import OpenAI from "openai";
import pool from "../db.js";
import { schoolToday } from "../config.js";

let openai = null;
if (process.env.OPENAI_API_KEY) {
  openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

// ---------- Logging ----------
function logAi(module, prompt, response, status) {
  pool.execute(
    "INSERT INTO ai_logs (module, prompt, response, status) VALUES (?, ?, ?, ?)",
    [module, prompt, typeof response === "string" ? response : JSON.stringify(response), status]
  ).catch(() => {});
}

// ---------- Fallback question builder (preserved from original code) ----------
function buildQuestions(topics, subject, count = 5) {
  const source = topics
    ? topics.split(",").map((s) => s.trim()).filter(Boolean)
    : [subject];
  return Array.from({ length: count }, (_, i) => ({
    question: `Explain the key ideas of ${source[i % source.length]}.`,
    marks: 5,
  }));
}

// ---------- Exam generation ----------
export async function generateExamQuestions({ subject, topics, prompt, num_questions = 5 }) {
  const systemPrompt = `You are an expert school exam paper creator. Generate exactly ${num_questions} exam questions for the subject "${subject}".
Topics to cover: ${topics || prompt}.
Return ONLY valid JSON in this exact format:
{
  "questions": [{"question": "...", "marks": 5}]
}
Mix question types: multiple choice, short answer, and long answer. Assign marks (2-10) based on difficulty.`;

  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        response_format: { type: "json_object" },
      });
      const content = completion.choices[0].message.content;
      const parsed = JSON.parse(content);
      logAi("exam_generation", prompt, content, "success");
      return parsed.questions || [];
    } catch (err) {
      logAi("exam_generation", prompt, err.message, "error");
    }
  }

  // Fallback
  const questions = buildQuestions(topics, subject, num_questions);
  logAi("exam_generation", prompt, JSON.stringify(questions), "fallback");
  return questions;
}

// ---------- Student summary ----------
export async function generateStudentSummary({ studentName, attendanceRate, averageScore, subjects, feeStatus }) {
  const userPrompt = `Summarize academic strengths and weaknesses of student "${studentName}":
- Attendance: ${attendanceRate}%
- Average Score: ${averageScore}%
- Subjects: ${subjects || "N/A"}
- Fee Status: ${feeStatus || "N/A"}
Provide a concise 2-3 sentence performance summary.`;

  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You are a school academic counselor. Provide concise, professional student performance summaries." },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.6,
        max_tokens: 200,
      });
      const text = completion.choices[0].message.content;
      logAi("student_summary", userPrompt, text, "success");
      return text;
    } catch (err) {
      logAi("student_summary", userPrompt, err.message, "error");
    }
  }

  // Fallback
  let summary = `${studentName} has an attendance rate of ${attendanceRate}% and an average score of ${averageScore}%.`;
  if (attendanceRate < 75) summary += " Attendance needs improvement.";
  if (averageScore < 50) summary += " Academic performance is below expectations and requires intervention.";
  else if (averageScore >= 80) summary += " Shows strong academic performance.";
  logAi("student_summary", userPrompt, summary, "fallback");
  return summary;
}

