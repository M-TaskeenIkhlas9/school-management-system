// M3: WhatsApp and SMS channels, fallback, delivery receipts and opt-outs. *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.QUIET_HOURS = "off";
delete process.env.SMTP_HOST;
process.env.SMS_PROVIDER = "simulated";
process.env.WHATSAPP_PROVIDER = "simulated";
process.env.CHANNEL_ORDER = "whatsapp,sms,email";
process.env.PUBLIC_BASE_URL = "https://school.example";
process.env.TWILIO_AUTH_TOKEN = "twilio-test-token";
process.env.WHATSAPP_APP_SECRET = "meta-test-secret";
process.env.WHATSAPP_VERIFY_TOKEN = "verify-me";
for (const key of ["SMS_REDIRECT_TO", "WHATSAPP_REDIRECT_TO", "SMS_COST_PER_SEGMENT", "WHATSAPP_COST_PER_MESSAGE"]) {
  delete process.env[key];
}

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

import { createHmac } from "node:crypto";

let request;
let pool;
let processDueJobs;
let smsSegments;
let buildWhatsAppPayload;
let smsChannel;
let whatsappChannel;
let twilioSignature;
const tokens = {};
const ids = {};

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

async function propose(spec) {
  const actions = await import("../src/agent/actions/actions.service.js");
  const me = (await request.get("/auth/me").set(as("principal"))).body;
  const user = { ...me.user, permissions: new Set(me.permissions), classIds: me.classIds };
  return actions.propose("send_parent_messages", spec, { req: { user } });
}

const approve = (id) => request.post(`/assistant/actions/${id}/approve`).set(as("principal"));
const deliveries = async (actionId) =>
  (await pool.query("SELECT * FROM message_deliveries WHERE action_id = ? ORDER BY id", [actionId]))[0];
const byGuardian = (rows, guardianId) => rows.filter((r) => r.guardian_id === guardianId);

/** Run the queue until nothing is due (fallbacks queue more work). */
async function drain() {
  for (let i = 0; i < 5 && (await processDueJobs()) > 0; i++);
}

