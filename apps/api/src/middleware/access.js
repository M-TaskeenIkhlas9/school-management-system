import pool from "../db/pool.js";
import { createError } from "./errorHandler.js";

const forbidden = () => createError(403, "You do not have permission to do this", "FORBIDDEN");

export const hasPermission = (req, permission) => Boolean(req.user?.permissions.has(permission));

/** Require every listed permission. Use after `auth`. */
export function requirePermission(...permissions) {
  return (req, _res, next) => (permissions.every((p) => hasPermission(req, p)) ? next() : next(forbidden()));
}

/** Reads (GET/HEAD) need `readPermission`; anything else needs `writePermission`. */
export function byMethod(readPermission, writePermission) {
  return (req, _res, next) => {
    const needed = req.method === "GET" || req.method === "HEAD" ? readPermission : writePermission;
    return hasPermission(req, needed) ? next() : next(forbidden());
  };
}

/** null = all classes; otherwise the class ids this user is limited to (may be empty). */
export const classScope = (req) => req.user?.classIds ?? null;

/** Throw 403 unless the user may access `classroomId`. */
export function assertClassAccess(req, classroomId) {
  const scope = classScope(req);
  if (scope && !scope.includes(Number(classroomId))) throw forbidden();
}

/** Throw 403 unless the student is actively enrolled in one of the user's classes. */
export async function assertStudentAccess(req, studentId) {
  const scope = classScope(req);
  if (!scope) return;
  if (!scope.length) throw forbidden();
  const [rows] = await pool.query(
    "SELECT 1 FROM enrollments WHERE student_id = ? AND is_active = 1 AND classroom_id IN (?) LIMIT 1",
    [studentId, scope]
  );
  if (!rows.length) throw forbidden();
}

/** Data integrity for every role: the student must be actively enrolled in that class. */
export async function assertStudentInClass(studentId, classroomId) {
  const [rows] = await pool.execute(
    "SELECT 1 FROM enrollments WHERE student_id = ? AND classroom_id = ? AND is_active = 1 LIMIT 1",
    [studentId, classroomId]
  );
  if (!rows.length) {
    throw createError(400, "That student is not enrolled in that class", "STUDENT_NOT_IN_CLASS");
  }
}
