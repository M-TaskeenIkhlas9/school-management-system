// Step 7: marking attendance through the assistant (web chat or WhatsApp), confirmed before it is saved.
// *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.CURRENCY = "USD";
process.env.SCHOOL_NAME = "";
process.env.QUIET_HOURS = "off";
delete process.env.SMTP_HOST;
process.env.SMS_PROVIDER = "off";
process.env.WHATSAPP_PROVIDER = "off";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
let runAgent;
let createFakeModel;
let loadUserContext;
let findStudent;
let actions;
let schoolToday;
const tokens = {};
const ids = {};

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
const marks = async (classId, day) =>
  Object.fromEntries(
    (
      await pool.query(
        `SELECT CONCAT(s.first_name, ' ', s.last_name) AS name, a.status
         FROM attendance a JOIN students s ON s.id = a.student_id WHERE a.classroom_id = ? AND a.day = ?`,
        [classId, day]
      )
    )[0].map((r) => [r.name, r.status])
  );

/** Ask the assistant (scripted model) as `role`; returns the tool results it saw and the actions proposed. */
async function ask(role, script) {
  const user = await loadUserContext(ids[`${role}User`]);
  const [{ insertId: conversationId }] = await pool.execute(
    "INSERT INTO agent_conversations (user_id, title) VALUES (?, 'test')",
    [user.id]
  );
  const model = createFakeModel(script);
  const proposed = [];
  await runAgent({
    user,
    conversationId,
    message: "attendance",
    model,
    emit: (event, data) => event === "action_proposed" && proposed.push(data.action),
  });
  const last = model.calls.at(-1).messages;
  const toolResults = last.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content));
  return { proposed, toolResults };
}

const prepare = (role, args) =>
  ask(role, [{ toolCalls: [{ name: "prepare_attendance", arguments: args }] }, { content: "Prepared." }]);

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  ({ runAgent } = await import("../src/agent/engine/runAgent.js"));
  ({ createFakeModel } = await import("../src/agent/llm/fakeModel.js"));
  ({ loadUserContext } = await import("../src/middleware/auth.js"));
  ({ findStudent } = await import("../src/agent/actions/markAttendance.js"));
  actions = await import("../src/agent/actions/actions.service.js");
  ({ schoolToday } = await import("../src/config/env.js"));
  request = supertest(app);

  for (const table of [
    "jobs",
    "agent_conversations",
    "agent_actions",
    "attendance",
    "teacher_classes",
    "fee_ledgers",
    "enrollments",
    "students",
  ]) {
    await pool.execute(`DELETE FROM ${table}`);
  }
  await pool.execute("DELETE FROM users WHERE email LIKE '%@attend.test'");
  await pool.execute("DELETE FROM teachers WHERE email LIKE '%@attend.test'");
  await pool.execute("DELETE FROM classrooms WHERE name LIKE 'Attend %'");
  const { ensureDefaultPrincipal } = await import("../src/modules/auth/auth.service.js");
  await ensureDefaultPrincipal();
  [[{ id: ids.principalUser }]] = await pool.execute("SELECT id FROM users WHERE email = 'admin@school.com'");
  tokens.principal = (
    await request.post("/auth/login").send({ email: "admin@school.com", password: "admin123" })
  ).body.token;

  [{ insertId: ids.classA }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Attend 5A', '5')");
  [{ insertId: ids.classB }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Attend 6B', '6')");
  const student = async (first, last, roll, classId) => {
    const [{ insertId }] = await pool.execute(
      "INSERT INTO students (first_name, last_name, roll_number) VALUES (?, ?, ?)",
      [first, last, roll]
    );
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [insertId, classId]);
  };
  await student("Ali", "Hassan", "1", ids.classA);
  await student("Ali", "Raza", "2", ids.classA);
  await student("Sara", "Khan", "3", ids.classA);
  await student("Bilal", "Ahmed", "4", ids.classA);
  await student("Omar", "Farooq", "5", ids.classB);

  const [{ insertId: teacherId }] = await pool.execute(
    "INSERT INTO teachers (first_name, last_name, email) VALUES ('Tahira', 'Naz', 'tahira@attend.test')"
  );
  await pool.execute("INSERT INTO teacher_classes (teacher_id, classroom_id) VALUES (?, ?)", [teacherId, ids.classA]);
  const res = await request.post("/users").set(as("principal")).send({
    username: "Tahira",
    email: "tahira@attend.test",
    password: "password123",
    role: "teacher",
    teacher_id: teacherId,
  });
  expect(res.status).toBe(201);
  ids.teacherUser = res.body.id;
  tokens.teacher = (
    await request.post("/auth/login").send({ email: "tahira@attend.test", password: "password123" })
  ).body.token;
});

afterAll(async () => {
  await pool.execute("DELETE FROM users WHERE email LIKE '%@attend.test'");
  await pool.end();
});

