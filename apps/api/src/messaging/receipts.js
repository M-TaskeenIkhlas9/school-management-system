/**
 * Provider callbacks: delivery receipts (sent → delivered → read, or failed) and parents'
 * replies. STOP-style replies withdraw consent for that channel; START gives it back.
 */
import pool from "../db/pool.js";
import { normalizePhone } from "../lib/phone.js";
import { failDelivery } from "./deliver.js";
import { settleMessageAction } from "../agent/actions/actions.service.js";

const RANK = { queued: 0, sending: 1, sent: 2, simulated: 2, delivered: 3, read: 4 };
const STOP_WORDS = new Set(["stop", "stopall", "unsubscribe", "cancel", "end", "quit"]);
const START_WORDS = new Set(["start", "unstop", "subscribe"]);

async function logEvent(event) {
  await pool.execute(
    `INSERT INTO message_events (provider, kind, provider_message_id, delivery_id, status, from_address, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      event.provider,
      event.kind,
      event.providerMessageId ?? null,
      event.deliveryId ?? null,
      event.status ?? null,
      event.from ?? null,
      JSON.stringify(event.raw ?? {}),
    ]
  );
}

/**
 * Apply a delivery receipt. Statuses only move forward (a late "delivered" never undoes "read");
 * a failure after "sent" means the message never arrived, so the parent's next channel is tried.
 * @param status sent | delivered | read | failed (anything else is only logged)
 */
export async function applyStatus({ provider, providerMessageId, status, error, raw }) {
  const [[d]] = providerMessageId
    ? await pool.execute("SELECT * FROM message_deliveries WHERE provider = ? AND provider_message_id = ?", [
        provider,
        providerMessageId,
      ])
    : [[]];
  await logEvent({ provider, kind: "status", providerMessageId, deliveryId: d?.id, status, raw });
  if (!d) return { matched: false };

  if (status === "failed") {
    if (d.status === "failed" || d.status === "read") return { matched: true, changed: false };
    await failDelivery(d, `Not delivered: ${error || "reported failed by provider"}`);
    return { matched: true, changed: true };
  }
  if (!(status in RANK) || d.status === "failed" || RANK[status] <= RANK[d.status]) {
    return { matched: true, changed: false };
  }
  await pool.execute("UPDATE message_deliveries SET status = ?, status_updated_at = NOW() WHERE id = ?", [
    status,
    d.id,
  ]);
  await settleMessageAction(d.action_id);
  return { matched: true, changed: true };
}

/** A parent's reply. @returns "opted_out" | "opted_in" | null */
export async function handleInbound({ provider, channel, from, text, raw }) {
  const phone = normalizePhone(String(from ?? "").replace(/^whatsapp:/, ""));
  await logEvent({ provider, kind: "inbound", from: phone ?? from, raw });
  const word = String(text ?? "")
    .trim()
    .toLowerCase();
  const optOut = STOP_WORDS.has(word);
  if (!phone || (!optOut && !START_WORDS.has(word))) return null;

  const column = channel === "whatsapp" ? "consent_whatsapp" : "consent_sms";
  await pool.execute(`UPDATE guardians SET ${column} = ?, consent_updated_at = NOW() WHERE phone = ?`, [
    optOut ? 0 : 1,
    phone,
  ]);
  return optOut ? "opted_out" : "opted_in";
}
