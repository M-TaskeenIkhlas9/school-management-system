import { describe, expect, it } from "vitest";
import { average, badgeClass, displayDate, formatDate, fullName } from "./format.js";

describe("format helpers", () => {
  it("maps statuses to badge colours", () => {
    expect(badgeClass("paid")).toBe("success");
    expect(badgeClass("pending")).toBe("warning");
    expect(badgeClass("absent")).toBe("danger");
    expect(badgeClass("High")).toBe("danger");
    expect(badgeClass(undefined)).toBe("primary");
  });

  it("formats dates and handles missing values", () => {
    expect(formatDate("2026-10-09T00:00:00.000Z")).toBe("2026-10-09");
    expect(formatDate(null)).toBe("—");
    expect(displayDate("2026-10-20")).toBe("20 Oct 2026");
    expect(displayDate("2026-01-05T23:30:00.000Z")).toBe("5 Jan 2026");
    expect(displayDate(null)).toBe("—");
  });

  it("joins names and averages numbers", () => {
    expect(fullName({ first_name: "Ali", last_name: "Hassan" })).toBe("Ali Hassan");
    expect(average([50, 100])).toBe(75);
    expect(average([])).toBeNull();
  });
});
