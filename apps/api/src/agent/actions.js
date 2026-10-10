/**
 * Approval-gated agent actions.
 *
 * Every side effect the agent wants (emailing guardians, adding a student,
 * recording a payment, saving an exam) goes through two steps:
 *
 *   1. propose*()  — resolves everything up front (recipients, rendered emails,
 *                    fee allocations, generated questions) and stores it as a
 *                    `pending` agent_action with a human-readable preview.
 *   2. approveAction() — the principal clicks Approve; we execute exactly the
 *                    stored payload. The LLM is not consulted again, so what was
 *                    previewed is precisely what happens.
 */
import pool from "../db/pool.js";
import { schoolToday } from "../config/env.js";
import { createError } from "../middleware/errorHandler.js";
import { sendEmail, emailMode } from "../lib/email.js";
import * as aiService from "../modules/ai/ai.service.js";
import * as examService from "../modules/exams/exams.service.js";
import { getConsecutiveAbsent } from "../modules/attendance/attendance.service.js";
import * as store from "./store.js";

const MAX_RECIPIENTS = 500;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const schoolName = () => process.env.SCHOOL_NAME || "Cambridge Public School";

const formatMoney = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: process.env.CURRENCY || "USD" }).format(
    Number(value) || 0
  );

const formatDate = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
};

/** Replace {{placeholders}} with values; unknown placeholders become empty. */
export function renderTemplate(template, vars) {
  return String(template || "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    vars[key] !== undefined && vars[key] !== null ? String(vars[key]) : ""
  );
}

// =====================================================================
// Lookups shared with tools
// =====================================================================

export async function findStudents(query, limit = 20) {
  const q = String(query || "").trim();
  const [rows] = await pool.query(
    `SELECT s.id, s.first_name, s.last_name, s.roll_number, s.guardian_name, s.guardian_email,
            c.name AS class_name
     FROM students s
     LEFT JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
     LEFT JOIN classrooms c ON c.id = e.classroom_id
     WHERE s.is_active = 1
       AND (? = '' OR CONCAT(s.first_name, ' ', s.last_name) LIKE ? OR s.roll_number = ?)
     GROUP BY s.id
     ORDER BY s.first_name, s.last_name
     LIMIT ?`,
    [q, `%${q}%`, q, limit]
  );
  return rows;
}

/** Resolve a class by name or grade; throws a helpful error when ambiguous/missing. */
export async function findClassroom(className) {
  const [rooms] = await pool.execute("SELECT id, name, grade, section FROM classrooms WHERE is_active = 1");
  const needle = String(className || "")
    .trim()
    .toLowerCase();
  const exact = rooms.filter((r) => r.name.toLowerCase() === needle || String(r.grade).toLowerCase() === needle);
  const matches = exact.length ? exact : rooms.filter((r) => r.name.toLowerCase().includes(needle));
  const available = rooms.map((r) => r.name).join(", ") || "none";
  if (!needle || matches.length === 0) {
    throw createError(400, `Class "${className}" not found. Available classes: ${available}`, "CLASS_NOT_FOUND");
  }
  if (matches.length > 1) {
    throw createError(
      400,
      `"${className}" matches several classes: ${matches.map((r) => r.name).join(", ")}. Be more specific.`,
      "CLASS_AMBIGUOUS"
    );
  }
  return matches[0];
}

// =====================================================================
// Guardian emails
// =====================================================================

export const EMAIL_AUDIENCES = [
  "fee_defaulters",
  "low_attendance",
  "absent_streak",
  "class",
  "students",
  "all_guardians",
];

const DEFAULT_TEMPLATES = {
  fee_defaulters: {
    subject: "Fee reminder for {{student_name}}",
    body:
      "Dear {{guardian_name}},\n\n" +
      "This is a friendly reminder that {{student_name}} has an outstanding fee balance of {{amount_owed}} " +
      "(oldest due date: {{oldest_due_date}}). Please clear the balance at your earliest convenience.\n\n" +
      "If you have already paid, please ignore this message.\n\n" +
      "Regards,\n{{school_name}}",
  },
  low_attendance: {
    subject: "Attendance concern for {{student_name}}",
    body:
      "Dear {{guardian_name}},\n\n" +
      "We would like to bring to your attention that {{student_name}}'s attendance is currently {{attendance_rate}}, " +
      "which is below the school's expected level. Regular attendance is important for academic progress.\n\n" +
      "Please contact the school office if there is anything we should know.\n\n" +
      "Regards,\n{{school_name}}",
  },
  absent_streak: {
    subject: "{{student_name}} has been absent for {{absent_days}} days",
    body:
      "Dear {{guardian_name}},\n\n" +
      "{{student_name}} has been marked absent for the last {{absent_days}} school days in a row. " +
      "Please let us know the reason for the absence and when we can expect {{student_name}} back.\n\n" +
      "Regards,\n{{school_name}}",
  },
};

