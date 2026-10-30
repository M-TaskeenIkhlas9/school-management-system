// Admission records: GR numbers, the admission form, leaving certificates, year-end promotion.
// *_test database only.
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
const admit = (body) => request.post("/students").set(as("principal")).send(body);

async function addResult(studentId, classroomId, percentage, subjects = []) {
  const [{ insertId }] = await pool.execute(
    "INSERT INTO result_cards (student_id, classroom_id, term, total_score, percentage) VALUES (?, ?, 'Annual', ?, ?)",
    [studentId, classroomId, percentage, percentage]
  );
  for (const [subject, obtained] of subjects) {
    await pool.execute("INSERT INTO result_subjects (result_id, subject, obtained, total) VALUES (?, ?, ?, 100)", [
      insertId,
      subject,
      obtained,
    ]);
  }
}

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  request = supertest(app);

  await pool.execute("DELETE FROM users WHERE email LIKE '%@admissions.test'");
  for (const table of [
    "fee_payments",
    "fee_concessions",
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

  [{ insertId: ids.class4 }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Class 4', '4')");
  [{ insertId: ids.class5 }] = await pool.execute(
    "INSERT INTO classrooms (name, grade, section) VALUES ('Class 5', '5', 'A')"
  );

  [{ insertId: ids.teacher }] = await pool.execute("INSERT INTO teachers (first_name, last_name) VALUES ('Ad', 'T')");
  await pool.execute("INSERT INTO teacher_classes (teacher_id, classroom_id) VALUES (?, ?)", [ids.teacher, ids.class4]);
  await request.post("/users").set(as("principal")).send({
    username: "Ad",
    email: "ad@admissions.test",
    password: "password123",
    role: "teacher",
    teacher_id: ids.teacher,
  });
  tokens.teacher = await login("ad@admissions.test", "password123");
});

afterAll(async () => {
  await pool.end();
});

describe("Admission form and GR numbers", () => {
  it("gives each new student the next GR number and records the admission", async () => {
    const res = await admit({
      first_name: "Ayesha",
      last_name: "Khan",
      classroom_id: ids.class4,
      father_name: "Imran Khan",
      father_cnic: "3520212345671",
      b_form: "35202 7654321 2",
      gender: "female",
      address: "House 4, Street 9, Lahore",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      gr_number: "1",
      admission_class: "Class 4",
      father_cnic: "35202-1234567-1",
      b_form: "35202-7654321-2",
      gender: "female",
    });
    expect(res.body.admission_date).toBeTruthy();
    ids.ayesha = res.body.id;

    const next = await admit({ first_name: "Bilal", last_name: "Ahmed", classroom_id: ids.class4 });
    expect(next.body.gr_number).toBe("2");
    ids.bilal = next.body.id;
  });

  it("keeps a GR number given by hand, and refuses one already used", async () => {
    const own = await admit({ first_name: "Old", last_name: "Record", gr_number: "150", classroom_id: ids.class4 });
    expect(own.body.gr_number).toBe("150");
    ids.old = own.body.id;
    const after = await admit({ first_name: "After", last_name: "It", classroom_id: ids.class4 });
    expect(after.body.gr_number).toBe("151");
    ids.after = after.body.id;
    const dup = await admit({ first_name: "Dup", last_name: "Gr", gr_number: "150" });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_GR");
  });

  it("keeps the GR number when a student is edited with the field left empty", async () => {
    const res = await request
      .put(`/students/${ids.bilal}`)
      .set(as("principal"))
      .send({ gr_number: "", admission_date: "", religion: "Islam" });
    expect(res.body).toMatchObject({ gr_number: "2", religion: "Islam" });
    expect(res.body.admission_date).toBeTruthy();
  });

  it("checks CNIC and B-Form numbers", async () => {
    const res = await admit({ first_name: "Bad", last_name: "Cnic", father_cnic: "12345" });
    expect(res.status).toBe(400);
  });

  it("hides identity numbers from teachers, and keeps the register with the office", async () => {
    const seen = (await request.get(`/students/${ids.ayesha}`).set(as("teacher"))).body;
    expect(seen.first_name).toBe("Ayesha");
    expect(seen.father_cnic).toBeUndefined();
    expect(seen.b_form).toBeUndefined();
    expect((await request.get("/admissions/register").set(as("teacher"))).status).toBe(403);
  });
});

describe("School Leaving Certificate", () => {
  it("refuses while fees are unpaid, unless the principal leaves them anyway", async () => {
    await pool.execute(
      "INSERT INTO fee_ledgers (student_id, month, due_date, amount_due, amount_paid, status) VALUES (?, '2027-03', '2027-03-10', 2000, 0, 'pending')",
      [ids.ayesha]
    );
    const refused = await request.post(`/admissions/${ids.ayesha}/leave`).set(as("principal")).send({});
    expect(refused.status).toBe(400);
    expect(refused.body.code).toBe("DUES_OUTSTANDING");

    const res = await request
      .post(`/admissions/${ids.ayesha}/leave`)
      .set(as("principal"))
      .send({ left_on: "2027-03-31", reason: "Family moved to Karachi", ignore_dues: true });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      slc_number: 1,
      gr_number: "1",
      name: "Ayesha Khan",
      father_name: "Imran Khan",
      admission_class: "Class 4",
      leaving_class: "Class 4",
      reason: "Family moved to Karachi",
      conduct: "Good",
      status: "left",
      dues: 2000,
    });
  });

  it("takes the student off the rolls but keeps them in the register", async () => {
    const list = (await request.get("/students").set(as("principal"))).body;
    expect(list.map((s) => s.id)).not.toContain(ids.ayesha);
    const former = (await request.get("/admissions/register?status=former").set(as("principal"))).body;
    expect(former.map((s) => [s.name, s.slc_number])).toEqual([["Ayesha Khan", 1]]);
    const all = (await request.get("/admissions/register").set(as("principal"))).body;
    expect(all.map((s) => s.gr_number)).toEqual(["1", "2", "150", "151"]);
    const found = (await request.get("/admissions/register?q=Imran").set(as("principal"))).body;
    expect(found.map((s) => s.id)).toEqual([ids.ayesha]);

    const again = await request.post(`/admissions/${ids.ayesha}/leave`).set(as("principal")).send({});
    expect(again.body.code).toBe("ALREADY_LEFT");
    const notLeft = await request.get(`/admissions/${ids.bilal}/certificate`).set(as("principal"));
    expect(notLeft.body.code).toBe("NOT_LEFT");
  });

  it("can take a former student back", async () => {
    const res = await request
      .post(`/admissions/${ids.ayesha}/readmit`)
      .set(as("principal"))
      .send({ classroom_id: ids.class4 });
    expect(res.status).toBe(200);
    const list = (await request.get("/students").set(as("principal"))).body;
    expect(list.find((s) => s.id === ids.ayesha)).toMatchObject({ classroom_id: ids.class4, status: "active" });
  });
});

