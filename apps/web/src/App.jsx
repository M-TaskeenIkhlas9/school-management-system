import { useEffect, useMemo, useState } from "react";
import LoginPage from "./LoginPage.jsx";
import AgentChat from "./features/agent/AgentChat.jsx";

const navItems = [
  {
    id: "dashboard",
    label: "Dashboard",
    colorClass: "nav-icon--blue",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-6v-6H10v6H4a1 1 0 0 1-1-1v-9.5Z" />
      </svg>
    ),
  },
  {
    id: "students",
    label: "Students",
    colorClass: "nav-icon--violet",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8 12a4 4 0 1 1 0-8 4 4 0 0 1 0 8Zm8 0a3 3 0 1 1 0-6 3 3 0 0 1 0 6ZM2 20a6 6 0 0 1 12 0v1H2v-1Zm13 1v-1a6.5 6.5 0 0 0-1.1-3.6A5 5 0 0 1 22 21v0h-7Z" />
      </svg>
    ),
  },
  {
    id: "teachers",
    label: "Teachers",
    colorClass: "nav-icon--indigo",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3 2 8l10 5 9-4.5V17h2V8L12 3Zm-6 9v4a6 6 0 0 0 12 0v-4l-6 3-6-3Z" />
      </svg>
    ),
  },
  {
    id: "classes",
    label: "Classes & Curriculum",
    colorClass: "nav-icon--teal",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5a2 2 0 0 1 2-2h11a3 3 0 0 1 3 3v13a1 1 0 0 1-1 1H6a2 2 0 0 1-2-2V5Zm2 0v13h12V6a1 1 0 0 0-1-1H6Z" />
      </svg>
    ),
  },
  {
    id: "ai-center",
    label: "AI Center",
    colorClass: "nav-icon--orange",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2 9.5 8H3l5.2 3.8L6 18l6-3.8L18 18l-2.2-6.2L21 8h-6.5L12 2Z" />
      </svg>
    ),
  },
  {
    id: "exams",
    label: "Exams & Tests",
    colorClass: "nav-icon--sky",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 2h10a2 2 0 0 1 2 2v2h-2V4H7v2H5V4a2 2 0 0 1 2-2Zm12 7v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V9h14Zm-9 3v2h2v-2H10Zm0 4v2h6v-2h-6Z" />
      </svg>
    ),
  },
  {
    id: "attendance",
    label: "Attendance",
    colorClass: "nav-icon--green",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm2 8 2 2 5-5-1.4-1.4-3.6 3.6-0.6-0.6L8 11Z" />
      </svg>
    ),
  },
  {
    id: "results",
    label: "Results & Report Cards",
    colorClass: "nav-icon--amber",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 3h7l5 5v13a1 1 0 0 1-1 1H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm7 1.5V9h4.5L14 4.5ZM9 13h6v2H9v-2Zm0 4h6v2H9v-2Z" />
      </svg>
    ),
  },
  {
    id: "accounts",
    label: "Accounts & Fees",
    colorClass: "nav-icon--emerald",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 6a2 2 0 0 1 2-2h12a3 3 0 0 1 3 3v2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h12a3 3 0 0 0 3-3v-2H8a2 2 0 0 1-2-2V6Zm14 8h3v-2h-3v2Z" />
      </svg>
    ),
  },
  {
    id: "predict-xai",
    label: "Predict & XAI",
    colorClass: "nav-icon--rose",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2a9 9 0 0 1 9 9c0 3.4-2 6.7-4.7 8.2L12 22l-4.3-2.8C5 17.7 3 14.4 3 11a9 9 0 0 1 9-9Zm-1 6v5h2V8h-2Zm0 7v2h2v-2h-2Z" />
      </svg>
    ),
  },
];

const teacherThemes = ["teacher-theme-blue", "teacher-theme-rose"];

const badgeClass = (value) => {
  const normalized = value.toLowerCase();
  if (normalized.includes("high") || normalized.includes("danger")) return "danger";
  if (normalized.includes("medium") || normalized.includes("warning")) return "warning";
  if (normalized.includes("ready") || normalized.includes("success")) return "success";
  if (normalized.includes("scheduled") || normalized.includes("primary")) return "primary";
  if (normalized.includes("low") || normalized.includes("info")) return "info";
  return "primary";
};

const formatCurrency = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value || 0);

const formatDate = (value) => {
  if (!value) return "—";
  return String(value).slice(0, 10);
};

const getAuthHeaders = () => {
  const token = localStorage.getItem("authToken");
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return headers;
};

const apiGet = async (path) => {
  const res = await fetch(`/api${path}`, { headers: getAuthHeaders() });
  if (res.status === 401) {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    window.location.reload();
    throw new Error("Session expired");
  }
  if (!res.ok) throw new Error("API request failed");
  return res.json();
};

export default function App() {
  const [authToken, setAuthToken] = useState(() => localStorage.getItem("authToken"));
  const [authUser, setAuthUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("authUser")); } catch { return null; }
  });

  const handleLogin = (token, user) => {
    setAuthToken(token);
    setAuthUser(user);
  };

  const handleLogout = () => {
    localStorage.removeItem("authToken");
    localStorage.removeItem("authUser");
    setAuthToken(null);
    setAuthUser(null);
  };

  if (!authToken) {
    return <LoginPage onLogin={handleLogin} />;
  }

  return <MainApp authUser={authUser} onLogout={handleLogout} />;
}

