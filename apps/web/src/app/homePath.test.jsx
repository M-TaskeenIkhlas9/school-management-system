import { describe, expect, it } from "vitest";
import { homePath } from "./App.jsx";

const canWith =
  (...permissions) =>
  (p) =>
    permissions.includes(p);

describe("homePath (first page a role may open)", () => {
  it("sends anyone with the dashboard there", () => {
    expect(homePath(canWith("dashboard:read", "fees:read"))).toBe("/dashboard");
  });

  it("falls back to the first allowed section", () => {
    expect(homePath(canWith("fees:read"))).toBe("/fees");
  });

  it("uses a no-access page when nothing is allowed", () => {
    expect(homePath(canWith())).toBe("/no-access");
  });
});
