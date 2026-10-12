/**
 * When a parent can't be reached on one channel (not on WhatsApp, number unreachable, consent
 * withdrawn), queue the same message on their next channel. Each channel is tried at most once
 * per parent per action (unique key), and a channel the approver chose explicitly never falls back.
 */
import pool from "../db/pool.js";
import logger from "../lib/logger.js";
import { enqueue, queueNow } from "../jobs/queue.js";
import { nextSendTime } from "./quietHours.js";
import { availableChannels } from "./channels/index.js";
import { chooseChannel } from "./recipients.js";
import { renderForChannel } from "../agent/actions/sendMessages.js";
import { insertDelivery } from "../agent/actions/actions.service.js";

const parse = (v) => (typeof v === "string" ? JSON.parse(v) : v);

/** @returns the fallback channel queued, or null when there is none. */
export async function fallBack(delivery) {
  if (!delivery.guardian_id) return null;
  const [[action]] = await pool.execute("SELECT payload FROM agent_actions WHERE id = ?", [delivery.action_id]);
  const payload = parse(action?.payload);
  if (!payload || payload.channel) return null;
  const recipient = payload.recipients?.find((r) => r.guardian_id === delivery.guardian_id);
  const [[guardian]] = await pool.execute("SELECT * FROM guardians WHERE id = ? AND is_active = 1", [
    delivery.guardian_id,
  ]);
  if (!recipient || !guardian) return null;

  const [tried] = await pool.execute("SELECT channel FROM message_deliveries WHERE action_id = ? AND guardian_id = ?", [
    delivery.action_id,
    delivery.guardian_id,
  ]);
  const choice = chooseChannel(
    guardian,
    availableChannels(),
    tried.map((t) => t.channel)
  );
  if (!choice.channel) return null;

  const r = { ...recipient, channel: choice.channel, to: choice.address };
  const sendAfter = queueNow(nextSendTime(new Date()));
  try {
    const id = await insertDelivery(
      pool,
      delivery.action_id,
      { ...r, ...renderForChannel(payload, r, choice.channel) },
      sendAfter,
      delivery.id
    );
    await enqueue("deliver_message", { delivery_id: id }, { runAt: sendAfter });
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY") return null; // another receipt already queued it
    throw err;
  }
  logger.info({ deliveryId: delivery.id, channel: choice.channel }, "Message falling back to another channel");
  return choice.channel;
}
