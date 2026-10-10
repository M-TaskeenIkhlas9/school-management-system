import pool from "../../db/pool.js";

import { schoolToday as today } from "../../config/env.js";

/**
 * Headline numbers. `classIds` limits student/attendance figures to those classes;
 * fee figures are only included when `includeFees` (the caller may read fees).
 */
export async function getStats({ classIds = null, includeFees = true } = {}) {
  const scoped = classIds !== null;
  if (scoped && !classIds.length) classIds = [0]; // matches nothing
  const [[students]] = await pool.query(
    scoped
      ? `SELECT COUNT(DISTINCT s.id) AS count FROM students s
         JOIN enrollments e ON e.student_id = s.id AND e.is_active = 1
         WHERE s.is_active = 1 AND e.classroom_id IN (?)`
      : "SELECT COUNT(*) AS count FROM students WHERE is_active = 1",
    scoped ? [classIds] : []
  );
  const [[teachers]] = await pool.query("SELECT COUNT(*) AS count FROM teachers WHERE is_active = 1");
  const [[classes]] = await pool.query(
    `SELECT COUNT(*) AS count FROM classrooms WHERE is_active = 1 ${scoped ? "AND id IN (?)" : ""}`,
    scoped ? [classIds] : []
  );
  const [[att]] = await pool.query(
    `SELECT AVG(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) AS rate
     FROM attendance WHERE day = ? ${scoped ? "AND classroom_id IN (?)" : ""}`,
    scoped ? [today(), classIds] : [today()]
  );

  const stats = {
    totalStudents: Number(students.count),
    totalTeachers: Number(teachers.count),
    activeClasses: Number(classes.count),
    todayAttendance: att.rate ? Number((att.rate * 100).toFixed(2)) : 0,
  };
  if (includeFees) {
    const [[fees]] = await pool.query(
      "SELECT COALESCE(SUM(amount_paid),0) AS collected, COALESCE(SUM(amount_due),0) AS due FROM fee_ledgers"
    );
    const [[unpaid]] = await pool.query("SELECT COUNT(*) AS count FROM fee_ledgers WHERE status != 'paid'");
    Object.assign(stats, {
      feeCollected: Number(fees.collected) || 0,
      feeDue: Number(fees.due) || 0,
      unpaidFees: Number(unpaid.count),
    });
  }
  return stats;
}

/** Chart data: average result % per term, and daily attendance % for the last 14 days. */
export async function getTrends({ classIds = null } = {}) {
  const scoped = classIds !== null;
  if (scoped && !classIds.length) classIds = [0]; // matches nothing
  const [byTerm] = await pool.query(
    `SELECT term AS label, ROUND(AVG(percentage)) AS value FROM result_cards
     ${scoped ? "WHERE classroom_id IN (?)" : ""}
     GROUP BY term ORDER BY MIN(created_at), term`,
    scoped ? [classIds] : []
  );
  const [byDay] = await pool.query(
    `SELECT DATE_FORMAT(day, '%Y-%m-%d') AS label,
            ROUND(AVG(CASE WHEN status IN ('present','late') THEN 1 ELSE 0 END) * 100) AS value
     FROM attendance WHERE day > DATE_SUB(?, INTERVAL 14 DAY) ${scoped ? "AND classroom_id IN (?)" : ""}
     GROUP BY day ORDER BY day`,
    scoped ? [today(), classIds] : [today()]
  );
  const num = (rows) => rows.map((r) => ({ label: r.label, value: Number(r.value) }));
  return { results_by_term: num(byTerm), attendance_by_day: num(byDay) };
}
