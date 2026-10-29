import { describe, expect, it } from "vitest";
import { parseCsv } from "./csv.js";

describe("parseCsv", () => {
  it("reads Excel-style CSV with quotes, BOM and the headers people write", () => {
    const rows = parseCsv(
      '\uFEFFName,Surname,Roll No,Class,Father Name,Mobile\r\nAli,Hassan,501,Class 5,"Hassan, Ali",0300 1234567\r\n\r\n'
    );
    expect(rows).toEqual([
      {
        first_name: "Ali",
        last_name: "Hassan",
        roll_number: "501",
        class: "Class 5",
        guardian_name: "Hassan, Ali",
        guardian_phone: "0300 1234567",
      },
    ]);
  });

  it("handles semicolon separators and escaped quotes", () => {
    expect(parseCsv('first_name;last_name\n"Sa""ra";Khan\n')).toEqual([{ first_name: 'Sa"ra', last_name: "Khan" }]);
  });
});