const AUDIENCE_LABELS = {
  fee_defaulters: "guardians of students with overdue fees",
  low_attendance: "guardians of students with low attendance",
  absent_streak: "guardians of students absent several days in a row",
  class: "guardians of a class",
  students: "guardians of selected students",
  all_guardians: "all guardians",
};

const STUDENT_COLS = "s.id, s.first_name, s.last_name, s.guardian_name, s.guardian_email";

function toRecipient(row, extraVars = {}) {
  const studentName = `${row.first_name} ${row.last_name}`.trim();
  return {
    student_id: row.id,
    student_name: studentName,
    guardian_name: row.guardian_name || "Parent/Guardian",
    email: row.guardian_email ? String(row.guardian_email).trim() : "",
    vars: {
      student_name: studentName,
      guardian_name: row.guardian_name || "Parent/Guardian",
      school_name: schoolName(),
      ...extraVars,
    },
  };
}

async function resolveAudience({ audience, class_name, student_ids, attendance_threshold = 75, absent_days = 3 }) {
  switch (audience) {
    case "fee_defaulters": {
      const [rows] = await pool.execute(
        `SELECT ${STUDENT_COLS},
                SUM(fl.amount_due - fl.amount_paid) AS amount_owed,
                COUNT(*) AS unpaid_count,
                MIN(fl.due_date) AS oldest_due_date
         FROM fee_ledgers fl JOIN students s ON s.id = fl.student_id
         WHERE fl.status != 'paid' AND fl.due_date < ? AND s.is_active = 1
         GROUP BY s.id`,
        [schoolToday()]
      );
      return rows.map((r) =>
        toRecipient(r, {
          amount_owed: formatMoney(r.amount_owed),
          unpaid_count: r.unpaid_count,
          oldest_due_date: formatDate(r.oldest_due_date),
        })
      );
    }
    case "low_attendance": {
      const [rows] = await pool.execute(
        `SELECT ${STUDENT_COLS}, COUNT(*) AS total,
                SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) AS attended
         FROM students s JOIN attendance a ON a.student_id = s.id
         WHERE s.is_active = 1
         GROUP BY s.id
         HAVING attended / total * 100 < ?`,
        [Number(attendance_threshold)]
      );
      return rows.map((r) => toRecipient(r, { attendance_rate: `${((r.attended / r.total) * 100).toFixed(1)}%` }));
    }
    case "absent_streak": {
      const streaks = await getConsecutiveAbsent(Number(absent_days));
      if (!streaks.length) return [];
      const ids = streaks.map((s) => s.student_id);
      const [rows] = await pool.query(`SELECT ${STUDENT_COLS} FROM students s WHERE s.is_active = 1 AND s.id IN (?)`, [
        ids,
      ]);
      const streakById = new Map(streaks.map((s) => [s.student_id, s.absent_streak]));
      return rows.map((r) => toRecipient(r, { absent_days: streakById.get(r.id) }));
    }
    case "class": {
      const room = await findClassroom(class_name);
      const [rows] = await pool.execute(
        `SELECT ${STUDENT_COLS} FROM students s
         JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
         WHERE s.is_active = 1 AND e.classroom_id = ?`,
        [room.id]
      );
      return rows.map((r) => toRecipient(r, { class_name: room.name }));
    }
    case "students": {
      const ids = (student_ids || []).map(Number).filter(Number.isInteger);
      if (!ids.length) throw createError(400, "student_ids is required for audience 'students'", "VALIDATION_ERROR");
      const [rows] = await pool.query(`SELECT ${STUDENT_COLS} FROM students s WHERE s.is_active = 1 AND s.id IN (?)`, [
        ids,
      ]);
      return rows.map((r) => toRecipient(r));
    }
    case "all_guardians": {
      const [rows] = await pool.execute(`SELECT ${STUDENT_COLS} FROM students s WHERE s.is_active = 1`);
      return rows.map((r) => toRecipient(r));
    }
    default:
      throw createError(
        400,
        `Unknown audience "${audience}". Use one of: ${EMAIL_AUDIENCES.join(", ")}`,
        "VALIDATION_ERROR"
      );
  }
}

