// M2: approval-gated actions, job queue, message deliveries. *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.QUIET_HOURS = "off"; // individual tests turn it on
delete process.env.SMTP_HOST; // emails are simulated

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
let processDueJobs;
let emailChannel;
let setModel;
let createFakeModel;
let schoolToday;
const tokens = {};
const ids = {};

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

async function login(email, password) {
  const res = await request.post("/auth/login").send({ email, password });
  return res.body.token;
}

/** Propose an action through the same service the assistant tool uses. */
async function propose(role, type, spec) {
  const actions = await import("../src/agent/actions/actions.service.js");
  const me = (await request.get("/auth/me").set(as(role))).body;
  const user = { ...me.user, permissions: new Set(me.permissions), classIds: me.classIds };
  return actions.propose(type, spec, { req: { user } });
}

const deliveries = async (actionId) =>
  (await pool.query("SELECT * FROM message_deliveries WHERE action_id = ? ORDER BY id", [actionId]))[0];

async function guardian(name, email, consentEmail, studentIds) {
  const [{ insertId }] = await pool.execute(
    "INSERT INTO guardians (full_name, email, preferred_channel, consent_email) VALUES (?, ?, 'email', ?)",
    [name, email, consentEmail ? 1 : 0]
  );
  for (const sid of studentIds) {
    await pool.execute("INSERT INTO student_guardians (student_id, guardian_id, is_primary) VALUES (?, ?, 1)", [
      sid,
      insertId,
    ]);
  }
  return insertId;
}

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  ({ processDueJobs } = await import("../src/jobs/queue.js"));
  await import("../src/jobs/handlers.js");
  emailChannel = (await import("../src/messaging/channels/email.js")).default;
  ({ setModel } = await import("../src/agent/llm/index.js"));
  ({ createFakeModel } = await import("../src/agent/llm/fakeModel.js"));
  ({ schoolToday } = await import("../src/config/env.js"));
  request = supertest(app);

  await pool.execute("DELETE FROM users WHERE email LIKE '%@actions.test'");
  for (const table of [
    "jobs",
    "agent_conversations",
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

  [{ insertId: ids.classA }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Class A', '5')");
  [{ insertId: ids.classB }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Class B', '6')");
  const student = async (key, first, classKey) => {
    [{ insertId: ids[key] }] = await pool.execute("INSERT INTO students (first_name, last_name) VALUES (?, 'Khan')", [
      first,
    ]);
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [ids[key], ids[classKey]]);
  };
  await student("ali", "Ali", "classA");
  await student("sara", "Sara", "classB"); // Ali's sister
  await student("omar", "Omar", "classA");
  await student("bilal", "Bilal", "classB");
  ids.khan = await guardian("Mr Khan", "khan@example.com", true, [ids.ali, ids.sara]);
  ids.omarParent = await guardian("Omar's parent", "omar.parent@example.com", false, [ids.omar]); // no email consent
  ids.bilalParent = await guardian("Bilal's parent", "bilal.parent@example.com", true, [ids.bilal]);

  for (const key of ["ali", "sara", "bilal"]) {
    await pool.execute(
      "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, '2020-01-01', 100, 0, 'pending')",
      [ids[key]]
    );
  }
  for (const key of ["ali", "omar", "bilal"]) {
    await pool.execute("INSERT INTO attendance (student_id, classroom_id, day, status) VALUES (?, ?, ?, 'absent')", [
      ids[key],
      key === "bilal" ? ids.classB : ids.classA,
      schoolToday(),
    ]);
  }

  const [{ insertId: teacherId }] = await pool.execute(
    "INSERT INTO teachers (first_name, last_name) VALUES ('Tia', 'T')"
  );
  await pool.execute("INSERT INTO teacher_classes (teacher_id, classroom_id) VALUES (?, ?)", [teacherId, ids.classA]);
  for (const [email, role, extra] of [
    ["tia@actions.test", "teacher", { teacher_id: teacherId }],
    ["acc@actions.test", "accountant", {}],
  ]) {
    await request
      .post("/users")
      .set(as("principal"))
      .send({ username: role, email, password: "password123", role, ...extra });
  }
  tokens.teacher = await login("tia@actions.test", "password123");
  tokens.accountant = await login("acc@actions.test", "password123");
});

afterAll(async () => {
  setModel(undefined);
  await pool.end();
});

describe("Teacher draft → principal approval", () => {
  it("drafts an absence message for the teacher's own class only, without sending", async () => {
    const action = await propose("teacher", "send_parent_messages", { audience: "absent_on_date" });
    ids.teacherDraft = action.id;
    expect(action.status).toBe("pending");
    expect(action.can_approve).toBe(false);
    const names = action.preview.recipients.map((r) => r.student_names);
    expect(names).toEqual(["Ali Khan"]); // Bilal (class B) excluded; Omar's parent has no email consent
    expect(action.preview.skipped).toEqual([
      expect.objectContaining({ student: "Omar Khan", reason: "has not agreed to email" }),
    ]);
    expect(await deliveries(action.id)).toHaveLength(0);
  });

  it("does not let the teacher approve, and shows it on the principal's approval list", async () => {
    const res = await request.post(`/assistant/actions/${ids.teacherDraft}/approve`).set(as("teacher"));
    expect(res.status).toBe(403);
    const list = await request.get("/assistant/actions?status=pending").set(as("principal"));
    expect(list.body.find((a) => a.id === ids.teacherDraft)).toMatchObject({ can_approve: true });
  });

  it("does not let an accountant approve a message about attendance they cannot see", async () => {
    const res = await request.post(`/assistant/actions/${ids.teacherDraft}/approve`).set(as("accountant"));
    expect(res.status).toBe(404); // not visible to them at all
  });

  it("sends exactly the edited text once the principal approves", async () => {
    const edited = await request.patch(`/assistant/actions/${ids.teacherDraft}`).set(as("principal")).send({
      subject: "About {{student_names}} today",
      body: "Dear {{guardian_name}}, {{student_names}} was absent.",
    });
    expect(edited.status).toBe(200);
    expect(edited.body.edited).toBe(1);

    const approved = await request.post(`/assistant/actions/${ids.teacherDraft}/approve`).set(as("principal"));
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("executing");

    await processDueJobs();
    const [d] = await deliveries(ids.teacherDraft);
    expect(d).toMatchObject({ status: "simulated", to_address: "khan@example.com", subject: "About Ali Khan today" });
    expect(d.body).toBe("Dear Mr Khan, Ali Khan was absent.");
    const after = await request.get(`/assistant/actions/${ids.teacherDraft}`).set(as("principal"));
    expect(after.body.status).toBe("executed");
  });

  it("refuses a second approval", async () => {
    const res = await request.post(`/assistant/actions/${ids.teacherDraft}/approve`).set(as("principal"));
    expect(res.status).toBe(409);
  });

  it("refuses a teacher's fee message (no fee access)", async () => {
    await expect(propose("teacher", "send_parent_messages", { audience: "fee_defaulters" })).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("Fee reminders (accountant)", () => {
  it("combines siblings into one message with the total owed", async () => {
    const action = await propose("accountant", "send_parent_messages", { audience: "fee_defaulters" });
    const khan = action.preview.recipients.find((r) => r.name === "Mr Khan");
    expect(khan.student_names).toBe("Ali Khan and Sara Khan");
    expect(khan.body).toContain("$200.00");
    expect(action.can_approve).toBe(true);
    ids.feeReminder = action.id;
  });

  it("holds messages during quiet hours", async () => {
    const { schoolHour } = await import("../src/messaging/quietHours.js");
    const h = schoolHour(new Date());
    process.env.QUIET_HOURS = `${h}-${(h + 2) % 24}`; // a window covering "now"
    try {
      await request.post(`/assistant/actions/${ids.feeReminder}/approve`).set(as("accountant"));
      expect(await processDueJobs()).toBe(0);
      const rows = await deliveries(ids.feeReminder);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.status === "queued" && new Date(r.send_after) > new Date())).toBe(true);
    } finally {
      process.env.QUIET_HOURS = "off";
    }
  });
});

describe("Delivery safety", () => {
  it("does not send if the parent withdrew consent after approval", async () => {
    const action = await propose("principal", "send_parent_messages", {
      audience: "students",
      student_ids: [ids.bilal],
      template: "announcement",
      message: "Sports day is on Friday.",
    });
    await request.post(`/assistant/actions/${action.id}/approve`).set(as("principal"));
    await pool.execute("UPDATE guardians SET consent_email = 0 WHERE id = ?", [ids.bilalParent]);
    await processDueJobs();
    const [d] = await deliveries(action.id);
    expect(d).toMatchObject({ status: "failed", error: "Not sent: has not agreed to email" });
    await pool.execute("UPDATE guardians SET consent_email = 1 WHERE id = ?", [ids.bilalParent]);
  });

  it("retries temporary failures and gives up on permanent ones", async () => {
    const realSend = emailChannel.send;
    const action = await propose("principal", "send_parent_messages", {
      audience: "students",
      student_ids: [ids.bilal],
      template: "announcement",
      message: "Retry test",
    });
    await request.post(`/assistant/actions/${action.id}/approve`).set(as("principal"));
    try {
      emailChannel.send = async () => {
        throw Object.assign(new Error("SMTP timeout"), { retryable: true });
      };
      await processDueJobs();
      let [d] = await deliveries(action.id);
      expect(d).toMatchObject({ status: "queued", attempts: 1, error: "SMTP timeout" });

      await pool.execute(
        "UPDATE jobs SET run_at = NOW() WHERE status = 'queued' AND JSON_EXTRACT(payload, '$.delivery_id') = ?",
        [d.id]
      ); // skip the backoff wait
      emailChannel.send = async () => {
        throw Object.assign(new Error("550 mailbox does not exist"), { retryable: false });
      };
      await processDueJobs();
      [d] = await deliveries(action.id);
      expect(d).toMatchObject({ status: "failed", attempts: 2 });
      const after = await request.get(`/assistant/actions/${action.id}`).set(as("principal"));
      expect(after.body.status).toBe("failed");
    } finally {
      emailChannel.send = realSend;
    }
  });

  it("will not approve an expired action", async () => {
    const action = await propose("principal", "send_parent_messages", {
      audience: "students",
      student_ids: [ids.bilal],
      template: "announcement",
      message: "Old news",
    });
    await pool.execute("UPDATE agent_actions SET expires_at = NOW() - INTERVAL 1 HOUR WHERE id = ?", [action.id]);
    const res = await request.post(`/assistant/actions/${action.id}/approve`).set(as("principal"));
    expect(res.status).toBe(409);
  });
});

describe("Fee payments", () => {
  it("records a payment on approval", async () => {
    const action = await propose("accountant", "record_fee_payment", { student_id: ids.ali, amount: 60 });
    const res = await request.post(`/assistant/actions/${action.id}/approve`).set(as("accountant"));
    expect(res.body.status).toBe("executed");
    const [[fee]] = await pool.query("SELECT amount_paid, status FROM fee_ledgers WHERE student_id = ?", [ids.ali]);
    expect(fee).toMatchObject({ status: "partial" });
    expect(Number(fee.amount_paid)).toBe(60);
  });

  it("refuses a payment prepared before the fees changed", async () => {
    const action = await propose("accountant", "record_fee_payment", { student_id: ids.sara, amount: 50 });
    await pool.execute("UPDATE fee_ledgers SET amount_paid = 10, status = 'partial' WHERE student_id = ?", [ids.sara]);
    const res = await request.post(`/assistant/actions/${action.id}/approve`).set(as("accountant"));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("STALE_ACTION");
  });
});

describe("Outbox", () => {
  it("shows senders every delivery and teachers only their own drafts", async () => {
    const all = await request.get("/messages/deliveries").set(as("principal"));
    const mine = await request.get("/messages/deliveries").set(as("teacher"));
    expect(all.body.total).toBeGreaterThan(mine.body.total);
    expect(mine.body.items.every((d) => d.action_id === ids.teacherDraft)).toBe(true);
  });
});

describe("Assistant tool", () => {
  it("drafts through the chat and shows the approval card", async () => {
    const model = createFakeModel([
      { toolCalls: [{ name: "draft_parent_message", arguments: { audience: "fee_defaulters" } }] },
      { content: "I've prepared reminders for your approval." },
    ]);
    setModel(model);
    const conv = (await request.post("/assistant/conversations").set(as("principal"))).body.id;
    const res = await request
      .post(`/assistant/conversations/${conv}/messages`)
      .set(as("principal"))
      .send({ message: "Remind parents about overdue fees" })
      .buffer(true)
      .parse((r, cb) => {
        let text = "";
        r.on("data", (c) => (text += c));
        r.on("end", () => cb(null, text));
      });
    expect(res.body).toContain("event: action_proposed");
    const toolMessage = JSON.parse(model.calls[1].messages.find((m) => m.role === "tool").content);
    expect(toolMessage.data).toMatchObject({ status: "waiting_for_approval" });
    expect(toolMessage.data.note).toMatch(/NOT done yet/);

    const conversation = await request.get(`/assistant/conversations/${conv}`).set(as("principal"));
    expect(conversation.body.actions).toHaveLength(1);
    expect(conversation.body.actions[0]).toMatchObject({ status: "pending", can_approve: true });
  });
});
