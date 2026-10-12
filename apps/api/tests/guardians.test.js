// Guardians: phone normalisation, migration planning, API and access. *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.CURRENCY = "USD"; // independent of the developer's .env
process.env.SCHOOL_NAME = "";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
let normalizePhone;
let planGuardians;
const tokens = {};
const ids = {};

const as = (role) => ({ Authorization: `Bearer ${tokens[role]}` });

async function login(email, password) {
  const res = await request.post("/auth/login").send({ email, password });
  return res.body.token;
}

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  ({ normalizePhone } = await import("../src/lib/phone.js"));
  ({ planGuardians } = await import("../src/db/migrations/005_guardians.js"));
  request = supertest(app);

  await pool.execute("DELETE FROM users WHERE email LIKE '%@guardians.test'");
  for (const table of [
    "student_guardians",
    "guardians",
    "teacher_classes",
    "result_cards",
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

  [{ insertId: ids.classA }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Guard A', '5')");
  [{ insertId: ids.classB }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Guard B', '6')");
});

afterAll(async () => {
  await pool.end();
});

describe("normalizePhone (Pakistan default)", () => {
  it.each([
    ["0300-1234567", "+923001234567"],
    ["0300 123 4567", "+923001234567"],
    ["+92 300 1234567", "+923001234567"],
    ["00923001234567", "+923001234567"],
    ["923001234567", "+923001234567"],
    ["3001234567", "+923001234567"],
    ["+44 20 7946 0958", "+442079460958"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizePhone(input)).toBe(expected);
  });

  it.each([["123456"], ["abc"], [""], [null]])("rejects %p", (input) => {
    expect(normalizePhone(input)).toBeNull();
  });
});

describe("Migration planning (planGuardians)", () => {
  it("merges siblings by email or phone and keeps unparseable phones in notes", () => {
    const { guardians, links } = planGuardians([
      { id: 1, first_name: "Ali", last_name: "H", guardian_name: "Hassan", guardian_email: "Hassan@X.com" },
      {
        id: 2,
        first_name: "Sara",
        last_name: "H",
        guardian_name: "Hassan",
        guardian_email: "hassan@x.com",
        guardian_phone: "0300 1112223",
      },
      { id: 3, first_name: "Omar", last_name: "K", guardian_name: "Khan", guardian_phone: "0321-4445556" },
      { id: 4, first_name: "Aisha", last_name: "K", guardian_name: "Mrs Khan", guardian_phone: "+923214445556" },
      { id: 5, first_name: "Bilal", last_name: "Z", guardian_name: "Zafar", guardian_phone: "ext 12" },
      { id: 6, first_name: "No", last_name: "Guardian" },
    ]);
    expect(guardians).toHaveLength(3);
    expect(guardians[0]).toMatchObject({ email: "hassan@x.com", phone: "+923001112223", consent_email: 1 });
    expect(guardians[1]).toMatchObject({
      phone: "+923214445556",
      email: null,
      preferred_channel: "sms",
      consent_email: 0,
    });
    expect(guardians[2].notes).toMatch(/ext 12/);
    expect(links.map((l) => [l.student_id, l.guardianIndex])).toEqual([
      [1, 0],
      [2, 0],
      [3, 1],
      [4, 1],
      [5, 2],
    ]);
  });
});

describe("Guardians through the API", () => {
  it("creates a guardian with a normalised phone when a student is saved", async () => {
    const res = await request.post("/students").set(as("principal")).send({
      first_name: "Ali",
      last_name: "Hassan",
      classroom_id: ids.classA,
      guardian_name: "Hassan Ali",
      guardian_email: "Hassan.Ali@Example.com",
      guardian_phone: "0300-1234567",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ guardian_email: "hassan.ali@example.com", guardian_phone: "+923001234567" });
    ids.ali = res.body.id;
    ids.guardian = res.body.guardian_id;
  });

  it("links a sibling to the same guardian instead of creating a duplicate", async () => {
    const res = await request.post("/students").set(as("principal")).send({
      first_name: "Sara",
      last_name: "Hassan",
      classroom_id: ids.classB,
      guardian_name: "Hassan Ali",
      guardian_phone: "+92 300 1234567",
    });
    expect(res.status).toBe(201);
    expect(res.body.guardian_id).toBe(ids.guardian);
    ids.sara = res.body.id;

    const guardian = await request.get(`/guardians/${ids.guardian}`).set(as("principal"));
    expect(guardian.body.students.map((s) => s.first_name).sort()).toEqual(["Ali", "Sara"]);
    const [[{ n }]] = await pool.query("SELECT COUNT(*) AS n FROM guardians");
    expect(Number(n)).toBe(1);
  });

  it("includes guardians in the student profile", async () => {
    const res = await request.get(`/students/${ids.ali}`).set(as("principal"));
    expect(res.body.guardians).toHaveLength(1);
    expect(res.body.guardians[0]).toMatchObject({ full_name: "Hassan Ali", is_primary: 1 });
  });

  it("rejects an invalid phone and saves nothing", async () => {
    const res = await request
      .post("/students")
      .set(as("principal"))
      .send({ first_name: "Bad", last_name: "Phone", guardian_name: "X", guardian_phone: "12345" });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_PHONE");
    const [rows] = await pool.query("SELECT id FROM students WHERE first_name = 'Bad'");
    expect(rows).toHaveLength(0);
  });

  it("records when consent changes", async () => {
    const res = await request
      .put(`/guardians/${ids.guardian}`)
      .set(as("principal"))
      .send({ consent_whatsapp: true, preferred_channel: "whatsapp" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ consent_whatsapp: 1, preferred_channel: "whatsapp" });
    expect(res.body.consent_updated_at).not.toBeNull();
  });

  it("searches guardians by name, email or phone", async () => {
    const res = await request.get("/guardians?q=300123").set(as("principal"));
    expect(res.body.total).toBe(1);
    expect(res.body.items[0].student_names).toBe("Ali Hassan, Sara Hassan");
  });
});

describe("Editing a student's guardian", () => {
  it("re-links to an existing guardian whose phone matches, without overwriting the old one", async () => {
    const created = await request.post("/students").set(as("principal")).send({
      first_name: "Zed",
      last_name: "Moved",
      classroom_id: ids.classA,
      guardian_name: "Temp Parent",
      guardian_email: "temp.parent@example.com",
    });
    const tempGuardian = created.body.guardian_id;
    expect(tempGuardian).not.toBe(ids.guardian);

    const res = await request
      .put(`/students/${created.body.id}`)
      .set(as("principal"))
      .send({ guardian_name: "Hassan Ali", guardian_email: "", guardian_phone: "0300 1234567" });
    expect(res.status).toBe(200);
    expect(res.body.guardian_id).toBe(ids.guardian);

    const old = await request.get(`/guardians/${tempGuardian}`).set(as("principal"));
    expect(old.body).toMatchObject({ email: "temp.parent@example.com", phone: null });
    await pool.execute("DELETE FROM students WHERE id = ?", [created.body.id]);
  });
});

describe("Guardian access for a teacher", () => {
  beforeAll(async () => {
    const [{ insertId: teacherId }] = await pool.execute(
      "INSERT INTO teachers (first_name, last_name) VALUES ('Gina', 'Guard')"
    );
    await pool.execute("INSERT INTO teacher_classes (teacher_id, classroom_id) VALUES (?, ?)", [teacherId, ids.classB]);
    await request.post("/users").set(as("principal")).send({
      username: "Gina",
      email: "gina@guardians.test",
      password: "password123",
      role: "teacher",
      teacher_id: teacherId,
    });
    tokens.teacher = await login("gina@guardians.test", "password123");

    // A guardian whose only child is in class A (not the teacher's class).
    const res = await request.post("/students").set(as("principal")).send({
      first_name: "Omar",
      last_name: "Khan",
      classroom_id: ids.classA,
      guardian_name: "Mr Khan",
      guardian_phone: "0321 4445556",
    });
    ids.khan = res.body.guardian_id;
  });

  it("sees only guardians of students in their classes", async () => {
    const list = await request.get("/guardians").set(as("teacher"));
    expect(list.body.items.map((g) => g.id)).toEqual([ids.guardian]); // Sara is in class B
    expect((await request.get(`/guardians/${ids.khan}`).set(as("teacher"))).status).toBe(404);
  });

  it("cannot edit guardians (no students:write)", async () => {
    const res = await request.put(`/guardians/${ids.guardian}`).set(as("teacher")).send({ notes: "x" });
    expect(res.status).toBe(403);
  });
});