/**
 * Propose emailing guardians. Returns { action } when something can be sent,
 * or { action: null, message } explaining why nothing was proposed.
 */
export async function proposeGuardianEmails(args, ctx) {
  const audience = args.audience;
  const defaults = DEFAULT_TEMPLATES[audience] || {};
  const subjectTemplate = args.subject || defaults.subject;
  const bodyTemplate = args.body || defaults.body;
  if (!subjectTemplate || !bodyTemplate) {
    throw createError(400, `A subject and body are required for audience "${audience}".`, "VALIDATION_ERROR");
  }

  const recipients = await resolveAudience(args);
  if (!recipients.length) {
    return { action: null, message: `No students match: ${AUDIENCE_LABELS[audience] || audience}. Nothing to send.` };
  }

  const sendable = recipients.filter((r) => EMAIL_RE.test(r.email)).slice(0, MAX_RECIPIENTS);
  const skipped = recipients
    .filter((r) => !EMAIL_RE.test(r.email))
    .map((r) => ({
      student_id: r.student_id,
      student_name: r.student_name,
      reason: r.email ? "invalid guardian email" : "no guardian email on file",
    }));

  if (!sendable.length) {
    return {
      action: null,
      message:
        `${recipients.length} student(s) match (${AUDIENCE_LABELS[audience]}), but none has a valid guardian email on file. ` +
        "Add guardian emails on the Students page first.",
      skipped,
    };
  }

  const emails = sendable.map((r) => ({
    student_id: r.student_id,
    student_name: r.student_name,
    to: r.email,
    to_name: r.guardian_name,
    subject: renderTemplate(subjectTemplate, r.vars),
    body: renderTemplate(bodyTemplate, r.vars),
  }));

  const action = await store.createAction({
    conversationId: ctx.conversationId,
    userId: ctx.userId,
    type: "send_guardian_emails",
    summary: `Email ${emails.length} ${AUDIENCE_LABELS[audience] || "guardians"}${skipped.length ? ` (${skipped.length} skipped)` : ""}`,
    payload: { emails },
    preview: {
      audience,
      audience_label: AUDIENCE_LABELS[audience],
      subject_template: subjectTemplate,
      body_template: bodyTemplate,
      emails,
      skipped,
      delivery_mode: emailMode(),
      redirect_to: process.env.EMAIL_REDIRECT_TO || null,
    },
  });
  return { action };
}

async function executeGuardianEmails(payload, action) {
  const counts = { sent: 0, simulated: 0, failed: 0 };
  const failures = [];
  for (const email of payload.emails) {
    try {
      const res = await sendEmail({ to: email.to, toName: email.to_name, subject: email.subject, text: email.body });
      counts[res.status]++;
      await pool.execute(
        `INSERT INTO email_outbox (action_id, student_id, to_email, to_name, subject, body, status, provider_message_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          action.id,
          email.student_id,
          res.deliveredTo,
          email.to_name,
          email.subject,
          email.body,
          res.status,
          res.messageId,
        ]
      );
    } catch (err) {
      counts.failed++;
      failures.push({ to: email.to, error: err.message });
      await pool.execute(
        `INSERT INTO email_outbox (action_id, student_id, to_email, to_name, subject, body, status, error)
         VALUES (?, ?, ?, ?, ?, ?, 'failed', ?)`,
        [action.id, email.student_id, email.to, email.to_name, email.subject, email.body, err.message]
      );
    }
  }
  const delivered = counts.sent + counts.simulated;
  const parts = [];
  if (counts.sent) parts.push(`${counts.sent} sent`);
  if (counts.simulated)
    parts.push(`${counts.simulated} simulated (SMTP not configured — nothing was actually delivered)`);
  if (counts.failed) parts.push(`${counts.failed} failed`);
  return {
    ok: delivered > 0,
    result: { ...counts, failures },
    message: `Emails: ${parts.join(", ")}.`,
  };
}

// =====================================================================
// Add student
// =====================================================================

export async function proposeAddStudent(args, ctx) {
  const room = await findClassroom(args.class_name);
  if (args.guardian_email && !EMAIL_RE.test(args.guardian_email)) {
    throw createError(400, `"${args.guardian_email}" is not a valid email address`, "VALIDATION_ERROR");
  }
  if (args.roll_number) {
    const [dup] = await pool.execute("SELECT id FROM students WHERE roll_number = ?", [args.roll_number]);
    if (dup.length) throw createError(409, `Roll number ${args.roll_number} already exists`, "DUPLICATE_ROLL");
  }
  const student = {
    first_name: args.first_name.trim(),
    last_name: args.last_name.trim(),
    roll_number: args.roll_number || null,
    guardian_name: args.guardian_name || null,
    guardian_email: args.guardian_email || null,
    guardian_phone: args.guardian_phone || null,
  };
  const action = await store.createAction({
    conversationId: ctx.conversationId,
    userId: ctx.userId,
    type: "add_student",
    summary: `Add student ${student.first_name} ${student.last_name} to ${room.name}`,
    payload: { student, classroom_id: room.id },
    preview: { student, class_name: room.name },
  });
  return { action };
}

async function executeAddStudent(payload) {
  const { student, classroom_id } = payload;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [res] = await conn.execute(
      `INSERT INTO students (first_name, last_name, roll_number, guardian_name, guardian_email, guardian_phone)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        student.first_name,
        student.last_name,
        student.roll_number,
        student.guardian_name,
        student.guardian_email,
        student.guardian_phone,
      ]
    );
    await conn.execute("INSERT INTO enrollments (student_id, classroom_id, start_date) VALUES (?, ?, ?)", [
      res.insertId,
      classroom_id,
      schoolToday(),
    ]);
    await conn.commit();
    return {
      ok: true,
      result: { student_id: res.insertId },
      message: `Added ${student.first_name} ${student.last_name} (ID ${res.insertId}).`,
    };
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY")
      throw createError(409, "A student with that roll number already exists", "DUPLICATE_ROLL");
    throw err;
  } finally {
    conn.release();
  }
}

