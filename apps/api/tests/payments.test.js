// Online fee payments: payment references, 1Bill, Raast notices, statement import and matching.
// *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.CURRENCY = "USD";
process.env.LOGIN_RATE_LIMIT = "1000";
process.env.ONEBILL_USERNAME = "onelink";
process.env.ONEBILL_PASSWORD = "secret-pass";
process.env.RAAST_WEBHOOK_SECRET = "raast-secret";

import { createHmac } from "node:crypto";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
let ref; // reference.js
const tokens = {};
const ids = {};

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
const login = async (email, password) => (await request.post("/auth/login").send({ email, password })).body.token;
const onebill = (path, body) =>
  request.post(`/billing/1bill/${path}`).set({ username: "onelink", password: "secret-pass" }).send(body);
const raast = (payload, secret = "raast-secret") => {
  const raw = JSON.stringify(payload);
  return request
    .post("/webhooks/raast")
    .set("Content-Type", "application/json")
    .set("X-Signature", `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`)
    .send(raw);
};
const fee = async (id) => (await pool.execute("SELECT * FROM fee_ledgers WHERE id = ?", [id]))[0][0];
const paymentsOf = async (id) => (await pool.execute("SELECT * FROM fee_payments WHERE fee_id = ?", [id]))[0];
const addFee = async (student, amount, due, month = "2026-10") =>
  (
    await pool.execute(
      "INSERT INTO fee_ledgers (student_id, month, due_date, amount_due, amount_paid, status) VALUES (?, ?, ?, ?, 0, 'pending')",
      [student, month, due, amount]
    )
  )[0].insertId;

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  ref = await import("../src/modules/payments/reference.js");
  request = supertest(app);

  await pool.execute("DELETE FROM users WHERE email LIKE '%@payments.test'");
  for (const table of [
    "incoming_payments",
    "fee_payments",
    "fee_concessions",
    "student_guardians",
    "guardians",
    "teacher_classes",
    "fee_ledgers",
    "enrollments",
    "students",
    "teachers",
    "classrooms",
  ]) {
    await pool.execute(`DELETE FROM ${table}`);
  }
  await pool.execute(
    "UPDATE school_settings SET late_fine = 200, onebill_prefix = '12345', raast_id = 'PK36MEZN0001234567890123' WHERE id = 1"
  );
  const { refreshSchool } = await import("../src/modules/settings/school.js");
  await refreshSchool();
  const { ensureDefaultPrincipal } = await import("../src/modules/auth/auth.service.js");
  await ensureDefaultPrincipal();
  tokens.principal = await login("admin@school.com", "admin123");

  [{ insertId: ids.class1 }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Pay 1', '1')");
  const [{ insertId: guardian }] = await pool.execute(
    "INSERT INTO guardians (full_name, phone) VALUES ('Imran Qureshi', '+923001112222')"
  );
  for (const [key, first, active] of [
    ["ali", "Ali", 1],
    ["sara", "Sara", 1],
    ["left", "Gone", 0],
  ]) {
    [{ insertId: ids[key] }] = await pool.execute(
      "INSERT INTO students (first_name, last_name, is_active) VALUES (?, 'Qureshi', ?)",
      [first, active]
    );
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [ids[key], ids.class1]);
    await pool.execute("INSERT INTO student_guardians (student_id, guardian_id, is_primary) VALUES (?, ?, 1)", [
      ids[key],
      guardian,
    ]);
  }

  [{ insertId: ids.teacher }] = await pool.execute("INSERT INTO teachers (first_name, last_name) VALUES ('Pa', 'T')");
  await request.post("/users").set(as("principal")).send({
    username: "Pa",
    email: "pa@payments.test",
    password: "password123",
    role: "teacher",
    teacher_id: ids.teacher,
  });
  tokens.teacher = await login("pa@payments.test", "password123");
});

afterAll(async () => {
  await pool.execute("UPDATE school_settings SET onebill_prefix = NULL, raast_id = NULL WHERE id = 1");
  await pool.end();
});

describe("Payment reference", () => {
  it("round-trips a fee number with the 1Bill prefix and catches typos", () => {
    const r = ref.feeReference(42, "12345");
    expect(r).toMatch(/^1234500000042\d$/);
    expect(ref.feeIdFromReference(r, "12345")).toBe(42);
    expect(ref.feeIdFromReference(r.slice(5), "12345")).toBe(42); // parent left the prefix out
    const typo = r.slice(0, 11) + ((Number(r[11]) + 1) % 10) + r.slice(12);
    expect(ref.feeIdFromReference(typo, "12345")).toBeNull();
    expect(ref.feeIdFromReference("abc", "12345")).toBeNull();
  });

  it("finds a reference written in a transfer's remarks", () => {
    const r = ref.feeReference(42, "");
    const spaced = `${r.slice(0, 4)} ${r.slice(4, 8)}-${r.slice(8)}`;
    expect(ref.findFeeId(`School fee Ali ${spaced} Oct`, "")).toBe(42);
    expect(ref.findFeeId("Paid by 03001234567 for October", "")).toBeNull();
  });

  it("is printed on challans", async () => {
    const id = await addFee(ids.ali, 1000, "2099-12-10", "2026-01");
    const res = await request.get(`/fees/challans?fee_id=${id}`).set(as("principal"));
    expect(res.body[0].reference).toBe(ref.feeReference(id));
    expect(res.body[0].reference.startsWith("12345")).toBe(true);
    await pool.execute("DELETE FROM fee_ledgers WHERE id = ?", [id]);
  });
});

