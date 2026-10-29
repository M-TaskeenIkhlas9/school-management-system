/**
 * Read a CSV file (as saved by Excel or Google Sheets) into rows of { header: value }.
 * Handles quoted cells, commas and line breaks inside quotes, a UTF-8 BOM, and ; separators.
 */
export function parseCsv(text) {
  const clean = text.replace(new RegExp("^\\uFEFF"), "");
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? "";
  const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ";" : ",";
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (quoted) {
      if (c === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) {
      row.push(cell);
      cell = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const nonEmpty = rows.filter((r) => r.some((v) => v.trim() !== ""));
  if (!nonEmpty.length) return [];
  const headers = nonEmpty[0].map((h) => normaliseHeader(h));
  return nonEmpty.slice(1).map((r) => Object.fromEntries(headers.map((h, i) => [h, (r[i] ?? "").trim()])));
}

// Accept the headers people actually write: "First Name", "Father Name", "Class", "Mobile"…
const ALIASES = {
  first_name: ["first name", "firstname", "name", "student name"],
  last_name: ["last name", "lastname", "surname"],
  roll_number: ["roll number", "roll no", "roll no.", "roll", "admission no", "admission number", "gr no"],
  class: ["class", "class name", "grade", "class_name"],
  guardian_name: ["guardian name", "father name", "father's name", "parent name", "guardian"],
  guardian_phone: ["guardian phone", "father phone", "phone", "mobile", "contact", "whatsapp", "parent phone"],
  guardian_email: ["guardian email", "email", "parent email"],
  date_of_birth: ["date of birth", "dob", "birth date"],
};

function normaliseHeader(raw) {
  const h = raw.trim().toLowerCase().replace(/\s+/g, " ");
  for (const [key, names] of Object.entries(ALIASES)) {
    if (h === key || names.includes(h)) return key;
  }
  return h.replace(/\s+/g, "_");
}

export const TEMPLATE_CSV =
  "first_name,last_name,roll_number,class,guardian_name,guardian_phone,guardian_email,date_of_birth\n" +
  "Ali,Hassan,501,Class 5,Hassan Ali,0300 1234567,hassan@example.com,2015-03-21\n";
