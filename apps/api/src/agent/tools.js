/**
 * Tools exposed to the LLM agent.
 *
 * - Read tools return data as JSON text.
 * - propose_* tools never change anything: they create a pending action that the
 *   principal must approve in the chat (see actions.js).
 *
 * Tools are built per request so they carry the caller's context
 * (user, conversation) and can record which actions were proposed this turn.
 */
import { tool } from "langchain";
import { z } from "zod";
import pool from "../db/pool.js";
import * as dashboardService from "../modules/dashboard/dashboard.service.js";
import * as studentService from "../modules/students/students.service.js";
import * as teacherService from "../modules/teachers/teachers.service.js";
import * as classroomService from "../modules/classrooms/classrooms.service.js";
import * as feeService from "../modules/fees/fees.service.js";
import * as examService from "../modules/exams/exams.service.js";
import * as aiService from "../modules/ai/ai.service.js";
import * as actions from "./actions.js";

const json = (value) => JSON.stringify(value, null, 1);

/** Wrap a tool body so errors go back to the model as text instead of crashing the run. */
const safe = (fn) => async (input) => {
  try {
    return await fn(input ?? {});
  } catch (err) {
    return `ERROR: ${err.message}`;
  }
};

/** Describe a proposal result to the model (and remember it for the UI). */
function reportProposal(ctx, outcome) {
  if (!outcome.action) {
    return `No action created. ${outcome.message}`;
  }
  ctx.proposedActions.push(outcome.action);
  const { id, summary, preview } = outcome.action;
  const extra = [];
  if (preview?.skipped?.length) {
    extra.push(`${preview.skipped.length} student(s) skipped: ${preview.skipped.map((s) => `${s.student_name} (${s.reason})`).join("; ")}`);
  }
  if (preview?.delivery_mode === "simulated") {
    extra.push("Note: SMTP is not configured, so approved emails will be simulated (recorded but not delivered).");
  }
  return (
    `PROPOSED action #${id}: ${summary}. ` +
    "It has NOT been done yet — the principal must click Approve or Reject on the card shown in the chat. " +
    "Tell them what will happen and ask them to review it. Do not claim it is complete." +
    (extra.length ? `\n${extra.join("\n")}` : "")
  );
}