describe("1Bill", () => {
  it("refuses calls without 1LINK's credentials", async () => {
    const res = await request.post("/billing/1bill/BillInquiry").send({ consumer_number: "1" });
    expect(res.status).toBe(401);
    const wrong = await request
      .post("/billing/1bill/BillInquiry")
      .set({ username: "onelink", password: "nope" })
      .send({ consumer_number: "1" });
    expect(wrong.status).toBe(401);
  });

  it("shows the bill for a consumer number", async () => {
    ids.feeA = await addFee(ids.ali, 2500, "2099-12-10");
    const res = await onebill("BillInquiry", { consumer_number: ref.feeReference(ids.feeA), bank_mnemonic: "MEZN" });
    expect(res.body).toMatchObject({
      response_Code: "00",
      bill_status: "U",
      due_date: "20991210",
      amount_within_dueDate: "+0000000250000",
      amount_after_dueDate: "+0000000270000",
      billing_month: "2610",
    });
    expect(res.body.consumer_Detail.trim()).toBe("Ali Qureshi");
    expect((await onebill("BillInquiry", { consumer_number: "1234500000000" })).body.response_Code).toBe("01");
  });

  it("records a payment once, even when the bank sends it again", async () => {
    const consumer = ref.feeReference(ids.feeA);
    const wrong = await onebill("BillPayment", {
      consumer_number: consumer,
      tran_auth_id: "T100",
      transaction_amount: "+0000000100000",
    });
    expect(wrong.body.response_Code).toBe("04"); // a voucher is paid in full
    const pay = {
      consumer_number: consumer,
      tran_auth_id: "T101",
      transaction_amount: "+0000000250000",
      tran_date: "20261030",
      bank_mnemonic: "HBL",
    };
    expect((await onebill("BillPayment", pay)).body.response_Code).toBe("00");
    expect((await onebill("BillPayment", pay)).body.response_Code).toBe("00"); // retry
    expect(await fee(ids.feeA)).toMatchObject({ status: "paid", amount_paid: "2500.00" });
    const rows = await paymentsOf(ids.feeA);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ method: "1bill", reference: "T101", late_fine: "0.00" });

    const inquiry = await onebill("BillInquiry", { consumer_number: consumer });
    expect(inquiry.body).toMatchObject({ bill_status: "P", tran_auth_Id: "T101", amount_paid: "+0000000250000" });
    const again = await onebill("BillPayment", { ...pay, tran_auth_id: "T102" });
    expect(again.body.response_Code).toBe("03"); // already paid
  });

  it("takes the late fine after the due date and keeps it apart from the fee", async () => {
    const id = await addFee(ids.sara, 3000, "2026-01-10");
    const res = await onebill("BillPayment", {
      consumer_number: ref.feeReference(id),
      tran_auth_id: "T200",
      transaction_amount: "+0000000320000",
      tran_date: "20261030",
    });
    expect(res.body.response_Code).toBe("00");
    expect(await fee(id)).toMatchObject({ status: "paid", amount_paid: "3000.00" });
    expect((await paymentsOf(id))[0]).toMatchObject({ amount: "3000.00", late_fine: "200.00" });
  });

  it("blocks a student who has left", async () => {
    const id = await addFee(ids.left, 1000, "2099-12-10");
    const res = await onebill("BillInquiry", { consumer_number: ref.feeReference(id) });
    expect(res.body).toMatchObject({ response_Code: "02", bill_status: "B" });
  });
});

