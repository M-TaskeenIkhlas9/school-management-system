import { z } from "zod";
import { assertStudentAccess, classScope, hasPermission } from "../../middleware/access.js";
import * as studentService from "../../modules/students/students.service.js";
import * as guardianService from "../../modules/guardians/guardians.service.js";
import { redactStudent } from "../../modules/students/students.redact.js";
import { ToolError, fullName, resolveClass } from "./helpers.js";

export default [
  {
    name: "find_students",
    description:
      "Search students by part of a name or roll number, optionally within one class. Returns ids (needed by other tools), class, primary guardian and, if allowed, latest fee status.",
    permission: "students:read",
    input: z.object({
      query: z.string().max(100).optional().describe("Part of a name or a roll number; omit to list"),
      class_name: z.string().max(100).optional().describe("Limit to this class, e.g. 'Class 5'"),
      limit: z.number().int().min(1).max(50).optional().describe("Default 20"),
    }),
    label: (i) => (i.query ? `Searching students for "${i.query}"` : "Listing students"),
    async run({ query, class_name, limit = 20 }, ctx) {
      const room = await resolveClass(ctx, class_name);
      const q = query?.trim().toLowerCase();
      const students = (await studentService.getAll({ classIds: classScope(ctx.req) }))
        .filter((s) => !room || s.classroom_id === room.id)
        .filter((s) => !q || fullName(s).toLowerCase().includes(q) || String(s.roll_number ?? "").toLowerCase() === q);
      const showFees = hasPermission(ctx.req, "fees:read");
      return {
        total_matches: students.length,
        students: students.slice(0, limit).map((s) => ({
          id: s.id,
          name: fullName(s),
          roll_number: s.roll_number,
          class: s.class_name,
          guardian: s.guardian_name,
          guardian_phone: s.guardian_phone,
          guardian_email: s.guardian_email,
          ...(showFees ? { latest_fee_status: s.latest_fee_status } : {}),
        })),
      };
    },
  },
  {
    name: "get_student_profile",
    description:
      "One student's details: class, guardians (with consented channels), and — where the user is allowed — attendance rate, results and fees.",
    permission: "students:read",
    input: z.object({ student_id: z.number().int().positive().describe("From find_students") }),
    label: () => "Opening a student profile",
    async run({ student_id }, ctx) {
      try {
        await assertStudentAccess(ctx.req, student_id);
      } catch {
        throw new ToolError("You don't have access to that student.");
      }
      const profile = await studentService.getProfile(student_id);
      if (!profile) throw new ToolError(`No student with id ${student_id}.`);
      const p = redactStudent(ctx.req, profile);
      return {
        id: p.id,
        name: fullName(p),
        roll_number: p.roll_number,
        class: p.enrollment?.class_name ?? null,
        guardians: p.guardians,
        ...(p.attendance_rate !== undefined ? { attendance_rate: p.attendance_rate } : {}),
        ...(p.results
          ? { results: p.results.map((r) => ({ term: r.term, percentage: r.percentage, grade: r.grade })) }
          : {}),
        ...(p.fees
          ? { fees: p.fees.map((f) => ({ due_date: f.due_date, status: f.status, remaining: f.remaining_amount })) }
          : {}),
      };
    },
  },
  {
    name: "find_guardians",
    description:
      "Search parents/guardians by name, email or phone. Shows their children, contact details, preferred channel and which channels (WhatsApp/SMS/email) they agreed to.",
    permission: "students:read",
    input: z.object({ query: z.string().max(100).optional().describe("Name, email or phone; omit to list") }),
    label: (i) => (i.query ? `Searching guardians for "${i.query}"` : "Listing guardians"),
    async run({ query }, ctx) {
      const page = await guardianService.list({ q: query, classIds: classScope(ctx.req), page: 1, pageSize: 25 });
      return {
        total_matches: page.total,
        guardians: page.items.map((g) => ({
          id: g.id,
          name: g.full_name,
          children: g.student_names,
          phone: g.phone,
          email: g.email,
          preferred_channel: g.preferred_channel,
          agreed_to: ["whatsapp", "sms", "email"].filter((c) => g[`consent_${c}`]),
        })),
      };
    },
  },
];
