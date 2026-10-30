import { parseCsv } from "./csv.js";

/**
 * Read a bank statement saved as CSV (internet banking → Statement → Download) into the credits to
 * import: { transaction_id?, amount, paid_on, reference?, payer? }. Banks name their columns
 * differently, so the columns are found by name; debits and lines without a date are skipped.
 */
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "30/10/2026", "30-Oct-2026", "2026-10-30" → "2026-10-30" (day first, as Pakistani banks write it). */
export function statementDate(value) {
  const s = String(value ?? "").trim();
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (m) return iso(m[1], m[2], m[3]);
  m = s.match(/^(\d{1,2})[-/. ](\d{1,2})[-/. ](\d{4})/);
  if (m) return iso(m[3], m[2], m[1]);
  m = s.match(/^(\d{1,2})[-/ ]([a-z]{3})[a-z]*[-/ ,]+(\d{4})/i);
  if (m && MONTHS.includes(m[2].toLowerCase())) return iso(m[3], MONTHS.indexOf(m[2].toLowerCase()) + 1, m[1]);
  return null;
}

function iso(y, mo, d) {
  const out = `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
  const check = new Date(`${out}T00:00:00Z`);
  return !Number.isNaN(check.getTime()) && check.toISOString().slice(0, 10) === out ? out : null;
}

/** "Rs. 2,500.00" → 2500; empty, zero or negative → null. */
export function statementAmount(value) {
  const s = String(value ?? "")
    .replace(/,/g, "")
    .replace(/^[^\d-]*/, "")
    .replace(/[^\d.-]/g, "");
  const n = Number(s);
  return s && Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}

const find = (keys, patterns, skip = []) =>
  patterns.map((p) => keys.find((k) => !skip.includes(k) && p.test(k))).find(Boolean);

export function readStatement(text) {
  const lines = parseCsv(text);
  if (!lines.length) return { rows: [], skipped: 0, error: "The file is empty." };
  const keys = Object.keys(lines[0]);
  const transaction = find(keys, [
    /^(txn|transaction|trans|tran)_?(id|no|number|ref|reference)\.?$/,
    /^(stan|rrn|utr)$/,
    /^ref(erence)?_?(no|number)\.?$/,
  ]);
  const date = find(keys, [/^(value_|transaction_|txn_|posting_)?date$/, /date/]);
  const amount = find(keys, [/^credit/, /^deposit/, /^amount/, /credit|amount/]);
  const reference = find(
    keys,
    [/purpose|narration|remarks|description|particulars|details/, /reference/],
    [transaction]
  );
  const payer = find(keys, [/sender|payer|remitter|from/, /name/], [reference, transaction]);
  if (!date || !amount) {
    return { rows: [], skipped: lines.length, error: "Couldn't find the date and credit (amount) columns." };
  }
  const rows = [];
  for (const line of lines) {
    const paid_on = statementDate(line[date]);
    const value = statementAmount(line[amount]);
    if (!paid_on || !value) continue;
    rows.push({
      transaction_id: (transaction && line[transaction].slice(0, 64)) || undefined,
      amount: value,
      paid_on,
      reference: (reference && line[reference].slice(0, 140)) || undefined,
      payer: (payer && line[payer].slice(0, 150)) || undefined,
    });
  }
  return { rows, skipped: lines.length - rows.length, columns: { date, amount, reference, payer, transaction } };
}
