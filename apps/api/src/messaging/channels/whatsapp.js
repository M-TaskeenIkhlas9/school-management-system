/**
 * WhatsApp through Meta's Cloud API. WHATSAPP_PROVIDER: "meta" sends for real, "simulated"
 * records without sending, "off" (default) disables the channel.
 *
 * WhatsApp only allows free text within 24 hours of the parent's last message, so messages the
 * school starts use pre-approved templates (template name + ordered parameters). A free-text
 * message to someone outside that window fails permanently and falls back to the next channel.
 * WHATSAPP_REDIRECT_TO sends everything to one test number.
 */
const provider = () => (process.env.WHATSAPP_PROVIDER || "off").toLowerCase();
const configured = () => Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

// Meta error codes that won't succeed on retry: not a WhatsApp user, outside the 24h window,
// template missing/paused/param mismatch, recipient blocked or opted out.
const PERMANENT_CODES = new Set([
  131026, 131047, 131051, 132000, 132001, 132005, 132007, 132012, 132015, 132016, 131050,
]);
// Template parameters may not contain newlines, tabs or more than 4 spaces in a row.
const cleanParam = (v) =>
  String(v ?? "")
    .replace(/[\n\t]+/g, " ")
    .replace(/ {4,}/g, "   ")
    .trim() || "-";

export function buildWhatsAppPayload({ to, body, templateName, templateParams, templateLanguage, buttons }) {
  const recipient = String(to).replace(/^\+/, "");
  if (templateName) {
    return {
      messaging_product: "whatsapp",
      to: recipient,
      type: "template",
      template: {
        name: templateName,
        // Urdu parents get the template's Urdu translation (approved in Meta under the same name).
        language: { code: templateLanguage || process.env.WHATSAPP_TEMPLATE_LANGUAGE || "en" },
        components: templateParams?.length
          ? [{ type: "body", parameters: templateParams.map((p) => ({ type: "text", text: cleanParam(p) })) }]
          : [],
      },
    };
  }
  if (buttons?.length) {
    // Reply buttons (up to 3, titles up to 20 characters); only inside the 24-hour window.
    return {
      messaging_product: "whatsapp",
      to: recipient,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: String(body).slice(0, 1024) },
        action: {
          buttons: buttons
            .slice(0, 3)
            .map((b) => ({ type: "reply", reply: { id: b.id, title: b.title.slice(0, 20) } })),
        },
      },
    };
  }
  return { messaging_product: "whatsapp", to: recipient, type: "text", text: { preview_url: false, body } };
}

export default {
  name: "whatsapp",
  mode: () => (provider() === "meta" ? (configured() ? "live" : "misconfigured") : provider()),
  enabled() {
    const mode = this.mode();
    return mode === "live" || mode === "simulated";
  },
  /** Estimated cost per conversation-opening message (WHATSAPP_COST_PER_MESSAGE). */
  estimate() {
    return { segments: null, cost: Number(process.env.WHATSAPP_COST_PER_MESSAGE) || 0 };
  },
  async send({ to, body, templateName, templateParams, templateLanguage, buttons }) {
    const deliveredTo = process.env.WHATSAPP_REDIRECT_TO || to;
    if (this.mode() !== "live")
      return { status: "simulated", provider: "simulated", providerMessageId: null, deliveredTo };

    const version = process.env.WHATSAPP_API_VERSION || "v21.0";
    let res;
    try {
      res = await fetch(`https://graph.facebook.com/${version}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
        body: JSON.stringify(
          buildWhatsAppPayload({ to: deliveredTo, body, templateName, templateParams, templateLanguage, buttons })
        ),
        signal: AbortSignal.timeout(15000),
      });
    } catch (err) {
      throw Object.assign(new Error(`WhatsApp unreachable: ${err.message}`), { retryable: true });
    }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const code = Number(data.error?.code);
      const permanent =
        PERMANENT_CODES.has(code) || (res.status >= 400 && res.status < 500 && res.status !== 429 && code !== 4);
      throw Object.assign(
        new Error(`WhatsApp failed: ${data.error?.message || res.statusText}${code ? ` (code ${code})` : ""}`),
        { retryable: !permanent, code }
      );
    }
    return { status: "sent", provider: "meta", providerMessageId: data.messages?.[0]?.id ?? null, deliveredTo };
  },
};