describe("Year-end promotion", () => {
  it("suggests keeping back students who failed, overall or in any subject", async () => {
    await addResult(ids.bilal, ids.class4, 25);
    await addResult(ids.old, ids.class4, 70, [
      ["English", 90],
      ["Maths", 20],
    ]);
    await addResult(ids.ayesha, ids.class4, 80, [["English", 80]]);
    const list = (await request.get(`/admissions/promotion?classroom_id=${ids.class4}`).set(as("principal"))).body;
    const byName = Object.fromEntries(list.map((s) => [s.name, s.suggestion]));
    expect(byName).toEqual({
      "Ayesha Khan": "promote",
      "Bilal Ahmed": "retain",
      "Old Record": "retain",
      "After It": "promote", // no result yet
    });
  });

  it("promotes, keeps back and strikes off as chosen", async () => {
    const res = await request
      .post("/admissions/promotion")
      .set(as("principal"))
      .send({
        from_classroom_id: ids.class4,
        to_classroom_id: ids.class5,
        decisions: { [ids.bilal]: "retain", [ids.old]: "promote", [ids.after]: "leave" },
      });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ promoted: 2, passed_out: 0, retained: 1, left: 1 });

    const students = (await request.get("/students").set(as("principal"))).body;
    const classOf = (id) => students.find((s) => s.id === id)?.classroom_id;
    expect(classOf(ids.ayesha)).toBe(ids.class5);
    expect(classOf(ids.old)).toBe(ids.class5);
    expect(classOf(ids.bilal)).toBe(ids.class4);
    expect(classOf(ids.after)).toBeUndefined();

    const [[{ outcome }]] = await pool.execute(
      "SELECT outcome FROM enrollments WHERE student_id = ? AND classroom_id = ?",
      [ids.ayesha, ids.class4]
    );
    expect(outcome).toBe("promoted");
  });

  it("passes the top class out of school, each with a leaving certificate", async () => {
    const res = await request
      .post("/admissions/promotion")
      .set(as("principal"))
      .send({ from_classroom_id: ids.class5 });
    expect(res.body).toEqual({ promoted: 0, passed_out: 2, retained: 0, left: 0 });
    const cert = (await request.get(`/admissions/${ids.old}/certificate`).set(as("principal"))).body;
    expect(cert).toMatchObject({ status: "passed_out", reason: "Passed out after completing Class 5 (A)" });
    expect(cert.slc_number).toBeGreaterThan(1);
  });
});
