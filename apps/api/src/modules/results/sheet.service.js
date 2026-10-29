/**
 * Subject-wise results, the way Pakistani schools keep them: a class "award list" per term
 * (each student's marks in each subject out of that subject's total), a position in class, and a
 * printable report card.
 */
import pool from "../../db/pool.js";
import { createError } from "../../middleware/errorHandler.js";
import { calcGrade, PASS_PERCENT } from "./results.service.js";
import { getStudentRate } from "../attendance/attendance.service.js";

const round1 = (n) => Math.round(n * 10) / 10;

/** Subjects for a class's sheet: what was used for that term before, else the class curriculum. */
async function sheetSubjects(classroomId, term) {
  const [used] = await pool.query(
    `SELECT rs.subject, MAX(rs.total) AS total, MIN(rs.position) AS pos
     FROM result_subjects rs JOIN result_cards r ON r.id = rs.result_id
     WHERE r.classroom_id = ? AND r.term = ?
     GROUP BY rs.subject ORDER BY pos, rs.subject`,
    [classroomId, term]
  );
  if (used.length) return used.map((u) => ({ name: u.subject, total: Number(u.total) }));
  const [curriculum] = await pool.query(
    "SELECT DISTINCT subject FROM curriculum_items WHERE classroom_id = ? ORDER BY subject",
    [classroomId]
  );
  return curriculum.map((c) => ({ name: c.subject, total: 100 }));
}

/** The award list for a class and term: subjects, and every student with their marks so far. */
export async function getSheet(classroomId, term) {
  const subjects = await sheetSubjects(classroomId, term);
  const [students] = await pool.query(
    `SELECT s.id AS student_id, CONCAT(s.first_name, ' ', s.last_name) AS student_name, s.roll_number
     FROM enrollments e JOIN students s ON s.id = e.student_id AND s.is_active = 1
     WHERE e.classroom_id = ? AND e.is_active = 1
     ORDER BY s.roll_number IS NULL, s.roll_number, s.first_name`,
    [classroomId]
  );
  const [marks] = await pool.query(
    `SELECT r.student_id, rs.subject, rs.obtained
     FROM result_cards r JOIN result_subjects rs ON rs.result_id = r.id
     WHERE r.classroom_id = ? AND r.term = ?`,
    [classroomId, term]
  );
  const byStudent = new Map();
  for (const m of marks) {
    const row = byStudent.get(m.student_id) ?? {};
    row[m.subject] = Number(m.obtained);
    byStudent.set(m.student_id, row);
  }
  const [terms] = await pool.query(
    "SELECT term FROM result_cards WHERE classroom_id = ? GROUP BY term ORDER BY MIN(created_at)",
    [classroomId]
  );
  return {
    classroom_id: classroomId,
    term,
    subjects,
    terms: terms.map((t) => t.term),
    students: students.map((s) => ({ ...s, marks: byStudent.get(s.student_id) ?? {} })),
  };
}

/**
 * Save the award list. For each student with at least one mark, their card for the term is
 * created or replaced: subject marks, total, percentage and grade.
 */
