// M5: automations — schedules, permissions, approval vs trusted rules, single runs. *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.CURRENCY = "USD";
process.env.SCHOOL_NAME = "";
process.env.SCHOOL_TIMEZONE = "Asia/Karachi";
process.env.SCHOOL_DAYS = "1,2,3,4,5";
process.env.QUIET_HOURS = "off";
process.env.LOGIN_RATE_LIMIT = "1000";
delete process.env.SMTP_HOST;
process.env.SMS_PROVIDER = "off";
process.env.WHATSAPP_PROVIDER = "off";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
let schedule;
let service;
const tokens = {};
const ids = {};

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
const login = async (email, password) => (await request.post("/auth/login").send({ email, password })).body.token;

const weekly = { frequency: "weekly", weekday: 1, time: "09:00" };

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  schedule = await import("../src/modules/automations/schedule.js");
  service = await import("../src/modules/automations/automations.service.js");
  request = supertest(app);

  await pool.execute("DELETE FROM users WHERE email LIKE '%@automations.test'");
  for (const table of [
    "automations",
    "jobs",
    "agent_actions",
    "student_guardians",
    "guardians",
    "teacher_classes",
    "fee_ledgers",
    "attendance",
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

  [{ insertId: ids.classA }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Auto A', '5')");
  [{ insertId: ids.student }] = await pool.execute(
    "INSERT INTO students (first_name, last_name) VALUES ('Nadia', 'Auto')"
  );
  await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [ids.student, ids.classA]);
  await pool.execute(
    "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, '2020-01-01', 300, 0, 'pending')",
    [ids.student]
  );
  const [{ insertId: guardianId }] = await pool.execute(
    "INSERT INTO guardians (full_name, email, preferred_channel, consent_email) VALUES ('Mrs Auto', 'auto.parent@example.com', 'email', 1)"
  );
  await pool.execute("INSERT INTO student_guardians (student_id, guardian_id, is_primary) VALUES (?, ?, 1)", [
    ids.student,
    guardianId,
  ]);

  [{ insertId: ids.teacher }] = await pool.execute("INSERT INTO teachers (first_name, last_name) VALUES ('Tom', 'T')");
  await pool.execute("INSERT INTO teacher_classes (teacher_id, classroom_id) VALUES (?, ?)", [ids.teacher, ids.classA]);
  const teacher = await request.post("/users").set(as("principal")).send({
    username: "Tom",
    email: "tom@automations.test",
    password: "password123",
    role: "teacher",
    teacher_id: ids.teacher,
  });
  ids.teacherUser = teacher.body.id;
  tokens.teacher = await login("tom@automations.test", "password123");
});

afterAll(async () => {
  await pool.end();
});

describe("Schedules (school time zone)", () => {
  it("finds the next Monday 09:00 in Karachi (UTC+5)", () => {
    // Wednesday 2026-10-28 12:00 UTC → Monday 2026-11-02 09:00 Karachi = 04:00 UTC
    const next = schedule.nextRun(weekly, new Date("2026-10-28T12:00:00Z"));
    expect(next.toISOString()).toBe("2026-11-02T04:00:00.000Z");
  });

  it("skips the weekend for school days, and fires later the same day if the time hasn't passed", () => {
    const sameDay = schedule.nextRun(
      { frequency: "school_days", time: "11:00" },
      new Date("2026-10-30T03:00:00Z") // Friday 08:00 in Karachi
    );
    expect(sameDay.toISOString()).toBe("2026-10-30T06:00:00.000Z");
    const afterFriday = schedule.nextRun(
      { frequency: "school_days", time: "11:00" },
      new Date("2026-10-30T07:00:00Z") // Friday 12:00 in Karachi
    );
    expect(afterFriday.toISOString()).toBe("2026-11-02T06:00:00.000Z"); // Monday
  });

  it("describes schedules in plain words", () => {
    expect(schedule.describeSchedule(weekly)).toBe("Every Monday at 09:00");
    expect(schedule.describeSchedule({ frequency: "school_days", time: "11:00" })).toBe("Every school day at 11:00");
  });
});