// =====================================================================
// Record fee payment (applied to oldest unpaid ledgers first)
// =====================================================================

const feeStatusFor = (paid, due) => (paid >= due ? "paid" : paid > 0 ? "partial" : "pending");

export async function proposeFeePayment(args, ctx) {
  const amount = Number(args.amount);
  if (!(amount > 0)) throw createError(400, "Payment amount must be greater than zero", "VALIDATION_ERROR");

  const [[student]] = await pool.execute(
    "SELECT id, first_name, last_name FROM students WHERE id = ? AND is_active = 1",
    [args.student_id]
  );
  if (!student) throw createError(404, `Student ${args.student_id} not found`, "NOT_FOUND");

  const [ledgers] = await pool.execute(
    "SELECT id, month, due_date, amount_due, amount_paid FROM fee_ledgers WHERE student_id = ? AND status != 'paid' ORDER BY due_date ASC, id ASC",
    [student.id]
  );
  const owed = ledgers.reduce((sum, l) => sum + (Number(l.amount_due) - Number(l.amount_paid)), 0);
  if (!ledgers.length)
    throw createError(400, `${student.first_name} ${student.last_name} has no unpaid fees`, "NOTHING_OWED");
  if (amount > owed + 1e-9) {
    throw createError(
      400,
      `Payment ${formatMoney(amount)} exceeds the outstanding balance ${formatMoney(owed)}`,
      "PAYMENT_EXCEEDS_FEE"
    );
  }

  let remaining = amount;
  const allocations = [];
  for (const l of ledgers) {
    if (remaining <= 0) break;
    const due = Number(l.amount_due);
    const before = Number(l.amount_paid);
    const apply = Math.min(due - before, remaining);
    remaining = Number((remaining - apply).toFixed(2));
    const after = Number((before + apply).toFixed(2));
    allocations.push({
      fee_id: l.id,
      month: l.month,
      due_date: formatDate(l.due_date),
      amount_due: due,
      paid_before: before,
      apply: Number(apply.toFixed(2)),
      paid_after: after,
      status_after: feeStatusFor(after, due),
    });
  }

  const name = `${student.first_name} ${student.last_name}`;
  const action = await store.createAction({
    conversationId: ctx.conversationId,
    userId: ctx.userId,
    type: "record_fee_payment",
    summary: `Record ${formatMoney(amount)} payment for ${name}`,
    payload: { student_id: student.id, amount, allocations },
    preview: { student_name: name, amount: formatMoney(amount), outstanding_before: formatMoney(owed), allocations },
  });
  return { action };
}

