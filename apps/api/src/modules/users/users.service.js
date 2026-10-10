import pool from "../../db/pool.js";
import { createError } from "../../middleware/errorHandler.js";
import { canAssignRole } from "../auth/permissions.js";
import { createUser, getUser, hashPassword } from "../auth/auth.service.js";

export async function list() {
  const [rows] = await pool.execute(
    `SELECT u.id, u.username, u.email, u.role, u.teacher_id, u.is_active, u.last_login_at, u.created_at,
            CONCAT(t.first_name, ' ', t.last_name) AS teacher_name
     FROM users u LEFT JOIN teachers t ON t.id = u.teacher_id
     ORDER BY u.role, u.username`
  );
  return rows;
}

async function assertTeacherLink(role, teacherId) {
  if (role !== "teacher") return;
  if (!teacherId) throw createError(400, "A teacher account must be linked to a teacher record", "TEACHER_REQUIRED");
  const [[teacher]] = await pool.execute("SELECT id FROM teachers WHERE id = ? AND is_active = 1", [teacherId]);
  if (!teacher) throw createError(400, "Teacher record not found", "TEACHER_NOT_FOUND");
}

async function activePrincipalCount() {
  const [[{ n }]] = await pool.execute("SELECT COUNT(*) AS n FROM users WHERE role = 'principal' AND is_active = 1");
  return Number(n);
}

export async function create(actor, data) {
  if (!canAssignRole(actor.role, data.role)) {
    throw createError(403, `You cannot create a ${data.role} account`, "FORBIDDEN");
  }
  await assertTeacherLink(data.role, data.teacher_id);
  return createUser({ ...data, teacher_id: data.role === "teacher" ? data.teacher_id : null });
}

/** Change role / active flag / teacher link / password, with safety rules. */
export async function update(actor, id, changes) {
  const target = await getUser(id);
  if (!target) throw createError(404, "User not found", "NOT_FOUND");
  if (target.role === "principal" && actor.role !== "principal") {
    throw createError(403, "Only a principal can change a principal's account", "FORBIDDEN");
  }

  const role = changes.role ?? target.role;
  if (changes.role && !canAssignRole(actor.role, changes.role)) {
    throw createError(403, `You cannot assign the ${changes.role} role`, "FORBIDDEN");
  }
  if (id === actor.id && (changes.is_active === false || (changes.role && changes.role !== target.role))) {
    throw createError(400, "You cannot deactivate yourself or change your own role", "SELF_CHANGE");
  }
  const losingPrincipal =
    target.role === "principal" &&
    target.is_active &&
    (changes.is_active === false || (changes.role && role !== "principal"));
  if (losingPrincipal && (await activePrincipalCount()) <= 1) {
    throw createError(400, "The school must keep at least one active principal", "LAST_PRINCIPAL");
  }

  const teacherId = role === "teacher" ? (changes.teacher_id ?? target.teacher_id) : null;
  await assertTeacherLink(role, teacherId);

  const sets = ["role = ?", "teacher_id = ?"];
  const values = [role, teacherId];
  if (changes.is_active !== undefined) {
    sets.push("is_active = ?");
    values.push(changes.is_active ? 1 : 0);
  }
  if (changes.username) {
    sets.push("username = ?");
    values.push(changes.username);
  }
  if (changes.password) {
    sets.push("password_hash = ?");
    values.push(await hashPassword(changes.password));
  }
  try {
    await pool.execute(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw createError(409, "That teacher already has an account", "TEACHER_TAKEN");
    throw err;
  }
  return getUser(id);
}
