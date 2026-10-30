/** Job handler: send one queued message delivery. Idempotent, consent-aware, falls back on failure. */
import pool from "../db/pool.js";
import { getChannel } from "./channels/index.js";
import { reachability } from "./recipients.js";
import { fallBack } from "./fallback.js";
import { settleMessageAction } from "../agent/actions/actions.service.js";

const FINAL = new Set(["sent", "delivered", "read", "simulated", "failed"]);
const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

/** Mark a delivery failed and try the parent's next channel; returns the error text stored. */
export async function failDelivery(d, reason) {
  const next = await fallBack(d);
  const error = next ? `${reason} — trying ${next} instead` : reason;
  await pool.execute(
    "UPDATE message_deliveries SET status = 'failed', error = ?, status_updated_at = NOW() WHERE id = ?",
    [error, d.id]
  );
  await settleMessageAction(d.action_id);
  return error;
}

export async function deliverMessage({ delivery_id }, job) {
  const [[d]] = await pool.execute("SELECT * FROM message_deliveries WHERE id = ?", [delivery_id]);
  if (!d || FINAL.has(d.status)) return; // already handled (e.g. job retried after success)

  // Re-check consent at send time: a parent may have opted out since approval.
  if (d.guardian_id) {
    const [[g]] = await pool.execute("SELECT * FROM guardians WHERE id = ?", [d.guardian_id]);
    const reach = g ? reachability(g, d.channel) : { reason: "guardian removed" };
    if (!reach.address) {
      await failDelivery(d, `Not sent: ${reach.reason}`);
      return;
    }
  }

  await pool.execute("UPDATE message_deliveries SET status = 'sending', attempts = attempts + 1 WHERE id = ?", [d.id]);
  try {
    const res = await getChannel(d.channel).send({
      to: d.to_address,
      toName: d.to_name,
      subject: d.subject,
      body: d.body,
      templateName: d.template_name,
      templateParams: parse(d.template_params),
      templateLanguage: d.template_language,
    });
    await pool.execute(
      `UPDATE message_deliveries SET status = ?, provider = ?, provider_message_id = ?, error = NULL,
         sent_at = NOW(), status_updated_at = NOW() WHERE id = ?`,
      [res.status, res.provider, res.providerMessageId, d.id]
    );
  } catch (err) {
    const willRetry = err.retryable !== false && job.attempts < job.max_attempts;
    if (willRetry) {
      await pool.execute("UPDATE message_deliveries SET status = 'queued', error = ? WHERE id = ?", [
        err.message,
        d.id,
      ]);
      throw err; // let the queue schedule the retry
    }
    await failDelivery(d, err.message);
    throw err; // recorded as a failed job too
  }
  await settleMessageAction(d.action_id);
}
