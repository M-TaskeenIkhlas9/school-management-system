import pool from "../../db/pool.js";

export async function getAll() {
  const [rows] = await pool.execute(
    "SELECT * FROM classrooms WHERE is_active = 1 ORDER BY id DESC"
  );
  return rows;
}

export async function getById(id) {
  const [rows] = await pool.execute(
    "SELECT * FROM classrooms WHERE id = ? AND is_active = 1",
    [id]
  );
  return rows[0] || null;
}

export async function create({ name, grade, section, academic_year }) {
  const [result] = await pool.execute(
    "INSERT INTO classrooms (name, grade, section, academic_year) VALUES (?, ?, ?, ?)",
    [name, grade, section || null, academic_year || null]
  );
  return (await getById(result.insertId));
}

export async function update(id, data) {
  const fields = [];
  const values = [];
  for (const key of ["name", "grade", "section", "academic_year"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) return getById(id);
  values.push(id);
  await pool.execute(`UPDATE classrooms SET ${fields.join(", ")} WHERE id = ?`, values);
  return getById(id);
}

export async function remove(id) {
  await pool.execute("UPDATE classrooms SET is_active = 0 WHERE id = ?", [id]);
}
