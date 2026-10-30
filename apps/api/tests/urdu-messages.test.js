// Urdu messages to parents: each parent's language, the school default, WhatsApp in Urdu. *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.CURRENCY = "PKR";
process.env.SCHOOL_NAME = "";
process.env.QUIET_HOURS = "off";
delete process.env.SMTP_HOST;
delete process.env.MESSAGE_LANGUAGE;
process.env.SMS_PROVIDER = "simulated";
process.env.WHATSAPP_PROVIDER = "simulated";
process.env.CHANNEL_ORDER = "whatsapp,sms,email";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
let processDueJobs;
let buildWhatsAppPayload;
const tokens = {};
const ids = {};

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
const URDU = /[؀-ۿ]/;

async function propose(spec) {
  const actions = await import("../src/agent/actions/actions.service.js");
  const me = (await request.get("/auth/me").set(as("principal"))).body;
  const user = { ...me.user, permissions: new Set(me.permissions), classIds: me.classIds };
  return actions.propose("send_parent_messages", spec, { req: { user } });
}
const byName = (action) => Object.fromEntries(action.preview.recipients.map((r) => [r.name, r]));
const setDefault = (language) =>
  request.put("/settings/school").set(as("principal")).send({ message_language: language });

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  ({ processDueJobs } = await import("../src/jobs/queue.js"));
  await import("../src/jobs/handlers.js");
  ({ buildWhatsAppPayload } = await import("../src/messaging/channels/whatsapp.js"));
  request = supertest(app);

  for (const table of [
    "message_events",
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
    "classrooms",
  ]) {
    await pool.execute(`DELETE FROM ${table}`);
  }
  const { ensureDefaultPrincipal } = await import("../src/modules/auth/auth.service.js");
  await ensureDefaultPrincipal();
  tokens.principal = (
    await request.post("/auth/login").send({ email: "admin@school.com", password: "admin123" })
  ).body.token;
  await setDefault("en");

  [{ insertId: ids.room }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Class Urdu', '4')");
  const student = async (first) => {
    const [{ insertId }] = await pool.execute("INSERT INTO students (first_name, last_name) VALUES (?, 'Khan')", [
      first,
    ]);
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [insertId, ids.room]);
    await pool.execute(
      "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, '2020-01-01', 1500, 0, 'pending')",
      [insertId]
    );
    await pool.execute("INSERT INTO attendance (student_id, classroom_id, day, status) VALUES (?, ?, ?, 'absent')", [
      insertId,
      ids.room,
      "2026-10-28",
    ]);
    return insertId;
  };
  const parent = async (name, phone, channel, language, kids) => {
    const [{ insertId }] = await pool.execute(
      `INSERT INTO guardians (full_name, phone, preferred_channel, language, consent_whatsapp, consent_sms)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [name, phone, channel, language, channel === "whatsapp" ? 1 : 0, channel === "sms" ? 1 : 0]
    );
    for (const kid of kids) {
      await pool.execute("INSERT INTO student_guardians (student_id, guardian_id, is_primary) VALUES (?, ?, 1)", [
        kid,
        insertId,
      ]);
    }
    return insertId;
  };
  ids.ali = await student("Ali");
  ids.zara = await student("Zara");
  ids.omar = await student("Omar");
  ids.hina = await student("Hina");
  ids.sam = await student("Sam");
  // Urdu by SMS with two children; Urdu on WhatsApp; English by SMS; no choice (school default) by SMS.
  ids.tariq = await parent("Tariq", "+923001230001", "sms", "ur", [ids.ali, ids.zara]);
  ids.bilal = await parent("Bilal", "+923001230002", "whatsapp", "ur", [ids.omar]);
  ids.sana = await parent("Sana", "+923001230003", "sms", "en", [ids.sam]);
  ids.nadia = await parent("Nadia", "+923001230004", "sms", null, [ids.hina]);
});

afterAll(async () => {
  await setDefault("en");
  await pool.end();
});

describe("Urdu messages to parents", () => {
  it("sends each parent the fee reminder in their own language", async () => {
    const action = await propose({ audience: "fee_defaulters" });
    const r = byName(action);
    expect(r.Tariq).toMatchObject({ channel: "sms", language: "ur" });
    expect(r.Tariq.body).toMatch(URDU);
    expect(r.Tariq.body).toContain("Ali Khan اور Zara Khan");
    expect(r.Tariq.body).toMatch(/3,000/);
    expect(r.Sana).toMatchObject({ channel: "sms", language: "en" });
    expect(r.Sana.body).toMatch(/Sam Khan has .*1,500.* in unpaid fees/);
    expect(r.Sana.body).not.toMatch(URDU);
    // Urdu SMS is billed as Unicode: 70 characters per part.
    expect(r.Tariq.segments).toBeGreaterThan(1);
    expect(action.preview.notes.join(" ")).toMatch(/2 parent\(s\) get this message in Urdu/);
  });

  it("sends the Urdu translation of the WhatsApp template, with Urdu parameters", async () => {
    const action = await propose({ audience: "absent_on_date", date: "2026-10-28" });
    const bilal = byName(action).Bilal;
    expect(bilal).toMatchObject({ channel: "whatsapp", template_name: "absence_alert", template_language: "ur" });
    expect(bilal.template_params).toEqual(["Bilal", "Omar Khan", "تاریخ 2026-10-28"]);
    expect(byName(action).Tariq.body).toContain("تاریخ 2026-10-28");

    const payload = buildWhatsAppPayload({
      to: "+923001230002",
      templateName: bilal.template_name,
      templateParams: bilal.template_params,
      templateLanguage: bilal.template_language,
    });
    expect(payload.template.language).toEqual({ code: "ur" });
  });

  it("uses the school's default language for parents who have not chosen one", async () => {
    let action = await propose({ audience: "students", student_ids: [ids.hina], template: "fee_reminder" });
    expect(byName(action).Nadia).toMatchObject({ language: "en" });

    expect((await setDefault("ur")).body.message_language).toBe("ur");
    try {
      action = await propose({ audience: "students", student_ids: [ids.hina, ids.sam], template: "fee_reminder" });
      expect(byName(action).Nadia.language).toBe("ur");
      expect(byName(action).Nadia.body).toMatch(URDU);
      expect(byName(action).Sana.language).toBe("en"); // her own choice wins
    } finally {
      await setDefault("en");
    }
  });

  it("wraps an announcement in Urdu but keeps the school's words as written", async () => {
    const action = await propose({ audience: "class", class_name: "Class Urdu", message: "Sports day is on Friday." });
    const { Bilal, Tariq } = byName(action);
    expect(Bilal.body).toMatch(/^محترم Bilal،/); // WhatsApp: the full Urdu greeting and sign-off
    expect(Bilal.body).toContain("Sports day is on Friday.");
    expect(Tariq.body).toContain("Sports day is on Friday."); // SMS: just the school name and the text
  });

  it("sends edited text to every parent exactly as written", async () => {
    const action = await propose({ audience: "students", student_ids: [ids.ali, ids.sam], template: "fee_reminder" });
    const res = await request
      .patch(`/assistant/actions/${action.id}`)
      .set(as("principal"))
      .send({ body: "Dear {{guardian_name}}, please visit the office." });
    expect(res.status).toBe(200);
    const r = Object.fromEntries(res.body.preview.recipients.map((x) => [x.name, x]));
    expect(r.Tariq).toMatchObject({ language: "en", body: "Dear Tariq, please visit the office." });
    expect(res.body.preview.notes.join(" ")).toMatch(/chose Urdu get it exactly as written/);
  });

  it("records the template language on the delivery", async () => {
    const action = await propose({ audience: "students", student_ids: [ids.omar], template: "fee_reminder" });
    expect((await request.post(`/assistant/actions/${action.id}/approve`).set(as("principal"))).status).toBe(200);
    for (let i = 0; i < 5 && (await processDueJobs()) > 0; i++);
    const [[row]] = await pool.execute("SELECT * FROM message_deliveries WHERE action_id = ?", [action.id]);
    expect(row).toMatchObject({ channel: "whatsapp", status: "simulated", template_language: "ur" });
  });
});

describe("Choosing the language", () => {
  it("saves the parent's language from the student form", async () => {
    const res = await request.post("/students").set(as("principal")).send({
      first_name: "Ayesha",
      last_name: "Malik",
      classroom_id: ids.room,
      guardian_name: "Imran Malik",
      guardian_phone: "03001239999",
      guardian_language: "ur",
    });
    expect(res.status).toBe(201);
    const [[g]] = await pool.execute(
      "SELECT g.language FROM guardians g JOIN student_guardians sg ON sg.guardian_id = g.id WHERE sg.student_id = ?",
      [res.body.id]
    );
    expect(g.language).toBe("ur");

    const edit = await request.put(`/students/${res.body.id}`).set(as("principal")).send({
      first_name: "Ayesha",
      last_name: "Malik",
      guardian_name: "Imran Malik",
      guardian_phone: "03001239999",
      guardian_language: "",
    });
    expect(edit.status).toBe(200);
    const [[after]] = await pool.execute("SELECT language FROM guardians WHERE full_name = 'Imran Malik'");
    expect(after.language).toBeNull(); // back to the school's default
  });

  it("refuses an unknown language", async () => {
    const res = await request.put("/settings/school").set(as("principal")).send({ message_language: "fr" });
    expect(res.status).toBe(400);
  });
});
