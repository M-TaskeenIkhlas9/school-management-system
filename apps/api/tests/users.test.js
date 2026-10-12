// M4: account management — teacher classes, roles, password resets, sessions, activity. *_test database only.
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-secret-that-is-long-enough-for-config-check";
process.env.DB_NAME = process.env.DB_NAME || "school_management_test";
process.env.CURRENCY = "USD"; // independent of the developer's .env
process.env.SCHOOL_NAME = "";
process.env.LOGIN_RATE_LIMIT = "1000";

if (!process.env.DB_NAME.endsWith("_test")) {
  throw new Error(`Refusing to run destructive tests against "${process.env.DB_NAME}" — DB_NAME must end with _test`);
}

let request;
let pool;
const tokens = {};
const ids = {};

const bearer = (token) => ({ Authorization: `Bearer ${token}` });
const as = (role) => bearer(tokens[role]);

async function login(email, password) {
  const res = await request.post("/auth/login").send({ email, password });
  return res.body.token;
}

beforeAll(async () => {
  const supertest = (await import("supertest")).default;
  const app = (await import("../src/app.js")).default;
  pool = (await import("../src/db/pool.js")).default;
  request = supertest(app);

  await pool.execute("DELETE FROM users WHERE email LIKE '%@users.test'");
  for (const table of ["audit_log", "teacher_classes", "enrollments", "students", "teachers", "classrooms"]) {
    await pool.execute(`DELETE FROM ${table}`);
  }
  const { ensureDefaultPrincipal } = await import("../src/modules/auth/auth.service.js");
  await ensureDefaultPrincipal();
  tokens.principal = await login("admin@school.com", "admin123");

  [{ insertId: ids.classA }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Users A', '5')");
  [{ insertId: ids.classB }] = await pool.execute("INSERT INTO classrooms (name, grade) VALUES ('Users B', '6')");
  [{ insertId: ids.teacher }] = await pool.execute("INSERT INTO teachers (first_name, last_name) VALUES ('Uma', 'U')");

  const admin = await request
    .post("/users")
    .set(as("principal"))
    .send({ username: "Adam", email: "adam@users.test", password: "password123", role: "admin" });
  ids.admin = admin.body.id;
  tokens.admin = await login("adam@users.test", "password123");
});

afterAll(async () => {
  await pool.end();
});

describe("Teacher accounts", () => {
  it("creates a teacher account with its classes in one step", async () => {
    const res = await request
      .post("/users")
      .set(as("principal"))
      .send({
        username: "Uma",
        email: "uma@users.test",
        password: "password123",
        role: "teacher",
        teacher_id: ids.teacher,
        classroom_ids: [ids.classB, ids.classA],
      });
    expect(res.status).toBe(201);
    ids.uma = res.body.id;

    const list = await request.get("/users").set(as("principal"));
    const uma = list.body.find((u) => u.id === ids.uma);
    expect(uma).toMatchObject({ role: "teacher", teacher_name: "Uma U" });
    expect(uma.class_ids).toEqual([ids.classA, ids.classB].sort((a, b) => a - b));

    tokens.uma = await login("uma@users.test", "password123");
    expect((await request.get("/auth/me").set(as("uma"))).body.classIds.sort()).toEqual(
      [ids.classA, ids.classB].sort()
    );
  });

  it("refuses a second account for the same teacher, and unknown classes", async () => {
    const dup = await request.post("/users").set(as("principal")).send({
      username: "Uma 2",
      email: "uma2@users.test",
      password: "password123",
      role: "teacher",
      teacher_id: ids.teacher,
    });
    expect(dup.status).toBe(409);

    const bad = await request
      .patch(`/users/${ids.uma}`)
      .set(as("principal"))
      .send({ classroom_ids: [ids.classA, 999999] });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("CLASS_NOT_FOUND");
  });

  it("changes a teacher's classes from their account, effective on the next request", async () => {
    const res = await request
      .patch(`/users/${ids.uma}`)
      .set(as("principal"))
      .send({ classroom_ids: [ids.classA] });
    expect(res.status).toBe(200);
    expect((await request.get("/auth/me").set(as("uma"))).body.classIds).toEqual([ids.classA]);
  });
});

describe("Roles", () => {
  it("lists what each role can do and which the actor may assign", async () => {
    const principal = (await request.get("/users/roles").set(as("principal"))).body;
    expect(principal.map((r) => r.role)).toEqual(["principal", "admin", "accountant", "teacher"]);
    expect(principal.every((r) => r.assignable)).toBe(true);
    expect(principal.find((r) => r.role === "accountant").permissions).toContain("fees:write");

    const admin = (await request.get("/users/roles").set(as("admin"))).body;
    expect(admin.find((r) => r.role === "principal").assignable).toBe(false);
    expect(admin.find((r) => r.role === "teacher").assignable).toBe(true);
  });

  it("is closed to people who don't manage users", async () => {
    for (const path of ["/users", "/users/roles", "/users/activity"]) {
      expect((await request.get(path).set(as("uma"))).status).toBe(403);
    }
  });
});

describe("Passwords and sessions", () => {
  it("signs a user out everywhere when their password is reset", async () => {
    const old = tokens.uma;
    const res = await request.patch(`/users/${ids.uma}`).set(as("principal")).send({ password: "newpassword1" });
    expect(res.status).toBe(200);

    const after = await request.get("/auth/me").set(bearer(old));
    expect(after.status).toBe(401);
    expect(after.body.code).toBe("SESSION_REVOKED");
    expect(await login("uma@users.test", "password123")).toBeUndefined();
    tokens.uma = await login("uma@users.test", "newpassword1");
    expect((await request.get("/auth/me").set(as("uma"))).status).toBe(200);
  });

  it("lets anyone change their own password, keeping only this session", async () => {
    const otherDevice = await login("uma@users.test", "newpassword1");

    const wrong = await request
      .post("/auth/password")
      .set(as("uma"))
      .send({ current_password: "nope", new_password: "another-pass1" });
    expect(wrong.status).toBe(400);
    expect(wrong.body.code).toBe("WRONG_PASSWORD");

    const ok = await request
      .post("/auth/password")
      .set(as("uma"))
      .send({ current_password: "newpassword1", new_password: "another-pass1" });
    expect(ok.status).toBe(200);
    expect((await request.get("/auth/me").set(bearer(ok.body.token))).status).toBe(200);
    expect((await request.get("/auth/me").set(bearer(otherDevice))).status).toBe(401);
    tokens.uma = ok.body.token;
  });

  it("signs a user out everywhere on request, but an admin can't do it to the principal", async () => {
    const res = await request.post(`/users/${ids.uma}/sign-out`).set(as("principal"));
    expect(res.status).toBe(204);
    expect((await request.get("/auth/me").set(as("uma"))).status).toBe(401);

    const [[principal]] = await pool.execute("SELECT id FROM users WHERE email = 'admin@school.com'");
    expect((await request.post(`/users/${principal.id}/sign-out`).set(as("admin"))).status).toBe(403);
  });

  it("keeps tokens issued before session versions existed working", async () => {
    const jwt = (await import("jsonwebtoken")).default;
    const legacy = jwt.sign({ id: ids.admin }, process.env.JWT_SECRET, { expiresIn: "1h" });
    expect((await request.get("/auth/me").set(bearer(legacy))).status).toBe(200);
  });
});

describe("Activity", () => {
  it("records failed sign-ins and account changes, filterable by person and kind", async () => {
    await request.post("/auth/login").send({ email: "UMA@users.test", password: "guess" });

    const auth = (await request.get("/users/activity?action=auth.").set(as("principal"))).body;
    expect(auth.items.every((a) => a.action.startsWith("auth."))).toBe(true);
    const failed = auth.items.find((a) => a.action === "auth.login_failed");
    expect(failed.details).toEqual({ email: "uma@users.test" });

    const uma = (await request.get(`/users/activity?user_id=${ids.uma}&pageSize=50`).set(as("principal"))).body;
    const actions = uma.items.map((a) => a.action);
    for (const action of ["user.create", "user.update", "auth.password_change", "user.sign_out_everywhere"]) {
      expect(actions).toContain(action);
    }
    const reset = uma.items.find((a) => a.action === "user.update" && a.details.password_changed);
    expect(reset).toMatchObject({ username: "Principal", target_name: "Uma" });
    expect(JSON.stringify(uma.items)).not.toMatch(/newpassword1|another-pass1/);
    expect(uma).toMatchObject({ page: 1, pageSize: 50 });
  });
});
