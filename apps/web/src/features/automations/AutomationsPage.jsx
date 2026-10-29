import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Segmented from "../../components/Segmented.jsx";
import CountUp from "../../components/CountUp.jsx";
import Icon from "../../app/Icon.jsx";
import { useApiMutation } from "../../api/queries.js";
import { useToast } from "../../components/Toast.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import { displayDateTime, timeAgo } from "../../lib/format.js";
import { automationsApi, automationsKey } from "./api.js";
import "./automations.css";

const KINDS = [
  {
    key: "fee_reminder",
    label: "Fee reminder",
    icon: "fees",
    tone: "amber",
    needs: "fees:read",
    text: "Reminds parents of students with overdue fees, with each family's real balance.",
    name: "Weekly fee reminders",
    schedule: { frequency: "weekly", weekday: 1, time: "09:00" },
  },
  {
    key: "absence_today",
    label: "Absence alert",
    icon: "attendance",
    tone: "rose",
    needs: "attendance:read",
    text: "Tells parents when their child was marked absent that day.",
    name: "Daily absence alerts",
    schedule: { frequency: "school_days", time: "11:00" },
  },
  {
    key: "absence_streak",
    label: "Absence streak",
    icon: "bell",
    tone: "violet",
    needs: "attendance:read",
    text: "Alerts parents when their child has missed several school days in a row.",
    name: "Absence streak alerts",
    schedule: { frequency: "school_days", time: "12:00" },
  },
];
const KIND = Object.fromEntries(KINDS.map((k) => [k.key, k]));
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const RUN_TONE = { sent: "success", waiting: "warning", skipped: "neutral", failed: "danger" };
const RUN_LABEL = { sent: "Sent", waiting: "Waiting for approval", skipped: "Skipped", failed: "Failed" };

