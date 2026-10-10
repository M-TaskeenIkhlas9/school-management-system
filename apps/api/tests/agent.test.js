// Agent harness + Phase 1 regression tests. Runs against the *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
// Force the deterministic rule-based path: no LLM calls, no tokens spent.
process.env.GROQ_API_KEY = "";
process.env.OPENAI_API_KEY = "";
process.env.USE_OLLAMA = "false";
// Never deliver real email from tests.
process.env.SMTP_HOST = "";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
let token;
let conversationId;

const auth = () => ({ Authorization: `Bearer ${token}` });
const outboxCount = async () => (await pool.query("SELECT COUNT(*) AS n FROM email_outbox"))[0][0].n;

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  request = supertest(app);

  for (const table of [
    "email_outbox", "agent_actions", "agent_messages", "agent_conversations",
    "exam_questions", "exams", "insights", "ai_logs", "result_cards", "fee_ledgers",
    "attendance", "curriculum_items", "enrollments", "students", "teachers", "classrooms",
  ]) {
    await pool.execute(`DELETE FROM ${table}`);
  }

  const { ensureDefaultPrincipal } = await import("../src/modules/auth/auth.service.js");
  await ensureDefaultPrincipal();
  const login = await request.post("/auth/login").send({ email: "admin@school.com", password: "admin123" });
  token = login.body.token;

  // Two students with overdue fees: one with a guardian email, one without.
  const [c] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Class 5', '5')");
  const [a] = await pool.execute(
    "INSERT INTO students (first_name, last_name, guardian_name, guardian_email) VALUES ('Ali', 'Hassan', 'Hassan Ali', 'hassan@example.com')"
  );
  const [b] = await pool.execute("INSERT INTO students (first_name, last_name, guardian_name) VALUES ('Zainab', 'Iqbal', 'Iqbal Shah')");
  for (const id of [a.insertId, b.insertId]) {
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [id, c.insertId]);
    await pool.execute(
      "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, '2020-01-10', 150, 0, 'pending')",
      [id]
    );
  }
});

afterAll(async () => {
  await pool.end();
});

describe("Phase 1 security & bug fixes", () => {
  it("POST /auth/register requires authentication", async () => {
    const res = await request.post("/auth/register").send({ username: "x", email: "x@example.com", password: "secret123" });
    expect(res.status).toBe(401);
  });

  it("risk prediction keeps legitimate zero values", async () => {
    const res = await request
      .post("/predict/explain/custom")
      .set(auth())
      .send({ attendance_rate: 0, average_score: 0, fee_status: "Clear" });
    expect(res.status).toBe(200);
    const att = res.body.contributions.find((c) => c.feature.startsWith("attendance_rate"));
    expect(att.value).toBe(0);
    expect(res.body.prediction).toBe("Needs Attention");
  });
});

