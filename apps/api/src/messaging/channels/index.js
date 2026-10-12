import email from "./email.js";
import sms from "./sms.js";
import whatsapp from "./whatsapp.js";

const CHANNELS = { whatsapp, sms, email };

/** Channels this school can send on (configured + enabled). */
export function availableChannels() {
  return Object.values(CHANNELS)
    .filter((c) => c.enabled())
    .map((c) => c.name);
}

export function getChannel(name) {
  const channel = CHANNELS[name];
  if (!channel) throw new Error(`Unknown channel ${name}`);
  return channel;
}

/** live | simulated | off | misconfigured, per channel. */
export function channelModes() {
  return Object.fromEntries(Object.values(CHANNELS).map((c) => [c.name, c.mode()]));
}
