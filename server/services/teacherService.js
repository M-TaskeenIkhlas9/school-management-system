import pool from "../db.js";

export async function getAll() {
  const [rows] = await pool.execute(
    "SELECT * FROM teachers WHERE is_active = 1 ORDER BY id DESC"
  );
  return rows;
}

export async function getById(id) {
  const [rows] = await pool.execute(
    "SELECT * FROM teachers WHERE id = ? AND is_active = 1",
    [id]
  );
  return rows[0] || null;
}

export async function create({ first_name, last_name, subject, phone, email, joining_date }) {
  const [result] = await pool.execute(
    "INSERT INTO teachers (first_name, last_name, subject, phone, email, joining_date) VALUES (?, ?, ?, ?, ?, ?)",
    [first_name, last_name, subject || null, phone || null, email || null, joining_date || null]
  );
  return (await getById(result.insertId));
}

export async function update(id, data) {
  const fields = [];
  const values = [];
  for (const key of ["first_name", "last_name", "subject", "phone", "email", "joining_date"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) return getById(id);
  values.push(id);
  await pool.execute(`UPDATE teachers SET ${fields.join(", ")} WHERE id = ?`, values);
  return getById(id);
}

export async function remove(id) {
  await pool.execute("UPDATE teachers SET is_active = 0 WHERE id = ?", [id]);
}
