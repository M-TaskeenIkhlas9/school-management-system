// Step 6: the assistant on WhatsApp for staff — linking a number, asking, approving. *_test database only.
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
process.env.WHATSAPP_BOT_NUMBER = "+92 300 0000000";
delete process.env.WHATSAPP_REDIRECT_TO;

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

import { createHmac } from "node:crypto";

let request;
let pool;
let processDueJobs;
let setModel;
let createFakeModel;
let whatsappChannel;
let toWhatsApp;
let chunks;
let parseCommand;
const tokens = {};
const ids = {};
const sent = []; // every message the bot sent: { to, body, buttons, templateName, templateParams }
let wamid = 0;

const PRINCIPAL_PHONE = "+923001112222";
const ADMIN_PHONE = "+923008880000";
const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

/** A signed WhatsApp webhook carrying one message from `phone`. */
function fromPhone(phone, message) {
  const m = { from: phone.replace(/^\+/, ""), id: `wamid.bot${++wamid}`, ...message };
  const raw = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ changes: [{ field: "messages", value: { messages: [m] } }] }],
  });
  const sig = `sha256=${createHmac("sha256", "meta-test-secret").update(raw).digest("hex")}`;
  return request
    .post("/webhooks/whatsapp")
    .set("X-Hub-Signature-256", sig)
    .set("Content-Type", "application/json")
    .send(raw);
}
const say = (phone, text) => fromPhone(phone, { type: "text", text: { body: text } });
const tap = (phone, id) =>
  fromPhone(phone, { type: "interactive", interactive: { type: "button_reply", button_reply: { id, title: "x" } } });

async function drain() {
  for (let i = 0; i < 5 && (await processDueJobs()) > 0; i++);
}
const sentTo = (phone) => sent.filter((s) => s.to === phone);
const lastTo = (phone) => sentTo(phone).at(-1);

async function link(role, phone) {
  const code = (await request.post("/account/whatsapp/code").set(as(role))).body;
  await say(phone, code.message);
  return code;
}

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  ({ processDueJobs } = await import("../src/jobs/queue.js"));
  await import("../src/jobs/handlers.js");
  ({ setModel } = await import("../src/agent/llm/index.js"));
  ({ createFakeModel } = await import("../src/agent/llm/fakeModel.js"));
  whatsappChannel = (await import("../src/messaging/channels/whatsapp.js")).default;
  ({ toWhatsApp, chunks } = await import("../src/modules/whatsapp-bot/format.js"));
  ({ parseCommand } = await import("../src/modules/whatsapp-bot/bot.service.js"));
  request = supertest(app);

  whatsappChannel.send = async (msg) => {
    sent.push(msg);
    return { status: "simulated", provider: "simulated", providerMessageId: null, deliveredTo: msg.to };
  };

  for (const table of [
    "staff_whatsapp_messages",
    "whatsapp_link_codes",
    "message_events",
    "jobs",
    "agent_conversations",
    "agent_actions",
    "student_guardians",
    "guardians",
    "fee_ledgers",
    "enrollments",
    "students",
  ]) {
    await pool.execute(`DELETE FROM ${table}`);
  }
  await pool.execute("DELETE FROM users WHERE email LIKE '%@bot.test'");
  await pool.execute("UPDATE users SET whatsapp_phone = NULL, whatsapp_sv = NULL");
  const { ensureDefaultPrincipal } = await import("../src/modules/auth/auth.service.js");
  await ensureDefaultPrincipal();
  tokens.principal = (
    await request.post("/auth/login").send({ email: "admin@school.com", password: "admin123" })
  ).body.token;
  for (const [role, name] of [
    ["accountant", "Asma"],
    ["admin", "Adil"],
  ]) {
    const res = await request
      .post("/users")
      .set(as("principal"))
      .send({ username: name, email: `${role}@bot.test`, password: "password123", role });
    ids[role] = res.body.id;
    tokens[role] = (
      await request.post("/auth/login").send({ email: `${role}@bot.test`, password: "password123" })
    ).body.token;
  }
  [{ insertId: ids.student }] = await pool.execute(
    "INSERT INTO students (first_name, last_name) VALUES ('Bilal', 'Bot')"
  );
  await pool.execute(
    "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, '2020-01-01', 300, 0, 'pending')",
    [ids.student]
  );
});

afterAll(async () => {
  await pool.execute("UPDATE users SET whatsapp_phone = NULL, whatsapp_sv = NULL");
  await pool.execute("DELETE FROM users WHERE email LIKE '%@bot.test'");
  await pool.end();
});

