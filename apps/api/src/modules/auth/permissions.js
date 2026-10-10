/**
 * Role → permission map. This is the single source of truth for who may do what;
 * the API, the web app and (from M1) the assistant's tool list all derive from it.
 */
export const ROLES = ["principal", "admin", "accountant", "teacher"];

export const PERMISSIONS = [
  "dashboard:read",
  "students:read",
  "students:write",
  "teachers:read",
  "teachers:write",
  "classes:read",
  "classes:write",
  "attendance:read",
  "attendance:write",
  "results:read",
  "results:write",
  "exams:read",
  "exams:write",
  "fees:read",
  "fees:write",
  "reports:read",
  "users:manage",
  "assistant:use",
];

const ROLE_PERMISSIONS = {
  // Everything.
  principal: PERMISSIONS,
  // Runs the school's records and accounts, but not money.
  admin: PERMISSIONS.filter((p) => !p.startsWith("fees:")),
  // Fees and payments; student and class details only to identify who pays.
  accountant: ["dashboard:read", "students:read", "classes:read", "fees:read", "fees:write", "assistant:use"],
  // Own classes only (see CLASS_SCOPED_ROLES): students, attendance, results, exams.
  teacher: [
    "dashboard:read",
    "students:read",
    "classes:read",
    "attendance:read",
    "attendance:write",
    "results:read",
    "results:write",
    "exams:read",
    "exams:write",
    "assistant:use",
  ],
};

/** Roles whose access is limited to the classes assigned to them (teacher_classes). */
export const CLASS_SCOPED_ROLES = new Set(["teacher"]);

/** Who may assign a role: only a principal can create or promote another principal. */
export function canAssignRole(actorRole, targetRole) {
  if (targetRole === "principal") return actorRole === "principal";
  return actorRole === "principal" || actorRole === "admin";
}

export function permissionsFor(role) {
  return ROLE_PERMISSIONS[role] ?? [];
}
