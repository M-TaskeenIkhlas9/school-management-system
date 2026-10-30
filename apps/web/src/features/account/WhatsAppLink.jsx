import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { useToast } from "../../components/Toast.jsx";
import { displayDateTime } from "../../lib/format.js";

/**
 * Link your own WhatsApp number to the assistant: you get a one-time code, send it from your phone
 * to the school's number, and from then on you can ask questions and approve work on WhatsApp.
 */
export default function WhatsAppLink() {
  const toast = useToast();
  const [code, setCode] = useState(null); // { code, message, minutes, bot_number, url }
  const [busy, setBusy] = useState(false);
  const { data: status, refetch } = useQuery({
    queryKey: ["account", "whatsapp"],
    queryFn: () => api.get("/account/whatsapp"),
    // While a code is showing, check every few seconds whether it has arrived.
    refetchInterval: (query) => (code && !query.state.data?.linked ? 3000 : false),
  });

  const getCode = async () => {
    setBusy(true);
    try {
      setCode(await api.post("/account/whatsapp/code"));
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    if (!window.confirm("Stop using the assistant on WhatsApp from this number?")) return;
    try {
      await api.del("/account/whatsapp");
      setCode(null);
      refetch();
      toast.success("WhatsApp unlinked");
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (!status) return null;
  const number = status.bot_number ?? code?.bot_number;

  return (
    <div className="card account-page whatsapp-link">
      <div className="card__title">
        <h4>Assistant on WhatsApp</h4>
        {status.linked && <span className="badge success">Linked</span>}
      </div>
      {status.linked ? (
        <>
          <p>
            <strong>{status.phone}</strong> is linked since {displayDateTime(status.linked_at)}. Message{" "}
            {number ? <strong>{number}</strong> : "the school's WhatsApp number"} to ask the assistant anything, and
            approve messages and payments with the buttons it sends. Send <strong>HELP</strong> to see what it can do.
          </p>
          <p className="muted">
            You&apos;re also told on WhatsApp when someone prepares something you can approve. Changing your password
            unlinks the number.
          </p>
          <div className="form-actions">
            <button type="button" className="btn ghost" onClick={unlink}>
              Unlink
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Ask questions (&ldquo;Who is absent today?&rdquo;) and approve messages to parents and fee payments from
            your phone, without opening the app.
          </p>
          {!status.available && (
            <p className="settings-form__warn">
              WhatsApp isn&apos;t connected for the school yet. Ask the administrator to set up the WhatsApp Cloud API
              (see the README).
            </p>
          )}
          {code ? (
            <div>
              <p>
                From your phone, send this to {number ? <strong>{number}</strong> : "the school's WhatsApp number"}{" "}
                within {code.minutes} minutes:
              </p>
              <output className="whatsapp-link__message">{code.message}</output>
              <div className="form-actions">
                {code.url && (
                  <a className="btn primary" href={code.url} target="_blank" rel="noreferrer">
                    Open WhatsApp
                  </a>
                )}
                <button type="button" className="btn ghost" onClick={getCode} disabled={busy}>
                  New code
                </button>
              </div>
              <p className="muted">Waiting for your message…</p>
            </div>
          ) : (
            <div className="form-actions">
              <button type="button" className="btn primary" onClick={getCode} disabled={busy || !status.available}>
                Link my WhatsApp
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
