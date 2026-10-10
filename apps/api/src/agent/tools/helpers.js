import { classScope } from "../../middleware/access.js";
import * as classroomService from "../../modules/classrooms/classrooms.service.js";

/** An error the model should see and recover from (wrong name, no access, ambiguous class…). */
export class ToolError extends Error {}

/** Resolve a class name the user can see; exact name/grade first, then partial match. */
export async function resolveClass(ctx, className) {
  if (!className) return null;
  const rooms = await classroomService.getAll({ classIds: classScope(ctx.req) });
  const needle = String(className).trim().toLowerCase();
  const exact = rooms.filter((r) => r.name.toLowerCase() === needle || String(r.grade).toLowerCase() === needle);
  const matches = exact.length ? exact : rooms.filter((r) => r.name.toLowerCase().includes(needle));
  if (matches.length === 1) return matches[0];
  const available = rooms.map((r) => r.name).join(", ") || "none";
  if (!matches.length) throw new ToolError(`No class matching "${className}". Classes you can see: ${available}.`);
  throw new ToolError(`"${className}" matches several classes: ${matches.map((r) => r.name).join(", ")}. Which one?`);
}

export const fullName = (row) => `${row.first_name ?? ""} ${row.last_name ?? ""}`.trim();
