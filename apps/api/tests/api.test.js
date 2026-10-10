import { jest } from "@jest/globals";

// Set test env before any imports. DB host/user/password come from .env;
// the database is always the dedicated *_test one (created by `npm test`).
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";

// Safety guard: these tests DELETE every row, so never run them on a real DB.
if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let app;
let pool;

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const appModule = await import("../index.js");
  const dbModule = await import("../db.js");
  app = appModule.default;
  pool = dbModule.default;
  request = supertest(app);

  // Clean test data
  await pool.execute("DELETE FROM exam_questions");
  await pool.execute("DELETE FROM exams");
  await pool.execute("DELETE FROM insights");
  await pool.execute("DELETE FROM ai_logs");
  await pool.execute("DELETE FROM result_cards");
  await pool.execute("DELETE FROM fee_ledgers");
  await pool.execute("DELETE FROM attendance");
  await pool.execute("DELETE FROM curriculum_items");
  await pool.execute("DELETE FROM enrollments");
  await pool.execute("DELETE FROM students");
  await pool.execute("DELETE FROM teachers");
  await pool.execute("DELETE FROM classrooms");

  // index.js no longer starts the server on import, so seed the login user here.
  const { ensureDefaultPrincipal } = await import("../services/authService.js");
  await ensureDefaultPrincipal();
});

afterAll(async () => {
  await pool.end();
});

let token;
let classroomId;
let studentId;
let teacherId;

describe("Health", () => {
  it("GET /health returns ok", async () => {
    const res = await request.get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
  });
});

describe("Auth", () => {
  it("POST /auth/login with valid credentials returns token", async () => {
    const res = await request.post("/auth/login").send({
      email: "admin@school.com",
      password: "admin123",
    });
    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.role).toBe("principal");
    token = res.body.token;
  });

  it("POST /auth/login with wrong password returns 401", async () => {
    const res = await request.post("/auth/login").send({
      email: "admin@school.com",
      password: "wrong",
    });
    expect(res.status).toBe(401);
  });

  it("GET /dashboard without token returns 401", async () => {
    const res = await request.get("/dashboard");
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("AUTH_REQUIRED");
  });
});

