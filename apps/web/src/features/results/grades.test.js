import { describe, expect, it } from "vitest";
import { bise, ordinal } from "./grades.js";

describe("BISE grades and positions", () => {
  it("grades on the Pakistani board scale with a 33% pass mark", () => {
    expect([85, 72, 65, 55, 45, 35, 20].map((p) => bise(p).grade)).toEqual(["A+", "A", "B", "C", "D", "E", "F"]);
  });

  it("writes positions the way a report card does", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 103].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "103rd",
    ]);
  });
});
