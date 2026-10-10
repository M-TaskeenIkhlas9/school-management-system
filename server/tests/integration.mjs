import "dotenv/config";

const BASE = `http://localhost:${process.env.PORT || 4000}`;

async function api(method, path, body, token) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const opts = { method, headers };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, opts);
  const data = await res.json();
  return { status: res.status, data };
}

async function run() {
  const results = [];
  const log = (name, res) => {
    const ok = res.status < 400;
    results.push({ name, status: res.status, ok, data: res.data });
    console.log(`${ok ? "PASS" : "FAIL"} [${res.status}] ${name}`);
    console.log("  ", JSON.stringify(res.data).slice(0, 200));
  };

  // Health
  log("Health", await api("GET", "/health"));

  // Auth
  log("401 no auth", await api("GET", "/dashboard"));
  const loginRes = await api("POST", "/auth/login", { email: "admin@school.com", password: "admin123" });
  log("Login", loginRes);
  const T = loginRes.data.token;

  // Dashboard empty
  log("Dashboard (empty)", await api("GET", "/dashboard", null, T));

  // Classroom CRUD
  const c = await api("POST", "/classrooms", { name: "Grade 7B", grade: "7", section: "B" }, T);
  log("Create classroom", c);
  const classId = c.data.id;

  // Student CRUD
  const s = await api("POST", "/students", { first_name: "Ahmed", last_name: "Khan", guardian_name: "Mr Khan", guardian_phone: "030012345" }, T);
  log("Create student", s);
  const studentId = s.data.id;

  // Teacher
  const t = await api("POST", "/teachers", { first_name: "Sara", last_name: "Ali", subject: "Mathematics", phone: "030098765" }, T);
  log("Create teacher", t);

  // Enrollment
  const e = await api("POST", "/enrollments", { student_id: studentId, classroom_id: classId }, T);
  log("Create enrollment", e);

  // Curriculum
  const cur = await api("POST", "/curriculum", { classroom_id: classId, subject: "Mathematics", book_title: "Math Book", topics: "Algebra,Geometry,Fractions" }, T);
  log("Create curriculum", cur);

  // Attendance
  const att = await api("POST", "/attendance", { student_id: studentId, classroom_id: classId, status: "present" }, T);
  log("Create attendance", att);

  // Duplicate attendance (should 409)
  const attDup = await api("POST", "/attendance", { student_id: studentId, classroom_id: classId, status: "absent" }, T);
  log("Duplicate attendance (409)", attDup);

  // Fee
  const fee = await api("POST", "/fees", { student_id: studentId, due_date: "2026-03-15", amount_due: 500, amount_paid: 200 }, T);
  log("Create fee", fee);

  // Fee exceeds (should 400)
  const feeBad = await api("POST", "/fees", { student_id: studentId, due_date: "2026-04-01", amount_due: 100, amount_paid: 999 }, T);
  log("Fee exceeds (400)", feeBad);

  // Result with grade auto-calc
  const r = await api("POST", "/results", { student_id: studentId, classroom_id: classId, term: "Term 1", total_score: 85, percentage: 85 }, T);
  log("Create result (grade=A)", r);

  // Validation: empty body
  const valBad = await api("POST", "/students", {}, T);
  log("Validation empty body (400)", valBad);

  // Dashboard with data
  log("Dashboard (with data)", await api("GET", "/dashboard", null, T));

  // List endpoints
  log("List students", await api("GET", "/students", null, T));
  log("List teachers", await api("GET", "/teachers", null, T));
  log("List classrooms", await api("GET", "/classrooms", null, T));
  log("List enrollments", await api("GET", "/enrollments", null, T));
  log("List attendance", await api("GET", "/attendance", null, T));
  log("List fees", await api("GET", "/fees", null, T));
  log("List results", await api("GET", "/results", null, T));

  // Student profile
  log("Student profile", await api("GET", `/students/${studentId}`, null, T));

  // AI: attention
  log("AI attention", await api("GET", "/ai/students/attention", null, T));

  // AI: exam generation
  const exam = await api("POST", "/ai/exams/generate", { classroom_id: classId, subject: "Mathematics", prompt: "Generate test on Algebra and Geometry", num_questions: 3 }, T);
  log("AI exam generate", exam);

  // List exams
  log("List exams", await api("GET", "/exams", null, T));

  // Summary
  console.log("\n========== SUMMARY ==========");
  const passed = results.filter(r => r.ok || r.name.includes("(4")).length;
  const failed = results.filter(r => !r.ok && !r.name.includes("(4")).length;
  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  // Check expected failures
  const att409 = results.find(r => r.name.includes("Duplicate attendance"));
  console.log(`Duplicate attendance guard: ${att409?.status === 409 ? "PASS" : "FAIL"}`);
  const fee400 = results.find(r => r.name.includes("Fee exceeds"));
  console.log(`Fee exceeds guard: ${fee400?.status === 400 ? "PASS" : "FAIL"}`);
  const val400 = results.find(r => r.name.includes("Validation empty"));
  console.log(`Validation guard: ${val400?.status === 400 ? "PASS" : "FAIL"}`);
  const noAuth = results.find(r => r.name.includes("401"));
  console.log(`Auth guard: ${noAuth?.status === 401 ? "PASS" : "FAIL"}`);
  const gradeCheck = results.find(r => r.name.includes("grade=A"));
  console.log(`Grade auto-calc (A for 85%): ${gradeCheck?.data?.grade === "A" ? "PASS" : "FAIL"}`);
  const feeRemaining = results.find(r => r.name === "Create fee");
  console.log(`Fee remaining_amount (300): ${feeRemaining?.data?.remaining_amount === 300 ? "PASS" : "FAIL"}`);
}

run().catch(err => { console.error("Test error:", err); process.exit(1); });
