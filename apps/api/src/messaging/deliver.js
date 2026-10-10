/** Job handler: send one queued message delivery. Idempotent and consent-aware. */
import pool from "../db/pool.js";
import { getChannel } from "./channels/index.js";
import { reachability } from "./recipients.js";
import { settleMessageAction } from "../agent/actions/actions.service.js";

const FINAL = new Set(["sent", "delivered", "read", "simulated", "failed"]);

export async function deliverMessage({ delivery_id }, job) {
  const [[d]] = await pool.execute("SELECT * FROM message_deliveries WHERE id = ?", [delivery_id]);
  if (!d || FINAL.has(d.status)) return; // already handled (e.g. job retried after success)

  // Re-check consent at send time: a parent may have opted out since approval.
  if (d.guardian_id) {
    const [[g]] = await pool.execute("SELECT * FROM guardians WHERE id = ?", [d.guardian_id]);
    const reach = g ? reachability(g, d.channel) : { reason: "guardian removed" };
    if (!reach.address) {
      await pool.execute("UPDATE message_deliveries SET status = 'failed', error = ? WHERE id = ?", [
        `Not sent: ${reach.reason}`,
        d.id,
      ]);
      await settleMessageAction(d.action_id);
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
    });
    await pool.execute(
      "UPDATE message_deliveries SET status = ?, provider = ?, provider_message_id = ?, error = NULL, sent_at = NOW() WHERE id = ?",
      [res.status, res.provider, res.providerMessageId, d.id]
    );
  } catch (err) {
    const willRetry = err.retryable !== false && job.attempts < job.max_attempts;
    await pool.execute("UPDATE message_deliveries SET status = ?, error = ? WHERE id = ?", [
      willRetry ? "queued" : "failed",
      err.message,
      d.id,
    ]);
    if (!willRetry) await settleMessageAction(d.action_id);
    throw err; // let the queue schedule the retry
  }
  await settleMessageAction(d.action_id);
}
