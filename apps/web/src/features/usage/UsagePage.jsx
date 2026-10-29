import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Segmented from "../../components/Segmented.jsx";
import CountUp from "../../components/CountUp.jsx";
import Avatar from "../../components/Avatar.jsx";
import { displayDate, formatCurrency, timeAgo } from "../../lib/format.js";

const TOOL_LABEL = {
  get_school_overview: "School overview",
  find_students: "Find students",
  get_student_profile: "Student profile",
  find_guardians: "Find parents",
  list_classes: "List classes",
  get_attendance_summary: "Attendance summary",
  list_absences: "Absences",
  find_absence_streaks: "Absence streaks",
  get_fee_defaulters: "Overdue fees",
  get_fee_summary: "Fee summary",
  get_results_summary: "Results",
  get_attention_report: "Students needing attention",
  draft_parent_message: "Draft a parent message",
  prepare_fee_payment: "Prepare a fee payment",
};
const compact = (n) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

/** How the AI assistant is used: questions, outcomes, tokens, speed, tools and people. */
export default function UsagePage() {
  const [days, setDays] = useState("30");
  const { data, isLoading } = useQuery({
    queryKey: ["assistant", "usage", days],
    queryFn: () => api.get(`/assistant/usage?days=${days}`),
  });
  const t = data?.totals ?? {};
  const answeredShare = t.questions ? Math.round((t.completed / t.questions) * 100) : 0;
  const peak = Math.max(1, ...(data?.by_day ?? []).map((d) => d.questions));
  const maxCalls = Math.max(1, ...(data?.tools ?? []).map((x) => x.calls));

  return (
    <section className="section">
      <PageHeader
        icon="chart"
        tone="blue"
        title="AI usage"
        subtitle="How the assistant is being used: questions, answers, cost in tokens, and which tools it relies on."
      >
        <Segmented
          label="Period"
          options={[
            ["7", "7 days"],
            ["30", "30 days"],
            ["90", "90 days"],
          ]}
          value={days}
          onChange={setDays}
        />
      </PageHeader>

      <StatRow>
        <StatCard
          tone="blue"
          icon="assistant"
          label="Questions asked"
          loading={isLoading}
          note={`by ${t.people ?? 0} people`}
        >
          <CountUp value={t.questions ?? 0} />
        </StatCard>
        <StatCard
          tone="green"
          icon="approvals"
          label="Answered"
          loading={isLoading}
          note={`${answeredShare}% of questions`}
        >
          <CountUp value={t.completed ?? 0} />
        </StatCard>
        <StatCard tone="rose" icon="close" label="Problems" loading={isLoading} note="failed or stopped at a limit">
          <CountUp value={t.problems ?? 0} />
        </StatCard>
        <StatCard
          tone="violet"
          icon="sparkle"
          label="Tokens used"
          loading={isLoading}
          note={
            t.estimated_cost !== null && t.estimated_cost !== undefined
              ? `≈ ${formatCurrency(t.estimated_cost)}`
              : `${compact(t.input_tokens ?? 0)} in · ${compact(t.output_tokens ?? 0)} out`
          }
        >
          {compact((t.input_tokens ?? 0) + (t.output_tokens ?? 0))}
        </StatCard>
        <StatCard tone="amber" icon="calendar" label="Average answer time" loading={isLoading}>
          {t.avg_seconds ?? 0}s
        </StatCard>
      </StatRow>

      <div className="grid-2">
        <div className="card">
          <div className="card__head">
            <div>
              <h2>Questions per day</h2>
              <p>Last 14 days</p>
            </div>
          </div>
          {data?.by_day?.length ? (
            <div className="columns" role="img" aria-label="Questions per day">
              {data.by_day.map((d, i) => (
                <div
                  key={d.day}
                  className="columns__col"
                  title={`${displayDate(d.day)}: ${d.questions} questions, ${d.tokens} tokens`}
                >
                  <span className="columns__value">{d.questions}</span>
                  <span className="columns__bar" style={{ height: `${(d.questions / peak) * 100}%`, "--i": i }} />
                  <span className="columns__label">{displayDate(d.day).split(" ").slice(0, 2).join(" ")}</span>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon="assistant" title="No questions yet">
              Usage appears here once people start asking the assistant.
            </EmptyState>
          )}
        </div>

        <div className="card">
          <div className="card__head">
            <div>
              <h2>Tools the assistant used</h2>
              <p>Where its answers come from</p>
            </div>
          </div>
          {data?.tools?.length ? (
            <ul className="bars">
              {data.tools.map((x, i) => (
                <li
                  key={x.tool}
                  style={{ "--i": i }}
                  title={`${x.calls} calls, ${x.errors} errors, ${x.avg_ms} ms average`}
                >
                  <span className="bars__label">{TOOL_LABEL[x.tool] ?? x.tool}</span>
                  <span className="bars__track">
                    <span
                      className={`bars__fill ${x.errors ? "is-low" : ""}`}
                      style={{ width: `${(x.calls / maxCalls) * 100}%` }}
                    />
                  </span>
                  <span className="bars__value">{x.calls}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">No tool calls in this period.</p>
          )}
        </div>

        <div className="card">
          <div className="card__head">
            <h2>Who asks most</h2>
          </div>
          {data?.people?.length ? (
            <ul className="activity__list">
              {data.people.map((p) => (
                <li key={p.username}>
                  <Avatar name={p.username} size={38} />
                  <div>
                    <strong>{p.username}</strong>
                    <span>{p.role}</span>
                  </div>
                  <span className="badge info">{p.questions} questions</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">Nobody has asked yet.</p>
          )}
        </div>

        <div className="card">
          <div className="card__head">
            <div>
              <h2>Recent problems</h2>
              <p>Questions that failed or hit a limit</p>
            </div>
          </div>
          {data?.recent_problems?.length ? (
            <ul className="activity__list">
              {data.recent_problems.map((r) => (
                <li key={r.id}>
                  <span className={`badge ${r.status === "failed" ? "danger" : "warning"}`}>
                    {r.status === "failed" ? "Failed" : "Limit"}
                  </span>
                  <div>
                    <strong>{r.username}</strong>
                    <span>{r.error || "Stopped at a step or token limit"}</span>
                  </div>
                  <time>{timeAgo(r.started_at)}</time>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState icon="approvals" title="No problems">
              Every question in this period was answered.
            </EmptyState>
          )}
        </div>
      </div>
    </section>
  );
}
