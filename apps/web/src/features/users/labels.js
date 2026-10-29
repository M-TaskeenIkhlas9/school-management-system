/** Human words for roles, permissions and audit entries. */

export const ROLE_LABEL = { principal: "Principal", admin: "Admin", accountant: "Accountant", teacher: "Teacher" };

export const ROLE_SUMMARY = {
  principal: "Everything, including money, messages to parents and managing accounts.",
  admin: "Runs records and accounts (students, teachers, classes, users) but not money.",
  accountant: "Fees and payments; sees students and classes only to know who pays.",
  teacher: "Only their assigned classes: students, attendance, results and exams.",
};

const AREA = {
  dashboard: "Dashboard",
  students: "Students & guardians",
  teachers: "Teachers",
  classes: "Classes & curriculum",
  attendance: "Attendance",
  results: "Results",
  exams: "Exams",
  fees: "Fees & payments",
  reports: "Reports",
  users: "User accounts",
  assistant: "AI assistant",
  messages: "Messages to parents",
};
const VERB = { read: "view", write: "edit", manage: "manage", use: "use", draft: "draft", send: "approve & send" };

/** Group permissions by area: [{ area, verbs: ["view", "edit"] }]. */
export function describePermissions(permissions) {
  const byArea = new Map();
  for (const p of permissions) {
    const [area, verb] = p.split(":");
    const list = byArea.get(area) ?? [];
    list.push(VERB[verb] ?? verb);
    byArea.set(area, list);
  }
  return Object.keys(AREA)
    .filter((area) => byArea.has(area))
    .map((area) => ({ area: AREA[area], verbs: byArea.get(area) }));
}

export const ACTIVITY_KINDS = [
  ["", "Everything"],
  ["auth.", "Sign-ins & passwords"],
  ["user.", "Account changes"],
  ["teacher.", "Class assignments"],
  ["action.", "Approvals"],
  ["automation.", "Automations"],
];

/** One line describing an audit entry. */
export function describeActivity(a) {
  const d = a.details ?? {};
  const target = a.target_name ?? `account #${a.entity_id}`;
  switch (a.action) {
    case "auth.login":
      return "Signed in";
    case "auth.login_failed":
      return `Failed sign-in attempt for ${d.email ?? "an unknown email"}`;
    case "auth.password_change":
      return "Changed their own password";
    case "user.create":
      return `Created an account for ${target} (${ROLE_LABEL[d.role] ?? d.role})`;
    case "user.update": {
      const parts = [];
      if (d.role) parts.push(`role → ${ROLE_LABEL[d.role] ?? d.role}`);
      if (d.is_active === false) parts.push("deactivated");
      if (d.is_active === true) parts.push("reactivated");
      if (d.password_changed) parts.push("password reset");
      if (d.classroom_ids) parts.push(`classes → ${d.classroom_ids.length}`);
      if (d.username) parts.push(`name → ${d.username}`);
      return `Updated ${target}${parts.length ? `: ${parts.join(", ")}` : ""}`;
    }
    case "user.sign_out_everywhere":
      return `Signed ${target} out everywhere`;
    case "teacher.classes.set":
      return `Set classes of teacher #${a.entity_id} (${d.classroom_ids?.length ?? 0})`;
    case "action.propose":
      return `Prepared ${d.type === "record_fee_payment" ? "a fee payment" : "a message to parents"} for approval`;
    case "action.edit":
      return "Edited a prepared message";
    case "automation.create":
      return `Created an automation (${d.kind?.replace("_", " ") ?? "rule"}${d.mode === "auto" ? ", sends automatically" : ""})`;
    case "automation.update":
      return d.is_active === false
        ? "Paused an automation"
        : d.is_active === true
          ? "Turned on an automation"
          : "Changed an automation";
    case "automation.delete":
      return "Deleted an automation";
    case "automation.run":
      return `Ran an automation by hand (${d.status})`;
    case "action.approve":
      return `Approved ${d.type === "record_fee_payment" ? "a fee payment" : "a message to parents"}`;
    case "action.reject":
      return "Rejected a prepared action";
    default:
      return a.action;
  }
}

/** A readable temporary password (no 0/O/1/l look-alikes). */
export function generatePassword(length = 12) {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(length));
  return Array.from(bytes, (n) => chars[n % chars.length]).join("");
}

/** "::ffff:127.0.0.1" → "127.0.0.1" */
export const displayIp = (ip) => (ip ? String(ip).replace(/^::ffff:/, "") : "—");
