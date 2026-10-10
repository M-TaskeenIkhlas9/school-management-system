import { z } from "zod";
import pool from "../../db/pool.js";
import { classScope } from "../../middleware/access.js";
import { schoolToday } from "../../config/env.js";
import * as attendanceService from "../../modules/attendance/attendance.service.js";
import { resolveClass } from "./helpers.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

export default [
  {
    name: "get_attendance_summary",
    description: "Today's attendance rate and the overall attendance rate per class (late counts as present).",
    permission: "attendance:read",
    input: z.object({}),
    label: () => "Checking attendance rates",
    run: (_input, ctx) => attendanceService.summary({ classIds: classScope(ctx.req) }),
  },
  {
    name: "list_absences",
    description: "Students marked absent (or late) on a date, optionally for one class. Defaults to today.",
    permission: "attendance:read",
    input: z.object({
      date: isoDate.optional().describe("YYYY-MM-DD, default today"),
      class_name: z.string().max(100).optional(),
      include_late: z.boolean().optional().describe("Also list late arrivals"),
    }),
    label: (i) => `Looking up absences for ${i.date ?? "today"}`,
    async run({ date = schoolToday(), class_name, include_late = false }, ctx) {
      const room = await resolveClass(ctx, class_name);
      const statuses = include_late ? ["absent", "late"] : ["absent"];
      const rows = [];
      for (const status of statuses) {
        const page = await attendanceService.list({
          status,
          from: date,
          to: date,
          classroom_id: room?.id,
          classIds: classScope(ctx.req),
          page: 1,
          pageSize: 200,
        });
        rows.push(...page.items.map((r) => ({ student: r.student_name, class: r.class_name, status: r.status })));
      }
      return { date, count: rows.length, records: rows };
    },
  },
  {
    name: "find_absence_streaks",
    description: "Students absent on each of their most recent N recorded school days (a consecutive streak).",
    permission: "attendance:read",
    input: z.object({ days: z.number().int().min(2).max(30).optional().describe("Default 3") }),
    label: (i) => `Finding students absent ${i.days ?? 3} days in a row`,
    async run({ days = 3 }, ctx) {
      const streaks = await attendanceService.getConsecutiveAbsent(days);
      if (!streaks.length) return { days, students: [] };
      const classIds = classScope(ctx.req);
      if (classIds && !classIds.length) return { days, students: [] };
      const [rows] = await pool.query(
        `SELECT s.id, CONCAT(s.first_name, ' ', s.last_name) AS name, c.name AS class_name
         FROM students s
         JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
         JOIN classrooms c ON c.id = e.classroom_id
         WHERE s.is_active = 1 AND s.id IN (?) ${classIds ? "AND e.classroom_id IN (?)" : ""}`,
        classIds ? [streaks.map((s) => s.student_id), classIds] : [streaks.map((s) => s.student_id)]
      );
      const streakOf = new Map(streaks.map((s) => [s.student_id, s.absent_streak]));
      return {
        days,
        students: rows.map((r) => ({
          id: r.id,
          name: r.name,
          class: r.class_name,
          absent_days_in_a_row: streakOf.get(r.id),
        })),
      };
    },
  },
];