async function executeFeePayment(payload) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const a of payload.allocations) {
      const [[row]] = await conn.execute("SELECT amount_paid FROM fee_ledgers WHERE id = ? FOR UPDATE", [a.fee_id]);
      if (!row || Number(row.amount_paid) !== a.paid_before) {
        throw createError(
          409,
          `Fee record #${a.fee_id} changed after this was proposed. Ask the assistant again.`,
          "STALE_ACTION"
        );
      }
      await conn.execute(
        "UPDATE fee_ledgers SET amount_paid = ?, status = ?, paid_date = IF(? = 'paid', ?, paid_date) WHERE id = ?",
        [a.paid_after, a.status_after, a.status_after, schoolToday(), a.fee_id]
      );
    }
    await conn.commit();
    return {
      ok: true,
      result: { updated: payload.allocations.length },
      message: `Payment recorded across ${payload.allocations.length} fee record(s).`,
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

// =====================================================================
// Create exam (questions generated at proposal time so they can be reviewed)
// =====================================================================

export async function proposeExam(args, ctx) {
  const room = await findClassroom(args.class_name);
  const numQuestions = Math.min(Math.max(Number(args.num_questions) || 5, 1), 30);
  const [curriculum] = await pool.execute(
    "SELECT topics FROM curriculum_items WHERE classroom_id = ? AND subject = ? LIMIT 1",
    [room.id, args.subject]
  );
  const prompt = args.prompt || `Generate ${numQuestions} questions for ${args.subject}`;
  const questions = await aiService.generateExamQuestions({
    subject: args.subject,
    topics: curriculum[0]?.topics || args.prompt,
    prompt,
    num_questions: numQuestions,
  });
  const totalMarks = questions.reduce((sum, q) => sum + (Number(q.marks) || 5), 0);
  const title = args.title || `${args.subject} Test`;

  const action = await store.createAction({
    conversationId: ctx.conversationId,
    userId: ctx.userId,
    type: "create_exam",
    summary: `Save "${title}" for ${room.name} (${questions.length} questions, ${totalMarks} marks)`,
    payload: { classroom_id: room.id, subject: args.subject, title, prompt, total_marks: totalMarks, questions },
    preview: { class_name: room.name, subject: args.subject, title, total_marks: totalMarks, questions },
  });
  return { action };
}

async function executeExam(payload) {
  const exam = await examService.createWithQuestions({
    classroom_id: payload.classroom_id,
    subject: payload.subject,
    title: payload.title,
    prompt: payload.prompt,
    type: "Test",
    total_marks: payload.total_marks,
    created_by_ai: true,
    ai_prompt_used: payload.prompt,
    ai_generated_content: { questions: payload.questions },
    questions: payload.questions,
  });
  return { ok: true, result: { exam_id: exam.id }, message: `Exam "${exam.title}" saved (ID ${exam.id}).` };
}

// =====================================================================
// Approve / reject
// =====================================================================

const EXECUTORS = {
  send_guardian_emails: executeGuardianEmails,
  add_student: executeAddStudent,
  record_fee_payment: executeFeePayment,
  create_exam: executeExam,
};

export async function approveAction(userId, actionId) {
  const action = await store.claimPendingAction(userId, actionId, "executing");
  const executor = EXECUTORS[action.type];

  let outcome;
  try {
    if (!executor) throw new Error(`No executor for action type "${action.type}"`);
    outcome = await executor(action.payload, action);
    await store.finishAction(action.id, { status: outcome.ok ? "executed" : "failed", result: outcome.result });
  } catch (err) {
    outcome = { ok: false, message: err.message };
    await store.finishAction(action.id, { status: "failed", error: err.message });
  }

  // Record the outcome in the chat so the agent sees it in later turns.
  if (action.conversation_id) {
    const prefix = outcome.ok ? "✅ Approved and done" : "❌ Approved but failed";
    await store.addMessage(action.conversation_id, "assistant", `${prefix}: ${action.summary}. ${outcome.message}`, {
      kind: "action_result",
      action_id: action.id,
    });
  }
  return store.getAction(userId, action.id);
}

export async function rejectAction(userId, actionId) {
  const action = await store.claimPendingAction(userId, actionId, "rejected");
  if (action.conversation_id) {
    await store.addMessage(action.conversation_id, "assistant", `🚫 Rejected: ${action.summary}. Nothing was done.`, {
      kind: "action_result",
      action_id: action.id,
    });
  }
  return action;
}