describe("matching names to a class", () => {
  const students = [
    { student_id: 1, student_name: "Ali Hassan", roll_number: "1" },
    { student_id: 2, student_name: "Ali Raza", roll_number: "2" },
    { student_id: 3, student_name: "Sara Khan", roll_number: "3" },
  ];
  it("finds by first name, initial, full name or roll number", () => {
    expect(findStudent(students, "sara").map((s) => s.student_id)).toEqual([3]);
    expect(findStudent(students, "Ali R").map((s) => s.student_id)).toEqual([2]);
    expect(findStudent(students, "ali hassan").map((s) => s.student_id)).toEqual([1]);
    expect(findStudent(students, "2").map((s) => s.student_id)).toEqual([2]);
    expect(findStudent(students, "Ali")).toHaveLength(2);
    expect(findStudent(students, "Zara")).toHaveLength(0);
  });
});

describe("the assistant marks attendance", () => {
  it("prepares a teacher's register for confirmation, and saves it only when approved", async () => {
    const today = schoolToday();
    const { proposed } = await prepare("teacher", { class_name: "5A", absent: ["Sara", "Ali R"], late: ["Bilal"] });
    expect(proposed).toHaveLength(1);
    const [action] = proposed;
    expect(action).toMatchObject({
      type: "mark_attendance",
      status: "pending",
      can_approve: true, // the teacher confirms their own class
      summary: `Attendance for Attend 5A on ${today}: 1 present, 2 absent, 1 late`,
      preview: { absent_names: ["Ali Raza", "Sara Khan"], late_names: ["Bilal Ahmed"], already_marked: 0 },
    });
    expect(await marks(ids.classA, today)).toEqual({});

    const res = await request.post(`/assistant/actions/${action.id}/approve`).set(as("teacher"));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "executed", result: { saved: 4, present: 1, absent: 2, late: 1 } });
    expect(await marks(ids.classA, today)).toEqual({
      "Ali Hassan": "present",
      "Ali Raza": "absent",
      "Sara Khan": "absent",
      "Bilal Ahmed": "late",
    });
    const [[row]] = await pool.execute("SELECT DISTINCT marked_by FROM attendance WHERE classroom_id = ?", [
      ids.classA,
    ]);
    expect(row.marked_by).toBe(ids.teacherUser);
  });

  it("shows what changes when a day is marked again", async () => {
    const { proposed } = await prepare("teacher", { class_name: "5A", absent: ["Sara"] });
    expect(proposed[0].preview).toMatchObject({
      already_marked: 4,
      changes: [
        { student: "Ali Raza", from: "absent", to: "present" },
        { student: "Bilal Ahmed", from: "late", to: "present" },
      ],
    });
    await actions.reject({ user: await loadUserContext(ids.teacherUser) }, proposed[0].id);
  });

  it("asks which student is meant when a name is unclear, and saves nothing", async () => {
    const { proposed, toolResults } = await prepare("teacher", { class_name: "5A", absent: ["Ali", "Zara"] });
    expect(proposed).toHaveLength(0);
    expect(toolResults[0].error).toMatch(/"Ali" could be Ali Hassan or Ali Raza; no student "Zara" in Attend 5A/);
    expect(toolResults[0].error).toMatch(/Students in Attend 5A: Ali Hassan, Ali Raza, Sara Khan, Bilal Ahmed/);
  });

  it("refuses a future day", async () => {
    const { toolResults } = await prepare("principal", { class_name: "5A", date: "2999-01-01" });
    expect(toolResults[0].error).toMatch(/future day/);
  });

  it("keeps a teacher to their own classes", async () => {
    const { proposed, toolResults } = await prepare("teacher", { class_name: "6B" });
    expect(proposed).toHaveLength(0);
    expect(toolResults[0].error).toMatch(/No class matching "6B"/);

    // The principal prepares 6B's register; the 5A teacher can't approve (or even see) it.
    const {
      proposed: [action],
    } = await prepare("principal", { class_name: "6B", absent: ["Omar"] });
    expect(action.can_approve).toBe(true);
    const res = await request.post(`/assistant/actions/${action.id}/approve`).set(as("teacher"));
    expect(res.status).toBe(404);
    const list = await request.get("/assistant/actions?status=pending").set(as("teacher"));
    expect(list.body.map((a) => a.id)).not.toContain(action.id);
  });

  it("refuses to save a register if the class changed after it was prepared", async () => {
    const {
      proposed: [action],
    } = await prepare("principal", { class_name: "6B" });
    const [{ insertId }] = await pool.execute("INSERT INTO students (first_name, last_name) VALUES ('New', 'Pupil')");
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [insertId, ids.classB]);
    const res = await request.post(`/assistant/actions/${action.id}/approve`).set(as("principal"));
    expect(res.status).toBe(409);
    const [[still]] = await pool.execute("SELECT status FROM agent_actions WHERE id = ?", [action.id]);
    expect(still.status).toBe("pending");
  });
});