function NewAutomation({ kinds, canAuto, onDone }) {
  const first = kinds[0];
  const [form, setForm] = useState({
    kind: first.key,
    name: first.name,
    schedule: first.schedule,
    mode: "approve",
    channel: "",
    days: 3,
  });
  const create = useApiMutation((data) => automationsApi.create(data), {
    invalidate: [automationsKey],
    success: (a) => `${a.name} is on`,
  });
  const pick = (kind) => setForm((f) => ({ ...f, kind: kind.key, name: kind.name, schedule: kind.schedule }));
  const setSchedule = (changes) => setForm((f) => ({ ...f, schedule: { ...f.schedule, ...changes } }));

  const submit = (e) => {
    e.preventDefault();
    const { frequency, time, weekday } = form.schedule;
    create.mutate(
      {
        name: form.name,
        kind: form.kind,
        mode: form.mode,
        schedule: frequency === "weekly" ? { frequency, time, weekday: Number(weekday ?? 1) } : { frequency, time },
        options: {
          ...(form.channel ? { channel: form.channel } : {}),
          ...(form.kind === "absence_streak" ? { days: Number(form.days) } : {}),
        },
      },
      { onSuccess: onDone }
    );
  };

  return (
    <form className="card automation-form" onSubmit={submit}>
      <div className="card__head">
        <div>
          <h2>New automation</h2>
          <p>Choose what to send, when, and whether it needs your approval each time.</p>
        </div>
      </div>

      <div className="kind-picker" role="radiogroup" aria-label="What to send">
        {kinds.map((k) => (
          <button
            key={k.key}
            type="button"
            role="radio"
            aria-checked={form.kind === k.key}
            className={`kind ${form.kind === k.key ? "is-active" : ""}`}
            onClick={() => pick(k)}
          >
            <span className={`tile tile--${k.tone}`}>
              <Icon name={k.icon} size={20} />
            </span>
            <strong>{k.label}</strong>
            <span>{k.text}</span>
          </button>
        ))}
      </div>

      <div className="form-row">
        <label>
          Name
          <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        </label>
        <div className="field-label">
          How often
          <Segmented
            label="How often"
            options={[
              ["school_days", "School days"],
              ["daily", "Every day"],
              ["weekly", "Weekly"],
            ]}
            value={form.schedule.frequency}
            onChange={(frequency) => setSchedule({ frequency, weekday: form.schedule.weekday ?? 1 })}
          />
        </div>
        {form.schedule.frequency === "weekly" && (
          <label>
            On
            <select
              value={form.schedule.weekday ?? 1}
              onChange={(e) => setSchedule({ weekday: Number(e.target.value) })}
            >
              {WEEKDAYS.map((d, i) => (
                <option key={d} value={i}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          At
          <input
            type="time"
            value={form.schedule.time}
            onChange={(e) => setSchedule({ time: e.target.value })}
            required
          />
        </label>
        {form.kind === "absence_streak" && (
          <label>
            Days in a row
            <input
              type="number"
              min="2"
              max="30"
              value={form.days}
              onChange={(e) => setForm((f) => ({ ...f, days: e.target.value }))}
            />
          </label>
        )}
        <label>
          Channel
          <select value={form.channel} onChange={(e) => setForm((f) => ({ ...f, channel: e.target.value }))}>
            <option value="">Each parent&apos;s preferred channel</option>
            <option value="whatsapp">WhatsApp only</option>
            <option value="sms">SMS only</option>
            <option value="email">Email only</option>
          </select>
        </label>
      </div>

      <div className="mode-picker" role="radiogroup" aria-label="Approval">
        <label className={`mode ${form.mode === "approve" ? "is-active" : ""}`}>
          <input
            type="radio"
            name="mode"
            checked={form.mode === "approve"}
            onChange={() => setForm((f) => ({ ...f, mode: "approve" }))}
          />
          <span>
            <strong>Wait for approval</strong>
            Each run prepares the messages and puts them on Approvals. Nothing is sent until someone approves.
          </span>
        </label>
        <label className={`mode ${form.mode === "auto" ? "is-active" : ""} ${canAuto ? "" : "is-disabled"}`}>
          <input
            type="radio"
            name="mode"
            disabled={!canAuto}
            checked={form.mode === "auto"}
            onChange={() => setForm((f) => ({ ...f, mode: "auto" }))}
          />
          <span>
            <strong>Send automatically</strong>
            {canAuto
              ? "Trusted rule: each run is approved and sent straight away, within quiet hours and consent."
              : "Only someone who can approve messages can let a rule send by itself."}
          </span>
        </label>
      </div>

      <div className="form-actions">
        <button type="submit" className="btn primary" disabled={create.isPending}>
          {create.isPending ? "Saving…" : "Turn on automation"}
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function History({ id }) {
  const { data: runs } = useQuery({
    queryKey: [...automationsKey, id, "runs"],
    queryFn: () => automationsApi.runs(id),
  });
  if (!runs) return <p className="muted">Loading…</p>;
  if (!runs.length) return <p className="muted">No runs yet.</p>;
  return (
    <ul className="runs">
      {runs.map((r) => (
        <li key={r.id}>
          <span className={`badge ${RUN_TONE[r.status]}`}>{RUN_LABEL[r.status]}</span>
          <span className="runs__note">
            {r.recipients ? `${r.recipients} parents · ` : ""}
            {r.note}
          </span>
          <span className="muted">
            {r.trigger_type === "manual" ? "Run by hand · " : ""}
            {timeAgo(r.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function AutomationCard({ a }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const kind = KIND[a.kind] ?? { icon: "calendar", tone: "blue", label: a.kind_label };
  const refresh = () => queryClient.invalidateQueries({ queryKey: automationsKey });

  const toggle = useApiMutation((active) => automationsApi.update(a.id, { is_active: active }), {
    invalidate: [automationsKey],
    success: (x) => (x.is_active ? `${x.name} is on` : `${x.name} is paused`),
  });
  const remove = useApiMutation(() => automationsApi.remove(a.id), {
    invalidate: [automationsKey],
    success: "Automation deleted",
  });
  const [running, setRunning] = useState(false);
  const runNow = async () => {
    setRunning(true);
    try {
      const r = await automationsApi.run(a.id);
      if (r.status === "failed") toast.error(r.note);
      else toast.success(r.status === "skipped" ? r.note : `${RUN_LABEL[r.status]}: ${r.recipients} parents`);
      setOpen(true);
      refresh();
      queryClient.invalidateQueries({ queryKey: ["actions", "pending"] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <article className={`automation ${a.is_active ? "" : "is-paused"}`}>
      <div className="automation__main">
        <span className={`tile tile--${kind.tone}`}>
          <Icon name={kind.icon} size={22} />
        </span>
        <div className="automation__text">
          <h3>{a.name}</h3>
          <p>
            {a.schedule_text}
            {a.options?.channel ? ` · ${a.options.channel === "sms" ? "SMS" : a.options.channel} only` : ""}
            {a.kind === "absence_streak" ? ` · ${a.options?.days ?? 3}+ days in a row` : ""}
          </p>
          <div className="tag-row">
            <span className={`badge ${a.mode === "auto" ? "info" : "neutral"}`}>
              {a.mode === "auto" ? "Sends automatically" : "Waits for approval"}
            </span>
            {a.last_status && (
              <span className={`badge ${RUN_TONE[a.last_status]}`}>Last run: {RUN_LABEL[a.last_status]}</span>
            )}
            <span className="muted automation__by">by {a.created_by_name}</span>
          </div>
        </div>
        <div className="automation__when">
          <span>{a.is_active ? "Next run" : "Paused"}</span>
          <strong>{a.is_active && a.next_run_at ? displayDateTime(a.next_run_at) : "—"}</strong>
        </div>
        <label className="switch" title={a.is_active ? "Pause" : "Turn on"}>
          <input
            type="checkbox"
            checked={a.is_active}
            onChange={(e) => toggle.mutate(e.target.checked)}
            aria-label={a.is_active ? `Pause ${a.name}` : `Turn on ${a.name}`}
          />
          <span />
        </label>
      </div>
      <div className="automation__actions">
        <button type="button" className="btn ghost small" disabled={running} onClick={runNow}>
          <Icon name="arrow" size={16} /> {running ? "Running…" : "Run now"}
        </button>
        <button type="button" className="btn link" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide history" : "History"}
        </button>
        <button
          type="button"
          className="btn link danger-text"
          onClick={() => window.confirm(`Delete "${a.name}"?`) && remove.mutate()}
        >
          Delete
        </button>
      </div>
      {open && <History id={a.id} />}
    </article>
  );
}

export default function AutomationsPage() {
  const { can } = useAuth();
  const [adding, setAdding] = useState(false);
  const { data: automations, isLoading } = useQuery({ queryKey: automationsKey, queryFn: automationsApi.list });
  const kinds = KINDS.filter((k) => can(k.needs));
  const list = automations ?? [];
  const active = list.filter((a) => a.is_active);
  const soonest = active
    .map((a) => a.next_run_at)
    .filter(Boolean)
    .sort()[0];

  return (
    <section className="section">
      <PageHeader
        icon="calendar"
        tone="violet"
        title="Automations"
        subtitle="Rules that prepare messages to parents on a schedule, so routine reminders never depend on someone remembering."
      >
        {!adding && kinds.length > 0 && (
          <button type="button" className="btn primary" onClick={() => setAdding(true)}>
            <Icon name="plus" size={18} strokeWidth={2} /> New automation
          </button>
        )}
      </PageHeader>

      <StatRow>
        <StatCard tone="violet" icon="calendar" label="Active rules" loading={isLoading}>
          <CountUp value={active.length} />
        </StatCard>
        <StatCard tone="blue" icon="sparkle" label="Send automatically" note="trusted rules">
          <CountUp value={active.filter((a) => a.mode === "auto").length} />
        </StatCard>
        <StatCard tone="amber" icon="bell" label="Paused">
          <CountUp value={list.length - active.length} />
        </StatCard>
        <StatCard
          tone="green"
          icon="arrow"
          label="Next run"
          note={soonest ? "the soonest scheduled run" : "nothing scheduled"}
        >
          <span className="kpi__small">{soonest ? displayDateTime(soonest) : "—"}</span>
        </StatCard>
      </StatRow>

      {adding && <NewAutomation kinds={kinds} canAuto={can("messages:send")} onDone={() => setAdding(false)} />}

      {!isLoading && !list.length && !adding && (
        <div className="card">
          <EmptyState
            icon="calendar"
            title="No automations yet"
            action={
              kinds.length > 0 && (
                <button type="button" className="btn primary small" onClick={() => setAdding(true)}>
                  New automation
                </button>
              )
            }
          >
            For example: every Monday at 9:00, remind parents of overdue fees; every school day at 11:00, tell parents
            about today&apos;s absences. Prepared messages wait on <Link to="/approvals">Approvals</Link>.
          </EmptyState>
        </div>
      )}

      <div className="automations">
        {list.map((a) => (
          <AutomationCard key={a.id} a={a} />
        ))}
      </div>
    </section>
  );
}
