import { z } from "zod";
import schoolTools from "./school.js";
import studentTools from "./students.js";
import attendanceTools from "./attendance.js";
import resultTools from "./results.js";
import feeTools from "./fees.js";
import reportTools from "./reports.js";

export { ToolError } from "./helpers.js";

/**
 * Every tool: { name, description, permission, input (zod object), label(input), run(input, ctx) }.
 * ctx = { user, req } where req mimics an HTTP request so the access helpers can be reused.
 */
export const ALL_TOOLS = [
  ...schoolTools,
  ...studentTools,
  ...attendanceTools,
  ...resultTools,
  ...feeTools,
  ...reportTools,
];

const byName = new Map(ALL_TOOLS.map((t) => [t.name, t]));
if (byName.size !== ALL_TOOLS.length) throw new Error("Duplicate tool name");

/** Tools this user may use; others are never shown to the model. */
export const toolsForUser = (user) => ALL_TOOLS.filter((t) => user.permissions.has(t.permission));

export const getTool = (name) => byName.get(name);

/** Tool description in the function-calling format models expect. */
export function modelSpec(tool) {
  const { $schema: _ignored, ...parameters } = z.toJSONSchema(tool.input);
  return { type: "function", function: { name: tool.name, description: tool.description, parameters } };
}
