import { useEffect, useState } from "react";
import { api } from "../../api/client.js";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { useToast } from "../../components/Toast.jsx";
import { formatCurrency } from "../../lib/format.js";

const FIELDS = [
  "name",
  "address",
  "phone",
  "bank_details",
  "late_fine",
  "sibling_discount",
  "message_language",
  "onebill_prefix",
  "raast_id",
];

/**
 * The school's details, set by the principal. They print on fee challans, receipts and report
 * cards, and are used in messages to parents.
 */
export default function SettingsPage() {
  const { school, refreshSession } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .get("/settings/school")
      .then((s) => setForm(Object.fromEntries(FIELDS.map((k) => [k, s[k] ?? ""]))))
      .catch((err) => toast.error(err.message));
  }, [toast]);

  const set = (name) => (e) => setForm((f) => ({ ...f, [name]: e.target.value }));
  const isSample = /sample/i.test(form?.bank_details ?? "");

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.put("/settings/school", {
        ...form,
        late_fine: Number(form.late_fine) || 0,
        sibling_discount: Number(form.sibling_discount) || 0,
      });
      await refreshSession();
      toast.success("School details saved");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="section">
      <PageHeader
        icon="settings"
        tone="violet"
        title="Settings"
        subtitle="Your school's details. They print on fee challans, receipts and report cards, and appear in messages to parents."
      />
      {!form ? (
        <div className="card">
          <p className="muted">Loading…</p>
        </div>
      ) : (
        <form className="card settings-form" onSubmit={submit}>
          <div className="card__head">
            <h2>School details</h2>
          </div>
          <div className="form-grid">
            <label>
              School name
              <input value={form.name} onChange={set("name")} maxLength={150} placeholder="Cambridge Public School" />
            </label>
            <label>
              Phone
              <input type="tel" value={form.phone} onChange={set("phone")} maxLength={50} placeholder="042 1234567" />
            </label>
            <label className="span-all">
              Address
              <input
                value={form.address}
                onChange={set("address")}
                maxLength={255}
                placeholder="12 Canal Road, Lahore"
              />
            </label>
            <label className="span-all">
              Bank account for fee challans
              <input
                value={form.bank_details}
                onChange={set("bank_details")}
                maxLength={255}
                placeholder="Bank name · Account title · Account number"
              />
              <span className="label-hint">
                Printed on every challan so parents can pay at the bank. Leave empty if fees are paid only at the school
                office.
              </span>
              {isSample && (
                <span className="settings-form__warn">
                  These are sample bank details. Replace them with the school&apos;s real account before printing
                  challans.
                </span>
              )}
            </label>
            <label>
              Late fee fine
              <input type="number" min="0" step="1" value={form.late_fine} onChange={set("late_fine")} />
              <span className="label-hint">
                Added after the due date on challans
                {Number(form.late_fine) ? ` (${formatCurrency(form.late_fine)})` : ""}. 0 = no fine.
              </span>
            </label>
            <label>
              Sibling discount (%)
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={form.sibling_discount}
                onChange={set("sibling_discount")}
              />
              <span className="label-hint">
                Taken off the monthly fee for each younger brother or sister; the eldest pays in full. 0 = no discount.
              </span>
            </label>
            <label>
              Messages to parents in
              <select value={form.message_language || "en"} onChange={set("message_language")}>
                <option value="en">English</option>
                <option value="ur">اردو (Urdu)</option>
              </select>
              <span className="label-hint">
                For parents who haven&apos;t chosen a language. A parent&apos;s own choice is set on the student form.
              </span>
            </label>
            <label>
              1Bill biller prefix
              <input
                value={form.onebill_prefix}
                onChange={set("onebill_prefix")}
                inputMode="numeric"
                pattern="\d{0,8}"
                maxLength={8}
                placeholder="e.g. 12345"
              />
              <span className="label-hint">
                Given by 1LINK (through your bank) when the school registers for 1Bill. Challans then show a consumer
                number parents can pay from any bank app, JazzCash or Easypaisa. Leave empty if not registered.
              </span>
            </label>
            <label>
              Raast ID
              <input
                value={form.raast_id}
                onChange={set("raast_id")}
                maxLength={40}
                placeholder="IBAN (PK36…) or Raast alias"
              />
              <span className="label-hint">
                Printed on challans so parents can send the fee by Raast, writing the challan&apos;s payment reference
                in the purpose. Leave empty to leave it off.
              </span>
            </label>
          </div>
          <div className="form-actions">
            <button type="submit" className="btn primary" disabled={busy}>
              {busy ? "Saving…" : "Save details"}
            </button>
          </div>
          <p className="muted settings-note">
            Currency ({school?.currency}) and time zone ({school?.timezone}) are set when the school is installed, so
            old records stay consistent.
          </p>
        </form>
      )}
    </section>
  );
}
