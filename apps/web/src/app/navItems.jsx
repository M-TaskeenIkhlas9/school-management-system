/**
 * Sidebar sections, grouped by how the school uses them. The first item a role may open is its
 * home page (see homePath), so the order matters.
 */
export const navGroups = [
  {
    label: "Workspace",
    items: [
      { path: "/dashboard", permission: "dashboard:read", label: "Dashboard", icon: "dashboard" },
      { path: "/attendance", permission: "attendance:read", label: "Attendance", icon: "attendance" },
      { path: "/fees", permission: "fees:read", label: "Fees", icon: "fees" },
    ],
  },
  {
    label: "Records",
    items: [
      { path: "/students", permission: "students:read", label: "Students", icon: "students" },
      { path: "/teachers", permission: "teachers:read", label: "Teachers", icon: "teachers" },
      { path: "/classes", permission: "classes:read", label: "Classes", icon: "classes" },
      { path: "/exams", permission: "exams:read", label: "Exams", icon: "exams" },
      { path: "/results", permission: "results:read", label: "Results", icon: "results" },
    ],
  },
  {
    label: "AI & messages",
    items: [
      { path: "/ai-center", permission: "assistant:use", label: "AI assistant", icon: "sparkle" },
      { path: "/approvals", permission: "messages:draft", label: "Approvals", icon: "approvals", badge: "pending" },
      { path: "/outbox", permission: "messages:read", label: "Outbox", icon: "outbox" },
      { path: "/automations", permission: "messages:draft", label: "Automations", icon: "calendar" },
      { path: "/predict", permission: "reports:read", label: "Risk predictions", icon: "predict" },
      { path: "/ai-usage", permission: "reports:read", label: "AI usage", icon: "chart" },
    ],
  },
  {
    label: "Administration",
    items: [
      { path: "/users", permission: "users:manage", label: "Users & access", icon: "users" },
      { path: "/settings", permission: "users:manage", label: "Settings", icon: "settings" },
    ],
  },
];

export const navItems = navGroups.flatMap((g) => g.items);
