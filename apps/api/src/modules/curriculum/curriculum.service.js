import pool from "../../db/pool.js";

export async function getAll() {
  const [rows] = await pool.execute("SELECT * FROM curriculum_items ORDER BY id DESC");
  return rows;
}

export async function getById(id) {
  const [rows] = await pool.execute("SELECT * FROM curriculum_items WHERE id = ?", [id]);
  return rows[0] || null;
}

export async function create({ classroom_id, subject, book_title, topics, chapter_number, learning_objectives }) {
  const [result] = await pool.execute(
    "INSERT INTO curriculum_items (classroom_id, subject, book_title, topics, chapter_number, learning_objectives) VALUES (?, ?, ?, ?, ?, ?)",
    [classroom_id, subject, book_title || null, topics || null, chapter_number || null, learning_objectives || null]
  );
  return (await getById(result.insertId));
}

export async function update(id, data) {
  const fields = [];
  const values = [];
  for (const key of ["classroom_id", "subject", "book_title", "topics", "chapter_number", "learning_objectives"]) {
    if (data[key] !== undefined) {
      fields.push(`${key} = ?`);
      values.push(data[key]);
    }
  }
  if (!fields.length) return getById(id);
  values.push(id);
  await pool.execute(`UPDATE curriculum_items SET ${fields.join(", ")} WHERE id = ?`, values);
  return getById(id);
}

export async function remove(id) {
  await pool.execute("DELETE FROM curriculum_items WHERE id = ?", [id]);
}
