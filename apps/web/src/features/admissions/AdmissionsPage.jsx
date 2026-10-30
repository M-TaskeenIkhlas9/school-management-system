import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { keys } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { displayDate } from "../../lib/format.js";
import { useToast } from "../../components/Toast.jsx";
import PageHeader from "../../components/PageHeader.jsx";
import Segmented from "../../components/Segmented.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Avatar from "../../components/Avatar.jsx";
import { CertificateDrawer } from "./Leaving.jsx";

const STATUS_LABEL = { active: "On rolls", left: "Left", passed_out: "Passed out" };
const STATUS_BADGE = { active: "success", left: "neutral", passed_out: "info" };
const roomLabel = (c) => (c.section ? `${c.name} (${c.section})` : c.name);

function useRefreshAdmissions() {
  const queryClient = useQueryClient();
  return () => {
    for (const key of [keys.students, keys.dashboard, ["admissions"]]) queryClient.invalidateQueries({ queryKey: key });
  };
}

/** The General Register: every student admitted, by GR number. Former students can be reprinted or taken back. */
function GeneralRegister({ classrooms }) {
  const toast = useToast();
  const refresh = useRefreshAdmissions();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [certificateFor, setCertificateFor] = useState(null);
  const [readmitting, setReadmitting] = useState(null); // { id, classroom_id }
  const params = new URLSearchParams({ ...(q.trim() ? { q: q.trim() } : {}), ...(status ? { status } : {}) });
  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["admissions", "register", q.trim(), status],
    queryFn: () => api.get(`/admissions/register?${params}`),
  });

  const readmit = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/admissions/${readmitting.id}/readmit`, { classroom_id: Number(readmitting.classroom_id) });
      toast.success("Taken back on the rolls");
      setReadmitting(null);
      refresh();
    } catch (err) {
      toast.error(err.message);
    }
  };

  return (
    <div className="card table-card">
      <div className="toolbar">
        <input
          type="search"
          className="toolbar__search"
          placeholder="Name, GR number or father's name"
          aria-label="Search the register"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <Segmented
          label="Who"
          options={[
            ["", "Everyone"],
            ["current", "On rolls"],
            ["former", "Left"],
          ]}
          value={status}
          onChange={setStatus}
        />
      </div>
      {!isLoading && rows.length === 0 ? (
        <EmptyState icon="students" title="No one in the register matches">
          Try another name or GR number.
        </EmptyState>
      ) : (
        <table>
          <thead>
            <tr>
              <th>GR no.</th>
              <th>Student</th>
              <th>Admitted</th>
              <th>Class</th>
              <th>Status</th>
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.id}>
                <td>
                  <strong>{s.gr_number || "—"}</strong>
                </td>
                <td>
                  <div className="student-cell">
                    <Avatar name={s.name} size={34} />
                    <div>
                      <div className="student-name">{s.name}</div>
                      <div className="student-meta">
                        {s.father_name ? `Father: ${s.father_name}` : "Father's name not given"}
                      </div>
                    </div>
                  </div>
                </td>
                <td>
                  {s.admission_date ? displayDate(s.admission_date) : "—"}
                  {s.admission_class && <div className="student-meta">in {s.admission_class}</div>}
                </td>
                <td>
                  {s.status === "active" ? (s.current_class ?? "—") : (s.leaving_class ?? "—")}
                  {s.left_on && <div className="student-meta">left {displayDate(s.left_on)}</div>}
                </td>
                <td>
                  <span className={`badge ${STATUS_BADGE[s.status] ?? "neutral"}`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </td>
                <td>
                  {s.status !== "active" && (
                    <div className="row-actions">
                      <button type="button" className="btn link" onClick={() => setCertificateFor(s.id)}>
                        Certificate
                      </button>
                      {readmitting?.id === s.id ? (
                        <form className="inline-form" onSubmit={readmit}>
                          <select
                            required
                            aria-label="Class to rejoin"
                            value={readmitting.classroom_id}
                            onChange={(e) => setReadmitting({ id: s.id, classroom_id: e.target.value })}
                          >
                            <option value="">Class…</option>
                            {classrooms.map((c) => (
                              <option key={c.id} value={c.id}>
                                {roomLabel(c)}
                              </option>
                            ))}
                          </select>
                          <button type="submit" className="btn primary small">
                            Take back
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={() => setReadmitting({ id: s.id, classroom_id: "" })}
                        >
                          Take back
                        </button>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {certificateFor && <CertificateDrawer studentId={certificateFor} onClose={() => setCertificateFor(null)} />}
    </div>
  );
}

/** Year-end promotion, one class at a time: promote, keep back, or mark as left. */
function Promotion({ classrooms }) {
  const toast = useToast();
  const refresh = useRefreshAdmissions();
  const [fromId, setFromId] = useState("");
  const [toId, setToId] = useState("");
  const [choices, setChoices] = useState({}); // student id → promote | retain | leave (overrides the suggestion)
  const [busy, setBusy] = useState(false);
  const { data: list = [], isFetching } = useQuery({
    queryKey: ["admissions", "promotion", fromId],
    queryFn: () => api.get(`/admissions/promotion?classroom_id=${fromId}`),
    enabled: Boolean(fromId),
  });
  const choiceOf = (s) => choices[s.id] ?? s.suggestion;
  const passOut = toId === "out";
  const count = (c) => list.filter((s) => choiceOf(s) === c).length;

  const submit = async () => {
    const from = classrooms.find((c) => String(c.id) === fromId);
    const to = classrooms.find((c) => String(c.id) === toId);
    const what = passOut ? "pass out of school" : `move up to ${to ? roomLabel(to) : "?"}`;
    if (!window.confirm(`${count("promote")} students of ${roomLabel(from)} will ${what}. Continue?`)) return;
    setBusy(true);
    try {
      const r = await api.post("/admissions/promotion", {
        from_classroom_id: Number(fromId),
        ...(passOut ? {} : { to_classroom_id: Number(toId) }),
        decisions: Object.fromEntries(list.map((s) => [s.id, choiceOf(s)])),
      });
      toast.success(
        [
          r.promoted && `${r.promoted} promoted`,
          r.passed_out && `${r.passed_out} passed out`,
          r.retained && `${r.retained} kept back`,
          r.left && `${r.left} left`,
        ]
          .filter(Boolean)
          .join(", ")
      );
      setChoices({});
      setFromId("");
      setToId("");
      refresh();
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card">
      <div className="card__head">
        <div>
          <h2>Year-end promotion</h2>
          <p>
            Start with the highest class, so each class moves up into an empty room. Students who failed their last
            result are suggested to be kept back; you can change any choice.
          </p>
        </div>
      </div>
      <div className="form-row">
        <label>
          Class
          <select
            value={fromId}
            onChange={(e) => {
              setFromId(e.target.value);
              setChoices({});
            }}
          >
            <option value="">Choose a class…</option>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {roomLabel(c)}
              </option>
            ))}
          </select>
        </label>
        <label>
          Promote to
          <select value={toId} onChange={(e) => setToId(e.target.value)} disabled={!fromId}>
            <option value="">Choose…</option>
            {classrooms
              .filter((c) => String(c.id) !== fromId)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {roomLabel(c)}
                </option>
              ))}
            <option value="out">Pass out of school (final class)</option>
          </select>
        </label>
      </div>

      {fromId &&
        (list.length === 0 && !isFetching ? (
          <EmptyState icon="students" title="No students in this class">
            Choose another class.
          </EmptyState>
        ) : (
          <>
            <ul className="promote-list">
              {list.map((s) => (
                <li key={s.id}>
                  <Avatar name={s.name} size={32} />
                  <span className="family__who">
                    <strong>{s.name}</strong>
                    <span className="muted">
                      {[s.gr_number && `GR ${s.gr_number}`, s.roll_number && `Roll ${s.roll_number}`]
                        .filter(Boolean)
                        .join(" · ")}
                      {" · "}
                      {s.result ? (
                        <span className={s.result.passed ? "text-ok" : "text-danger"}>
                          {s.result.term}: {s.result.percentage}% {s.result.passed ? "passed" : "failed"}
                        </span>
                      ) : (
                        "no result yet"
                      )}
                    </span>
                  </span>
                  <Segmented
                    label={`Choice for ${s.name}`}
                    options={[
                      ["promote", passOut ? "Pass out" : "Promote"],
                      ["retain", "Keep back"],
                      ["leave", "Left"],
                    ]}
                    value={choiceOf(s)}
                    onChange={(c) => setChoices((m) => ({ ...m, [s.id]: c }))}
                  />
                </li>
              ))}
            </ul>
            <div className="form-actions promote-actions">
              <button type="button" className="btn primary btn--lg" disabled={busy || !toId} onClick={submit}>
                {busy
                  ? "Saving…"
                  : `${passOut ? "Pass out" : "Promote"} ${count("promote")} · keep back ${count("retain")}` +
                    (count("leave") ? ` · ${count("leave")} left` : "")}
              </button>
              {!toId && <span className="muted">Choose where the class moves to.</span>}
            </div>
          </>
        ))}
    </div>
  );
}

export default function AdmissionsPage() {
  const { classrooms } = useLookups();
  const [tab, setTab] = useState("register");
  return (
    <section className="section">
      <PageHeader
        icon="book"
        tone="violet"
        title="Admissions"
        subtitle="The General Register of every student admitted, leaving certificates, and promotion at the end of the year."
      >
        <Segmented
          label="View"
          options={[
            ["register", "General register"],
            ["promotion", "Year-end promotion"],
          ]}
          value={tab}
          onChange={setTab}
        />
      </PageHeader>
      {tab === "register" ? <GeneralRegister classrooms={classrooms} /> : <Promotion classrooms={classrooms} />}
    </section>
  );
}
