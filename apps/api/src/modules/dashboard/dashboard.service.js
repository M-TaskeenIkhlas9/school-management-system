import pool from "../../db/pool.js";

import { schoolToday as today } from "../../config/env.js";

export async function getStats() {
  const [[students]] = await pool.execute(
    "SELECT COUNT(*) as count FROM students WHERE is_active = 1"
  );
  const [[teachers]] = await pool.execute(
    "SELECT COUNT(*) as count FROM teachers WHERE is_active = 1"
  );
  const [[classes]] = await pool.execute(
    "SELECT COUNT(*) as count FROM classrooms WHERE is_active = 1"
  );
  const [[fees]] = await pool.execute(
    "SELECT COALESCE(SUM(amount_paid),0) as collected, COALESCE(SUM(amount_due),0) as due FROM fee_ledgers"
  );
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
    todayAttendance: att.rate ? Number((att.rate * 100).toFixed(2)) : 0,
  };
}