describe("Who may automate what", () => {
  it("lets the principal create a weekly fee reminder that waits for approval", async () => {
    const res = await request
      .post("/automations")
      .set(as("principal"))
      .send({ name: "Monday fee reminders", kind: "fee_reminder", schedule: weekly });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ mode: "approve", is_active: true, schedule_text: "Every Monday at 09:00" });
    expect(new Date(res.body.next_run_at) > new Date()).toBe(true);
    ids.feeRule = res.body.id;
  });

  it("refuses a teacher's fee rule (no fee access) and any rule that sends by itself", async () => {
    const fees = await request
      .post("/automations")
      .set(as("teacher"))
      .send({ name: "x", kind: "fee_reminder", schedule: weekly });
    expect(fees.status).toBe(403);
    const auto = await request
      .post("/automations")
      .set(as("teacher"))
      .send({ name: "x", kind: "absence_today", schedule: weekly, mode: "auto" });
    expect(auto.status).toBe(403);
  });

  it("lets a teacher automate absence alerts for approval, and shows them only their own rules", async () => {
    const res = await request
      .post("/automations")
      .set(as("teacher"))
      .send({ name: "Daily absences", kind: "absence_today", schedule: { frequency: "school_days", time: "11:00" } });
    expect(res.status).toBe(201);
    ids.teacherRule = res.body.id;
    const mine = (await request.get("/automations").set(as("teacher"))).body;
    expect(mine.map((a) => a.id)).toEqual([ids.teacherRule]);
    const all = (await request.get("/automations").set(as("principal"))).body;
    expect(all.map((a) => a.id).sort()).toEqual([ids.feeRule, ids.teacherRule].sort());
  });

  it("validates times", async () => {
    const res = await request
      .post("/automations")
      .set(as("principal"))
      .send({ name: "x", kind: "fee_reminder", schedule: { frequency: "daily", time: "25:00" } });
    expect(res.status).toBe(400);
  });
});

describe("Runs", () => {
  it("prepares a message that waits on Approvals", async () => {
    const res = await request.post(`/automations/${ids.feeRule}/run`).set(as("principal"));
    expect(res.body).toMatchObject({ status: "waiting", recipients: 1 });
    const [[action]] = await pool.execute("SELECT status FROM agent_actions WHERE id = ?", [res.body.action_id]);
    expect(action.status).toBe("pending");
  });

  it("sends straight away when the rule is trusted", async () => {
    await request.patch(`/automations/${ids.feeRule}`).set(as("principal")).send({ mode: "auto" });
    const res = await request.post(`/automations/${ids.feeRule}/run`).set(as("principal"));
    expect(res.body.status).toBe("sent");
    const [rows] = await pool.execute("SELECT channel, to_address FROM message_deliveries WHERE action_id = ?", [
      res.body.action_id,
    ]);
    expect(rows).toEqual([{ channel: "email", to_address: "auto.parent@example.com" }]);
  });

  it("records a skipped run when nobody matches", async () => {
    const res = await request.post(`/automations/${ids.teacherRule}/run`).set(as("teacher"));
    expect(res.body.status).toBe("skipped");
    expect(res.body.note).toMatch(/Nobody matches/);
    const history = (await request.get(`/automations/${ids.teacherRule}/runs`).set(as("teacher"))).body;
    expect(history[0]).toMatchObject({ trigger_type: "manual", status: "skipped" });
  });

  it("runs a due rule exactly once and moves its next run forward", async () => {
    await pool.execute("UPDATE automations SET next_run_at = NOW() - INTERVAL 1 MINUTE WHERE id = ?", [ids.feeRule]);
    const [first, second] = await Promise.all([service.runDueAutomations(), service.runDueAutomations()]);
    expect(first.length + second.length).toBe(1);
    const [[rule]] = await pool.execute("SELECT next_run_at FROM automations WHERE id = ?", [ids.feeRule]);
    expect(new Date(rule.next_run_at) > new Date()).toBe(true);
  });

  it("stops a paused rule, and fails safely if its creator can no longer sign in", async () => {
    const paused = await request.patch(`/automations/${ids.teacherRule}`).set(as("teacher")).send({ is_active: false });
    expect(paused.body).toMatchObject({ is_active: false, next_run_at: null });

    await pool.execute("UPDATE users SET is_active = 0 WHERE id = ?", [ids.teacherUser]);
    const [[rule]] = await pool.execute("SELECT * FROM automations WHERE id = ?", [ids.teacherRule]);
    const result = await service.runAutomation(rule, "schedule");
    expect(result).toMatchObject({ status: "failed", note: expect.stringMatching(/can no longer sign in/) });
  });
});
