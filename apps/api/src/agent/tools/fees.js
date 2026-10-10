import { z } from "zod";
import * as feeService from "../../modules/fees/fees.service.js";
import * as dashboardService from "../../modules/dashboard/dashboard.service.js";
import pool from "../../db/pool.js";

/** Primary guardian name and contact per student (one query for all of them). */
async function primaryGuardians(studentIds) {
  if (!studentIds.length) return new Map();
  const [rows] = await pool.query(
    `SELECT sg.student_id, g.full_name, g.phone, g.email, g.preferred_channel,
            g.consent_whatsapp, g.consent_sms, g.consent_email
     FROM student_guardians sg JOIN guardians g ON g.id = sg.guardian_id
     WHERE sg.is_primary = 1 AND sg.student_id IN (?)`,
    [studentIds]
  );
  return new Map(
    rows.map((g) => [
      g.student_id,
      {
        name: g.full_name,
        phone: g.phone,
        email: g.email,
        preferred_channel: g.preferred_channel,
        agreed_to: ["whatsapp", "sms", "email"].filter((c) => g[`consent_${c}`]),
      },
    ])
  );
}

export default [
  {
    name: "get_fee_defaulters",
    description:
      "Students with overdue unpaid fees, one row per student: total owed, number of overdue records, oldest due date, most days overdue, and the primary guardian with contact details and consented channels.",
    permission: "fees:read",
    input: z.object({}),
    label: () => "Looking up overdue fees",
    async run() {
      const byStudent = new Map();
      for (const f of await feeService.getDefaulters()) {
        const row = byStudent.get(f.student_id) ?? {
          student_id: f.student_id,
          student: f.student_name,
          owed: 0,
          overdue_records: 0,
          oldest_due_date: f.due_date,
          max_days_overdue: 0,
        };
        row.owed = Number((row.owed + f.remaining_amount).toFixed(2));
        row.overdue_records++;
        row.max_days_overdue = Math.max(row.max_days_overdue, Number(f.days_overdue));
        if (f.due_date < row.oldest_due_date) row.oldest_due_date = f.due_date;
        byStudent.set(f.student_id, row);
      }
      const guardians = await primaryGuardians([...byStudent.keys()]);
      const students = [...byStudent.values()]
        .map((row) => ({ ...row, guardian: guardians.get(row.student_id) ?? null }))
        .sort((a, b) => b.owed - a.owed);
      return {
        students_with_overdue_fees: students.length,
        total_overdue: Number(students.reduce((sum, s) => sum + s.owed, 0).toFixed(2)),
        students,
      };
    },
  },
  {
    name: "get_fee_summary",
    description: "School-wide fee totals: billed, collected, outstanding and number of unpaid records.",
    permission: "fees:read",
    input: z.object({}),
    label: () => "Checking fee totals",
    async run() {
      const s = await dashboardService.getStats({ includeFees: true });
      return {
        billed: s.feeDue,
        collected: s.feeCollected,
        outstanding: Number((s.feeDue - s.feeCollected).toFixed(2)),
        unpaid_records: s.unpaidFees,
      };
    },
  },
];
