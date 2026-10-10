import pool from "../../db/pool.js";

import { schoolToday as today } from "../../config/env.js";

export async function getStats() {
  const [[students]] = await pool.execute("SELECT COUNT(*) as count FROM students WHERE is_active = 1");
  const [[teachers]] = await pool.execute("SELECT COUNT(*) as count FROM teachers WHERE is_active = 1");
  const [[classes]] = await pool.execute("SELECT COUNT(*) as count FROM classrooms WHERE is_active = 1");
  const [[fees]] = await pool.execute(
    "SELECT COALESCE(SUM(amount_paid),0) as collected, COALESCE(SUM(amount_due),0) as due FROM fee_ledgers"
  );
  const [[unpaid]] = await pool.execute("SELECT COUNT(*) AS count FROM fee_ledgers WHERE status != 'paid'");
  const [[att]] = await pool.execute(
    "SELECT AVG(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) as rate FROM attendance WHERE day = ?",
    [today()]
  );

  return {
    totalStudents: students.count,
    totalTeachers: teachers.count,
    activeClasses: classes.count,
    feeCollected: Number(fees.collected) || 0,
    feeDue: Number(fees.due) || 0,
    unpaidFees: Number(unpaid.count),
    todayAttendance: att.rate ? Number((att.rate * 100).toFixed(2)) : 0,
  };
}

/** Chart data: average result % per term, and daily attendance % for the last 14 days. */
export async function getTrends() {
  const [byTerm] = await pool.query(
    "SELECT term AS label, ROUND(AVG(percentage)) AS value FROM result_cards GROUP BY term ORDER BY MIN(created_at), term"
  );
  const [byDay] = await pool.query(
    `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS label,
            ROUND(AVG(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) * 100) AS value
     FROM attendance WHERE day > DATE_SUB(?, INTERVAL 14 DAY)
     GROUP BY day ORDER BY day`,
    [today()]
  );
  const num = (rows) => rows.map((r) => ({ label: r.label, value: Number(r.value) }));
  return { results_by_term: num(byTerm), attendance_by_day: num(byDay) };
}
