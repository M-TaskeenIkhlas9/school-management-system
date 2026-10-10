import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import LoginPage from "../auth/LoginPage.jsx";
import AppLayout from "./AppLayout.jsx";
import { navItems } from "./navItems.jsx";
import DashboardPage from "../features/dashboard/DashboardPage.jsx";
import StudentsPage from "../features/students/StudentsPage.jsx";
import TeachersPage from "../features/teachers/TeachersPage.jsx";
import ClassesPage from "../features/classes/ClassesPage.jsx";
import AiCenterPage from "../features/ai-center/AiCenterPage.jsx";
import ExamsPage from "../features/exams/ExamsPage.jsx";
import AttendancePage from "../features/attendance/AttendancePage.jsx";
import ResultsPage from "../features/results/ResultsPage.jsx";
import FeesPage from "../features/fees/FeesPage.jsx";
import PredictPage from "../features/predict/PredictPage.jsx";
import SettingsPage from "../features/settings/SettingsPage.jsx";

// Every page with the permission required to open it.
const pages = [
  { path: "dashboard", element: <DashboardPage />, permission: "dashboard:read" },
  { path: "students", element: <StudentsPage />, permission: "students:read" },
  { path: "teachers", element: <TeachersPage />, permission: "teachers:read" },
  { path: "classes", element: <ClassesPage />, permission: "classes:read" },
  { path: "ai-center", element: <AiCenterPage />, permission: "assistant:use" },
  { path: "exams", element: <ExamsPage />, permission: "exams:read" },
  { path: "attendance", element: <AttendancePage />, permission: "attendance:read" },
  { path: "results", element: <ResultsPage />, permission: "results:read" },
  { path: "fees", element: <FeesPage />, permission: "fees:read" },
  { path: "predict", element: <PredictPage />, permission: "reports:read" },
  { path: "settings", element: <SettingsPage />, permission: "users:manage" },
];

/** First page this user may open (used as home and as the redirect for forbidden pages). */
export function homePath(can) {
  return navItems.find((item) => can(item.permission))?.path ?? "/no-access";
}

function RequireAuth({ children }) {
  const { isAuthenticated, isReady } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (!isReady) return <div className="page-loading muted">Loading…</div>;
  return children;
}

function RequirePermission({ permission, children }) {
  const { can } = useAuth();
  return can(permission) ? children : <Navigate to={homePath(can)} replace />;
}

function NoAccess() {
  return (
    <section className="section active">
      <div className="card empty-card">
        Your account has no pages assigned yet. Ask the principal to check your role and classes.
      </div>
    </section>
  );
}

export default function App() {
  const { isAuthenticated, can } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to={homePath(can)} replace />} />
        {pages.map(({ path, element, permission }) => (
          <Route
            key={path}
            path={path}
            element={<RequirePermission permission={permission}>{element}</RequirePermission>}
          />
        ))}
        <Route path="no-access" element={<NoAccess />} />
        <Route path="*" element={<Navigate to={homePath(can)} replace />} />
      </Route>
    </Routes>
  );
}
