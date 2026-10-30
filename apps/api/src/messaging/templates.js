import pool from "../db/pool.js";

/** Replace {{name}} placeholders; unknown placeholders become empty (never left as "{{…}}"). */
export function renderTemplate(text, vars) {
  return String(text ?? "").replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key) =>
    vars[key] === undefined || vars[key] === null ? "" : String(vars[key])
  );
}

export async function getTemplate(key) {
  const [[row]] = await pool.execute(
    `SELECT template_key, name, subject, body, sms_body, whatsapp_template, whatsapp_params,
            subject_ur, body_ur, sms_body_ur
     FROM message_templates WHERE template_key = ? AND is_active = 1`,
    [key]
  );
  return row ?? null;
}

export async function listTemplates() {
  const [rows] = await pool.execute(
    "SELECT template_key, name, subject, body, sms_body, whatsapp_template FROM message_templates WHERE is_active = 1 ORDER BY name"
  );
  return rows;
}