describe("Raast notices", () => {
  it("needs the bank's signature", async () => {
    const res = await raast({ transaction_id: "R0", amount: 10, date: "2026-10-30" }, "wrong");
    expect(res.status).toBe(403);
  });

  it("matches a transfer by the reference the parent wrote, once", async () => {
    ids.feeR = await addFee(ids.sara, 4000, "2099-12-10");
    const notice = {
      transaction_id: "RAAST-1",
      amount: 1500,
      date: "2026-10-29",
      purpose: `fee ${ref.feeReference(ids.feeR, "")}`,
      payer_name: "IMRAN QURESHI",
    };
    const res = await raast(notice);
    expect(res.body.received[0]).toEqual({ transaction_id: "RAAST-1", status: "matched", duplicate: false });
    expect((await raast(notice)).body.received[0].duplicate).toBe(true);
    expect(await fee(ids.feeR)).toMatchObject({ status: "partial", amount_paid: "1500.00" });
    expect(await paymentsOf(ids.feeR)).toHaveLength(1);
  });

  it("keeps transfers it can't match for the accountant, and rejects a bad batch whole", async () => {
    const res = await raast([
      { transaction_id: "RAAST-2", amount: 2500, date: "2026-10-29", purpose: "school fee", payer_name: "Imran Q" },
      { transaction_id: "RAAST-3", amount: 99999, date: "2026-10-29", purpose: ref.feeReference(ids.feeR, "") },
    ]);
    expect(res.body.received.map((r) => r.status)).toEqual(["unmatched", "unmatched"]);
    const [[tooMuch]] = await pool.execute("SELECT * FROM incoming_payments WHERE transaction_id = 'RAAST-3'");
    expect(tooMuch.note).toMatch(/Only 2500 is left/);

    const bad = await raast([
      { transaction_id: "RAAST-4", amount: 10, date: "2026-10-29" },
      { amount: 10, date: "2026-10-29" },
    ]);
    expect(bad.status).toBe(400);
    const [found] = await pool.execute("SELECT id FROM incoming_payments WHERE transaction_id = 'RAAST-4'");
    expect(found).toHaveLength(0);
  });
});

describe("Matching and statement import", () => {
  it("lists what is waiting and suggests fees with the same amount first", async () => {
    const list = await request.get("/fees/online?status=unmatched").set(as("principal"));
    expect(list.body.items.map((i) => i.transaction_id).sort()).toEqual(["RAAST-2", "RAAST-3"]);
    const summary = await request.get("/fees/online/summary").set(as("principal"));
    expect(summary.body.unmatched).toBe(2);
    ids.waiting = list.body.items.find((i) => i.transaction_id === "RAAST-2").id;
    ids.feeB = await addFee(ids.ali, 2500, "2099-11-10", "2026-11");
    const candidates = await request.get(`/fees/online/${ids.waiting}/candidates`).set(as("principal"));
    expect(candidates.body[0]).toMatchObject({ id: ids.feeB, remaining: 2500 });
  });

  it("takes the payer's name from the description when the bank gives none", async () => {
    const { nameWords } = await import("../src/modules/payments/payments.service.js");
    expect(nameWords("RAAST P2P IQBAL HUSSAIN school fee")).toEqual(["iqbal", "hussain"]);
    expect(nameWords(null)).toEqual([]);
  });

  it("matches a waiting payment to a fee, once", async () => {
    const res = await request.post(`/fees/online/${ids.waiting}/match`).set(as("principal")).send({ fee_id: ids.feeB });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: "matched", fee_id: ids.feeB });
    expect(await fee(ids.feeB)).toMatchObject({ status: "paid" });
    const again = await request
      .post(`/fees/online/${ids.waiting}/match`)
      .set(as("principal"))
      .send({ fee_id: ids.feeB });
    expect(again.status).toBe(409);
  });

  it("sets aside a payment that isn't a fee", async () => {
    const [[row]] = await pool.execute("SELECT id FROM incoming_payments WHERE transaction_id = 'RAAST-3'");
    const res = await request
      .post(`/fees/online/${row.id}/ignore`)
      .set(as("principal"))
      .send({ note: "Donation for the library" });
    expect(res.body).toMatchObject({ status: "ignored", note: "Donation for the library" });
  });

  it("imports a bank statement, safely twice", async () => {
    const left = Number((await fee(ids.feeR)).amount_due) - Number((await fee(ids.feeR)).amount_paid);
    const rows = [
      { amount: left, paid_on: "2026-10-30", reference: `IBFT ${ref.feeReference(ids.feeR)}`, payer: "IMRAN" },
      { amount: 700, paid_on: "2026-10-30", reference: "fee", payer: "SOMEONE" },
    ];
    const first = await request.post("/fees/online/import").set(as("principal")).send({ channel: "bank", rows });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ matched: 1, unmatched: 1, duplicates: 0 });
    expect(await fee(ids.feeR)).toMatchObject({ status: "paid" });
    const second = await request.post("/fees/online/import").set(as("principal")).send({ channel: "bank", rows });
    expect(second.body).toEqual({ matched: 0, unmatched: 0, duplicates: 2 });
  });

  it("is not open to teachers", async () => {
    expect((await request.get("/fees/online").set(as("teacher"))).status).toBe(403);
    const res = await request
      .post("/fees/online/import")
      .set(as("teacher"))
      .send({ rows: [{ amount: 1, paid_on: "2026-10-30" }] });
    expect(res.status).toBe(403);
  });
});
