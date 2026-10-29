/** One line-icon family for the whole app (24px grid, 1.6 stroke, inherits text colour). */
const PATHS = {
  dashboard: "M4 4h7v7H4zM13 4h7v4h-7zM13 10h7v10h-7zM4 13h7v7H4z",
  attendance: "M9 3.5h6v3H9zM7 5H5v15.5h14V5h-2M8.5 13.5l2.5 2.5 4.5-5",
  fees: "M3 6.5h18v11H3zM12 14.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM6.5 12h.01M17.5 12h.01",
  students:
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c.4-3.4 3-5.3 6.5-5.3s6.1 1.9 6.5 5.3M16 4.4a3.5 3.5 0 0 1 0 6.3M18 14.9c2 .7 3.2 2.3 3.5 5.1",
  teachers: "M2.5 9 12 4.5 21.5 9 12 13.5zM6.5 11v5c1.4 1.6 3.3 2.5 5.5 2.5s4.1-.9 5.5-2.5v-5M21.5 9v5",
  classes: "M3.5 20.5V9L12 4l8.5 5v11.5M9.5 20.5v-6h5v6M2 20.5h20",
  exams: "M6 3h9l4 4v14H6zM14.5 3v4.5H19M9 12h7M9 16h5",
  results: "M5 20V11M10.5 20V5M16 20v-6.5M3 20.5h18",
  assistant: "M4 4.5h16v11.5H9.5L4 20.5zM8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01",
  approvals: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12.3l2.8 2.8L16.2 9.5",
  outbox: "M21 3 10.2 13.8M21 3l-6.8 18-4-7.2L3 9.8z",
  predict: "M3 17.5 9 11.5l4 4 8-8M15.5 7.5H21V13",
  users: "M12 3 19.5 6v6c0 4.4-3.2 8.1-7.5 9-4.3-.9-7.5-4.6-7.5-9V6zM12 10.5v3M12 10.5a1 1 0 1 0 0-.01",
  settings: "M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1M15 4.5v4M9 10v4M17 15.5v4",
  menu: "M4 6.5h16M4 12h16M4 17.5h16",
  close: "M6 6l12 12M18 6 6 18",
  signout: "M14 4.5h5.5v15H14M10 16.5 5.5 12 10 7.5M5.5 12H15",
  search: "M10.5 17.5a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20.5 20.5 15.5 15.5",
  sun: "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4",
  moon: "M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z",
  arrow: "M5 12h14M13 6l6 6-6 6",
  student: "M12 11.5a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4.5 20.5c.6-4 3.6-6 7.5-6s6.9 2 7.5 6",
  bell: "M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0",
  plus: "M12 5v14M5 12h14",
  chevron: "M6 9l6 6 6-6",
  chevronRight: "M9 6l6 6-6 6",
  sparkle:
    "M12 3.5l1.8 5.2 5.2 1.8-5.2 1.8L12 17.5l-1.8-5.2L5 10.5l5.2-1.8zM18.5 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
  book: "M4 5.5C4 4.7 4.7 4 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5zM20 5.5c0-.8-.7-1.5-1.5-1.5H13v16h5.5c.8 0 1.5-.7 1.5-1.5z",
  money:
    "M12 3v18M16.5 7.5c-.6-1.5-2.2-2.5-4.5-2.5-2.6 0-4.5 1.4-4.5 3.3 0 4.4 9 2.4 9 7 0 2-2 3.4-4.6 3.4-2.4 0-4.2-1.1-4.8-2.8",
  trendUp: "M3 17l6-6 4 4 8-8M15 7h6v6",
  trendDown: "M3 7l6 6 4-4 8 8M15 17h6v-6",
  flat: "M5 12h14",
  userPlus:
    "M9.5 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM3 20c.4-3.4 3-5.5 6.5-5.5 1.5 0 2.9.4 4 1.1M18.5 14v6M15.5 17h6",
  message: "M4 5h16v11H9l-5 4zM8.5 9.5h7M8.5 12.5h4.5",
  card: "M3 6h18v12H3zM3 10h18M7 15h3",
  megaphone: "M3.5 10v4h3l7 4.5V5.5l-7 4.5zM17 9a4 4 0 0 1 0 6M6.5 14l1 5h2.5l-1-5",
  calendar: "M4 6h16v14.5H4zM4 10h16M8.5 3.5v4M15.5 3.5v4",
  chart: "M4 19.5h16M7 16V11M11.5 16V7M16 16v-3.5",
  trash: "M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13M10 11v5.5M14 11v5.5",
  logo: "M2.5 9.5 12 5l9.5 4.5L12 14zM6.5 11.5V16c1.5 1.6 3.3 2.5 5.5 2.5s4-.9 5.5-2.5v-4.5M21.5 9.5v5",
};

export default function Icon({ name, size = 18, strokeWidth = 1.6 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
