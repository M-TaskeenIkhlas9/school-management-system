/**
 * The assistant writes markdown for the web chat; WhatsApp shows *bold*, _italic_ and "- " lists but
 * no tables, headings or links. Tables become one line per row ("Ali · 5A · Rs 2,000").
 */
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|?(\s*:?-{2,}:?\s*\|)+\s*:?-*:?\s*\|?\s*$/;

const cells = (line) =>
  line
    .trim()
    .replace(/^\||\|$/g, "")
    .split("|")
    .map((c) => c.trim());

const inline = (text) =>
  text
    .replace(/\*\*(.+?)\*\*/g, "*$1*")
    .replace(/__(.+?)__/g, "_$1_")
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, "$1 ($2)");

export function toWhatsApp(markdown) {
  const out = [];
  let inTable = false;
  for (const line of String(markdown ?? "").split("\n")) {
    if (TABLE_ROW.test(line)) {
      if (TABLE_RULE.test(line)) continue;
      const row = inline(cells(line).join(" · "));
      out.push(inTable ? row : `*${row.replace(/\*/g, "")}*`); // the first row is the header
      inTable = true;
      continue;
    }
    inTable = false;
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      out.push(`*${heading[1].replace(/\*/g, "")}*`);
      continue;
    }
    out.push(inline(line.replace(/^(\s*)[*+]\s+/, "$1- ")));
  }
  return out
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split a long reply into WhatsApp-sized messages (the limit is 4,096 characters), at line breaks. */
export function chunks(text, max = 3500) {
  const parts = [];
  let current = "";
  for (const line of String(text).split("\n")) {
    let piece = line;
    while (piece.length > max - (current ? current.length + 1 : 0)) {
      if (current) {
        parts.push(current);
        current = "";
      } else {
        parts.push(piece.slice(0, max)); // a single line longer than a whole message
        piece = piece.slice(max);
      }
    }
    current = current ? `${current}\n${piece}` : piece;
  }
  if (current) parts.push(current);
  return parts.length ? parts : [""];
}
