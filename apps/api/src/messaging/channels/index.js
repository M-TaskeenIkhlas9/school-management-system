import email from "./email.js";

const CHANNELS = { email };

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

export function channelModes() {
  return Object.fromEntries(Object.values(CHANNELS).map((c) => [c.name, c.enabled() ? c.mode() : "disabled"]));
}
