// Everyday school work: class register, monthly fees and payments, correcting results, importing
// students. *_test database only.
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

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  request = supertest(app);

  await pool.execute("DELETE FROM users WHERE email LIKE '%@ops.test'");
  for (const table of [
    "fee_payments",
    "result_subjects",
    "result_cards",
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

  [{ insertId: ids.class5 }] = await pool.execute(
    "INSERT INTO classrooms (name, grade, section) VALUES ('Ops 5', '5', 'A')"
  );
  [{ insertId: ids.class6 }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Ops 6', '6')");
  for (const [key, first, roll, cls] of [
    ["ayesha", "Ayesha", "501", "class5"],
    ["bilal", "Bilal", "502", "class5"],
    ["danish", "Danish", "601", "class6"],
  ]) {
    [{ insertId: ids[key] }] = await pool.execute(
      "INSERT INTO students (first_name, last_name, roll_number) VALUES (?, 'Ops', ?)",
      [first, roll]
    );
    await pool.execute("INSERT INTO enrollments (student_id, classroom_id) VALUES (?, ?)", [ids[key], ids[cls]]);
  }

  [{ insertId: ids.teacher }] = await pool.execute(
    "INSERT INTO teachers (first_name, last_name) VALUES ('Tariq', 'T')"
  );
  await pool.execute("INSERT INTO teacher_classes (teacher_id, classroom_id) VALUES (?, ?)", [ids.teacher, ids.class5]);
  await request.post("/users").set(as("principal")).send({
    username: "Tariq",
    email: "tariq@ops.test",
    password: "password123",
    role: "teacher",
    teacher_id: ids.teacher,
  });
  tokens.teacher = await login("tariq@ops.test", "password123");
});

afterAll(async () => {
  await pool.end();
});

describe("Class register", () => {
  it("lists every student in the class for the day, in roll-number order, unmarked at first", async () => {
    const res = await request.get(`/attendance/register?classroom_id=${ids.class5}&day=2026-10-29`).set(as("teacher"));
    expect(res.status).toBe(200);
    expect(res.body.students.map((s) => [s.student_name, s.status])).toEqual([
      ["Ayesha Ops", null],
      ["Bilal Ops", null],
    ]);
  });

  it("saves the whole register at once, and saving again corrects it", async () => {
    const save = (entries) =>
      request
        .post("/attendance/register")
        .set(as("teacher"))
        .send({ classroom_id: ids.class5, day: "2026-10-29", entries });
    const first = await save([
      { student_id: ids.ayesha, status: "present" },
      { student_id: ids.bilal, status: "absent" },
    ]);
    expect(first.body).toMatchObject({ saved: 2, present: 1, absent: 1 });
    await save([{ student_id: ids.bilal, status: "late" }]);
    const reg = await request.get(`/attendance/register?classroom_id=${ids.class5}&day=2026-10-29`).set(as("teacher"));
    expect(reg.body.students.map((s) => s.status)).toEqual(["present", "late"]);
  });

  it("refuses other classes and students from other classes", async () => {
    expect((await request.get(`/attendance/register?classroom_id=${ids.class6}`).set(as("teacher"))).status).toBe(403);
    const res = await request
      .post("/attendance/register")
      .set(as("principal"))
      .send({ classroom_id: ids.class5, entries: [{ student_id: ids.danish, status: "present" }] });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("STUDENT_NOT_IN_CLASS");
  });
});

describe("Monthly fees and payments", () => {
  it("bills a month to a class and never bills the same student twice for that month", async () => {
    const body = { month: "2026-11", due_date: "2026-11-10", amount: 3000, classroom_id: ids.class5 };
    const first = await request.post("/fees/generate").set(as("principal")).send(body);
    expect(first.status).toBe(201);
    expect(first.body).toMatchObject({ created: 2, skipped: 0, total: 6000 });
    const again = await request
      .post("/fees/generate")
      .set(as("principal"))
      .send({ ...body, classroom_id: undefined });
    expect(again.body).toMatchObject({ created: 1, skipped: 2 }); // only Danish (class 6) is new
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM fee_ledgers WHERE month = '2026-11'");
    expect(Number(n)).toBe(3);
  });

  it("records instalments with receipts, and refuses paying more than is left", async () => {
    const [[fee]] = await pool.execute("SELECT id FROM fee_ledgers WHERE student_id = ? AND month = '2026-11'", [
      ids.ayesha,
    ]);
    ids.fee = fee.id;
    const part = await request
      .post(`/fees/${fee.id}/payments`)
      .set(as("principal"))
      .send({ amount: 1000, method: "cash", paid_on: "2026-11-02" });
    expect(part.status).toBe(201);
    expect(part.body.fee).toMatchObject({ status: "partial", remaining_amount: 2000 });

    const over = await request.post(`/fees/${fee.id}/payments`).set(as("principal")).send({ amount: 2500 });
    expect(over.status).toBe(400);
    expect(over.body.code).toBe("PAYMENT_EXCEEDS_FEE");

    const rest = await request
      .post(`/fees/${fee.id}/payments`)
      .set(as("principal"))
      .send({ amount: 2000, method: "bank" });
    expect(rest.body.fee).toMatchObject({ status: "paid", remaining_amount: 0 });

    const receipts = (await request.get(`/fees/${fee.id}/payments`).set(as("principal"))).body;
    expect(receipts.map((r) => [r.amount, r.method, r.received_by])).toEqual([
      [2000, "bank", "Principal"],
      [1000, "cash", "Principal"],
    ]);
  });

  it("deletes a fee entered by mistake, but not one with payments", async () => {
    expect((await request.delete(`/fees/${ids.fee}`).set(as("principal"))).status).toBe(400);
    const [[unpaid]] = await pool.execute("SELECT id FROM fee_ledgers WHERE student_id = ? AND month = '2026-11'", [
      ids.bilal,
    ]);
    expect((await request.delete(`/fees/${unpaid.id}`).set(as("principal"))).status).toBe(204);
  });

  it("keeps fees away from teachers", async () => {
    const res = await request
      .post("/fees/generate")
      .set(as("teacher"))
      .send({ month: "2026-12", due_date: "2026-12-10", amount: 100 });
    expect(res.status).toBe(403);
  });
});

describe("Correcting results", () => {
  it("edits a result (grade follows) and deletes one entered by mistake", async () => {
    const created = await request.post("/results").set(as("teacher")).send({
      student_id: ids.ayesha,
      classroom_id: ids.class5,
      term: "First Term",
      total_score: 410,
      percentage: 41,
    });
    expect(created.body.grade).not.toBe("A");
    const fixed = await request.put(`/results/${created.body.id}`).set(as("teacher")).send({ percentage: 91 });
    expect(fixed.status).toBe(200);
    expect(fixed.body).toMatchObject({ percentage: "91.00", grade: expect.stringMatching(/^A/) });
    expect((await request.delete(`/results/${created.body.id}`).set(as("teacher"))).status).toBe(204);
  });
});

describe("Importing students", () => {
  it("adds good rows, matches classes by name, and explains rows it can't add", async () => {
    const res = await request
      .post("/students/import")
      .set(as("principal"))
      .send({
        rows: [
          { first_name: "Hira", last_name: "Khan", roll_number: "503", class: "Ops 5", guardian_phone: "0300 1112233" },
          { first_name: "Imran", last_name: "Ali", class: "ops 5 a" },
          { first_name: "Junaid", last_name: "", class: "Ops 5" },
          { first_name: "Kamran", last_name: "Raza", class: "Class 99" },
          { first_name: "Laiba", last_name: "Noor", roll_number: "501" },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ added: 2, failed: 3 });
    expect(res.body.results.filter((r) => !r.ok).map((r) => r.row)).toEqual([4, 5, 6]);
    expect(res.body.results[3].error).toMatch(/No class called "Class 99"/);
    const reg = await request.get(`/attendance/register?classroom_id=${ids.class5}`).set(as("principal"));
    expect(reg.body.students.map((s) => s.student_name)).toEqual(expect.arrayContaining(["Hira Khan", "Imran Ali"]));
  });
});

describe("Subject-wise results (award list, position, report card)", () => {
  const sheet = (
    rows,
    subjects = [
      { name: "English", total: 100 },
      { name: "Maths", total: 100 },
      { name: "Urdu", total: 75 },
    ]
  ) =>
    request
      .post("/results/sheet")
      .set(as("teacher"))
      .send({ classroom_id: ids.class5, term: "Final Term", subjects, rows });

  it("saves a class award list, skipping blank marks and students with none", async () => {
    const res = await sheet([
      { student_id: ids.ayesha, marks: { English: 90, Maths: 85, Urdu: 70 } },
      { student_id: ids.bilal, marks: { English: 40, Maths: "", Urdu: 20 } },
    ]);
    expect(res.status).toBe(200);
    expect(res.body.saved).toBe(2);
    const back = (await request.get(`/results/sheet?classroom_id=${ids.class5}&term=Final Term`).set(as("teacher")))
      .body;
    expect(back.subjects.map((s) => [s.name, s.total])).toEqual([
      ["English", 100],
      ["Maths", 100],
      ["Urdu", 75],
    ]);
    const bilal = back.students.find((s) => s.student_id === ids.bilal);
    expect(bilal.marks).toEqual({ English: 40, Urdu: 20 });
  });

  it("refuses marks above a subject's total", async () => {
    const res = await sheet([{ student_id: ids.ayesha, marks: { Urdu: 80 } }]);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("MARKS_OUT_OF_RANGE");
  });

  it("re-saving replaces a student's marks; positions and BISE grades follow", async () => {
    await sheet([{ student_id: ids.bilal, marks: { English: 60, Maths: 55, Urdu: 50 } }]);
    const list = (await request.get(`/results?classroom_id=${ids.class5}&term=Final Term`).set(as("teacher"))).body
      .items;
    const ayesha = list.find((r) => r.student_id === ids.ayesha);
    const bilal = list.find((r) => r.student_id === ids.bilal);
    // Ayesha 245/275 = 89.1% → A+, 1st; Bilal 165/275 = 60% → B, 2nd
    expect(ayesha).toMatchObject({ grade: "A+", position: 1, out_of: 2 });
    expect(bilal).toMatchObject({ percentage: "60.00", grade: "B", position: 2 });
  });

  it("builds a report card with subject grades, pass/fail, position and attendance", async () => {
    const list = (await request.get(`/results?classroom_id=${ids.class5}&term=Final Term`).set(as("teacher"))).body
      .items;
    const id = list.find((r) => r.student_id === ids.ayesha).id;
    const card = (await request.get(`/results/${id}/report-card`).set(as("teacher"))).body;
    expect(card).toMatchObject({
      term: "Final Term",
      obtained: 245,
      max_marks: 275,
      grade: "A+",
      passed: true,
      position: 1,
      out_of: 2,
      student: { name: "Ayesha Ops", roll_number: "501" },
    });
    expect(card.subjects.map((s) => [s.subject, s.obtained, s.total, s.grade])).toEqual([
      ["English", 90, 100, "A+"],
      ["Maths", 85, 100, "A+"],
      ["Urdu", 70, 75, "A+"],
    ]);
    expect(card.attendance_rate).toEqual(expect.any(Number));
  });

  it("fails a student who is below 33% in any subject", async () => {
    await sheet([{ student_id: ids.bilal, marks: { English: 90, Maths: 20, Urdu: 70 } }]);
    const list = (await request.get(`/results?classroom_id=${ids.class5}&term=Final Term`).set(as("teacher"))).body
      .items;
    const card = (
      await request.get(`/results/${list.find((r) => r.student_id === ids.bilal).id}/report-card`).set(as("teacher"))
    ).body;
    expect(card.passed).toBe(false);
    expect(card.subjects.find((s) => s.subject === "Maths")).toMatchObject({ grade: "F", passed: false });
  });
});

describe("Fee challans", () => {
  it("lists a month's unpaid fees with father's name, class and roll number, or one fee", async () => {
    await request
      .post("/fees/generate")
      .set(as("principal"))
      .send({ month: "2026-12", due_date: "2026-12-10", amount: 2500, classroom_id: ids.class5 });
    const res = await request.get(`/fees/challans?month=2026-12&classroom_id=${ids.class5}`).set(as("principal"));
    expect(res.status).toBe(200);
    expect(res.body.map((c) => [c.student_name, c.roll_number, c.payable])).toEqual(
      expect.arrayContaining([["Ayesha Ops", "501", 2500]])
    );
    expect(res.body[0]).toHaveProperty("guardian_name");
    const one = await request.get(`/fees/challans?fee_id=${res.body[0].id}`).set(as("principal"));
    expect(one.body).toHaveLength(1);
    expect((await request.get("/fees/challans").set(as("principal"))).status).toBe(400);
  });
});

describe("School details set by the principal", () => {
  it("saves details on Settings and shows them to staff straight away", async () => {
    const before = (await request.get("/settings/school").set(as("principal"))).body;
    expect(before.bank_details).toMatch(/SAMPLE/); // sample until the principal replaces it

    const res = await request.put("/settings/school").set(as("principal")).send({
      address: "12 Canal Road, Lahore",
      phone: "042 1234567",
      bank_details: "HBL · Ops School · 1234-5678",
      late_fine: 300,
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ address: "12 Canal Road, Lahore", late_fine: 300 });

    const me = (await request.get("/auth/me").set(as("teacher"))).body;
    expect(me.school).toMatchObject({ bank_details: "HBL · Ops School · 1234-5678", phone: "042 1234567" });

    // Clearing a value falls back to the server setting.
    const cleared = await request.put("/settings/school").set(as("principal")).send({ address: "" });
    expect(cleared.body.address).toBe(process.env.SCHOOL_ADDRESS || "");
  });

  it("only lets people who manage the school change them", async () => {
    const res = await request.put("/settings/school").set(as("teacher")).send({ name: "Hacked" });
    expect(res.status).toBe(403);
  });
});
