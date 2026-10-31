// Step 8: the morning briefing on WhatsApp (TODAY command and the daily_briefing automation).
// *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.CURRENCY = "USD";
process.env.SCHOOL_NAME = "";
process.env.QUIET_HOURS = "off";
delete process.env.SMTP_HOST;
process.env.SMS_PROVIDER = "off";
process.env.WHATSAPP_PROVIDER = "simulated";
process.env.WHATSAPP_APP_SECRET = "meta-test-secret";
delete process.env.WHATSAPP_REDIRECT_TO;

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

import { createHmac } from "node:crypto";

let request;
let pool;
let processDueJobs;
let loadUserContext;
let buildBriefing;
let schoolToday;
const tokens = {};
const ids = {};
const sent = [];
let wamid = 0;

const PRINCIPAL_PHONE = "+923001234000";
const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
const shift = (day, n) => {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

function say(phone, text) {
  const message = { from: phone.slice(1), id: `wamid.brief${++wamid}`, type: "text", text: { body: text } };
  const raw = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [message] } }] }],
  });
  const sig = `sha256=${createHmac("sha256", "meta-test-secret").update(raw).digest("hex")}`;
  return request
    .post("/webhooks/whatsapp")
    .set("X-Hub-Signature-256", sig)
    .set("Content-Type", "application/json")
    .send(raw);
}
async function drain() {
  for (let i = 0; i < 5 && (await processDueJobs()) > 0; i++);
}
const lastTo = (phone) => sent.filter((s) => s.to === phone).at(-1);

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  ({ processDueJobs } = await import("../src/jobs/queue.js"));
  await import("../src/jobs/handlers.js");
  ({ loadUserContext } = await import("../src/middleware/auth.js"));
  ({ buildBriefing } = await import("../src/modules/whatsapp-bot/briefing.js"));
  ({ schoolToday } = await import("../src/config/env.js"));
  const whatsapp = (await import("../src/messaging/channels/whatsapp.js")).default;
  whatsapp.send = async (msg) => {
    sent.push(msg);
    return { status: "simulated", provider: "simulated", providerMessageId: null, deliveredTo: msg.to };
  };
  request = supertest(app);

  for (const table of [
    "staff_whatsapp_messages",
    "automations",
    "jobs",
    "agent_conversations",
    "agent_actions",
    "incoming_payments",
    "fee_payments",
    "attendance",
    "teacher_classes",
    "fee_ledgers",
    "enrollments",
    "students",
  ]) {
    await pool.execute(`DELETE FROM ${table}`);
  }
  await pool.execute("DELETE FROM users WHERE email LIKE '%@brief.test'");
  await pool.execute("DELETE FROM teachers WHERE email LIKE '%@brief.test'");
  await pool.execute("DELETE FROM classrooms WHERE name LIKE 'Brief %'");
  await pool.execute("UPDATE users SET whatsapp_phone = NULL, whatsapp_sv = NULL");
  const { ensureDefaultPrincipal } = await import("../src/modules/auth/auth.service.js");
  await ensureDefaultPrincipal();
  [[{ id: ids.principal }]] = await pool.execute("SELECT id FROM users WHERE email = 'admin@school.com'");
  tokens.principal = (
    await request.post("/auth/login").send({ email: "admin@school.com", password: "admin123" })
  ).body.token;

  const today = schoolToday();
  ids.today = today;
  // Classes without enrolled students don't appear in the briefing, so only these two count.
  [{ insertId: ids.classA }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Brief 5A', '5')");
  [{ insertId: ids.classB }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Brief 6B', '6')");
  const student = async (first, classId) => {
    const [{ insertId }] = await pool.execute("INSERT INTO students (first_name, last_name) VALUES (?, 'Brief')", [
      first,
    ]);
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [insertId, classId]);
    return insertId;
  };
  ids.ali = await student("Ali", ids.classA);
  ids.sara = await student("Sara", ids.classA);
  ids.omar = await student("Omar", ids.classB);
  // Last school day (two days ago): Sara absent in 5A. Today: 5A marked, 6B not yet.
  const mark = (sid, cls, day, status) =>
    pool.execute("INSERT INTO attendance (student_id, classroom_id, day, status) VALUES (?, ?, ?, ?)", [
      sid,
      cls,
      day,
      status,
    ]);
  await mark(ids.ali, ids.classA, shift(today, -2), "present");
  await mark(ids.sara, ids.classA, shift(today, -2), "absent");
  await mark(ids.omar, ids.classB, shift(today, -2), "present");
  await mark(ids.ali, ids.classA, today, "present");
  await mark(ids.sara, ids.classA, today, "present");

  // Fees: Omar owes 200 (overdue); Ali paid 150 yesterday; one Raast transfer waits to be matched.
  await pool.execute(
    "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, ?, 200, 0, 'pending')",
    [ids.omar, shift(today, -10)]
  );
  const [{ insertId: feeId }] = await pool.execute(
    "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, ?, 150, 150, 'paid')",
    [ids.ali, shift(today, -10)]
  );
  await pool.execute("INSERT INTO fee_payments (fee_id, amount, paid_on) VALUES (?, 150, ?)", [
    feeId,
    shift(today, -1),
  ]);
  await pool.execute(
    "INSERT INTO incoming_payments (channel, transaction_id, amount, paid_on, status) VALUES ('raast', 'T-BRIEF', 75, ?, 'unmatched')",
    [today]
  );

  // A teacher of 5A, and a payment waiting for the principal's approval.
  const [{ insertId: teacherId }] = await pool.execute(
    "INSERT INTO teachers (first_name, last_name, email) VALUES ('Tahira', 'Naz', 'tahira@brief.test')"
  );
  await pool.execute("INSERT INTO teacher_classes (teacher_id, classroom_id) VALUES (?, ?)", [teacherId, ids.classA]);
  const res = await request.post("/users").set(as("principal")).send({
    username: "Tahira",
    email: "tahira@brief.test",
    password: "password123",
    role: "teacher",
    teacher_id: teacherId,
  });
  ids.teacher = res.body.id;
  const actions = await import("../src/agent/actions/actions.service.js");
  const principal = await loadUserContext(ids.principal);
  ids.action = (
    await actions.propose("record_fee_payment", { student_id: ids.omar, amount: 50 }, { req: { user: principal } })
  ).id;
});