describe("Classrooms", () => {
  it("POST /classrooms creates a classroom", async () => {
    const res = await request
      .post("/classrooms")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "Grade 7B", grade: "7", section: "B" });
    expect(res.status).toBe(201);
    expect(res.body.name).toBe("Grade 7B");
    classroomId = res.body.id;
  });

  it("GET /classrooms returns list", async () => {
    const res = await request
      .get("/classrooms")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it("POST /classrooms without required field returns 400", async () => {
    const res = await request
      .post("/classrooms")
      .set("Authorization", `Bearer ${token}`)
      .send({ section: "A" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });
});

describe("Students", () => {
  it("POST /students creates a student", async () => {
    const res = await request
      .post("/students")
      .set("Authorization", `Bearer ${token}`)
      .send({
        first_name: "Test",
        last_name: "Student",
        guardian_name: "Mr. Parent",
        guardian_phone: "123456",
      });
    expect(res.status).toBe(201);
    expect(res.body.first_name).toBe("Test");
    studentId = res.body.id;
  });

  it("POST /students with empty body returns 400", async () => {
    const res = await request
      .post("/students")
      .set("Authorization", `Bearer ${token}`)
      .send({});
    expect(res.status).toBe(400);
  });

  it("GET /students/:id returns student profile", async () => {
    const res = await request
      .get(`/students/${studentId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.attendance_rate).toBeDefined();
    expect(res.body.results).toBeDefined();
    expect(res.body.fees).toBeDefined();
  });

  it("GET /students/99999 returns 404", async () => {
    const res = await request
      .get("/students/99999")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe("Teachers", () => {
  it("POST /teachers creates a teacher", async () => {
    const res = await request
      .post("/teachers")
      .set("Authorization", `Bearer ${token}`)
      .send({ first_name: "Test", last_name: "Teacher", subject: "Math" });
    expect(res.status).toBe(201);
    teacherId = res.body.id;
  });

  it("PUT /teachers/:id updates teacher", async () => {
    const res = await request
      .put(`/teachers/${teacherId}`)
      .set("Authorization", `Bearer ${token}`)
      .send({ subject: "Science" });
    expect(res.status).toBe(200);
    expect(res.body.subject).toBe("Science");
  });

  it("DELETE /teachers/:id soft-deletes teacher", async () => {
    const res = await request
      .delete(`/teachers/${teacherId}`)
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe("Enrollments", () => {
  it("POST /enrollments creates enrollment", async () => {
    const res = await request
      .post("/enrollments")
      .set("Authorization", `Bearer ${token}`)
      .send({ student_id: studentId, classroom_id: classroomId });
    expect(res.status).toBe(201);
  });

  it("POST /enrollments duplicate returns 409", async () => {
    const res = await request
      .post("/enrollments")
      .set("Authorization", `Bearer ${token}`)
      .send({ student_id: studentId, classroom_id: classroomId });
    expect(res.status).toBe(409);
  });
});

describe("Attendance", () => {
  it("POST /attendance marks attendance", async () => {
    const res = await request
      .post("/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send({ student_id: studentId, classroom_id: classroomId, status: "present" });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("present");
    expect(res.body.marked_by).toBe(1);
  });

  it("POST /attendance duplicate day returns 409", async () => {
    const res = await request
      .post("/attendance")
      .set("Authorization", `Bearer ${token}`)
      .send({ student_id: studentId, classroom_id: classroomId, status: "absent" });
    expect(res.status).toBe(409);
  });
});

describe("Fees", () => {
  it("POST /fees creates fee with remaining_amount", async () => {
    const res = await request
      .post("/fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ student_id: studentId, due_date: "2026-03-15", amount_due: 500, amount_paid: 200 });
    expect(res.status).toBe(201);
    expect(res.body.remaining_amount).toBe(300);
    expect(res.body.status).toBe("partial");
  });

  it("POST /fees rejects payment exceeding amount_due", async () => {
    const res = await request
      .post("/fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ student_id: studentId, due_date: "2026-04-01", amount_due: 100, amount_paid: 999 });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("PAYMENT_EXCEEDS_FEE");
  });

  it("POST /fees auto-sets paid status when full payment", async () => {
    const res = await request
      .post("/fees")
      .set("Authorization", `Bearer ${token}`)
      .send({ student_id: studentId, due_date: "2026-05-01", amount_due: 300, amount_paid: 300 });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe("paid");
    expect(res.body.remaining_amount).toBe(0);
  });
});

describe("Results", () => {
  it("POST /results auto-calculates grade", async () => {
    const res = await request
      .post("/results")
      .set("Authorization", `Bearer ${token}`)
      .send({
        student_id: studentId,
        classroom_id: classroomId,
        term: "Term 1",
        total_score: 92,
        percentage: 92,
      });
    expect(res.status).toBe(201);
    expect(res.body.grade).toBe("A+");
  });

  it("POST /results grade B for 75%", async () => {
    const res = await request
      .post("/results")
      .set("Authorization", `Bearer ${token}`)
      .send({
        student_id: studentId,
        classroom_id: classroomId,
        term: "Term 2",
        total_score: 75,
        percentage: 75,
      });
    expect(res.status).toBe(201);
    expect(res.body.grade).toBe("B");
  });

  it("POST /results/generate batch creates multiple results", async () => {
    const res = await request
      .post("/results/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        classroom_id: classroomId,
        term: "Final",
        results: [
          { student_id: studentId, total_score: 45, percentage: 45, remarks: "Needs improvement" },
        ],
      });
    expect(res.status).toBe(201);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body[0].grade).toBe("F");
  });
});

describe("Exams & AI", () => {
  it("POST /ai/exams/generate creates exam with questions", async () => {
    // First create curriculum so AI has context
    await request
      .post("/curriculum")
      .set("Authorization", `Bearer ${token}`)
      .send({ classroom_id: classroomId, subject: "Math", topics: "Algebra,Geometry" });

    const res = await request
      .post("/ai/exams/generate")
      .set("Authorization", `Bearer ${token}`)
      .send({
        classroom_id: classroomId,
        subject: "Math",
        prompt: "Generate a test on Algebra",
        num_questions: 3,
      });
    expect(res.status).toBe(201);
    expect(res.body.questions).toBeDefined();
    expect(res.body.questions.length).toBe(3);
    expect(res.body.created_by_ai).toBe(1);
  });

  it("GET /exams returns list with class_name and question_count", async () => {
    const res = await request
      .get("/exams")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body[0].class_name).toBeDefined();
    expect(res.body[0].question_count).toBeDefined();
  });

  it("GET /ai/students/attention returns flagged students", async () => {
    const res = await request
      .get("/ai/students/attention")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.generated_at).toBeDefined();
    expect(Array.isArray(res.body.students)).toBe(true);
  });
});

describe("Dashboard", () => {
  it("GET /dashboard returns all 6 stats", async () => {
    const res = await request
      .get("/dashboard")
      .set("Authorization", `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.totalStudents).toBeGreaterThanOrEqual(1);
    expect(res.body.totalTeachers).toBeDefined();
    expect(res.body.activeClasses).toBeDefined();
    expect(res.body.feeCollected).toBeDefined();
    expect(res.body.feeDue).toBeDefined();
    expect(res.body.todayAttendance).toBeDefined();
  });
});
