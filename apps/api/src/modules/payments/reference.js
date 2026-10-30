/**
 * The payment reference printed on a challan: the 1Bill biller prefix (when the school has one),
 * the fee's number in 8 digits and a check digit — "12345" + "00000042" + "7". Parents type it in
 * their bank app (1Bill) or in the purpose / remarks of a Raast transfer. The check digit means a
 * mistyped reference is not matched to someone else's fee.
 */
import { school } from "../settings/school.js";

/** Luhn check digit for a string of digits. */
export function checkDigit(digits) {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 0) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return String((10 - (sum % 10)) % 10);
}

const BODY = 8; // digits for the fee number (up to 99,999,999 fees)

export function feeReference(feeId, prefix = school().onebill_prefix || "") {
  const body = String(feeId).padStart(BODY, "0");
  return `${prefix}${body}${checkDigit(body)}`;
}

/** The fee a reference points to, or null. The prefix may be left out by the parent. */
export function feeIdFromReference(value, prefix = school().onebill_prefix || "") {
  const digits = String(value ?? "");
  const tail = prefix && digits.startsWith(prefix) && digits.length === prefix.length + BODY + 1;
  const ref = tail ? digits.slice(prefix.length) : digits;
  if (!new RegExp(`^\\d{${BODY + 1}}$`).test(ref)) return null;
  const body = ref.slice(0, BODY);
  if (checkDigit(body) !== ref.at(-1)) return null;
  return Number(body) || null;
}

/**
 * Find a payment reference in free text (a transfer's purpose or remarks, a statement line):
 * "Fee 00000042 7 Ali" → 42. Digits split by spaces or dashes are joined first.
 */
export function findFeeId(text, prefix = school().onebill_prefix || "") {
  const raw = String(text ?? "");
  const runs = [
    ...(raw.match(/\d+/g) ?? []),
    ...(raw.match(/\d[\d\s-]*\d/g) ?? []).map((r) => r.replace(/[\s-]/g, "")),
  ];
  for (const run of runs) {
    const id = feeIdFromReference(run, prefix);
    if (id) return id;
  }
  return null;
}