/** Replace global fetch with a canned response; records each request. */
function mockFetch(status, json) {
  const calls = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(json), { status, headers: { "Content-Type": "application/json" } });
  };
  return { calls, restore: () => (globalThis.fetch = real) };
}

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  ({ processDueJobs } = await import("../src/jobs/queue.js"));
  await import("../src/jobs/handlers.js");
  ({ smsSegments } = await import("../src/messaging/channels/text.js"));
  smsChannel = (await import("../src/messaging/channels/sms.js")).default;
  const wa = await import("../src/messaging/channels/whatsapp.js");
  whatsappChannel = wa.default;
  buildWhatsAppPayload = wa.buildWhatsAppPayload;
  ({ twilioSignature } = await import("../src/modules/webhooks/webhooks.routes.js"));
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

  [{ insertId: ids.classA }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Class M3', '5')");
  const family = async (key, first, guardian) => {
    [{ insertId: ids[key] }] = await pool.execute("INSERT INTO students (first_name, last_name) VALUES (?, 'Test')", [
      first,
    ]);
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [ids[key], ids.classA]);
    await pool.execute(
      "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, '2020-01-01', 250, 0, 'pending')",
      [ids[key]]
    );
    const [{ insertId: gid }] = await pool.execute(
      `INSERT INTO guardians (full_name, email, phone, preferred_channel, consent_whatsapp, consent_sms, consent_email)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [guardian.name, guardian.email ?? null, guardian.phone ?? null, guardian.preferred, ...guardian.consent]
    );
    await pool.execute("INSERT INTO student_guardians (student_id, guardian_id, is_primary) VALUES (?, ?, 1)", [
      ids[key],
      gid,
    ]);
    ids[`${key}Parent`] = gid;
  };
  // WhatsApp first; SMS and email also allowed.
  await family("ali", "Ali", {
    name: "Wasim",
    phone: "+923001110001",
    email: "wasim@example.com",
    preferred: "whatsapp",
    consent: [1, 1, 1],
  });
  // SMS only.
  await family("sara", "Sara", { name: "Sadia", phone: "+923001110002", preferred: "sms", consent: [0, 1, 0] });
  // WhatsApp only.
  await family("omar", "Omar", { name: "Owais", phone: "+923001110003", preferred: "whatsapp", consent: [1, 0, 0] });
});

afterAll(async () => {
  await pool.end();
});

describe("SMS length", () => {
  it("counts GSM-7 and Unicode segments the way operators bill them", () => {
    expect(smsSegments("a".repeat(160))).toMatchObject({ encoding: "GSM-7", segments: 1 });
    expect(smsSegments("a".repeat(161)).segments).toBe(2);
    expect(smsSegments("€".repeat(80)).segments).toBe(1); // extension characters count double
    expect(smsSegments("€".repeat(81)).segments).toBe(2);
    expect(smsSegments("ف".repeat(70))).toMatchObject({ encoding: "UCS-2", segments: 1 });
    expect(smsSegments("ف".repeat(71)).segments).toBe(2);
  });
});

describe("Provider requests", () => {
  afterEach(() => {
    process.env.SMS_PROVIDER = "simulated";
    process.env.WHATSAPP_PROVIDER = "simulated";
    delete process.env.SMS_REDIRECT_TO;
  });

  it("builds WhatsApp template messages with cleaned parameters", () => {
    expect(
      buildWhatsAppPayload({ to: "+923001110001", templateName: "fee_reminder", templateParams: ["Mr\nKhan", ""] })
    ).toEqual({
      messaging_product: "whatsapp",
      to: "923001110001",
      type: "template",
      template: {
        name: "fee_reminder",
        language: { code: "en" },
        components: [
          {
            type: "body",
            parameters: [
              { type: "text", text: "Mr Khan" },
              { type: "text", text: "-" },
            ],
          },
        ],
      },
    });
    expect(buildWhatsAppPayload({ to: "+92300", body: "Hi" })).toMatchObject({ type: "text", text: { body: "Hi" } });
  });

  it("sends SMS through Twilio with a status callback, honouring the test redirect", async () => {
    Object.assign(process.env, {
      SMS_PROVIDER: "twilio",
      TWILIO_ACCOUNT_SID: "AC123",
      TWILIO_SMS_FROM: "+15550001111",
      SMS_REDIRECT_TO: "+923009999999",
    });
    const fetch = mockFetch(201, { sid: "SM1" });
    try {
      const res = await smsChannel.send({ to: "+923001110002", body: "Hello" });
      expect(res).toMatchObject({ status: "sent", provider: "twilio", providerMessageId: "SM1" });
      const { url, init } = fetch.calls[0];
      expect(url).toBe("https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json");
      expect(Object.fromEntries(new URLSearchParams(init.body.toString()))).toMatchObject({
        To: "+923009999999",
        From: "+15550001111",
        Body: "Hello",
        StatusCallback: "https://school.example/webhooks/twilio/status",
      });
    } finally {
      fetch.restore();
    }
  });

  it("treats a bad number as permanent and a provider outage as temporary", async () => {
    Object.assign(process.env, { SMS_PROVIDER: "twilio", TWILIO_ACCOUNT_SID: "AC123", TWILIO_SMS_FROM: "+1555" });
    let fetch = mockFetch(400, { code: 21211, message: "Invalid 'To' Phone Number" });
    await expect(smsChannel.send({ to: "+92", body: "x" })).rejects.toMatchObject({ retryable: false });
    fetch.restore();
    fetch = mockFetch(503, {});
    await expect(smsChannel.send({ to: "+92", body: "x" })).rejects.toMatchObject({ retryable: true });
    fetch.restore();
  });

  it("treats 'not on WhatsApp' as permanent", async () => {
    Object.assign(process.env, { WHATSAPP_PROVIDER: "meta", WHATSAPP_TOKEN: "t", WHATSAPP_PHONE_NUMBER_ID: "123" });
    const fetch = mockFetch(400, { error: { code: 131026, message: "Message undeliverable" } });
    try {
      await expect(whatsappChannel.send({ to: "+92300", body: "x" })).rejects.toMatchObject({ retryable: false });
      expect(fetch.calls[0].url).toMatch(/graph\.facebook\.com\/v[\d.]+\/123\/messages$/);
    } finally {
      fetch.restore();
    }
  });

  it("is not used when switched on without credentials", () => {
    process.env.SMS_PROVIDER = "twilio";
    delete process.env.TWILIO_ACCOUNT_SID;
    expect(smsChannel.mode()).toBe("misconfigured");
    expect(smsChannel.enabled()).toBe(false);
  });
});

describe("Routing and preview", () => {
  it("uses each parent's channel: WhatsApp template, short SMS, with a cost estimate", async () => {
    process.env.SMS_COST_PER_SEGMENT = "2";
    try {
      const action = await propose({ audience: "fee_defaulters" });
      const r = Object.fromEntries(action.preview.recipients.map((x) => [x.name, x]));
      expect(r.Wasim).toMatchObject({ channel: "whatsapp", to: "+923001110001", template_name: "fee_reminder" });
      expect(r.Wasim.template_params).toEqual(["Wasim", "Ali Test", expect.stringMatching(/250/), "2020-01-01"]);
      expect(r.Sadia).toMatchObject({ channel: "sms", subject: null, segments: 1, est_cost: 2 });
      expect(r.Sadia.body).toMatch(/Sara Test has .*250.* in unpaid fees/);
      expect(r.Sadia.body.length).toBeLessThanOrEqual(160);
      expect(action.preview.by_channel).toMatchObject({ whatsapp: { messages: 2 }, sms: { messages: 1, segments: 1 } });
      expect(action.preview.estimated_cost).toMatch(/2/);
      expect(action.summary).toMatch(/2 WhatsApp, 1 SMS/);
    } finally {
      delete process.env.SMS_COST_PER_SEGMENT;
    }
  });

  it("sends on one channel when asked, skipping parents who can't get it", async () => {
    const action = await propose({ audience: "fee_defaulters", channel: "sms" });
    expect(action.preview.recipients.map((x) => [x.name, x.channel]).sort()).toEqual([
      ["Sadia", "sms"],
      ["Wasim", "sms"],
    ]);
    expect(action.preview.skipped).toEqual([
      expect.objectContaining({ student: "Omar Test", reason: "has not agreed to SMS" }),
    ]);
  });

  it("refuses a channel the school hasn't set up", async () => {
    process.env.SMS_PROVIDER = "off";
    try {
      await expect(propose({ audience: "fee_defaulters", channel: "sms" })).rejects.toMatchObject({
        code: "CHANNEL_UNAVAILABLE",
      });
    } finally {
      process.env.SMS_PROVIDER = "simulated";
    }
  });

  it("sends edited text as plain WhatsApp text and warns about the 24-hour window", async () => {
    const action = await propose({ audience: "students", student_ids: [ids.ali], template: "fee_reminder" });
    const res = await request
      .patch(`/assistant/actions/${action.id}`)
      .set(as("principal"))
      .send({ body: "Dear {{guardian_name}}, please see the office." });
    expect(res.status).toBe(200);
    const [r] = res.body.preview.recipients;
    expect(r).toMatchObject({ channel: "whatsapp", template_name: null, body: "Dear Wasim, please see the office." });
    expect(res.body.preview.notes.join(" ")).toMatch(/24 hours/);
  });
});

describe("Delivery and fallback", () => {
  it("delivers on WhatsApp and SMS (simulated) and records template details", async () => {
    const action = await propose({ audience: "fee_defaulters" });
    expect((await approve(action.id)).status).toBe(200);
    await drain();
    const rows = await deliveries(action.id);
    expect(rows.map((d) => [d.channel, d.status]).sort()).toEqual([
      ["sms", "simulated"],
      ["whatsapp", "simulated"],
      ["whatsapp", "simulated"],
    ]);
    const wasim = byGuardian(rows, ids.aliParent)[0];
    expect(wasim.template_name).toBe("fee_reminder");
    expect(wasim.template_params).toEqual(["Wasim", "Ali Test", expect.any(String), "2020-01-01"]);
    expect((await request.get(`/assistant/actions/${action.id}`).set(as("principal"))).body.status).toBe("executed");
  });

  it("falls back to SMS when the parent is not on WhatsApp", async () => {
    const realSend = whatsappChannel.send;
    whatsappChannel.send = async () => {
      throw Object.assign(new Error("WhatsApp failed: not a WhatsApp user (code 131026)"), { retryable: false });
    };
    try {
      const action = await propose({
        audience: "students",
        student_ids: [ids.ali, ids.omar],
        template: "fee_reminder",
      });
      await approve(action.id);
      await drain();
      const rows = await deliveries(action.id);

      const wasim = byGuardian(rows, ids.aliParent);
      expect(wasim.map((d) => [d.channel, d.status])).toEqual([
        ["whatsapp", "failed"],
        ["sms", "simulated"],
      ]);
      expect(wasim[0].error).toMatch(/trying sms instead/);
      expect(wasim[1].fallback_from).toBe(wasim[0].id);
      expect(wasim[1].body).toMatch(/^the school: Ali Test has/); // the SMS text, not the WhatsApp one

      // Owais only allows WhatsApp: nothing to fall back to.
      const owais = byGuardian(rows, ids.omarParent);
      expect(owais.map((d) => d.status)).toEqual(["failed"]);
      expect(owais[0].error).not.toMatch(/trying/);

      const after = (await request.get(`/assistant/actions/${action.id}`).set(as("principal"))).body;
      expect(after).toMatchObject({ status: "executed", result: { delivered: 1, failed: 2 } });
    } finally {
      whatsappChannel.send = realSend;
    }
  });

  it("never falls back when the approver chose the channel", async () => {
    const realSend = smsChannel.send;
    smsChannel.send = async () => {
      throw Object.assign(new Error("SMS failed (code 21211)"), { retryable: false });
    };
    try {
      const action = await propose({
        audience: "students",
        student_ids: [ids.ali],
        template: "fee_reminder",
        channel: "sms",
      });
      await approve(action.id);
      await drain();
      expect((await deliveries(action.id)).map((d) => [d.channel, d.status])).toEqual([["sms", "failed"]]);
    } finally {
      smsChannel.send = realSend;
    }
  });
});

describe("Twilio webhooks", () => {
  let delivery;

  beforeAll(async () => {
    const action = await propose({ audience: "students", student_ids: [ids.sara], template: "fee_reminder" });
    await approve(action.id);
    await drain();
    [delivery] = await deliveries(action.id);
    await pool.execute(
      "UPDATE message_deliveries SET provider = 'twilio', provider_message_id = 'SMtest', status = 'sent' WHERE id = ?",
      [delivery.id]
    );
  });

  const post = (path, fields, signature) => {
    const sig = signature ?? twilioSignature("twilio-test-token", `https://school.example${path}`, fields);
    return request.post(path).set("X-Twilio-Signature", sig).type("form").send(new URLSearchParams(fields).toString());
  };
  const status = async () =>
    (await pool.execute("SELECT status FROM message_deliveries WHERE id = ?", [delivery.id]))[0][0].status;

  it("rejects wrongly signed callbacks", async () => {
    const res = await post("/webhooks/twilio/status", { MessageSid: "SMtest", MessageStatus: "delivered" }, "forged");
    expect(res.status).toBe(403);
    expect(await status()).toBe("sent");
  });

  it("moves status forward and never backward", async () => {
    const res = await post("/webhooks/twilio/status", { MessageSid: "SMtest", MessageStatus: "delivered" });
    expect(res.status).toBe(204);
    expect(await status()).toBe("delivered");
    await post("/webhooks/twilio/status", { MessageSid: "SMtest", MessageStatus: "sent" }); // late, out of order
    expect(await status()).toBe("delivered");
    const [[event]] = await pool.execute("SELECT * FROM message_events WHERE delivery_id = ? ORDER BY id LIMIT 1", [
      delivery.id,
    ]);
    expect(event).toMatchObject({ provider: "twilio", kind: "status", status: "delivered" });
  });

  it("withdraws and restores SMS consent on STOP / START replies", async () => {
    const consent = async () =>
      (await pool.execute("SELECT consent_sms FROM guardians WHERE id = ?", [ids.saraParent]))[0][0].consent_sms;
    const res = await post("/webhooks/twilio/inbound", { From: "+923001110002", Body: " Stop " });
    expect(res.status).toBe(200);
    expect(res.text).toBe("<Response></Response>");
    expect(await consent()).toBe(0);
    await post("/webhooks/twilio/inbound", { From: "+923001110002", Body: "START" });
    expect(await consent()).toBe(1);
  });

  it("is off until configured", async () => {
    const token = process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_AUTH_TOKEN;
    try {
      expect((await post("/webhooks/twilio/status", { MessageSid: "x" }, "x")).status).toBe(503);
    } finally {
      process.env.TWILIO_AUTH_TOKEN = token;
    }
  });
});