describe("Validation and errors (zod + Express 5)", () => {
  it("rejects a non-numeric id with 400", async () => {
    const res = await request.get("/students/abc").set(auth());
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("returns 404 in the standard error format", async () => {
    const res = await request.get("/students/999999").set(auth());
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an invalid guardian email", async () => {
    const res = await request.post("/students").set(auth()).send({ first_name: "A", last_name: "B", guardian_email: "nope" });
    expect(res.status).toBe(400);
    expect(res.body.details.join(" ")).toMatch(/guardian_email/);
  });

  it("treats empty optional form fields as null", async () => {
    const res = await request.post("/students").set(auth()).send({ first_name: "Empty", last_name: "Fields", roll_number: "", date_of_birth: "" });
    expect(res.status).toBe(201);
    expect(res.body.roll_number).toBeNull();
    expect(res.body.date_of_birth).toBeNull();
    await pool.execute("DELETE FROM students WHERE id = ?", [res.body.id]);
  });

  it("rejects an empty chat message with 400", async () => {
    const conv = await request.post("/agent/conversations").set(auth());
    const res = await request.post(`/agent/conversations/${conv.body.id}/messages`).set(auth()).send({ message: "   " });
    expect(res.status).toBe(400);
  });
});

describe("Students with class assignment (single transaction)", () => {
  let classA;
  let classB;
  let studentId;

  beforeAll(async () => {
    [{ insertId: classA }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Txn A', '7')");
    [{ insertId: classB }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Txn B', '8')");
  });

  const activeClasses = async (id) =>
    (await pool.execute("SELECT classroom_id FROM enrollments WHERE student_id = ? AND is_active = 1", [id]))[0].map((r) => r.classroom_id);

  it("creates the student and enrolls them together", async () => {
    const res = await request.post("/students").set(auth()).send({ first_name: "Txn", last_name: "Student", classroom_id: String(classA) });
    expect(res.status).toBe(201);
    studentId = res.body.id;
    expect(await activeClasses(studentId)).toEqual([classA]);
  });

  it("moves the student to a new class, deactivating the old enrollment", async () => {
    const res = await request.put(`/students/${studentId}`).set(auth()).send({ classroom_id: classB });
    expect(res.status).toBe(200);
    expect(await activeClasses(studentId)).toEqual([classB]);
  });

  it("rolls back the student when the class does not exist", async () => {
    const res = await request.post("/students").set(auth()).send({ first_name: "Ghost", last_name: "Student", classroom_id: 999999 });
    expect(res.status).toBe(400);
    const [rows] = await pool.execute("SELECT id FROM students WHERE first_name = 'Ghost'");
    expect(rows).toHaveLength(0);
  });
});

describe("Agent harness", () => {
  it("creates a conversation", async () => {
    const res = await request.post("/agent/conversations").set(auth());
    expect(res.status).toBe(201);
    conversationId = res.body.id;
  });

  it("proposes fee reminder emails without sending anything", async () => {
    const res = await request
      .post(`/agent/conversations/${conversationId}/messages`)
      .set(auth())
      .send({ message: "Send the email to the parents whose fees are due" });
    expect(res.status).toBe(200);
    expect(res.body.actions).toHaveLength(1);
    const action = res.body.actions[0];
    expect(action.type).toBe("send_guardian_emails");
    expect(action.status).toBe("pending");
    expect(action.preview.emails).toHaveLength(1);
    expect(action.preview.emails[0].to).toBe("hassan@example.com");
    expect(action.preview.emails[0].body).toContain("$150.00");
    expect(action.preview.skipped[0].student_name).toBe("Zainab Iqbal");
    expect(await outboxCount()).toBe(0);
  });

  it("approving executes exactly the previewed emails (simulated without SMTP)", async () => {
    const conv = await request.get(`/agent/conversations/${conversationId}`).set(auth());
    const actionId = conv.body.actions[0].id;

    const res = await request.post(`/agent/actions/${actionId}/approve`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("executed");
    expect(res.body.result.simulated).toBe(1);
    expect(await outboxCount()).toBe(1);

    const again = await request.post(`/agent/actions/${actionId}/approve`).set(auth());
    expect(again.status).toBe(409);
    expect(await outboxCount()).toBe(1);

    const after = await request.get(`/agent/conversations/${conversationId}`).set(auth());
    expect(after.body.messages.at(-1).content).toMatch(/Approved and done/);
  });

  it("rejecting a proposal sends nothing", async () => {
    const turn = await request
      .post(`/agent/conversations/${conversationId}/messages`)
      .set(auth())
      .send({ message: "remind parents about unpaid fees" });
    const actionId = turn.body.actions[0].id;

    const res = await request.post(`/agent/actions/${actionId}/reject`).set(auth());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("rejected");
    expect(await outboxCount()).toBe(1);
  });

  it("returns 404 for another user's / missing conversation", async () => {
    const res = await request.get("/agent/conversations/999999").set(auth());
    expect(res.status).toBe(404);
  });
});

describe("Security hardening", () => {
  it("sends security headers and hides the framework", async () => {
    const res = await request.get("/health");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("answers malformed JSON with 400, not 500", async () => {
    const res = await request.post("/auth/login").set("Content-Type", "application/json").send("{not json");
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_JSON");
  });

  // Keep last in this file: it exhausts the login limit for this IP.
  it("locks out repeated failed logins with 429", async () => {
    let last;
    for (let i = 0; i < 11; i++) {
      last = await request.post("/auth/login").send({ email: "admin@school.com", password: "wrong-password" });
    }
    expect(last.status).toBe(429);
    expect(last.body.code).toBe("RATE_LIMITED");
  });
});
