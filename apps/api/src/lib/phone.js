/**
 * Normalise a phone number to E.164 (e.g. +923001234567), the format WhatsApp and
 * SMS providers require. Local numbers use DEFAULT_COUNTRY_CODE (Pakistan: 92).
 * Returns null when the input cannot be a valid phone number.
 */
export function normalizePhone(raw, countryCode = process.env.DEFAULT_COUNTRY_CODE || "92") {
  if (raw === undefined || raw === null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  let digits = text.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  else if (digits.startsWith("00")) digits = digits.slice(2);
  else if (digits.startsWith("0")) digits = countryCode + digits.slice(1);
  else if (!digits.startsWith(countryCode) && digits.length === 10) digits = countryCode + digits; // 3001234567

  if (!/^\d{10,15}$/.test(digits)) return null;
  return `+${digits}`;
}
