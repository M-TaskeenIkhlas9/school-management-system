import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import LoginPage from "../auth/LoginPage.jsx";
import AppLayout from "./AppLayout.jsx";
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

function RequireAuth({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return children;
}

export default function App() {
  const { isAuthenticated } = useAuth();
  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="dashboard" element={<DashboardPage />} />
        <Route path="students" element={<StudentsPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="ai-center" element={<AiCenterPage />} />
        <Route path="exams" element={<ExamsPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="results" element={<ResultsPage />} />
        <Route path="fees" element={<FeesPage />} />
        <Route path="predict" element={<PredictPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  );
}