export async function saveSheet({ classroom_id, term, subjects, rows }) {
  const names = subjects.map((s) => s.name.trim());
  if (new Set(names.map((n) => n.toLowerCase())).size !== names.length) {
    throw createError(400, "Each subject can appear only once", "DUPLICATE_SUBJECT");
  }
  const totals = Object.fromEntries(subjects.map((s) => [s.name.trim(), Number(s.total)]));
  for (const row of rows) {
    for (const [subject, value] of Object.entries(row.marks)) {
      if (value === null || value === "" || value === undefined) continue;
      if (!(subject in totals)) throw createError(400, `Unknown subject "${subject}"`, "VALIDATION_ERROR");
      if (Number(value) < 0 || Number(value) > totals[subject]) {
        throw createError(400, `Marks for ${subject} must be between 0 and ${totals[subject]}`, "MARKS_OUT_OF_RANGE");
      }
    }
  }
  const [enrolled] = await pool.query("SELECT student_id FROM enrollments WHERE classroom_id = ? AND is_active = 1", [
    classroom_id,
  ]);
  const inClass = new Set(enrolled.map((e) => e.student_id));
  if (rows.some((r) => !inClass.has(r.student_id))) {
    throw createError(400, "Some students are not in this class", "STUDENT_NOT_IN_CLASS");
  }

  const conn = await pool.getConnection();
  let saved = 0;
  try {
    await conn.beginTransaction();
    for (const row of rows) {
      const entered = names
        .map((name, i) => ({ name, i, value: row.marks[name] }))
        .filter((m) => m.value !== null && m.value !== "" && m.value !== undefined);
      if (!entered.length) continue;
      const obtained = entered.reduce((sum, m) => sum + Number(m.value), 0);
      const max = entered.reduce((sum, m) => sum + totals[m.name], 0);
      const percentage = round1((obtained / max) * 100);
      const [[existing]] = await conn.query(
        "SELECT id FROM result_cards WHERE student_id = ? AND classroom_id = ? AND term = ? ORDER BY id LIMIT 1",
        [row.student_id, classroom_id, term]
      );
      let resultId = existing?.id;
      if (resultId) {
        await conn.execute("UPDATE result_cards SET total_score = ?, percentage = ?, grade = ? WHERE id = ?", [
          obtained,
          percentage,
          calcGrade(percentage),
          resultId,
        ]);
        await conn.execute("DELETE FROM result_subjects WHERE result_id = ?", [resultId]);
      } else {
        const [res] = await conn.execute(
          "INSERT INTO result_cards (student_id, classroom_id, term, total_score, percentage, grade) VALUES (?, ?, ?, ?, ?, ?)",
          [row.student_id, classroom_id, term, obtained, percentage, calcGrade(percentage)]
        );
        resultId = res.insertId;
      }
      for (const m of entered) {
        await conn.execute(
          "INSERT INTO result_subjects (result_id, subject, obtained, total, position) VALUES (?, ?, ?, ?, ?)",
          [resultId, m.name, Number(m.value), totals[m.name], m.i]
        );
      }
      saved += 1;
    }
    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  return { classroom_id, term, saved };
}

/** Position of every card in a class for a term (1 = top; equal percentages share a position). */
export async function positions(classroomId, term) {
  const [rows] = await pool.query(
    `SELECT id, RANK() OVER (ORDER BY percentage DESC) AS position, COUNT(*) OVER () AS out_of
     FROM result_cards WHERE classroom_id = ? AND term = ?`,
    [classroomId, term]
  );
  return new Map(rows.map((r) => [r.id, { position: Number(r.position), out_of: Number(r.out_of) }]));
}

/** Everything a printed report card shows. */
export async function reportCard(resultId) {
  const [[card]] = await pool.query(
    `SELECT r.*, CONCAT(s.first_name, ' ', s.last_name) AS student_name, s.roll_number,
            c.name AS class_name, c.section, g.full_name AS guardian_name
     FROM result_cards r
     JOIN students s ON s.id = r.student_id
     JOIN classrooms c ON c.id = r.classroom_id
     LEFT JOIN student_guardians sg ON sg.student_id = s.id AND sg.is_primary = 1
     LEFT JOIN guardians g ON g.id = sg.guardian_id
     WHERE r.id = ?`,
    [resultId]
  );
  if (!card) return null;
  const [subjects] = await pool.query(
    "SELECT subject, obtained, total FROM result_subjects WHERE result_id = ? ORDER BY position, subject",
    [resultId]
  );
  const place = (await positions(card.classroom_id, card.term)).get(card.id);
  const subjectRows = subjects.map((s) => {
    const pct = (Number(s.obtained) / Number(s.total)) * 100;
    return {
      subject: s.subject,
      obtained: Number(s.obtained),
      total: Number(s.total),
      percentage: round1(pct),
      grade: calcGrade(pct),
      passed: pct >= PASS_PERCENT,
    };
  });
  const maxMarks = subjectRows.reduce((n, s) => n + s.total, 0);
  return {
    id: card.id,
    classroom_id: card.classroom_id,
    term: card.term,
    student: {
      name: card.student_name,
      roll_number: card.roll_number,
      guardian_name: card.guardian_name,
      class_name: `${card.class_name}${card.section ? ` (${card.section})` : ""}`,
    },
    subjects: subjectRows,
    obtained: Number(card.total_score),
    max_marks: maxMarks || null,
    percentage: Number(card.percentage),
    grade: card.grade,
    passed: Number(card.percentage) >= PASS_PERCENT && subjectRows.every((s) => s.passed),
    position: place?.position ?? null,
    out_of: place?.out_of ?? null,
    attendance_rate: await getStudentRate(card.student_id),
    remarks: card.remarks,
  };
}
