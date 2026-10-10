/**
 * Demo data for local development: classes, teachers, students (guardian emails
 * on the reserved example.com domain), fees (some overdue), attendance, results.
 *
 * Usage: npm run seed   — refuses to run if any students already exist.
 */
import "dotenv/config";
import { fileURLToPath } from "node:url";
import pool from "./pool.js";
import { schoolToday } from "../config/env.js";
import { calcGrade } from "../modules/results/results.service.js";
import { createUser } from "../modules/auth/auth.service.js";

const daysAgo = (n) => {
  const d = new Date(`${schoolToday()}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

const CLASSES = [
  { name: "Class 5", grade: "5", section: "A" },
  { name: "Class 6", grade: "6", section: "A" },
];

const TEACHERS = [
  ["Sara", "Ahmed", "Mathematics"],
  ["Bilal", "Khan", "Science"],
  ["Ayesha", "Raza", "English"],
];

// [first, last, roll, guardian, email|null, classIndex, feeProfile, attendanceProfile, scores]
const STUDENTS = [
  ["Ali", "Hassan", "R-501", "Hassan Ali", "hassan.ali@example.com", 0, "overdue2", "good", [78, 82]],
  ["Fatima", "Noor", "R-502", "Noor Ahmed", "noor.ahmed@example.com", 0, "paid", "good", [91, 88]],
  ["Usman", "Tariq", "R-503", "Tariq Mehmood", "tariq.m@example.com", 0, "overdue1", "poor", [45, 48]],
  ["Zainab", "Iqbal", "R-504", "Iqbal Shah", null, 0, "overdue1", "good", [67, 70]],
  ["Hamza", "Saeed", "R-601", "Saeed Akhtar", "saeed.akhtar@example.com", 1, "partial", "streak", [55, 52]],
  ["Maryam", "Javed", "R-602", "Javed Iqbal", "javed.iqbal@example.com", 1, "paid", "good", [84, 86]],
  ["Ahmed", "Raza", "R-603", "Raza Khan", "raza.khan@example.com", 1, "upcoming", "poor", [38, 42]],
];

export async function seed() {
  const [[{ count }]] = await pool.query("SELECT COUNT(*) AS count FROM students");
  if (count > 0) {
    console.log(`[seed] ${count} students already exist — skipping (seed only runs on an empty database).`);
    return;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const classIds = [];
    for (const c of CLASSES) {
      const [r] = await conn.execute(
        "INSERT INTO classrooms (name, grade, section, academic_year) VALUES (?, ?, ?, '2026-27')",
        [c.name, c.grade, c.section]
      );
      classIds.push(r.insertId);
      await conn.execute(
        "INSERT INTO curriculum_items (classroom_id, subject, topics) VALUES (?, 'Mathematics', 'Fractions, Decimals, Geometry basics')",
        [r.insertId]
      );
    }

    for (const [first, last, subject] of TEACHERS) {
      await conn.execute("INSERT INTO teachers (first_name, last_name, subject) VALUES (?, ?, ?)", [
        first,
        last,
        subject,
      ]);
    }

    for (const [first, last, roll, guardian, email, classIdx, fee, att, scores] of STUDENTS) {
      const [s] = await conn.execute("INSERT INTO students (first_name, last_name, roll_number) VALUES (?, ?, ?)", [
        first,
        last,
        roll,
      ]);
      const studentId = s.insertId;
      const [g] = await conn.execute(
        "INSERT INTO guardians (full_name, email, preferred_channel, consent_email, consent_updated_at) VALUES (?, ?, 'email', ?, NOW())",
        [guardian, email, email ? 1 : 0]
      );
      await conn.execute("INSERT INTO student_guardians (student_id, guardian_id, is_primary) VALUES (?, ?, 1)", [
        studentId,
        g.insertId,
      ]);
      const classId = classIds[classIdx];
      await conn.execute("INSERT INTO enrollments (student_id, classroom_id, start_date) VALUES (?, ?, ?)", [
        studentId,
        classId,
        daysAgo(90),
      ]);

      // Fees: monthly 150.00
      const fees = {
        paid: [
          [daysAgo(40), 150, "paid"],
          [daysAgo(10), 150, "paid"],
        ],
        overdue1: [
          [daysAgo(40), 150, "paid"],
          [daysAgo(10), 0, "pending"],
        ],
        overdue2: [
          [daysAgo(40), 0, "pending"],
          [daysAgo(10), 0, "pending"],
        ],
        partial: [
          [daysAgo(40), 150, "paid"],
          [daysAgo(10), 60, "partial"],
        ],
        upcoming: [
          [daysAgo(40), 150, "paid"],
          [daysAgo(-10), 0, "pending"],
        ],
      }[fee];
      for (const [due, paid, status] of fees) {
        await conn.execute(
          "INSERT INTO fee_ledgers (student_id, month, due_date, amount_due, amount_paid, status, paid_date) VALUES (?, ?, ?, 150, ?, ?, ?)",
          [studentId, due.slice(0, 7), due, paid, status, status === "paid" ? due : null]
        );
      }

      // Attendance over the last 10 days
      for (let d = 10; d >= 1; d--) {
        let status = "present";
        if (att === "poor" && d % 2 === 0) status = "absent";
        if (att === "streak" && d <= 3) status = "absent";
        if (att === "good" && d === 7) status = "late";
        await conn.execute("INSERT INTO attendance (student_id, classroom_id, day, status) VALUES (?, ?, ?, ?)", [
          studentId,
          classId,
          daysAgo(d),
          status,
        ]);
      }

      // Results for two terms
      for (const [i, pct] of scores.entries()) {
        await conn.execute(
          "INSERT INTO result_cards (student_id, classroom_id, term, total_score, percentage, grade) VALUES (?, ?, ?, ?, ?, ?)",
          [studentId, classId, `Term ${i + 1}`, pct * 5, pct, calcGrade(pct)]
        );
      }
    }

    await conn.commit();
    console.log(
      `[seed] Inserted ${CLASSES.length} classes, ${TEACHERS.length} teachers, ${STUDENTS.length} students with fees, attendance and results.`
    );
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

/**
 * Development-only accounts for trying each role: accountant, admin and a teacher
 * linked to the first teacher record and assigned to the first class.
 * Created only if missing; never in production.
 */
export async function seedDemoUsers() {
  if (process.env.NODE_ENV === "production") return;
  const password = process.env.DEMO_USER_PASSWORD || "password123";
  const [[teacher]] = await pool.query("SELECT id FROM teachers WHERE is_active = 1 ORDER BY id LIMIT 1");
  const [[firstClass]] = await pool.query("SELECT id, name FROM classrooms WHERE is_active = 1 ORDER BY id LIMIT 1");

  const accounts = [
    { username: "Demo Accountant", email: "accountant@school.test", role: "accountant" },
    { username: "Demo Admin", email: "office@school.test", role: "admin" },
    ...(teacher
      ? [{ username: "Demo Teacher", email: "teacher@school.test", role: "teacher", teacher_id: teacher.id }]
      : []),
  ];
  for (const account of accounts) {
    const [[existing]] = await pool.query("SELECT id FROM users WHERE email = ?", [account.email]);
    if (existing) continue;
    await createUser({ ...account, password });
    console.log(`[seed] demo ${account.role}: ${account.email} / ${password}`);
  }
  if (teacher && firstClass) {
    await pool.query("INSERT IGNORE INTO teacher_classes (teacher_id, classroom_id) VALUES (?, ?)", [
      teacher.id,
      firstClass.id,
    ]);
    console.log(`[seed] demo teacher assigned to ${firstClass.name}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  seed()
    .then(seedDemoUsers)
    .catch((err) => {
      console.error("[seed] failed:", err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
