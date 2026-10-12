import pool from "../../db/pool.js";
import { createError } from "../../middleware/errorHandler.js";
import { ROLES, canAssignRole, permissionsFor } from "../auth/permissions.js";
import { createUser, getUser, hashPassword, revokeSessions } from "../auth/auth.service.js";
import { setClasses } from "../teachers/teachers.service.js";
import { pageResult, pageWindow } from "../../lib/pagination.js";

export async function list() {
  const [rows] = await pool.execute(
    `SELECT u.id, u.username, u.email, u.role, u.teacher_id, u.is_active, u.last_login_at, u.created_at,
            CONCAT(t.first_name, ' ', t.last_name) AS teacher_name,
            (SELECT GROUP_CONCAT(tc.classroom_id ORDER BY tc.classroom_id)
             FROM teacher_classes tc WHERE tc.teacher_id = u.teacher_id) AS class_ids
     FROM users u LEFT JOIN teachers t ON t.id = u.teacher_id
     ORDER BY FIELD(u.role, 'principal', 'admin', 'accountant', 'teacher'), u.username`
  );
  return rows.map((r) => ({
    ...r,
    class_ids: r.role === "teacher" && r.class_ids ? String(r.class_ids).split(",").map(Number) : [],
  }));
}

/** Each role, what it may do, and whether this actor may give it out. */
export function roles(actor) {
  return ROLES.map((role) => ({
    role,
    permissions: permissionsFor(role),
    assignable: canAssignRole(actor.role, role),
  }));
}

/** Recent audit entries, newest first. Filters: user_id, action prefix (e.g. "auth."). */
export async function activity({ user_id, action, ...paging }) {
  const where = [];
  const params = [];
  if (user_id) {
    where.push("(a.user_id = ? OR (a.entity_type = 'user' AND a.entity_id = ?))");
    params.push(user_id, user_id);
  }
  if (action) {
    where.push("a.action LIKE ?");
    params.push(`${action.replace(/[%_]/g, "")}%`);
  }
  const sql = where.length ? `WHERE ${where.join(" AND ")}` : "";
  const [[{ total }]] = await pool.query(`SELECT COUNT(*) AS total FROM audit_log a ${sql}`, params);
  const [rows] = await pool.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.ip, a.created_at,
            a.user_id, u.username, u.role, target.username AS target_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN users target ON a.entity_type = 'user' AND target.id = a.entity_id
     ${sql} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    [...params, ...Object.values(pageWindow(paging))]
  );
  const items = rows.map((r) => ({ ...r, details: typeof r.details === "string" ? JSON.parse(r.details) : r.details }));
  return pageResult(items, Number(total), paging);
}

async function assertClassesExist(classroomIds) {
  if (!classroomIds?.length) return;
  const [rows] = await pool.query("SELECT id FROM classrooms WHERE id IN (?)", [classroomIds]);
  if (rows.length !== new Set(classroomIds).size) throw createError(400, "Unknown class", "CLASS_NOT_FOUND");
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
  if (data.role === "teacher") await assertClassesExist(data.classroom_ids);
  let user;
  try {
    user = await createUser({ ...data, teacher_id: data.role === "teacher" ? data.teacher_id : null });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw createError(409, "That teacher already has an account", "TEACHER_TAKEN");
    throw err;
  }
  if (data.role === "teacher" && data.classroom_ids) await setClasses(data.teacher_id, data.classroom_ids);
  return user;
}

/** Sign a user out everywhere (e.g. a lost phone). */
export async function signOutEverywhere(actor, id) {
  const target = await getUser(id);
  if (!target) throw createError(404, "User not found", "NOT_FOUND");
  if (target.role === "principal" && actor.role !== "principal") {
    throw createError(403, "Only a principal can change a principal's account", "FORBIDDEN");
  }
  await revokeSessions(id);
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
  if (role === "teacher") await assertClassesExist(changes.classroom_ids);

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
    // A reset password ends the user's current sessions.
    sets.push("password_hash = ?", "session_version = session_version + 1");
    values.push(await hashPassword(changes.password));
  }
  try {
    await pool.execute(`UPDATE users SET ${sets.join(", ")} WHERE id = ?`, [...values, id]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") throw createError(409, "That teacher already has an account", "TEACHER_TAKEN");
    throw err;
  }
  if (role === "teacher" && changes.classroom_ids) await setClasses(teacherId, changes.classroom_ids);
  return getUser(id);
}
