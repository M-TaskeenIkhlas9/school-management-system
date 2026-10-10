/**
 * Rule-based fallback used when no LLM is configured or the LLM call fails
 * (e.g. Groq daily limit). Covers the most common requests, including the
 * approval-gated email actions, without spending any tokens.
 */
import * as dashboardService from "../modules/dashboard/dashboard.service.js";
import * as studentService from "../modules/students/students.service.js";
import * as teacherService from "../modules/teachers/teachers.service.js";
import * as classroomService from "../modules/classrooms/classrooms.service.js";
import * as aiService from "../modules/ai/ai.service.js";
import * as actions from "./actions.js";

export const HELP_TEXT =
  "I can help with:\n" +
  '• "How many students?" • "List students / teachers / classes"\n' +
  '• "Who needs attention?"\n' +
  '• "Email parents whose fees are due" • "Email parents of students with low attendance"\n' +
  "With an AI model configured I can also add students, record payments and draft exams.";

/** @returns {Promise<{content: string, actions: object[]} | null>} null when no rule matches */
export async function handleRuleBased(message, ctx) {
  const q = String(message || "")
    .toLowerCase()
    .trim();
  if (!q) return null;
  const reply = (content, proposed = []) => ({ content, actions: proposed });

  const wantsEmail = /\b(email|e-mail|mail|notify|remind|reminder|message|inform)\b/.test(q);
  const aboutGuardians = /\b(parent|parents|guardian|guardians|famil)/.test(q);

  if (wantsEmail && (aboutGuardians || /\bfee|dues?\b|defaulter|unpaid|overdue/.test(q))) {
    let audience = null;
    if (/\bfee|dues?\b|defaulter|unpaid|overdue|payment/.test(q)) audience = "fee_defaulters";
    else if (/attendance/.test(q)) audience = "low_attendance";
    else if (/absent/.test(q)) audience = "absent_streak";

    if (audience) {
      const outcome = await actions.proposeGuardianEmails({ audience }, ctx);
      if (!outcome.action) return reply(outcome.message);
      const { preview, summary } = outcome.action;
      let text = `I've prepared this for your approval: ${summary}. Review the emails below and click Approve to send, or Reject.`;
      if (preview.delivery_mode === "simulated") {
        text += "\n\nNote: SMTP isn't configured yet, so approved emails will be recorded but not actually delivered.";
      }
      return reply(text, [outcome.action]);
    }
    return reply(
      "Which parents should I email? I can do: parents whose fees are overdue, parents of students with low attendance, " +
        "or parents of students absent several days in a row. (Emailing a whole class or custom message needs the AI model to be configured.)"
    );
  }

  if (/\b(how many|number of|count|total)\b.*\bstudents?\b/.test(q)) {
    const stats = await dashboardService.getStats();
    return reply(`There are ${stats.totalStudents} active students.`);
  }
  if (/\b(list|show|get|all)\b.*\bstudents?\b/.test(q) || q === "students") {
    const students = await studentService.getAll();
    const list = students
      .slice(0, 50)
      .map((s) => `• ${s.first_name} ${s.last_name} (ID ${s.id})`)
      .join("\n");
    return reply(list ? `Students:\n${list}` : "No students found.");
  }
  if (/\b(list|show|get|all)\b.*\bteachers?\b/.test(q) || q === "teachers") {
    const teachers = await teacherService.getAll();
    const list = teachers.map((t) => `• ${t.first_name} ${t.last_name} — ${t.subject || "N/A"}`).join("\n");
    return reply(list ? `Teachers:\n${list}` : "No teachers found.");
  }
  if (/\b(list|show|get|all)\b.*\b(classes|classrooms?)\b/.test(q) || q === "classes") {
    const rooms = await classroomService.getAll();
    const list = rooms.map((r) => `• ${r.name}${r.grade ? ` (Grade ${r.grade})` : ""}`).join("\n");
    return reply(list ? `Classes:\n${list}` : "No classes found.");
  }
  if (/attention|struggling|at risk|need(s)? help/.test(q)) {
    const report = await aiService.getStudentsNeedingAttention();
    if (!report.students.length) return reply("No students currently need attention.");
    const list = report.students.map((s) => `• ${s.student_name}: ${s.reasons.join(", ")}`).join("\n");
    return reply(`Students needing attention:\n${list}`);
  }
  if (/^(hi|hello|hey|salam|assalam|help)\b/.test(q)) {
    return reply(`Hello! ${HELP_TEXT}`);
  }
  return null;
}