describe("WhatsApp formatting", () => {
  it("turns the assistant's markdown into WhatsApp text", () => {
    const md =
      "## Overdue fees\n\n| Student | Owed |\n|---|---:|\n| **Ali** | USD 200 |\n| Sara | USD 50 |\n\n* see [Fees](https://x.test)";
    expect(toWhatsApp(md)).toBe(
      "*Overdue fees*\n\n*Student · Owed*\n*Ali* · USD 200\nSara · USD 50\n\n- see Fees (https://x.test)"
    );
  });

  it("splits long replies at line breaks", () => {
    const parts = chunks(["a".repeat(30), "b".repeat(30), "c".repeat(30)].join("\n"), 65);
    expect(parts).toEqual([`${"a".repeat(30)}\n${"b".repeat(30)}`, "c".repeat(30)]);
    expect(chunks("x".repeat(25), 10)).toEqual(["x".repeat(10), "x".repeat(10), "x".repeat(5)]);
  });

  it("reads commands and button taps", () => {
    expect(parseCommand("approve:12")).toEqual({ name: "approve", id: 12 });
    expect(parseCommand("Cancel #7")).toEqual({ name: "reject", id: 7 });
    expect(parseCommand("PENDING")).toEqual({ name: "pending" });
    expect(parseCommand("approve the fee reminder")).toBeNull();
    expect(parseCommand("yes")).toBeNull(); // an answer to the assistant, not an approval
  });
});

