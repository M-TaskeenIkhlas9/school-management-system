// Sidebar navigation: one entry per page route.
export const navItems = [
  {
    path: "/dashboard",
    label: "Dashboard",
    colorClass: "nav-icon--blue",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-6v-6H10v6H4a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    ),
  },
  {
    path: "/students",
    label: "Students",
    colorClass: "nav-icon--violet",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm8 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM2 20a6 6 0 0 1 12 0v1H2v-1Zm13 1v-1a6.5 6.5 0 0 0-1.1-3.6A5 5 0 0 1 22 21v0h-7Z" />
      </svg>
    ),
  },
  {
    path: "/teachers",
    label: "Teachers",
    colorClass: "nav-icon--indigo",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 2 8l10 5 9-4.5V17h2V8L12 3Zm-6 9v4a6 6 0 0 0 12 0v-4l-6 3-6-3Z" />
      </svg>
    ),
  },
  {
    path: "/classes",
    label: "Classes & Curriculum",
    colorClass: "nav-icon--teal",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5a2 2 0 0 1 2-2h11a3 3 0 0 1 3 3v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5Zm2 0v13h12V6a1 1 0 0 0-1-1H6Z" />
      </svg>
    ),
  },
  {
    path: "/ai-center",
    label: "AI Center",
    colorClass: "nav-icon--orange",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 9.5 8H3l5.2 3.8L6 18l6-3.8L18 18l-2.2-6.2L21 8h-6.5L12 2Z" />
      </svg>
    ),
  },
  {
    path: "/exams",
    label: "Exams & Tests",
    colorClass: "nav-icon--sky",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 2h10a2 2 0 0 1 2 2v2h-2V4H7v2H5V4a2 2 0 0 1 2-2Zm12 7v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9h14Zm-9 3v2h2v-2H10Zm0 4v2h6v-2h-6Z" />
      </svg>
    ),
  },
  {
    path: "/attendance",
    label: "Attendance",
    colorClass: "nav-icon--green",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 8 2 2 5-5-1.4-1.4-3.6 3.6-0.6-0.6L8 11Z" />
      </svg>
    ),
  },
  {
    path: "/results",
    label: "Results & Report Cards",
    colorClass: "nav-icon--amber",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 1.5V9h4.5L14 4.5ZM9 13h6v2H9v-2Zm0 4h6v2H9v-2Z" />
      </svg>
    ),
  },
  {
    path: "/fees",
    label: "Accounts & Fees",
    colorClass: "nav-icon--emerald",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6a2 2 0 0 1 2-2h12a3 3 0 0 1 3 3v2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a3 3 0 0 0 3-3v-2H8a2 2 0 0 1-2-2V6Zm14 8h3v-2h-3v2Z" />
      </svg>
    ),
  },
  {
    path: "/predict",
    label: "Predict & XAI",
    colorClass: "nav-icon--rose",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a9 9 0 0 1 9 9c0 3.4-2 6.7-4.7 8.2L12 22l-4.3-2.8C5 17.7 3 14.4 3 11a9 9 0 0 1 9-9Zm-1 6v5h2V8h-2Zm0 7v2h2v-2h-2Z" />
      </svg>
    ),
  },
];
