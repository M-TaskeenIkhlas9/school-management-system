// Roles, permissions and teacher class scoping. *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.CURRENCY = "USD"; // independent of the developer's .env
process.env.SCHOOL_NAME = "";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
const tokens = {};
const ids = {};

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

async function login(email, password) {
  const res = await request.post("/auth/login").send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.token;
}

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  request = supertest(app);

  await pool.execute("DELETE FROM users WHERE email LIKE '%@access.test'");
  for (const table of [
    "audit_log",
    "teacher_classes",
    "exam_questions",
    "exams",
    "insights",
    "result_cards",
    "fee_ledgers",
    "attendance",
    "curriculum_items",
    "enrollments",
    "students",
    "teachers",
    "classrooms",
  ]) {
    await pool.execute(`DELETE FROM ${table}`);
  }

  const { ensureDefaultPrincipal } = await import("../src/modules/auth/auth.service.js");
  await ensureDefaultPrincipal();
  tokens.principal = await login("admin@school.com", "admin123");

  // Two classes with two students each, and a fee for one student in each.
  [{ insertId: ids.classA }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Access A', '7')");
  [{ insertId: ids.classB }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Access B', '8')");
  for (const [key, classKey] of [
    ["a1", "classA"],
    ["a2", "classA"],
    ["b1", "classB"],
    ["b2", "classB"],
  ]) {
    [{ insertId: ids[key] }] = await pool.execute("INSERT INTO students (first_name, last_name) VALUES (?, 'Access')", [
      key.toUpperCase(),
    ]);
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [ids[key], ids[classKey]]);
  }
  for (const key of ["a1", "b1"]) {
    await pool.execute(
      "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, '2020-01-01', 100, 0, 'pending')",
      [ids[key]]
    );
  }
  [{ insertId: ids.teacher }] = await pool.execute(
    "INSERT INTO teachers (first_name, last_name, subject) VALUES ('Tara', 'Teach', 'Maths')"
  );
});

afterAll(async () => {
  await pool.end();
});