afterAll(async () => {
  await pool.execute("UPDATE users SET whatsapp_phone = NULL, whatsapp_sv = NULL");
  await pool.execute("DELETE FROM users WHERE email LIKE '%@brief.test'");
  await pool.end();
});

describe("the morning briefing", () => {
  it("gives the principal attendance, fees, online payments and approvals", async () => {
    const { text, summary } = await buildBriefing(await loadUserContext(ids.principal));
    const twoDaysAgo = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(
      new Date(`${shift(ids.today, -2)}T00:00:00Z`)
    );
    expect(text).toContain(`- ${twoDaysAgo}: 67% present, 1 absent`);
    expect(text).toContain("- Today: 1 of 2 classes marked (not yet: Brief 6B)");
    expect(text).toContain("- Collected yesterday: $150.00 (this month");
    expect(text).toContain("- Overdue: $200.00 from 1 student");
    expect(text).toContain("- 1 online payment ($75.00) waiting to be matched");
    expect(text).toContain(`*Waiting for you (1)*\n- #${ids.action} Record a $50.00 payment for Omar Brief`);
    // Template parameters can't contain line breaks.
    expect(summary).toHaveLength(4);
    for (const part of summary) expect(part).not.toMatch(/\n/);
  });

  it("gives a teacher only their classes' attendance, and nothing about fees", async () => {
    const { text, summary } = await buildBriefing(await loadUserContext(ids.teacher));
    expect(text).toContain("- Today: all 1 class marked");
    expect(text).not.toContain("6B");
    expect(text).not.toContain("*Fees*");
    expect(text).toContain("Nothing is waiting for your approval");
    expect(summary[2]).toBe("Fees: -");
  });

  it("answers TODAY on WhatsApp without asking the AI", async () => {
    const code = (await request.post("/account/whatsapp/code").set(as("principal"))).body;
    await say(PRINCIPAL_PHONE, code.message);
    await say(PRINCIPAL_PHONE, "today");
    await drain();
    expect(lastTo(PRINCIPAL_PHONE).body).toMatch(/^\*Good morning – /);
    expect(lastTo(PRINCIPAL_PHONE).body).toContain("Brief 6B");
  });

  it("is sent by a daily_briefing automation, as a template outside WhatsApp's 24-hour window", async () => {
    const created = await request
      .post("/automations")
      .set(as("principal"))
      .send({
        name: "Morning briefing",
        kind: "daily_briefing",
        mode: "approve",
        schedule: { frequency: "school_days", time: "08:00" },
      });
    expect(created.status).toBe(201);
    expect(created.body.mode).toBe("auto"); // nothing to approve

    let run = await request.post(`/automations/${created.body.id}/run`).set(as("principal"));
    expect(run.body).toMatchObject({ status: "sent", recipients: 1 });
    expect(lastTo(PRINCIPAL_PHONE).templateName).toBeUndefined(); // they wrote today: free text

    await pool.execute("UPDATE staff_whatsapp_messages SET created_at = NOW() - INTERVAL 2 DAY");
    run = await request.post(`/automations/${created.body.id}/run`).set(as("principal"));
    expect(run.body.status).toBe("sent");
    expect(lastTo(PRINCIPAL_PHONE)).toMatchObject({ templateName: "daily_briefing" });
    expect(lastTo(PRINCIPAL_PHONE).templateParams).toHaveLength(4);
  });

  it("is skipped, with the reason, when the person hasn't linked WhatsApp", async () => {
    tokens.teacher = (
      await request.post("/auth/login").send({ email: "tahira@brief.test", password: "password123" })
    ).body.token;
    const created = await request
      .post("/automations")
      .set(as("teacher"))
      .send({ name: "My briefing", kind: "daily_briefing", schedule: { frequency: "daily", time: "07:30" } });
    expect(created.status).toBe(201);
    const run = await request.post(`/automations/${created.body.id}/run`).set(as("teacher"));
    expect(run.body).toMatchObject({
      status: "skipped",
      note: "Link your WhatsApp on My account to get the briefing.",
    });
  });
});