describe("WhatsApp webhooks", () => {
  const send = (payload, secret = "meta-test-secret") => {
    const raw = JSON.stringify(payload);
    const sig = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
    return request
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", sig)
      .set("Content-Type", "application/json")
      .send(raw);
  };
  const wrap = (value) => ({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value }] }],
  });

  it("answers Meta's verification only with the right token", async () => {
    const ok = await request
      .get("/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "verify-me", "hub.challenge": "12345" });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("12345");
    const bad = await request
      .get("/webhooks/whatsapp")
      .query({ "hub.mode": "subscribe", "hub.verify_token": "nope", "hub.challenge": "1" });
    expect(bad.status).toBe(403);
  });

  it("rejects a forged signature", async () => {
    expect((await send(wrap({ statuses: [] }), "wrong-secret")).status).toBe(403);
  });

  it("records read receipts, and falls back to SMS when WhatsApp reports a failure", async () => {
    const action = await propose({ audience: "students", student_ids: [ids.ali, ids.omar], template: "fee_reminder" });
    await approve(action.id);
    await drain();
    const rows = await deliveries(action.id);
    for (const [d, wamid] of [
      [byGuardian(rows, ids.aliParent)[0], "wamid.W"],
      [byGuardian(rows, ids.omarParent)[0], "wamid.O"],
    ]) {
      await pool.execute(
        "UPDATE message_deliveries SET provider = 'meta', provider_message_id = ?, status = 'sent' WHERE id = ?",
        [wamid, d.id]
      );
    }

    const res = await send(
      wrap({
        statuses: [
          { id: "wamid.O", status: "read", recipient_id: "923001110003" },
          { id: "wamid.W", status: "failed", errors: [{ code: 131047, title: "Re-engagement message" }] },
        ],
      })
    );
    expect(res.status).toBe(200);
    await drain();

    const after = await deliveries(action.id);
    expect(byGuardian(after, ids.omarParent).map((d) => d.status)).toEqual(["read"]);
    const w = byGuardian(after, ids.aliParent);
    expect(w.map((d) => [d.channel, d.status])).toEqual([
      ["whatsapp", "failed"],
      ["sms", "simulated"],
    ]);
    expect(w[0].error).toMatch(/Re-engagement message \(code 131047\).*trying sms/);
  });

  it("withdraws WhatsApp consent when a parent replies STOP", async () => {
    await send(wrap({ messages: [{ from: "923001110003", type: "text", text: { body: "STOP" } }] }));
    const [[g]] = await pool.execute("SELECT consent_whatsapp, consent_updated_at FROM guardians WHERE id = ?", [
      ids.omarParent,
    ]);
    expect(g.consent_whatsapp).toBe(0);
    expect(g.consent_updated_at).not.toBeNull();
  });
});