// ---------- Report card remark ----------
export async function generateReportCardRemark({ studentName, percentage, grade, attendanceRate }) {
  const userPrompt = `Generate a personalized teacher remark for student "${studentName}":
- Overall percentage: ${percentage}%
- Grade: ${grade}
- Attendance: ${attendanceRate}%
One to two sentences, professional tone.`;

  if (openai) {
    try {
      const completion = await openai.chat.completions.create({
        model: "gpt-3.5-turbo",
        messages: [
          { role: "system", content: "You write brief, encouraging report card remarks for school students." },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 100,
      });
      const text = completion.choices[0].message.content;
      logAi("report_remark", userPrompt, text, "success");
      return text;
    } catch (err) {
      logAi("report_remark", userPrompt, err.message, "error");
    }
  }

  // Fallback
  let remark;
  if (percentage >= 90) remark = `Outstanding performance by ${studentName}. Keep up the excellent work!`;
  else if (percentage >= 70) remark = `${studentName} shows consistent effort and good academic standing.`;
  else if (percentage >= 50) remark = `${studentName} meets basic requirements but has room for improvement.`;
  else remark = `${studentName} needs significant improvement. Additional support is recommended.`;
  if (attendanceRate < 75) remark += " Attendance needs immediate attention.";
  logAi("report_remark", userPrompt, remark, "fallback");
  return remark;
}

// ---------- Insights generation ----------
export async function generateInsights() {
  // Low attendance students
  const [lowAtt] = await pool.execute(
    `SELECT s.id as student_id, s.first_name, s.last_name,
            COUNT(*) as total,
            SUM(CASE WHEN a.status IN ('present','late') THEN 1 ELSE 0 END) as present_count
     FROM students s
     JOIN attendance a ON a.student_id = s.id
     WHERE s.is_active = 1
     GROUP BY s.id
     HAVING (present_count / total * 100) < 75`
  );

  // Low score students
  const [lowScore] = await pool.execute(
    `SELECT s.id as student_id, s.first_name, s.last_name,
            AVG(r.percentage) as avg_score
     FROM students s
     JOIN result_cards r ON r.student_id = s.id
     WHERE s.is_active = 1
     GROUP BY s.id
     HAVING avg_score < 60`
  );

  // Fee defaulters
  const [defaulters] = await pool.execute(
    `SELECT fl.student_id, s.first_name, s.last_name,
            SUM(fl.amount_due - fl.amount_paid) as total_owed,
            COUNT(*) as unpaid_months
     FROM fee_ledgers fl
     JOIN students s ON s.id = fl.student_id
     WHERE fl.status != 'paid' AND fl.due_date < ? AND s.is_active = 1
     GROUP BY fl.student_id`,
    [schoolToday()]
  );

  const insightsToStore = [];

  for (const row of lowAtt) {
    const rate = Number(((row.present_count / row.total) * 100).toFixed(2));
    insightsToStore.push({
      type: "low_attendance",
      priority: rate < 50 ? "high" : "medium",
      student_id: row.student_id,
      description: `${row.first_name} ${row.last_name} has ${rate}% attendance.`,
      suggested_action: "Schedule parent-teacher meeting to discuss attendance issues.",
    });
  }

  for (const row of lowScore) {
    const avg = Number(Number(row.avg_score).toFixed(2));
    insightsToStore.push({
      type: "low_performance",
      priority: avg < 40 ? "high" : "medium",
      student_id: row.student_id,
      description: `${row.first_name} ${row.last_name} has average score of ${avg}%.`,
      suggested_action: "Consider extra tutoring or remedial classes.",
    });
  }

  for (const row of defaulters) {
    insightsToStore.push({
      type: "fee_defaulter",
      priority: row.unpaid_months >= 2 ? "high" : "medium",
      student_id: row.student_id,
      description: `${row.first_name} ${row.last_name} owes $${Number(row.total_owed).toFixed(2)} across ${row.unpaid_months} month(s).`,
      suggested_action: "Send fee reminder notice to guardian.",
    });
  }

  // Replace unresolved insights atomically so concurrent calls can't interleave.
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.execute("DELETE FROM insights WHERE is_resolved = 0");
    for (const insight of insightsToStore) {
      await conn.execute(
        "INSERT INTO insights (type, priority, student_id, description, suggested_action) VALUES (?, ?, ?, ?, ?)",
        [insight.type, insight.priority, insight.student_id, insight.description, insight.suggested_action]
      );
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }

  const [stored] = await pool.execute("SELECT * FROM insights WHERE is_resolved = 0 ORDER BY FIELD(priority,'high','medium','low'), created_at DESC");
  return stored;
}

// ---------- Attention report (backward compat with existing endpoint) ----------
export async function getStudentsNeedingAttention() {
  const [students] = await pool.execute("SELECT * FROM students WHERE is_active = 1");

  const [attendance] = await pool.execute("SELECT student_id, status FROM attendance");
  const attMap = new Map();
  for (const row of attendance) {
    const s = attMap.get(row.student_id) || { total: 0, present: 0 };
    s.total++;
    if (row.status === "present" || row.status === "late") s.present++;
    attMap.set(row.student_id, s);
  }

  const [results] = await pool.execute("SELECT student_id, percentage FROM result_cards");
  const scoreMap = new Map();
  for (const row of results) {
    const list = scoreMap.get(row.student_id) || [];
    list.push(Number(row.percentage));
    scoreMap.set(row.student_id, list);
  }

  const flagged = students
    .map((student) => {
      const att = attMap.get(student.id) || { total: 0, present: 0 };
      const attendanceRate = att.total ? (att.present / att.total) * 100 : 100;
      const scores = scoreMap.get(student.id) || [];
      const averageScore = scores.length
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : 100;
      const reasons = [];
      if (attendanceRate < 75) reasons.push("low attendance");
      if (averageScore < 50) reasons.push("low scores");
      if (!reasons.length) return null;
      return {
        student_id: student.id,
        student_name: `${student.first_name} ${student.last_name}`.trim(),
        attendance_rate: Number(attendanceRate.toFixed(2)),
        average_score: Number(averageScore.toFixed(2)),
        reasons,
      };
    })
    .filter(Boolean);

  return { generated_at: new Date().toISOString(), students: flagged };
}