describe("User management (principal)", () => {
  it("requires a teacher record for teacher accounts", async () => {
    const res = await request
      .post("/users")
      .set(as("principal"))
      .send({ username: "No Link", email: "nolink@access.test", password: "password123", role: "teacher" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("TEACHER_REQUIRED");
  });

  it("creates accountant, admin and teacher accounts", async () => {
    const accounts = [
      { username: "Acc", email: "accountant@access.test", role: "accountant" },
      { username: "Adm", email: "admin@access.test", role: "admin" },
      { username: "Tara", email: "teacher@access.test", role: "teacher", teacher_id: ids.teacher },
    ];
    for (const account of accounts) {
      const res = await request
        .post("/users")
        .set(as("principal"))
        .send({ ...account, password: "password123" });
      expect(res.status).toBe(201);
      expect(res.body).not.toHaveProperty("password_hash");
      ids[`user_${account.role}`] = res.body.id;
    }
    tokens.accountant = await login("accountant@access.test", "password123");
    tokens.admin = await login("admin@access.test", "password123");
  });

  it("assigns the teacher to class A only", async () => {
    const res = await request
      .put(`/teachers/${ids.teacher}/classes`)
      .set(as("principal"))
      .send({ classroom_ids: [ids.classA] });
    expect(res.status).toBe(200);
    expect(res.body.classroom_ids).toEqual([ids.classA]);
    tokens.teacher = await login("teacher@access.test", "password123");
  });
});

describe("/auth/me", () => {
  it("reports each role's permissions and the teacher's classes", async () => {
    const principal = await request.get("/auth/me").set(as("principal"));
    expect(principal.body.permissions).toContain("users:manage");
    expect(principal.body.classIds).toBeNull();
    expect(principal.body.school).toMatchObject({ currency: "USD", timezone: expect.any(String) });
    const pub = await request.get("/auth/school");
    expect(pub.status).toBe(200);
    expect(Object.keys(pub.body).sort()).toEqual(["currency", "name", "timezone"]);

    const teacher = await request.get("/auth/me").set(as("teacher"));
    expect(teacher.body.user.role).toBe("teacher");
    expect(teacher.body.permissions).toContain("attendance:write");
    expect(teacher.body.permissions).not.toContain("fees:read");
    expect(teacher.body.classIds).toEqual([ids.classA]);
  });
});

describe("Accountant", () => {
  it("can work with fees", async () => {
    expect((await request.get("/fees").set(as("accountant"))).status).toBe(200);
    const dash = await request.get("/dashboard").set(as("accountant"));
    expect(dash.body).toHaveProperty("feeCollected");
  });

  it("sees students with fee status but cannot change them", async () => {
    const list = await request.get("/students").set(as("accountant"));
    expect(list.status).toBe(200);
    expect(list.body.find((s) => s.id === ids.a1)).toHaveProperty("latest_fee_status", "pending");
    const create = await request.post("/students").set(as("accountant")).send({ first_name: "X", last_name: "Y" });
    expect(create.status).toBe(403);
  });

  it("cannot see attendance, results or reports", async () => {
    for (const path of ["/attendance", "/results", "/ai/students/attention", "/users"]) {
      expect((await request.get(path).set(as("accountant"))).status).toBe(403);
    }
  });
});

describe("Teacher (class A only)", () => {
  it("lists only their own class and students, without fee data", async () => {
    const classes = await request.get("/classrooms").set(as("teacher"));
    expect(classes.body.map((c) => c.id)).toEqual([ids.classA]);

    const students = await request.get("/students").set(as("teacher"));
    expect(students.body.map((s) => s.id).sort()).toEqual([ids.a1, ids.a2].sort());
    expect(students.body[0]).not.toHaveProperty("latest_fee_status");
  });

  it("cannot open a student from another class", async () => {
    expect((await request.get(`/students/${ids.b1}`).set(as("teacher"))).status).toBe(403);
    const own = await request.get(`/students/${ids.a1}`).set(as("teacher"));
    expect(own.status).toBe(200);
    expect(own.body).not.toHaveProperty("fees");
    expect(own.body).toHaveProperty("results");
  });

  it("marks attendance only for their class, and only for students in it", async () => {
    const otherClass = await request
      .post("/attendance")
      .set(as("teacher"))
      .send({ student_id: ids.b1, classroom_id: ids.classB, status: "present" });
    expect(otherClass.status).toBe(403);

    const wrongStudent = await request
      .post("/attendance")
      .set(as("teacher"))
      .send({ student_id: ids.b1, classroom_id: ids.classA, status: "present" });
    expect(wrongStudent.status).toBe(400);
    expect(wrongStudent.body.code).toBe("STUDENT_NOT_IN_CLASS");

    const ok = await request
      .post("/attendance")
      .set(as("teacher"))
      .send({ student_id: ids.a1, classroom_id: ids.classA, status: "present" });
    expect(ok.status).toBe(201);
    expect(ok.body.marked_by).toBe(ids.user_teacher);

    const list = await request.get("/attendance").set(as("teacher"));
    expect(list.body.items.every((row) => row.classroom_id === ids.classA)).toBe(true);
  });

  it("sees a dashboard for their class only, without money", async () => {
    const dash = await request.get("/dashboard").set(as("teacher"));
    expect(dash.status).toBe(200);
    expect(dash.body.totalStudents).toBe(2);
    expect(dash.body).not.toHaveProperty("feeCollected");
  });

  it("is refused fees, reports, student changes and user management", async () => {
    expect((await request.get("/fees").set(as("teacher"))).status).toBe(403);
    expect((await request.get("/ai/students/attention").set(as("teacher"))).status).toBe(403);
    expect((await request.post("/students").set(as("teacher")).send({ first_name: "X", last_name: "Y" })).status).toBe(
      403
    );
    expect((await request.get("/users").set(as("teacher"))).status).toBe(403);
  });

  it("sees nothing once unassigned from all classes", async () => {
    await request.put(`/teachers/${ids.teacher}/classes`).set(as("principal")).send({ classroom_ids: [] });
    const students = await request.get("/students").set(as("teacher"));
    expect(students.body).toEqual([]);
    const attendance = await request.get("/attendance").set(as("teacher"));
    expect(attendance.body.total).toBe(0);
    await request
      .put(`/teachers/${ids.teacher}/classes`)
      .set(as("principal"))
      .send({ classroom_ids: [ids.classA] });
  });
});

describe("Admin", () => {
  it("manages records but not money", async () => {
    expect((await request.get("/students").set(as("admin"))).status).toBe(200);
    expect((await request.get("/fees").set(as("admin"))).status).toBe(403);
    const dash = await request.get("/dashboard").set(as("admin"));
    expect(dash.body).not.toHaveProperty("feeCollected");
  });

  it("cannot create or change a principal", async () => {
    const create = await request
      .post("/users")
      .set(as("admin"))
      .send({ username: "Boss", email: "boss@access.test", password: "password123", role: "principal" });
    expect(create.status).toBe(403);

    const [[principal]] = await pool.execute("SELECT id FROM users WHERE email = 'admin@school.com'");
    const change = await request.patch(`/users/${principal.id}`).set(as("admin")).send({ is_active: false });
    expect(change.status).toBe(403);
  });
});

describe("Account safety", () => {
  it("does not let the principal deactivate or demote themselves", async () => {
    const [[principal]] = await pool.execute("SELECT id FROM users WHERE email = 'admin@school.com'");
    const res = await request.patch(`/users/${principal.id}`).set(as("principal")).send({ role: "admin" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("SELF_CHANGE");
  });

  it("locks out a deactivated user immediately, even with a valid token", async () => {
    const res = await request.patch(`/users/${ids.user_accountant}`).set(as("principal")).send({ is_active: false });
    expect(res.status).toBe(200);
    const after = await request.get("/fees").set(as("accountant"));
    expect(after.status).toBe(401);
    expect(after.body.code).toBe("ACCOUNT_DISABLED");
  });

  it("records logins, account changes and class assignments in the audit log", async () => {
    const [rows] = await pool.query("SELECT action FROM audit_log");
    const actions = new Set(rows.map((r) => r.action));
    for (const action of ["auth.login", "user.create", "user.update", "teacher.classes.set"]) {
      expect(actions).toContain(action);
    }
  });
});
