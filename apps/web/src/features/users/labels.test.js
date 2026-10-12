import { describe, expect, it } from "vitest";
import { describeActivity, describePermissions, generatePassword } from "./labels.js";

describe("users labels", () => {
  it("groups permissions into plain-language areas", () => {
    expect(describePermissions(["fees:read", "fees:write", "students:read", "messages:send"])).toEqual([
      { area: "Students & guardians", verbs: ["view"] },
      { area: "Fees & payments", verbs: ["view", "edit"] },
      { area: "Messages to parents", verbs: ["approve & send"] },
    ]);
  });

  it("describes audit entries without leaking anything secret", () => {
    expect(describeActivity({ action: "auth.login_failed", details: { email: "x@y.z" } })).toBe(
      "Failed sign-in attempt for x@y.z"
    );
    expect(
      describeActivity({ action: "user.update", entity_id: 4, details: { password_changed: true, is_active: false } })
    ).toBe("Updated account #4: deactivated, password reset");
    expect(describeActivity({ action: "user.create", target_name: "Bilal", details: { role: "teacher" } })).toBe(
      "Created an account for Bilal (Teacher)"
    );
    expect(describeActivity({ action: "something.new", details: null })).toBe("something.new");
  });

  it("generates readable random passwords", () => {
    const a = generatePassword();
    expect(a).toMatch(/^[A-HJ-NP-Za-km-z2-9]{12}$/);
    expect(generatePassword()).not.toBe(a);
  });
});