export function buildTools(ctx) {
  // ---------- Read tools ----------

  const getDashboardStats = tool(
    safe(async () => json(await dashboardService.getStats())),
    {
      name: "get_dashboard_stats",
      description: "School totals: students, teachers, classes, fees collected/due, today's attendance rate.",
      schema: z.object({}),
    }
  );

  const findStudents = tool(
    safe(async ({ query }) => {
      const rows = await actions.findStudents(query || "", 50);
      return json(
        rows.map((s) => ({
          id: s.id,
          name: `${s.first_name} ${s.last_name}`,
          roll_number: s.roll_number,
          class: s.class_name,
          guardian: s.guardian_name,
          has_guardian_email: Boolean(s.guardian_email),
        }))
      );
    }),
    {
      name: "find_students",
      description: "Search active students by (part of) name or roll number. Empty query lists students (max 50). Use this to get student IDs.",
      schema: z.object({ query: z.string().nullish().describe("Name fragment or roll number; empty for all") }),
    }
  );

  const getStudentProfile = tool(
    safe(async ({ student_id }) => {
      const p = await studentService.getProfile(Number(student_id));
      if (!p) return "Student not found.";
      return json({
        id: p.id,
        name: `${p.first_name} ${p.last_name}`,
        guardian: p.guardian_name,
        guardian_email: p.guardian_email,
        class: p.enrollment?.class_name,
        attendance_rate: p.attendance_rate,
        results: p.results.map((r) => ({ term: r.term, percentage: r.percentage, grade: r.grade })),
        fees: p.fees.map((f) => ({ month: f.month, due_date: f.due_date, status: f.status, remaining: f.remaining_amount })),
      });
    }),
    {
      name: "get_student_profile",
      description: "Full profile of one student: class, guardian, attendance rate, results, fees.",
      schema: z.object({ student_id: z.number().int().describe("Student ID (use find_students first)") }),
    }
  );

  const listClassrooms = tool(
    safe(async () => json((await classroomService.getAll()).map((r) => ({ id: r.id, name: r.name, grade: r.grade, section: r.section })))),
    { name: "list_classrooms", description: "All active classes with id, name, grade, section.", schema: z.object({}) }
  );

  const listTeachers = tool(
    safe(async () => json((await teacherService.getAll()).map((t) => ({ id: t.id, name: `${t.first_name} ${t.last_name}`, subject: t.subject })))),
    { name: "list_teachers", description: "All active teachers with id, name, subject.", schema: z.object({}) }
  );

  const getAttentionReport = tool(
    safe(async () => json(await aiService.getStudentsNeedingAttention())),
    {
      name: "get_attention_report",
      description: "Students needing attention (attendance < 75% or average score < 50%) with reasons.",
      schema: z.object({}),
    }
  );

  const getFeeDefaulters = tool(
    safe(async () => {
      const rows = await feeService.getDefaulters();
      return json(
        rows.map((r) => ({
          student_id: r.student_id,
          student: r.student_name,
          month: r.month,
          due_date: r.due_date,
          remaining: r.remaining_amount,
          days_overdue: r.days_overdue,
          risk: r.risk,
        }))
      );
    }),
    { name: "get_fee_defaulters", description: "Unpaid fee records past their due date, with amount remaining and days overdue.", schema: z.object({}) }
  );

  const listExams = tool(
    safe(async () =>
      json((await examService.getAll()).map((e) => ({ id: e.id, title: e.title, class: e.class_name, questions: e.question_count, created_at: e.created_at })))
    ),
    { name: "list_exams", description: "Saved exams with class and number of questions.", schema: z.object({}) }
  );

  const getRecentEmails = tool(
    safe(async ({ limit }) => {
      const [rows] = await pool.query(
        "SELECT to_name, to_email, subject, status, created_at FROM email_outbox ORDER BY id DESC LIMIT ?",
        [Math.min(Number(limit) || 20, 100)]
      );
      return rows.length ? json(rows) : "No emails have been sent yet.";
    }),
    {
      name: "get_recent_emails",
      description: "Emails already sent/simulated to guardians (most recent first).",
      schema: z.object({ limit: z.number().int().nullish() }),
    }
  );

  // ---------- Propose (approval-gated) tools ----------

  const proposeGuardianEmail = tool(
    safe(async (args) => reportProposal(ctx, await actions.proposeGuardianEmails(args, ctx))),
    {
      name: "propose_guardian_email",
      description:
        "Prepare emails to students' parents/guardians for the principal to approve. Nothing is sent until approved. " +
        "Audiences: fee_defaulters (overdue fees — has a default reminder template), low_attendance (below attendance_threshold, default 75 — default template), " +
        "absent_streak (absent absent_days in a row, default 3 — default template), class (needs class_name), students (needs student_ids), all_guardians. " +
        "For class/students/all_guardians you must write subject and body. Templates may use {{guardian_name}}, {{student_name}}, {{school_name}}, " +
        "and for fee_defaulters {{amount_owed}}, {{oldest_due_date}}; low_attendance {{attendance_rate}}; absent_streak {{absent_days}}; class {{class_name}}. " +
        "Leave subject/body empty to use the default template where one exists.",
      schema: z.object({
        audience: z.enum(actions.EMAIL_AUDIENCES),
        class_name: z.string().nullish().describe("Required when audience is 'class'"),
        student_ids: z.array(z.number().int()).nullish().describe("Required when audience is 'students'"),
        attendance_threshold: z.number().nullish().describe("For low_attendance; percent, default 75"),
        absent_days: z.number().int().nullish().describe("For absent_streak; default 3"),
        subject: z.string().nullish().describe("Email subject template"),
        body: z.string().nullish().describe("Email body template (plain text)"),
      }),
    }
  );

  const proposeAddStudent = tool(
    safe(async (args) => reportProposal(ctx, await actions.proposeAddStudent(args, ctx))),
    {
      name: "propose_add_student",
      description: "Prepare adding a new student and enrolling them in a class, for the principal to approve.",
      schema: z.object({
        first_name: z.string(),
        last_name: z.string(),
        class_name: z.string().describe("Class name or grade, e.g. 'Class 5' or '5'"),
        guardian_name: z.string().nullish(),
        guardian_email: z.string().nullish(),
        guardian_phone: z.string().nullish(),
        roll_number: z.string().nullish(),
      }),
    }
  );

  const proposeFeePayment = tool(
    safe(async (args) => reportProposal(ctx, await actions.proposeFeePayment(args, ctx))),
    {
      name: "propose_fee_payment",
      description: "Prepare recording a fee payment for a student (applied to the oldest unpaid fees first), for the principal to approve.",
      schema: z.object({
        student_id: z.number().int().describe("Student ID (use find_students first)"),
        amount: z.number().positive(),
      }),
    }
  );

  const proposeExam = tool(
    safe(async (args) => reportProposal(ctx, await actions.proposeExam(args, ctx))),
    {
      name: "propose_exam",
      description: "Generate exam questions for a class and subject; the principal reviews them and approves saving the exam.",
      schema: z.object({
        class_name: z.string(),
        subject: z.string(),
        prompt: z.string().nullish().describe("Topics or instructions"),
        num_questions: z.number().int().nullish().describe("1-30, default 5"),
        title: z.string().nullish(),
      }),
    }
  );

  return [
    getDashboardStats,
    findStudents,
    getStudentProfile,
    listClassrooms,
    listTeachers,
    getAttentionReport,
    getFeeDefaulters,
    listExams,
    getRecentEmails,
    proposeGuardianEmail,
    proposeAddStudent,
    proposeFeePayment,
    proposeExam,
  ];
}
