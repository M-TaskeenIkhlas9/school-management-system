// Family accounts, sibling discounts and concessions. *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.CURRENCY = "USD";
process.env.LOGIN_RATE_LIMIT = "1000";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
const tokens = {};
const ids = {};

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });
const login = async (email, password) => (await request.post("/auth/login").send({ email, password })).body.token;
const feeOf = async (studentId, month) =>
  (await pool.execute("SELECT * FROM fee_ledgers WHERE student_id = ? AND month = ?", [studentId, month]))[0][0];

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  request = supertest(app);

  await pool.execute("DELETE FROM users WHERE email LIKE '%@families.test'");
  for (const table of [
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
  const { ensureDefaultPrincipal } = await import("../src/modules/auth/auth.service.js");
  await ensureDefaultPrincipal();
  tokens.principal = await login("admin@school.com", "admin123");

  [{ insertId: ids.class1 }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Fam 1', '1')");
  const [{ insertId: siddiqui }] = await pool.execute(
    "INSERT INTO guardians (full_name, phone) VALUES ('Mr Siddiqui', '+923001110000')"
  );
  const [{ insertId: other }] = await pool.execute("INSERT INTO guardians (full_name) VALUES ('Mrs Other')");
  ids.siddiqui = siddiqui;
  for (const [key, first, dob, guardian] of [
    ["young", "Zara", "2018-05-01", siddiqui],
    ["eldest", "Adil", "2014-02-01", siddiqui],
    ["middle", "Hiba", "2016-09-01", siddiqui],
    ["scholar", "Omar", "2015-01-01", other],
  ]) {
    [{ insertId: ids[key] }] = await pool.execute(
      "INSERT INTO students (first_name, last_name, date_of_birth) VALUES (?, 'Fam', ?)",
      [first, dob]
    );
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [ids[key], ids.class1]);
    await pool.execute("INSERT INTO student_guardians (student_id, guardian_id, is_primary) VALUES (?, ?, 1)", [
      ids[key],
      guardian,
    ]);
  }

  [{ insertId: ids.teacher }] = await pool.execute("INSERT INTO teachers (first_name, last_name) VALUES ('Fa', 'T')");
  await request.post("/users").set(as("principal")).send({
    username: "Fa",
    email: "fa@families.test",
    password: "password123",
    role: "teacher",
    teacher_id: ids.teacher,
  });
  tokens.teacher = await login("fa@families.test", "password123");
});

afterAll(async () => {
  await request.put("/settings/school").set(as("principal")).send({ sibling_discount: 0 });
  await pool.end();
});

describe("Sibling discount and concessions on the monthly bill", () => {
  it("lets the principal set a sibling discount and give a scholarship", async () => {
    const s = await request.put("/settings/school").set(as("principal")).send({ sibling_discount: 10 });
    expect(s.body.sibling_discount).toBe(10);
    const c = await request
      .post("/fees/concessions")
      .set(as("principal"))
      .send({ student_id: ids.scholar, kind: "scholarship", type: "percent", value: 50, note: "Merit" });
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ label: "Scholarship", value: 50 });
    ids.concession = c.body.id;
  });

  it("bills the eldest in full, younger siblings with the discount, and applies concessions", async () => {
    const res = await request
      .post("/fees/generate")
      .set(as("principal"))
      .send({ month: "2027-01", due_date: "2027-01-10", amount: 3000, classroom_id: ids.class1 });
    expect(res.body).toMatchObject({ created: 4, discounted: 3, discount: 2100, total: 9900 });
    expect(await feeOf(ids.eldest, "2027-01")).toMatchObject({ amount_due: "3000.00", discount: "0.00" });
    expect(await feeOf(ids.middle, "2027-01")).toMatchObject({
      amount_due: "2700.00",
      discount: "300.00",
      discount_note: "Sibling 10%",
    });
    expect(await feeOf(ids.young, "2027-01")).toMatchObject({ amount_due: "2700.00" });
    expect(await feeOf(ids.scholar, "2027-01")).toMatchObject({
      amount_due: "1500.00",
      discount_note: "Scholarship 50%",
    });
  });

  it("stops a concession once it is ended", async () => {
    expect((await request.delete(`/fees/concessions/${ids.concession}`).set(as("principal"))).status).toBe(204);
    await request
      .post("/fees/generate")
      .set(as("principal"))
      .send({ month: "2027-02", due_date: "2027-02-10", amount: 3000, classroom_id: ids.class1 });
    expect(await feeOf(ids.scholar, "2027-02")).toMatchObject({ amount_due: "3000.00", discount: "0.00" });
  });
});

describe("Family account", () => {
  it("finds a family by parent, phone or child name, with what it owes", async () => {
    for (const q of ["Siddiqui", "3001110000", "Hiba"]) {
      const list = (await request.get(`/fees/families?q=${q}`).set(as("principal"))).body;
      expect(list.map((f) => f.id)).toContain(ids.siddiqui);
    }
    const [family] = (await request.get("/fees/families?q=Siddiqui").set(as("principal"))).body;
    expect(family).toMatchObject({ children: 3, outstanding: 16800 });
  });

  it("shows a statement with every child, eldest first, and their unpaid months", async () => {
    const s = (await request.get(`/fees/families/${ids.siddiqui}`).set(as("principal"))).body;
    expect(s.children.map((c) => [c.name, c.unpaid.length])).toEqual([
      ["Adil Fam", 2],
      ["Hiba Fam", 2],
      ["Zara Fam", 2],
    ]);
    expect(s.outstanding).toBe(16800);
  });

  it("takes one family payment and settles the oldest month first, across children", async () => {
    const res = await request
      .post(`/fees/families/${ids.siddiqui}/payments`)
      .set(as("principal"))
      .send({ amount: 9000, method: "bank", paid_on: "2027-01-08" });
    expect(res.status).toBe(201);
    // January for all three (8400), then 600 towards February (the eldest's first).
    expect(res.body.applied.map((a) => [a.child, a.month, a.amount, a.status])).toEqual([
      ["Adil Fam", "2027-01", 3000, "paid"],
      ["Hiba Fam", "2027-01", 2700, "paid"],
      ["Zara Fam", "2027-01", 2700, "paid"],
      ["Adil Fam", "2027-02", 600, "partial"],
    ]);
    expect(res.body.outstanding_after).toBe(7800);
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM fee_payments WHERE note = 'Family payment'");
    expect(Number(n)).toBe(4);
  });

  it("refuses more than the family owes, and keeps families away from teachers", async () => {
    const over = await request
      .post(`/fees/families/${ids.siddiqui}/payments`)
      .set(as("principal"))
      .send({ amount: 99999 });
    expect(over.status).toBe(400);
    expect(over.body.code).toBe("PAYMENT_EXCEEDS_FEE");
    expect((await request.get("/fees/families").set(as("teacher"))).status).toBe(403);
  });
});