describe("linking a number", () => {
  it("links the phone that sends the one-time code", async () => {
    expect((await request.get("/account/whatsapp").set(as("principal"))).body).toMatchObject({
      linked: false,
      available: true,
      bot_number: "+923000000000",
    });
    const code = await link("principal", PRINCIPAL_PHONE);
    expect(code.code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(code.url).toBe(`https://wa.me/923000000000?text=${encodeURIComponent(code.message)}`);
    expect(lastTo(PRINCIPAL_PHONE).body).toMatch(/^Linked to Principal \(principal\)/);
    expect((await request.get("/account/whatsapp").set(as("principal"))).body).toMatchObject({
      linked: true,
      phone: PRINCIPAL_PHONE,
    });
    // The code works once.
    await say("+923009990000", code.message);
    expect(lastTo("+923009990000").body).toMatch(/wrong or has expired/);
    const [[row]] = await pool.execute(
      "SELECT body FROM staff_whatsapp_messages WHERE phone = ? AND direction = 'in'",
      [PRINCIPAL_PHONE]
    );
    expect(row.body).toBe("LINK ********"); // the code itself is not kept
  });

  it("stops answering a phone after five wrong codes in an hour", async () => {
    const phone = "+923007770000";
    for (let i = 0; i < 5; i++) await say(phone, "LINK AAAA-AAAA");
    expect(sentTo(phone)).toHaveLength(5);
    await say(phone, "LINK BBBB-BBBB");
    expect(sentTo(phone)).toHaveLength(5);
  });

  it("leaves other numbers to the parents' handling", async () => {
    await say("+923005556666", "STOP");
    const [[event]] = await pool.execute("SELECT kind FROM message_events WHERE from_address = '+923005556666'");
    expect(event.kind).toBe("inbound");
    expect(sentTo("+923005556666")).toHaveLength(0);
  });
});

describe("asking and approving on WhatsApp", () => {
  it("answers with the assistant, and sends what it prepared with Approve / Cancel buttons", async () => {
    const model = createFakeModel([
      { toolCalls: [{ name: "prepare_fee_payment", arguments: { student_id: ids.student, amount: 300 } }] },
      { content: "I prepared the **USD 300** payment for Bilal Bot.\n\n| Fee | Left |\n|---|---|\n| Jan | USD 300 |" },
    ]);
    setModel(model);
    await say(PRINCIPAL_PHONE, "Bilal paid 300 in cash, record it");
    await drain();

    expect(model.calls[0].messages[0].content).toMatch(/chatting on WhatsApp/);
    const toolResult = JSON.parse(model.calls[1].messages.at(-1).content);
    expect(toolResult.data.approval).toMatch(/Approve button/);

    const [answer, card] = sentTo(PRINCIPAL_PHONE).slice(-2);
    expect(answer.body).toBe("I prepared the *USD 300* payment for Bilal Bot.\n\n*Fee · Left*\nJan · USD 300");
    const [[action]] = await pool.execute("SELECT id, conversation_id FROM agent_actions ORDER BY id DESC LIMIT 1");
    expect(card.body).toMatch(new RegExp(`Waiting for approval #${action.id}`));
    expect(card.buttons).toEqual([
      { id: `approve:${action.id}`, title: "Approve" },
      { id: `reject:${action.id}`, title: "Cancel" },
    ]);
    ids.action = action.id;
    const [[conversation]] = await pool.execute("SELECT channel FROM agent_conversations WHERE id = ?", [
      action.conversation_id,
    ]);
    expect(conversation.channel).toBe("whatsapp");
  });

  it("approves when the button is tapped, once", async () => {
    await tap(PRINCIPAL_PHONE, `approve:${ids.action}`);
    await drain();
    expect(lastTo(PRINCIPAL_PHONE).body).toMatch(new RegExp(`^Approved #${ids.action}`));
    const [[fee]] = await pool.execute("SELECT status FROM fee_ledgers WHERE student_id = ?", [ids.student]);
    expect(fee.status).toBe("paid");

    await tap(PRINCIPAL_PHONE, `approve:${ids.action}`);
    await drain();
    expect(lastTo(PRINCIPAL_PHONE).body).toMatch(/already executed/);
  });

  it("handles a message Meta delivers twice only once", async () => {
    setModel(createFakeModel([{ content: "Hello!" }]));
    const before = sentTo(PRINCIPAL_PHONE).length;
    await fromPhone(PRINCIPAL_PHONE, { id: "wamid.same", type: "text", text: { body: "hi" } });
    await fromPhone(PRINCIPAL_PHONE, { id: "wamid.same", type: "text", text: { body: "hi" } });
    await drain();
    expect(sentTo(PRINCIPAL_PHONE).length).toBe(before + 1);
  });

  it("knows HELP, PENDING and non-text messages without asking the model", async () => {
    const model = createFakeModel([{ content: "should not be called" }]);
    setModel(model);
    await say(PRINCIPAL_PHONE, "help");
    await drain();
    await say(PRINCIPAL_PHONE, "pending");
    await drain();
    await fromPhone(PRINCIPAL_PHONE, { type: "image", image: { id: "img1" } });
    await drain();
    const [help, pending, image] = sentTo(PRINCIPAL_PHONE).slice(-3);
    expect(help.body).toMatch(/School assistant on WhatsApp/);
    expect(pending.body).toBe("Nothing is waiting for your approval.");
    expect(image.body).toMatch(/only read text/);
    expect(model.calls).toHaveLength(0);
  });

  it("tells a linked approver when someone who can't approve it prepares something", async () => {
    await pool.execute(
      "INSERT INTO fee_ledgers (student_id, due_date, amount_due, amount_paid, status) VALUES (?, '2020-02-01', 100, 0, 'pending')",
      [ids.student]
    );
    await link("admin", ADMIN_PHONE);
    const actions = await import("../src/agent/actions/actions.service.js");
    const userFor = async (role) => {
      const me = (await request.get("/auth/me").set(as(role))).body;
      return { ...me.user, permissions: new Set(me.permissions), classIds: me.classIds };
    };
    // The accountant can approve their own payments, so nobody else is bothered.
    const own = await actions.propose(
      "record_fee_payment",
      { student_id: ids.student, amount: 10 },
      { req: { user: await userFor("accountant") } }
    );
    await drain();
    expect(sent.some((s) => s.body.includes(`#${own.id}`))).toBe(false);
    await pool.execute("UPDATE agent_actions SET status = 'rejected' WHERE id = ?", [own.id]);

    // An admin has no fee permissions: the principal must approve.
    const admin = await userFor("admin");
    const propose = (amount) =>
      actions.propose("record_fee_payment", { student_id: ids.student, amount }, { req: { user: admin } });

    const action = await propose(100);
    await drain();
    const notice = lastTo(PRINCIPAL_PHONE);
    expect(notice.body).toMatch(new RegExp(`Adil prepared this – #${action.id}`));
    expect(notice.buttons[0]).toEqual({ id: `approve:${action.id}`, title: "Approve" });
    // The admin who prepared it isn't told about it.
    expect(sentTo(ADMIN_PHONE).some((s) => s.body.includes(`#${action.id}`))).toBe(false);

    // Outside WhatsApp's 24-hour window only an approved template can be sent.
    await pool.execute("UPDATE staff_whatsapp_messages SET created_at = NOW() - INTERVAL 2 DAY WHERE phone = ?", [
      PRINCIPAL_PHONE,
    ]);
    await pool.execute("UPDATE agent_actions SET status = 'rejected' WHERE id = ?", [action.id]);
    const again = await propose(50);
    await drain();
    expect(lastTo(PRINCIPAL_PHONE)).toMatchObject({
      templateName: "approval_request",
      templateParams: ["Adil", again.summary, String(again.id)],
    });
    ids.pending = again.id;
  });

  it("won't let a role approve what it can't", async () => {
    await say(ADMIN_PHONE, `approve ${ids.pending}`);
    await drain();
    expect(lastTo(ADMIN_PHONE).body).toBe("You don't have permission to approve this");
    await say(PRINCIPAL_PHONE, `cancel ${ids.pending}`);
    await drain();
    expect(lastTo(PRINCIPAL_PHONE).body).toMatch(new RegExp(`^Cancelled #${ids.pending}`));
    const [[row]] = await pool.execute("SELECT status FROM agent_actions WHERE id = ?", [ids.pending]);
    expect(row.status).toBe("rejected");
  });

  it("forgets the number when the account's sessions are revoked, or on UNLINK", async () => {
    const res = await request
      .post("/auth/password")
      .set(as("admin"))
      .send({ current_password: "password123", new_password: "password456" });
    tokens.admin = res.body.token;
    const before = sentTo(ADMIN_PHONE).length;
    await say(ADMIN_PHONE, "who is absent today?");
    await drain();
    expect(sentTo(ADMIN_PHONE)).toHaveLength(before); // now just an unknown number
    expect((await request.get("/account/whatsapp").set(as("admin"))).body.linked).toBe(false);

    await say(PRINCIPAL_PHONE, "unlink");
    await drain();
    expect(lastTo(PRINCIPAL_PHONE).body).toMatch(/no longer linked/);
    expect((await request.get("/account/whatsapp").set(as("principal"))).body.linked).toBe(false);
  });
});
