/** Plain-text helpers shared by the phone channels. */

// GSM 03.38 basic + extension characters; anything else forces UCS-2 (e.g. Urdu, emoji, curly quotes).
const GSM = new Set(
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà"
);
const GSM_EXT = new Set("^{}\\[~]|€");

/** How many SMS segments a text needs (what operators bill for). */
export function smsSegments(text) {
  const chars = [...String(text ?? "")];
  const gsm = chars.every((c) => GSM.has(c) || GSM_EXT.has(c));
  if (gsm) {
    const units = chars.reduce((n, c) => n + (GSM_EXT.has(c) ? 2 : 1), 0);
    return { encoding: "GSM-7", length: units, segments: units <= 160 ? 1 : Math.ceil(units / 153) };
  }
  const units = [...String(text ?? "")].reduce((n, c) => n + (c.codePointAt(0) > 0xffff ? 2 : 1), 0);
  return { encoding: "UCS-2", length: units, segments: units <= 70 ? 1 : Math.ceil(units / 67) };
}

/** Phone messages are plain text: collapse blank-line runs and trim. */
export const toPlainText = (text) =>
  String(text ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
