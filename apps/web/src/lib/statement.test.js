import { describe, expect, it } from "vitest";
import { readStatement, statementAmount, statementDate } from "./statement.js";

describe("readStatement", () => {
  it("reads the credits from a bank statement and skips debits", () => {
    const csv =
      "Transaction Date,Description,Reference No,Debit,Credit,Balance\r\n" +
      '30/10/2026,"RAAST P2P IMRAN QURESHI fee 0000 0042 7",RT991,,"2,500.00","12,500.00"\r\n' +
      "30/10/2026,ATM withdrawal,AT12,1000,,11500\r\n" +
      "31-Oct-2026,IBFT from SARA,RT992,,Rs. 700,12200\r\n";
    const { rows, skipped, columns } = readStatement(csv);
    expect(columns).toMatchObject({ date: "transaction_date", amount: "credit", transaction: "reference_no" });
    expect(rows).toEqual([
      {
        transaction_id: "RT991",
        amount: 2500,
        paid_on: "2026-10-30",
        reference: "RAAST P2P IMRAN QURESHI fee 0000 0042 7",
        payer: undefined,
      },
      { transaction_id: "RT992", amount: 700, paid_on: "2026-10-31", reference: "IBFT from SARA", payer: undefined },
    ]);
    expect(skipped).toBe(1);
  });

  it("says when it can't find the columns it needs", () => {
    expect(readStatement("Name,Remarks\nAli,fee\n").error).toMatch(/date and credit/);
    expect(readStatement("").error).toMatch(/empty/);
  });

  it("reads Pakistani dates and amounts", () => {
    expect(statementDate("2026-10-30")).toBe("2026-10-30");
    expect(statementDate("05/11/2026")).toBe("2026-11-05");
    expect(statementDate("5 Nov 2026")).toBe("2026-11-05");
    expect(statementDate("31/02/2026")).toBeNull();
    expect(statementAmount("PKR 1,500.50")).toBe(1500.5);
    expect(statementAmount("-200")).toBeNull();
    expect(statementAmount("")).toBeNull();
  });
});