function MainApp({ authUser, onLogout }) {
  const [activeSection, setActiveSection] = useState("dashboard");
  const [collapsed, setCollapsed] = useState(false);
  const [dashboard, setDashboard] = useState({
    totalStudents: 0,
    totalTeachers: 0,
    activeClasses: 0,
    feeCollected: 0,
    feeDue: 0,
    todayAttendance: 0,
  });
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classrooms, setClassrooms] = useState([]);
  const [curriculumItems, setCurriculumItems] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [attendanceEntries, setAttendanceEntries] = useState([]);
  const [feeLedgers, setFeeLedgers] = useState([]);
  const [resultCards, setResultCards] = useState([]);
  const [examsList, setExamsList] = useState([]);
  const [attentionReport, setAttentionReport] = useState({ students: [] });
  const [loading, setLoading] = useState(true);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [editingStudentId, setEditingStudentId] = useState(null);
  const [studentProfile, setStudentProfile] = useState(null);
  const [studentSearch, setStudentSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [feeFilter, setFeeFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");
  const [studentForm, setStudentForm] = useState({
    first_name: "",
    last_name: "",
    roll_number: "",
    date_of_birth: "",
    guardian_name: "",
    guardian_phone: "",
    guardian_email: "",
    classroom_id: "",
  });
  const [teacherForm, setTeacherForm] = useState({
    first_name: "",
    last_name: "",
    subject: "",
    phone: "",
  });
  const [classForm, setClassForm] = useState({
    name: "",
    grade: "",
    section: "",
  });
  const [attendanceForm, setAttendanceForm] = useState({
    student_id: "",
    day: "",
    status: "present",
  });
  const [feeForm, setFeeForm] = useState({
    student_id: "",
    due_date: "",
    amount_due: "",
    amount_paid: "",
    status: "pending",
  });
  const [resultForm, setResultForm] = useState({
    student_id: "",
    term: "",
    total_score: "",
    percentage: "",
    remarks: "",
  });
  const [aiForm, setAiForm] = useState({
    classroom_id: "",
    subject: "",
    prompt: "",
    num_questions: 5,
  });
  const [aiPreview, setAiPreview] = useState(null);
  const [predictStudentId, setPredictStudentId] = useState("");
  const [xaiData, setXaiData] = useState(null);
  const [xaiLoading, setXaiLoading] = useState(false);
  const [customPredictForm, setCustomPredictForm] = useState({
    attendance_rate: "",
    average_score: "",
    fee_status: "Clear",
  });
  const [customPredictResult, setCustomPredictResult] = useState(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [
          dashboardData,
          studentData,
          attentionData,
          teacherData,
          classData,
          curriculumData,
          enrollmentData,
          attendanceData,
          feeData,
          resultData,
          examsData,
        ] = await Promise.all([
          apiGet("/dashboard"),
          apiGet("/students"),
          apiGet("/ai/students/attention"),
          apiGet("/teachers"),
          apiGet("/classrooms"),
          apiGet("/curriculum"),
          apiGet("/enrollments"),
          apiGet("/attendance"),
          apiGet("/fees"),
          apiGet("/results"),
          apiGet("/exams"),
        ]);
        if (mounted) {
          setDashboard(dashboardData);
          setStudents(studentData);
          setAttentionReport(attentionData);
          setTeachers(teacherData);
          setClassrooms(classData);
          setCurriculumItems(curriculumData);
          setEnrollments(enrollmentData);
          setAttendanceEntries(attendanceData);
          setFeeLedgers(feeData);
          setResultCards(resultData);
          setExamsList(examsData);
        }
      } catch (error) {
        console.error(error);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const feeStatusMap = useMemo(() => {
    const map = new Map();
    feeLedgers.forEach((fee) => {
      if (!map.has(fee.student_id)) map.set(fee.student_id, fee.status);
    });
    return map;
  }, [feeLedgers]);
  const riskMap = useMemo(() => {
    const map = new Map();
    (attentionReport.students || []).forEach((student) => {
      map.set(student.student_id, "High");
    });
    return map;
  }, [attentionReport]);
  const enrollmentMap = useMemo(() => {
    const map = new Map();
    enrollments.forEach((enrollment) => {
      if (!map.has(enrollment.student_id)) {
        map.set(enrollment.student_id, enrollment.class_name || "Unassigned");
      }
    });
    return map;
  }, [enrollments]);
  const enrollmentClassIdMap = useMemo(() => {
    const map = new Map();
    enrollments.forEach((enrollment) => {
      if (!map.has(enrollment.student_id)) {
        map.set(enrollment.student_id, enrollment.classroom_id);
      }
    });
    return map;
  }, [enrollments]);
  const studentClassLabel = (studentId) => {
    const classId = enrollmentClassIdMap.get(studentId);
    const room = classrooms.find((item) => item.id === classId);
    if (!room) return enrollmentMap.get(studentId) || "Unassigned";
    return `${room.name}${room.section ? ` • ${room.section}` : ""}`;
  };
  const filteredStudents = useMemo(() => {
    return students.filter((student) => {
      const fullName = `${student.first_name} ${student.last_name}`.toLowerCase();
      const matchesSearch =
        !studentSearch || fullName.includes(studentSearch.toLowerCase());
      const className = studentClassLabel(student.id).toLowerCase();
      const matchesClass = !classFilter || className.includes(classFilter.toLowerCase());
      const status = feeStatusMap.get(student.id) || "pending";
      const matchesFee = !feeFilter || status === feeFilter;
      const risk = riskMap.get(student.id) || "Low";
      const matchesRisk = !riskFilter || risk.toLowerCase() === riskFilter.toLowerCase();
      return matchesSearch && matchesClass && matchesFee && matchesRisk;
    });
  }, [students, studentSearch, classFilter, feeFilter, riskFilter, feeStatusMap, riskMap]);
  const studentRows = useMemo(() => filteredStudents.slice(0, 8), [filteredStudents]);
  const attentionCount = attentionReport.students?.length || 0;
  const studentNameMap = useMemo(() => {
    const map = new Map();
    students.forEach((student) => {
      map.set(student.id, `${student.first_name} ${student.last_name}`.trim());
    });
    return map;
  }, [students]);
  const classroomNameMap = useMemo(() => {
    const map = new Map();
    classrooms.forEach((room) => {
      map.set(room.id, room.name);
    });
    return map;
  }, [classrooms]);
  const enrollmentIdMap = useMemo(() => {
    const map = new Map();
    enrollments.forEach((enrollment) => {
      if (!map.has(enrollment.student_id)) {
        map.set(enrollment.student_id, enrollment.id);
      }
    });
    return map;
  }, [enrollments]);
  const featuredStudent =
    students.find((student) => student.id === selectedStudentId) || students[0];
  const classSubjectMap = useMemo(() => {
    const map = new Map();
    curriculumItems.forEach((item) => {
      const list = map.get(item.classroom_id) || [];
      list.push(item.subject);
      map.set(item.classroom_id, list);
    });
    return map;
  }, [curriculumItems]);
  const performanceSeries = useMemo(() => {
    if (resultCards.length === 0) return [];
    const byTerm = new Map();
    resultCards.forEach((row) => {
      const key = row.term || "Term";
      const list = byTerm.get(key) || [];
      list.push(row.percentage || 0);
      byTerm.set(key, list);
    });
    return Array.from(byTerm.entries()).map(([term, list]) => ({
      label: term,
      value: Math.round(list.reduce((sum, v) => sum + v, 0) / list.length),
    }));
  }, [resultCards]);
  const attendanceSeries = useMemo(() => {
    if (attendanceEntries.length === 0) return [];
    const byDay = new Map();
    attendanceEntries.forEach((row) => {
      const list = byDay.get(row.day) || [];
      list.push(row.status === "present" ? 1 : 0);
      byDay.set(row.day, list);
    });
    return Array.from(byDay.entries())
      .slice(0, 8)
      .map(([day, list]) => ({
        label: day,
        value: Math.round((list.reduce((s, v) => s + v, 0) / list.length) * 100),
      }));
  }, [attendanceEntries]);
  const chartSeries = performanceSeries.length ? performanceSeries : attendanceSeries;
  const subjectOptions = useMemo(() => {
    const set = new Set();
    curriculumItems.forEach((item) => {
      if (item.subject) set.add(item.subject);
    });
    return Array.from(set);
  }, [curriculumItems]);
  const feeAlerts = useMemo(() => {
    const pending = feeLedgers.filter((fee) => fee.status === "pending");
    return pending.slice(0, 3).map((fee) => ({
      level: "High",
      label: `${studentNameMap.get(fee.student_id) || "Student"} - ${formatCurrency(
        fee.amount_due
      )}`,
    }));
  }, [feeLedgers, studentNameMap]);

  const refreshDashboard = async () => {
    const data = await apiGet("/dashboard");
    setDashboard(data);
  };

  const handleCreateStudent = async (event) => {
    event.preventDefault();
    if (!studentForm.first_name || !studentForm.last_name || !studentForm.classroom_id) return;
    if (editingStudentId) {
      const res = await fetch(`/api/students/${editingStudentId}`, {
        method: "PUT",
        headers: getAuthHeaders(),
        body: JSON.stringify(studentForm),
      });
      if (res.ok) {
        const updated = await res.json();
        setStudents((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        const existingEnrollmentId = enrollmentIdMap.get(updated.id);
        const enrollUrl = existingEnrollmentId
          ? `/api/enrollments/${existingEnrollmentId}`
          : "/api/enrollments";
        await fetch(enrollUrl, {
          method: existingEnrollmentId ? "PUT" : "POST",
          headers: getAuthHeaders(),
          body: JSON.stringify({
            student_id: updated.id,
            classroom_id: Number(studentForm.classroom_id),
            is_active: true,
          }),
        });
        const refreshedEnrollments = await apiGet("/enrollments");
        setEnrollments(refreshedEnrollments);
        setStudentForm({
          first_name: "",
          last_name: "",
          roll_number: "",
          date_of_birth: "",
          guardian_name: "",
          guardian_phone: "",
          guardian_email: "",
          classroom_id: "",
        });
        setEditingStudentId(null);
        refreshDashboard();
      }
      return;
    }
    const res = await fetch("/api/students", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(studentForm),
    });
    if (res.ok) {
      const created = await res.json();
      await fetch("/api/enrollments", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({
          student_id: created.id,
          classroom_id: Number(studentForm.classroom_id),
        }),
      });
      setStudents((prev) => [created, ...prev]);
      const refreshedEnrollments = await apiGet("/enrollments");
      setEnrollments(refreshedEnrollments);
      setStudentForm({
        first_name: "",
        last_name: "",
        roll_number: "",
        date_of_birth: "",
        guardian_name: "",
        guardian_phone: "",
        guardian_email: "",
        classroom_id: "",
      });
      refreshDashboard();
    }
  };

  const startEditStudent = (student) => {
    setEditingStudentId(student.id);
    setSelectedStudentId(student.id);
    setStudentForm({
      first_name: student.first_name || "",
      last_name: student.last_name || "",
      roll_number: student.roll_number || "",
      date_of_birth: student.date_of_birth || "",
      guardian_name: student.guardian_name || "",
      guardian_phone: student.guardian_phone || "",
      guardian_email: student.guardian_email || "",
      classroom_id: enrollmentClassIdMap.get(student.id) || "",
    });
  };

  useEffect(() => {
    if (!selectedStudentId) {
      setStudentProfile(null);
      return;
    }
    apiGet(`/students/${selectedStudentId}`)
      .then((profile) => setStudentProfile(profile))
      .catch(() => setStudentProfile(null));
  }, [selectedStudentId]);

  const handleCreateTeacher = async (event) => {
    event.preventDefault();
    if (!teacherForm.first_name || !teacherForm.last_name) return;
    const res = await fetch("/api/teachers", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(teacherForm),
    });
    if (res.ok) {
      const created = await res.json();
      setTeachers((prev) => [created, ...prev]);
      setTeacherForm({ first_name: "", last_name: "", subject: "", phone: "" });
      refreshDashboard();
    }
  };

  const handleCreateClass = async (event) => {
    event.preventDefault();
    if (!classForm.name || !classForm.grade) return;
    const res = await fetch("/api/classrooms", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify(classForm),
    });
    if (res.ok) {
      const created = await res.json();
      setClassrooms((prev) => [created, ...prev]);
      setClassForm({ name: "", grade: "", section: "" });
      refreshDashboard();
    }
  };

  const handleCreateAttendance = async (event) => {
    event.preventDefault();
    if (!attendanceForm.student_id) return;
    const classroomId = enrollmentClassIdMap.get(Number(attendanceForm.student_id));
    if (!classroomId) return;
    const res = await fetch("/api/attendance", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        student_id: Number(attendanceForm.student_id),
        classroom_id: classroomId,
        day: attendanceForm.day || undefined,
        status: attendanceForm.status,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setAttendanceEntries((prev) => [created, ...prev]);
      setAttendanceForm({ student_id: "", day: "", status: "present" });
      refreshDashboard();
    }
  };

  const handleCreateFee = async (event) => {
    event.preventDefault();
    if (!feeForm.student_id || !feeForm.due_date || !feeForm.amount_due) return;
    const res = await fetch("/api/fees", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        student_id: Number(feeForm.student_id),
        due_date: feeForm.due_date,
        amount_due: Number(feeForm.amount_due),
        amount_paid: feeForm.amount_paid ? Number(feeForm.amount_paid) : 0,
        status: feeForm.status,
        paid_date: feeForm.status === "paid" ? feeForm.due_date : null,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setFeeLedgers((prev) => [created, ...prev]);
      setFeeForm({
        student_id: "",
        due_date: "",
        amount_due: "",
        amount_paid: "",
        status: "pending",
      });
      refreshDashboard();
    }
  };

  const handleCreateResult = async (event) => {
    event.preventDefault();
    if (!resultForm.student_id || !resultForm.term || !resultForm.total_score) return;
    const classroomId = enrollmentClassIdMap.get(Number(resultForm.student_id));
    if (!classroomId) return;
    const res = await fetch("/api/results", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        student_id: Number(resultForm.student_id),
        classroom_id: classroomId,
        term: resultForm.term,
        total_score: Number(resultForm.total_score),
        percentage: resultForm.percentage ? Number(resultForm.percentage) : 0,
        remarks: resultForm.remarks,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setResultCards((prev) => [created, ...prev]);
      setResultForm({ student_id: "", term: "", total_score: "", percentage: "", remarks: "" });
    }
  };

  const handleGenerateExam = async (event) => {
    event.preventDefault();
    if (!aiForm.classroom_id || !aiForm.subject || !aiForm.prompt) return;
    const res = await fetch("/api/ai/exams/generate", {
      method: "POST",
      headers: getAuthHeaders(),
      body: JSON.stringify({
        classroom_id: Number(aiForm.classroom_id),
        subject: aiForm.subject,
        prompt: aiForm.prompt,
        num_questions: Number(aiForm.num_questions),
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setAiPreview(created);
      const refreshed = await apiGet("/exams");
      setExamsList(refreshed);
    }
  };

  const handlePredictStudent = async () => {
    if (!predictStudentId || xaiLoading) return;
    setXaiLoading(true);
    setXaiData(null);
    try {
      const res = await fetch(`/api/predict/explain/${predictStudentId}`, { headers: getAuthHeaders() });
      const data = await res.json();
      if (res.ok) setXaiData(data);
    } catch {
      setXaiData(null);
    } finally {
      setXaiLoading(false);
    }
  };

  const handleCustomPredict = async (e) => {
    e.preventDefault();
    setXaiLoading(true);
    setCustomPredictResult(null);
    try {
      const res = await fetch("/api/predict/explain/custom", {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify(customPredictForm),
      });
      const data = await res.json();
      if (res.ok) setCustomPredictResult(data);
    } catch {
      setCustomPredictResult(null);
    } finally {
      setXaiLoading(false);
    }
  };

  const buildSeriesLine = (data, width, height, padding) => {
    if (!data.length) return "";
    const values = data.map((d) => d.value);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const step = (width - padding * 2) / (data.length - 1 || 1);
    return data
      .map((point, index) => {
        const x = padding + index * step;
        const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(" ");
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${collapsed ? "collapsed" : ""}`}>
        <div className="sidebar__brand">
          <span className="brand-dot" />
          <div>
            <h1>EduManage AI</h1>
            <p>Smart School Control Center</p>
          </div>
        </div>
        <nav className="sidebar__nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              className={`nav-item ${activeSection === item.id ? "active" : ""}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span className={`nav-icon ${item.colorClass}`} aria-hidden="true">
                {item.icon}
              </span>
              <span className="nav-label">{item.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar__footer">
          <div className="sidebar__user">
            <span className="user-badge">{authUser?.username?.[0] || "P"}</span>
            <span className="user-name">{authUser?.username || "Principal"}</span>
          </div>
          <button className="collapse-btn" onClick={onLogout}>
            Logout
          </button>
          <button className="collapse-btn" onClick={() => setCollapsed((prev) => !prev)}>
            {collapsed ? "Expand" : "Collapse"}
          </button>
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="topbar__title">
            <h2>Cambridge Public School</h2>
            <div className="session-pill">Session: 2025-2026</div>
          </div>
          <div className="topbar__actions">
            <label className="search">
              <input type="search" placeholder="Search students, fees, exams..." />
            </label>
            <button className="icon-btn" aria-label="Notifications">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6v-5a7 7 0 0 0-5-6.7V3a2 2 0 1 0-4 0v1.3A7 7 0 0 0 5 11v5l-2 2v1h20v-1l-2-2Z"
                  fill="currentColor"
                />
              </svg>
            </button>
            <button className="icon-btn" aria-label="Settings">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path
                  d="M19.4 12.9c.04-.3.06-.6.06-.9s-.02-.6-.06-.9l2.1-1.6a.5.5 0 0 0 .12-.64l-2-3.4a.5.5 0 0 0-.6-.22l-2.5 1a7.2 7.2 0 0 0-1.6-.9l-.4-2.6a.5.5 0 0 0-.5-.42h-4a.5.5 0 0 0-.5.42l-.4 2.6a7.2 7.2 0 0 0-1.6.9l-2.5-1a.5.5 0 0 0-.6.22l-2 3.4a.5.5 0 0 0 .12.64l2.1 1.6c-.04.3-.06.6-.06.9s.02.6.06.9l-2.1 1.6a.5.5 0 0 0-.12.64l2 3.4a.5.5 0 0 0 .6.22l2.5-1c.5.36 1.04.66 1.6.9l.4 2.6a.5.5 0 0 0 .5.42h4a.5.5 0 0 0 .5-.42l.4-2.6c.56-.24 1.1-.54 1.6-.9l2.5 1a.5.5 0 0 0 .6-.22l2-3.4a.5.5 0 0 0-.12-.64l-2.1-1.6ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"
                  fill="currentColor"
                />
              </svg>
            </button>
          </div>
        </header>

        <main className="content">
          {activeSection === "dashboard" && (
            <section className="section active dashboard">
              <div className="dashboard-hero">
                <div className="dashboard-hero__text">
                  <div className="dashboard-breadcrumb">Home / Dashboard</div>
                  <h3>Institution Command Center</h3>
                  <p>
                    University-grade insights for students, faculty, finance, and academic
                    performance in one view.
                  </p>
                </div>
                <div className="section__actions">
                  <button className="btn ghost">Download Summary</button>
                  <button className="btn primary">Ask AI</button>
                </div>
              </div>

              <div className="dashboard-banner">
                <span>✅ Live data synced</span>
                <p>Updates are reflected instantly across reports and AI insights.</p>
              </div>

              <div className="dashboard-kpis">
                <div className="card kpi-card">
                  <div className="kpi-icon">🎓</div>
                  <div>
                    <p>Total Students</p>
                    <h4>{dashboard.totalStudents}</h4>
                    <span className="trend up">+4.2% this term</span>
                  </div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-icon">👩‍🏫</div>
                  <div>
                    <p>Total Teachers</p>
                    <h4>{dashboard.totalTeachers}</h4>
                    <span className="trend neutral">Stable staffing</span>
                  </div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-icon">🏫</div>
                  <div>
                    <p>Active Classes</p>
                    <h4>{dashboard.activeClasses}</h4>
                    <span className="trend up">Structured by grade</span>
                  </div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-icon">💵</div>
                  <div>
                    <p>Revenue (MTD)</p>
                    <h4>{formatCurrency(dashboard.feeCollected)}</h4>
                    <span className="trend up">
                      {formatCurrency(dashboard.feeDue)} due
                    </span>
                  </div>
                </div>
                <div className="card kpi-card">
                  <div className="kpi-icon">✅</div>
                  <div>
                    <p>Attendance</p>
                    <h4>{dashboard.todayAttendance}%</h4>
                    <span className="trend down">Daily tracking</span>
                  </div>
                </div>
              </div>

              <div className="dashboard-main">
                <div className="card chart-panel">
                  <div className="card__title">
                    <h5>Academic Performance Trends</h5>
                    <span>Core subjects overview</span>
                  </div>
                  <div className="chart-placeholder">
                    {chartSeries.length ? (
                      <svg viewBox="0 0 520 220" aria-hidden="true">
                        <defs>
                          <linearGradient id="trend" x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor="#6d7df6" stopOpacity="0.25" />
                            <stop offset="100%" stopColor="#6d7df6" stopOpacity="0" />
                          </linearGradient>
                        </defs>
                        <polyline
                          fill="none"
                          stroke="#5166f0"
                          strokeWidth="3"
                          strokeLinecap="round"
                          points={buildSeriesLine(chartSeries, 520, 220, 24)}
                        />
                        <polygon
                          fill="url(#trend)"
                          points={`${buildSeriesLine(chartSeries, 520, 220, 24)} 496,196 24,196`}
                        />
                      </svg>
                    ) : (
                      <div className="chart-empty">Add results or attendance to see trends.</div>
                    )}
                  </div>
                </div>

                <div className="card ai-hub">
                  <div className="card__title">
                    <h5>AI Intelligence Hub</h5>
                    <span>Priority alerts</span>
                  </div>
                  <div className="ai-hub-item">
                    <span className="badge danger pill">Critical</span>
                    <p>{attentionCount} students require intervention.</p>
                  </div>
                  <div className="ai-hub-item">
                    <span className="badge warning pill">Medium</span>
                    <p>
                      {feeLedgers.filter((fee) => fee.status === "pending").length} fee
                      accounts pending.
                    </p>
                  </div>
                  <div className="ai-hub-item">
                    <span className="badge info pill">Info</span>
                    <p>Curriculum mapping is {curriculumItems.length} items deep.</p>
                  </div>
                  <button className="btn primary">Schedule Catch-up</button>
                </div>
              </div>

              <div className="dashboard-secondary">
                <div className="card quick-actions">
                  <div className="card__title">
                    <h5>Quick Actions</h5>
                    <span>Daily workflow</span>
                  </div>
                  <div className="action-grid">
                    <button className="action-tile" onClick={() => setActiveSection("students")}>
                      <span>New Student</span>
                      <small>Registration</small>
                    </button>
                    <button className="action-tile" onClick={() => setActiveSection("exams")}>
                      <span>Exam Prep</span>
                      <small>Schedule</small>
                    </button>
                    <button className="action-tile" onClick={() => setActiveSection("accounts")}>
                      <span>Broadcast</span>
                      <small>Message parents</small>
                    </button>
                    <button className="action-tile" onClick={() => setActiveSection("results")}>
                      <span>Report Card</span>
                      <small>Generate PDF</small>
                    </button>
                  </div>
                </div>

                <div className="card table-card">
                  <div className="card__title">
                    <h5>Activity Pulse</h5>
                    <span>Recent updates</span>
                  </div>
                  <ul className="activity-list">
                    {students.slice(0, 3).map((student) => (
                      <li key={student.id}>
                        <strong>{student.first_name} {student.last_name}</strong>
                        <span>Added to {studentClassLabel(student.id)}</span>
                      </li>
                    ))}
                    {feeLedgers.slice(0, 2).map((fee) => (
                      <li key={`fee-${fee.id}`}>
                        <strong>{studentNameMap.get(fee.student_id) || "Student"}</strong>
                        <span>Fee due {formatCurrency(fee.amount_due)}</span>
                      </li>
                    ))}
                    {students.length === 0 && feeLedgers.length === 0 && (
                      <li>Activity will appear here as you manage records.</li>
                    )}
                  </ul>
                </div>
              </div>

              {loading && <p className="muted">Loading live data...</p>}
            </section>
          )}

          {activeSection === "students" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>Students</h3>
                  <p>Search, filter, and review student profiles.</p>
                </div>
                <button className="btn primary">Add Student</button>
              </div>
              <div className="card form-card">
                <div className="card__title">
                  <h4>{editingStudentId ? "Edit Student" : "Quick Add Student"}</h4>
                  <span className="ai-pill">Basic Info</span>
                </div>
                <form className="form-row" onSubmit={handleCreateStudent}>
                  <input
                    type="text"
                    placeholder="First name"
                    value={studentForm.first_name}
                    onChange={(event) =>
                      setStudentForm((prev) => ({ ...prev, first_name: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={studentForm.last_name}
                    onChange={(event) =>
                      setStudentForm((prev) => ({ ...prev, last_name: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Roll number"
                    value={studentForm.roll_number}
                    onChange={(event) =>
                      setStudentForm((prev) => ({ ...prev, roll_number: event.target.value }))
                    }
                  />
                  <input
                    type="date"
                    placeholder="Date of birth"
                    value={studentForm.date_of_birth}
                    onChange={(event) =>
                      setStudentForm((prev) => ({ ...prev, date_of_birth: event.target.value }))
                    }
                  />
                  <select
                    value={studentForm.classroom_id}
                    onChange={(event) =>
                      setStudentForm((prev) => ({ ...prev, classroom_id: event.target.value }))
                    }
                  >
                    <option value="">Select class</option>
                    {classrooms.map((room) => (
                      <option key={room.id} value={room.id}>
                        {room.name} {room.section ? `• ${room.section}` : ""}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Guardian name"
                    value={studentForm.guardian_name}
                    onChange={(event) =>
                      setStudentForm((prev) => ({ ...prev, guardian_name: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Guardian phone"
                    value={studentForm.guardian_phone}
                    onChange={(event) =>
                      setStudentForm((prev) => ({ ...prev, guardian_phone: event.target.value }))
                    }
                  />
                  <input
                    type="email"
                    placeholder="Guardian email (for reminders)"
                    value={studentForm.guardian_email}
                    onChange={(event) =>
                      setStudentForm((prev) => ({ ...prev, guardian_email: event.target.value }))
                    }
                  />
                  <div className="form-actions">
                    <button type="submit" className="btn primary">
                      {editingStudentId ? "Update Student" : "Save Student"}
                    </button>
                    {editingStudentId && (
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={() => {
                          setEditingStudentId(null);
                          setStudentForm({
                            first_name: "",
                            last_name: "",
                            date_of_birth: "",
                            guardian_name: "",
                            guardian_phone: "",
                            guardian_email: "",
                            classroom_id: "",
                          });
                        }}
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </form>
              </div>
              <div className="card table-card">
                <div className="filters">
                  <input
                    type="text"
                    placeholder="Search students"
                    value={studentSearch}
                    onChange={(event) => setStudentSearch(event.target.value)}
                  />
                  <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                    <option value="">All Classes</option>
                    {classrooms.map((room) => (
                      <option key={room.id} value={room.name}>
                        {room.name} {room.section ? `• ${room.section}` : ""}
                      </option>
                    ))}
                  </select>
                  <select value={feeFilter} onChange={(event) => setFeeFilter(event.target.value)}>
                    <option value="">Fee Status</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                  </select>
                  <select value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}>
                    <option value="">Performance Risk</option>
                    <option value="High">High</option>
                    <option value="Low">Low</option>
                  </select>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Attendance</th>
                      <th>Fee Status</th>
                      <th>AI Risk</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {studentRows.length === 0 ? (
                      <tr>
                        <td colSpan="6">
                          <div className="empty-state">
                            <div className="empty-icon">👩‍🎓</div>
                            <div>
                              <h5>No students yet</h5>
                              <p>Add your first student to see live data here.</p>
                            </div>
                            <button className="btn ghost">Add Student</button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      studentRows.map((student) => (
                      <tr
                        key={student.id}
                        className={student.id === selectedStudentId ? "row-active" : ""}
                        onClick={() => setSelectedStudentId(student.id)}
                      >
                          <td>
                            <div className="student-cell">
                              <div className="student-avatar">
                                {student.first_name?.[0]}
                                {student.last_name?.[0]}
                              </div>
                              <div>
                                <div className="student-name">
                                  {student.first_name} {student.last_name}
                                </div>
                                <div className="student-meta">
                                  {studentClassLabel(student.id)}
                                </div>
                              </div>
                            </div>
                          </td>
                          <td>{studentClassLabel(student.id)}</td>
                          <td>--</td>
                          <td>
                            <span className="badge warning">Pending</span>
                          </td>
                          <td>
                            <span className={`badge ${badgeClass(riskMap.get(student.id) || "low")}`}>
                              {riskMap.get(student.id) || "Low"}
                            </span>
                          </td>
                          <td>
                            <button
                              className="btn ghost small"
                              onClick={(event) => {
                                event.stopPropagation();
                                startEditStudent(student);
                              }}
                            >
                              Edit
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="card profile-card">
                {studentProfile ? (
                  <>
                    <div className="profile">
                      <div className="profile-title">
                        <div className="student-avatar large">
                          {studentProfile.first_name?.[0]}
                          {studentProfile.last_name?.[0]}
                        </div>
                        <div>
                          <h4>
                            {studentProfile.first_name} {studentProfile.last_name}
                          </h4>
                          <p>{studentClassLabel(studentProfile.id)}</p>
                          <div className="profile-tags">
                            <span className="badge info pill">
                              {riskMap.get(studentProfile.id) || "Low Risk"}
                            </span>
                            <span className="badge warning pill">
                              {feeStatusMap.get(studentProfile.id) || "No Fees"}
                            </span>
                          </div>
                        </div>
                      </div>
                      <button className="btn ghost">Ask AI about this student</button>
                    </div>
                    <div className="profile-grid">
                      <div className="profile-metric">
                        <h5>Attendance</h5>
                        <p>{studentProfile.attendance_rate ?? "—"}% last 30 days</p>
                      </div>
                      <div className="profile-metric">
                        <h5>Fee Status</h5>
                        <p>{feeStatusMap.get(studentProfile.id) || "No dues"}</p>
                      </div>
                      <div className="profile-metric">
                        <h5>Academic History</h5>
                        <p>
                          Avg{" "}
                          {studentProfile.results?.length
                            ? Math.round(
                                studentProfile.results.reduce(
                                  (sum, r) => sum + (r.percentage || 0),
                                  0
                                ) / studentProfile.results.length
                              )
                            : "—"}
                          % this term
                        </p>
                      </div>
                      <div className="profile-metric">
                        <h5>AI Insight</h5>
                        <p>
                          {riskMap.get(studentProfile.id)
                            ? "Recommend parent meeting and support plan."
                            : "Student performing within expected range."}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="empty-card">Add a student to see the profile preview.</div>
                )}
              </div>
            </section>
          )}

          {activeSection === "teachers" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>Teachers</h3>
                  <p>Workload, assigned classes, and AI suggestions.</p>
                </div>
                <button className="btn primary">Add Teacher</button>
              </div>
              <div className="card form-card">
                <div className="card__title">
                  <h4>Quick Add Teacher</h4>
                  <span className="ai-pill">Basic Info</span>
                </div>
                <form className="form-row" onSubmit={handleCreateTeacher}>
                  <input
                    type="text"
                    placeholder="First name"
                    value={teacherForm.first_name}
                    onChange={(event) =>
                      setTeacherForm((prev) => ({ ...prev, first_name: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={teacherForm.last_name}
                    onChange={(event) =>
                      setTeacherForm((prev) => ({ ...prev, last_name: event.target.value }))
                    }
                  />
                  <select
                    value={teacherForm.subject}
                    onChange={(event) =>
                      setTeacherForm((prev) => ({ ...prev, subject: event.target.value }))
                    }
                  >
                    <option value="">Select subject</option>
                    {subjectOptions.map((subject) => (
                      <option key={subject} value={subject}>
                        {subject}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Custom subject (optional)"
                    value={teacherForm.subject}
                    onChange={(event) =>
                      setTeacherForm((prev) => ({ ...prev, subject: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Phone"
                    value={teacherForm.phone}
                    onChange={(event) =>
                      setTeacherForm((prev) => ({ ...prev, phone: event.target.value }))
                    }
                  />
                  <div className="form-actions">
                    <button type="submit" className="btn primary">
                      Save Teacher
                    </button>
                  </div>
                </form>
              </div>
              <div className="grid-2">
                {teachers.length === 0 && (
                  <div className="card empty-card">Add teachers to see them here.</div>
                )}
                {teachers.map((teacher, index) => (
                  <div
                    className={`card teacher-card ${
                      teacherThemes[index % teacherThemes.length]
                    }`}
                    key={teacher.id}
                  >
                    <div className="teacher-header">
                      <div className="teacher-avatar">
                        {`${teacher.first_name ?? ""}${teacher.last_name ?? ""}`
                          .split(" ")
                          .map((chunk) => chunk[0])
                          .join("")
                          .slice(0, 2)}
                      </div>
                      <div>
                        <h4>
                          {teacher.first_name} {teacher.last_name}
                        </h4>
                        <p className="teacher-meta">
                          {teacher.subject || "Subject"} • Assigned classes
                        </p>
                      </div>
                      <button className="btn ghost small">Profile</button>
                    </div>
                    <div className="tag-row">
                      <span className="badge info">Attendance 96%</span>
                      <span className="badge primary">Performance Strong</span>
                    </div>
                    <div className="teacher-footer">
                      <span className="teacher-label">AI Suggestion</span>
                      <p className="muted">AI Suggestion: Review workload distribution.</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {activeSection === "classes" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>Classes & Curriculum</h3>
                  <p>Map subjects, books, and AI-ready curriculum tags.</p>
                </div>
                <button className="btn primary">Add Class</button>
              </div>
              <div className="card form-card">
                <div className="card__title">
                  <h4>Quick Add Class</h4>
                  <span className="ai-pill">Structure</span>
                </div>
                <form className="form-row" onSubmit={handleCreateClass}>
                  <input
                    type="text"
                    placeholder="Class name (e.g., Grade 7B)"
                    value={classForm.name}
                    onChange={(event) =>
                      setClassForm((prev) => ({ ...prev, name: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Grade"
                    value={classForm.grade}
                    onChange={(event) =>
                      setClassForm((prev) => ({ ...prev, grade: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Section"
                    value={classForm.section}
                    onChange={(event) =>
                      setClassForm((prev) => ({ ...prev, section: event.target.value }))
                    }
                  />
                  <div className="form-actions">
                    <button type="submit" className="btn primary">
                      Save Class
                    </button>
                  </div>
                </form>
              </div>
              <div className="class-grid">
                {classrooms.length === 0 && (
                  <div className="card empty-card">Add classes to see them here.</div>
                )}
                {classrooms.map((item) => {
                  const subjects = classSubjectMap.get(item.id) || [];
                  const subjectList = subjects.length ? subjects.join(", ") : "No curriculum yet";
                  return (
                    <div className="class-card" key={item.id}>
                    <div className="class-header">
                      <div>
                        <h4>{item.name}</h4>
                        <p>Subjects: {subjectList}</p>
                      </div>
                      <span className="class-count">{subjects.length} subjects</span>
                    </div>
                    <div className="tag-row">
                      <span className="badge primary">
                        {subjects.length ? "Curriculum Tagged" : "Needs Curriculum"}
                      </span>
                      <span className="badge info">{item.grade}</span>
                      {item.section && <span className="badge warning">Section {item.section}</span>}
                    </div>
                    <div className="class-actions">
                      <button className="btn ghost small">View</button>
                      <button className="btn ghost small">Edit</button>
                    </div>
                  </div>
                  );
                })}
              </div>
            </section>
          )}

          {activeSection === "ai-center" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>AI Center</h3>
                  <p>School Assistant &bull; Ask questions, email parents, and more. Every action waits for your approval.</p>
                </div>
                <button className="btn primary">Save Prompt</button>
              </div>
              <div className="grid-2 ai-center-grid">
                <div className="span-2">
                  <AgentChat />
                </div>
                <div className="card ai-panel span-2">
                  <div className="card__title">
                    <h4>AI Command Panel</h4>
                    <span className="ai-pill">Prompt Studio</span>
                  </div>
                  <form className="ai-form" onSubmit={handleGenerateExam}>
                    <div className="form-row">
                      <select
                        value={aiForm.classroom_id}
                        onChange={(event) =>
                          setAiForm((prev) => ({ ...prev, classroom_id: event.target.value }))
                        }
                      >
                        <option value="">Select class</option>
                        {classrooms.map((room) => (
                          <option key={room.id} value={room.id}>
                            {room.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        placeholder="Subject (e.g., Mathematics)"
                        value={aiForm.subject}
                        onChange={(event) =>
                          setAiForm((prev) => ({ ...prev, subject: event.target.value }))
                        }
                      />
                      <input
                        type="number"
                        min="1"
                        max="20"
                        placeholder="Questions"
                        value={aiForm.num_questions}
                        onChange={(event) =>
                          setAiForm((prev) => ({ ...prev, num_questions: event.target.value }))
                        }
                      />
                    </div>
                    <textarea
                      rows="8"
                      placeholder="Generate Class 7 Maths test from Chapter 3-5"
                      value={aiForm.prompt}
                      onChange={(event) =>
                        setAiForm((prev) => ({ ...prev, prompt: event.target.value }))
                      }
                    />
                    <div className="ai-actions">
                      <button type="submit" className="btn primary">
                        Generate Test
                      </button>
                      <button className="btn ghost accent-blue" type="button">
                        Lesson Plan
                      </button>
                      <button className="btn ghost accent-green" type="button">
                        Worksheet
                      </button>
                    </div>
                  </form>
                </div>
                <div className="card ai-preview span-2">
                  <div className="card__title">
                    <h4>Preview</h4>
                    <span className="ai-pill success">Draft Ready</span>
                  </div>
                  <div className="preview">
                    {aiPreview ? (
                      <>
                        <p>
                          <strong>{aiPreview.title}</strong>
                        </p>
                        {aiPreview.questions?.map((q, index) => (
                          <p key={q.id || q.question}>
                            {index + 1}. {q.question}
                          </p>
                        ))}
                      </>
                    ) : (
                      <p className="muted">Generate a test to preview questions here.</p>
                    )}
                  </div>
                  <div className="ai-actions">
                    <button className="btn ghost accent-indigo">Edit</button>
                    <button className="btn primary">Save</button>
                  </div>
                </div>
              </div>
            </section>
          )}

          {activeSection === "exams" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>Exams & Tests</h3>
                  <p>Calendar view and AI-generated exams.</p>
                </div>
                <button className="btn primary">Create Exam</button>
              </div>
              <div className="card table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Exam</th>
                      <th>Class</th>
                      <th>Created</th>
                      <th>Status</th>
                      <th>Questions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {examsList.length === 0 && (
                      <tr>
                        <td colSpan="5">Generate an exam to see it here.</td>
                      </tr>
                    )}
                    {examsList.map((exam) => (
                      <tr key={exam.id}>
                        <td>{exam.title}</td>
                        <td>{exam.class_name}</td>
                        <td>{exam.created_at?.slice(0, 10)}</td>
                        <td>
                          <span className="badge primary">AI Generated</span>
                        </td>
                        <td>{exam.question_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "attendance" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>Attendance</h3>
                  <p>Daily tracking and AI insights.</p>
                </div>
                <button className="btn primary">Mark Attendance</button>
              </div>
              <div className="card form-card">
                <div className="card__title">
                  <h4>Mark Attendance</h4>
                  <span className="ai-pill">Daily</span>
                </div>
                <form className="form-row" onSubmit={handleCreateAttendance}>
                  <select
                    value={attendanceForm.student_id}
                    onChange={(event) =>
                      setAttendanceForm((prev) => ({ ...prev, student_id: event.target.value }))
                    }
                  >
                    <option value="">Select student</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={attendanceForm.day}
                    onChange={(event) =>
                      setAttendanceForm((prev) => ({ ...prev, day: event.target.value }))
                    }
                  />
                  <select
                    value={attendanceForm.status}
                    onChange={(event) =>
                      setAttendanceForm((prev) => ({ ...prev, status: event.target.value }))
                    }
                  >
                    <option value="present">Present</option>
                    <option value="absent">Absent</option>
                  </select>
                  <div className="form-actions">
                    <button type="submit" className="btn primary">
                      Save Attendance
                    </button>
                  </div>
                </form>
              </div>
              <div className="grid-2">
                <div className="card">
                  <h4>Daily Summary</h4>
                  <p>
                    Overall attendance: <strong>{dashboard.todayAttendance}%</strong>
                  </p>
                  <p>Irregular students: {attentionCount}</p>
                  <p className="muted">AI Insight: Grade 6C needs follow-up.</p>
                </div>
                <div className="card">
                  <h4>Monthly Report</h4>
                  <p>Best attendance: Grade 5A (96%)</p>
                  <p>Lowest attendance: Grade 7B (72%)</p>
                </div>
              </div>
              <div className="card table-card">
                <div className="card__title">
                  <h5>Recent Attendance</h5>
                  <span>Latest entries</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Date</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {attendanceEntries.length === 0 && (
                      <tr>
                        <td colSpan="4">No attendance marked yet.</td>
                      </tr>
                    )}
                    {attendanceEntries.slice(0, 6).map((row) => (
                      <tr key={row.id}>
                        <td>{studentNameMap.get(row.student_id) || "Student"}</td>
                        <td>{classroomNameMap.get(row.classroom_id) || "Class"}</td>
                        <td>{formatDate(row.day)}</td>
                        <td>
                          <span className={`badge ${row.status === "present" ? "success" : "danger"}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "results" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>Results & Report Cards</h3>
                  <p>Enter marks and generate AI remarks.</p>
                </div>
                <button className="btn primary">Generate Report Cards</button>
              </div>
              <div className="card form-card">
                <div className="card__title">
                  <h4>Add Result</h4>
                  <span className="ai-pill">Term</span>
                </div>
                <form className="form-row" onSubmit={handleCreateResult}>
                  <select
                    value={resultForm.student_id}
                    onChange={(event) =>
                      setResultForm((prev) => ({ ...prev, student_id: event.target.value }))
                    }
                  >
                    <option value="">Select student</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Term (e.g., Term 1)"
                    value={resultForm.term}
                    onChange={(event) =>
                      setResultForm((prev) => ({ ...prev, term: event.target.value }))
                    }
                  />
                  <input
                    type="number"
                    placeholder="Total score"
                    value={resultForm.total_score}
                    onChange={(event) =>
                      setResultForm((prev) => ({ ...prev, total_score: event.target.value }))
                    }
                  />
                  <input
                    type="number"
                    placeholder="Percentage"
                    value={resultForm.percentage}
                    onChange={(event) =>
                      setResultForm((prev) => ({ ...prev, percentage: event.target.value }))
                    }
                  />
                  <input
                    type="text"
                    placeholder="Remarks"
                    value={resultForm.remarks}
                    onChange={(event) =>
                      setResultForm((prev) => ({ ...prev, remarks: event.target.value }))
                    }
                  />
                  <div className="form-actions">
                    <button type="submit" className="btn primary">
                      Save Result
                    </button>
                  </div>
                </form>
              </div>
              <div className="card table-card">
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Class</th>
                      <th>Average</th>
                      <th>AI Remark</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultCards.length === 0 && (
                      <tr>
                        <td colSpan="5">No results added yet.</td>
                      </tr>
                    )}
                    {resultCards.map((row) => (
                      <tr key={row.id}>
                        <td>{studentNameMap.get(row.student_id) || "Student"}</td>
                        <td>{classroomNameMap.get(row.classroom_id) || "Class"}</td>
                        <td>{row.percentage}%</td>
                        <td>{row.remarks || "—"}</td>
                        <td>
                          <span className="badge primary">Recorded</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "accounts" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>Accounts & Fees</h3>
                  <p>Track paid, unpaid, and partial fees.</p>
                </div>
                <button className="btn primary">Send Reminders</button>
              </div>
              <div className="card form-card">
                <div className="card__title">
                  <h4>Add Fee Record</h4>
                  <span className="ai-pill">Ledger</span>
                </div>
                <form className="form-row" onSubmit={handleCreateFee}>
                  <select
                    value={feeForm.student_id}
                    onChange={(event) =>
                      setFeeForm((prev) => ({ ...prev, student_id: event.target.value }))
                    }
                  >
                    <option value="">Select student</option>
                    {students.map((student) => (
                      <option key={student.id} value={student.id}>
                        {student.first_name} {student.last_name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={feeForm.due_date}
                    onChange={(event) =>
                      setFeeForm((prev) => ({ ...prev, due_date: event.target.value }))
                    }
                  />
                  <input
                    type="number"
                    placeholder="Amount due"
                    value={feeForm.amount_due}
                    onChange={(event) =>
                      setFeeForm((prev) => ({ ...prev, amount_due: event.target.value }))
                    }
                  />
                  <input
                    type="number"
                    placeholder="Amount paid"
                    value={feeForm.amount_paid}
                    onChange={(event) =>
                      setFeeForm((prev) => ({ ...prev, amount_paid: event.target.value }))
                    }
                  />
                  <select
                    value={feeForm.status}
                    onChange={(event) =>
                      setFeeForm((prev) => ({ ...prev, status: event.target.value }))
                    }
                  >
                    <option value="pending">Pending</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                  </select>
                  <div className="form-actions">
                    <button type="submit" className="btn primary">
                      Save Fee
                    </button>
                  </div>
                </form>
              </div>
              <div className="grid-2">
                <div className="card fee-card">
                  <div className="card__title">
                    <h4>Fee Summary</h4>
                    <span className="ai-pill">Monthly</span>
                  </div>
                  <div className="fee-metrics">
                    <div>
                      <span>Total due</span>
                      <strong>{formatCurrency(dashboard.feeDue)}</strong>
                    </div>
                    <div>
                      <span>Collected</span>
                      <strong>{formatCurrency(dashboard.feeCollected)}</strong>
                    </div>
                  </div>
                  <div className="fee-tip">
                    <span>AI Suggestion</span>
                    <p>Offer partial payment plans to improve collection rate.</p>
                  </div>
                </div>
                <div className="card">
                  <div className="card__title">
                    <h4>Defaulters (AI Prioritized)</h4>
                    <span className="ai-pill success">Auto-ranked</span>
                  </div>
                  <ul className="alert-list">
                    {feeAlerts.length === 0 && (
                      <li className="alert-item">No pending fees yet.</li>
                    )}
                    {feeAlerts.map((alert) => (
                      <li key={alert.label} className="alert-item">
                        <span className={`badge ${badgeClass(alert.level)} pill`}>
                          {alert.level}
                        </span>
                        <div>
                          <div className="alert-text">{alert.label}</div>
                          <div className="alert-meta">Action: Send reminder</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div className="card table-card">
                <div className="card__title">
                  <h5>Recent Fee Records</h5>
                  <span>Latest entries</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Due Date</th>
                      <th>Amount Due</th>
                      <th>Paid</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {feeLedgers.length === 0 && (
                      <tr>
                        <td colSpan="5">No fee records yet.</td>
                      </tr>
                    )}
                    {feeLedgers.slice(0, 6).map((fee) => (
                      <tr key={fee.id}>
                        <td>{studentNameMap.get(fee.student_id) || "Student"}</td>
                        <td>{formatDate(fee.due_date)}</td>
                        <td>{formatCurrency(fee.amount_due)}</td>
                        <td>{formatCurrency(fee.amount_paid)}</td>
                        <td>
                          <span className={`badge ${badgeClass(fee.status)}`}>{fee.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {activeSection === "predict-xai" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>Predict & XAI</h3>
                  <p>Risk prediction with Explainable AI (SHAP-style). Select from dataset or predict for new.</p>
                </div>
              </div>
              <div className="grid-2 predict-xai-grid">
                <div className="card">
                  <div className="card__title">
                    <h4>Select from Dataset</h4>
                    <span className="ai-pill">No search — direct select</span>
                  </div>
                  <div className="form-row">
                    <select
                      value={predictStudentId}
                      onChange={(e) => {
                        setPredictStudentId(e.target.value);
                        setXaiData(null);
                      }}
                    >
                      <option value="">Select a student...</option>
                      {students.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.first_name} {s.last_name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="btn primary"
                      onClick={handlePredictStudent}
                      disabled={!predictStudentId || xaiLoading}
                    >
                      {xaiLoading ? "Loading..." : "Explain"}
                    </button>
                  </div>
                </div>
                <div className="card">
                  <div className="card__title">
                    <h4>Predict for New (Not in Dataset)</h4>
                    <span className="ai-pill">Custom input</span>
                  </div>
                  <form className="form-row" onSubmit={handleCustomPredict}>
                    <input
                      type="number"
                      placeholder="Attendance % (0-100)"
                      min="0"
                      max="100"
                      value={customPredictForm.attendance_rate}
                      onChange={(e) =>
                        setCustomPredictForm((p) => ({ ...p, attendance_rate: e.target.value }))
                      }
                    />
                    <input
                      type="number"
                      placeholder="Average score % (0-100)"
                      min="0"
                      max="100"
                      value={customPredictForm.average_score}
                      onChange={(e) =>
                        setCustomPredictForm((p) => ({ ...p, average_score: e.target.value }))
                      }
                    />
                    <select
                      value={customPredictForm.fee_status}
                      onChange={(e) =>
                        setCustomPredictForm((p) => ({ ...p, fee_status: e.target.value }))
                      }
                    >
                      <option value="Clear">Fee Clear</option>
                      <option value="Pending">Fee Pending</option>
                    </select>
                    <button type="submit" className="btn primary" disabled={xaiLoading}>
                      {xaiLoading ? "Predicting..." : "Predict"}
                    </button>
                  </form>
                </div>
                <div className="card span-2 xai-chart-card">
                  <div className="card__title">
                    <h4>XAI — Feature Contributions (SHAP-style)</h4>
                    <span className="ai-pill success">
                      {(xaiData || customPredictResult)?.prediction || "—"}
                    </span>
                  </div>
                  {(xaiData || customPredictResult) && (
                    <div className="xai-waterfall">
                      <p className="xai-summary">
                        {(xaiData || customPredictResult).student_name} — Risk:{" "}
                        {((xaiData || customPredictResult).risk_score * 100).toFixed(1)}% (
                        {(xaiData || customPredictResult).prediction})
                      </p>
                      <div className="xai-bars">
                        {((xaiData || customPredictResult).contributions || []).map((c, i) => (
                          <div key={i} className="xai-bar-row">
                            <span className="xai-bar-label">{c.feature}</span>
                            <div className="xai-bar-track">
                              <div
                                className={`xai-bar-fill ${c.shap_value >= 0 ? "positive" : "negative"}`}
                                style={{
                                  width: `${Math.min(100, Math.abs(c.shap_value) * 150)}%`,
                                }}
                              />
                            </div>
                            <span className={`xai-bar-value ${c.shap_value >= 0 ? "positive" : "negative"}`}>
                              {c.shap_value >= 0 ? "+" : ""}{c.shap_value}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {!xaiData && !customPredictResult && !xaiLoading && (
                    <p className="muted">Select a student and click Explain, or enter custom values and Predict.</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {activeSection === "settings" && (
            <section className="section active">
              <div className="section__header">
                <div>
                  <h3>Settings</h3>
                  <p>Manage school profile and AI preferences.</p>
                </div>
                <button className="btn primary">Save Settings</button>
              </div>
              <div className="card">
                <div className="form-grid">
                  <label>
                    School Name
                    <input type="text" defaultValue="Cambridge Public School" />
                  </label>
                  <label>
                    Academic Session
                    <input type="text" defaultValue="2025-2026" />
                  </label>
                  <label>
                    AI Response Mode
                    <select defaultValue="Balanced">
                      <option>Balanced</option>
                      <option>Detailed</option>
                      <option>Brief</option>
                    </select>
                  </label>
                  <label>
                    Notification Preference
                    <select defaultValue="Email + SMS">
                      <option>Email + SMS</option>
                      <option>Email only</option>
                      <option>SMS only</option>
                    </select>
                  </label>
                </div>
              </div>
            </section>
          )}
        </main>
      </div>
      <button className="ai-fab" title="Ask AI Assistant">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <defs>
            <linearGradient id="ai-gradient" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
              <stop offset="100%" stopColor="#dfe6ff" stopOpacity="0.9" />
            </linearGradient>
          </defs>
          <circle cx="24" cy="24" r="18" fill="url(#ai-gradient)" />
          <g fill="none" stroke="#4b5df3" strokeWidth="2" strokeLinecap="round">
            <circle cx="24" cy="24" r="7.5" />
            <path d="M24 12v5.5M24 30.5V36" />
            <path d="M12 24h5.5M30.5 24H36" />
            <path d="M16.5 16.5l3.8 3.8M27.7 27.7l3.8 3.8" />
            <path d="M31.5 16.5l-3.8 3.8M20.3 27.7l-3.8 3.8" />
          </g>
          <circle cx="24" cy="24" r="2.6" fill="#4b5df3" />
        </svg>
      </button>
    </div>
  );
}

