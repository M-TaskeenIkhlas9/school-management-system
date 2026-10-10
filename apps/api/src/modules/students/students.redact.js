import { hasPermission } from "../../middleware/access.js";

/** Remove fields the caller may not see (fees for a teacher, results for an accountant, …). */
export function redactStudent(req, student) {
  const out = { ...student };
  if (!hasPermission(req, "fees:read")) {
    delete out.latest_fee_status;
    delete out.fees;
  }
  if (!hasPermission(req, "results:read")) delete out.results;
  if (!hasPermission(req, "attendance:read")) delete out.attendance_rate;
  return out;
}
