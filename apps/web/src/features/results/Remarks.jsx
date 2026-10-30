import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { keys } from "../../api/queries.js";
import { useToast } from "../../components/Toast.jsx";
import Segmented from "../../components/Segmented.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Icon from "../../app/Icon.jsx";
import { ordinal, TERMS } from "./grades.js";

const NONE = [];

/**
 * Report-card remarks for a class and term. The AI drafts a remark for each student from their
 * own marks and attendance, in English or Urdu; the teacher reads, edits and saves. Nothing is
 * saved until the teacher presses Save.
 */
export default function Remarks({ classrooms, onDone }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState(classrooms[0] ? String(classrooms[0].id) : "");
  const [term, setTerm] = useState(TERMS[0]);
  const [language, setLanguage] = useState("en");
  const [texts, setTexts] = useState({}); // result id → remark being edited
  const [drafts, setDrafts] = useState({}); // result id → { text, source } from the last draft
  const [drafting, setDrafting] = useState(null); // "all" | result id
  const [busy, setBusy] = useState(false);

  const { data: rows = NONE, isFetching } = useQuery({
    queryKey: ["results", "remarks", classId, term],
    queryFn: () => api.get(`/results/remarks?classroom_id=${classId}&term=${encodeURIComponent(term)}`),
    enabled: Boolean(classId && term.trim()),
  });

  useEffect(() => {
    setTexts(Object.fromEntries(rows.map((r) => [r.result_id, r.remarks ?? ""])));
    setDrafts({});
  }, [rows]);

  const changed = rows.filter((r) => (texts[r.result_id] ?? "") !== (r.remarks ?? ""));
  const empty = rows.filter((r) => !(texts[r.result_id] ?? "").trim());

  const draft = async (resultIds, which) => {
    setDrafting(which);
    try {
      const res = await api.post("/results/remarks/draft", {
        classroom_id: Number(classId),
        term: term.trim(),
        language,
        result_ids: resultIds,
      });
      setTexts((t) => ({ ...t, ...Object.fromEntries(res.remarks.map((r) => [r.result_id, r.text])) }));
      setDrafts((d) => ({ ...d, ...Object.fromEntries(res.remarks.map((r) => [r.result_id, r])) }));
      if (res.notice) toast.error(res.notice);
      else toast.success(`Drafted ${res.remarks.length} remark(s). Read each one before saving.`);
    } catch (err) {
      toast.error(err.message);
    } finally {
      setDrafting(null);
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const r = await api.put("/results/remarks", {
        classroom_id: Number(classId),
        term: term.trim(),
        items: changed.map((row) => {
          const d = drafts[row.result_id];
          return {
            result_id: row.result_id,
            remarks: texts[row.result_id] ?? "",
            ...(d?.source === "ai" ? { ai_draft: d.text } : {}),
          };
        }),
      });
      toast.success(`Saved ${r.saved} remark(s)`);
      queryClient.invalidateQueries({ queryKey: keys.results });
      queryClient.invalidateQueries({ queryKey: ["results", "remarks"] });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card form-card">
      <div className="card__head">
        <div>
          <h2>Report-card remarks</h2>
          <p>
            The AI drafts a remark for each student from their own marks and attendance. Read and correct each one;
            nothing is saved until you press Save.
          </p>
        </div>
      </div>
      <div className="form-row">
        <label>
          Class
          <select value={classId} onChange={(e) => setClassId(e.target.value)}>
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.section ? ` • ${c.section}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Term or test
          <input list="remark-terms" value={term} onChange={(e) => setTerm(e.target.value)} required maxLength={50} />
          <datalist id="remark-terms">
            {TERMS.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </label>
        <div className="form-row__wide remarks-toolbar">
          <Segmented
            label="Language of the remarks"
            options={[
              ["en", "English"],
              ["ur", "اردو"],
            ]}
            value={language}
            onChange={setLanguage}
          />
          <button
            type="button"
            className="btn ghost"
            disabled={!rows.length || drafting !== null}
            onClick={() =>
              draft(
                (empty.length ? empty : rows).map((r) => r.result_id),
                "all"
              )
            }
          >
            <Icon name="sparkle" size={16} />
            {drafting === "all"
              ? "Drafting…"
              : empty.length && empty.length < rows.length
                ? `Draft the ${empty.length} empty remark(s)`
                : "Draft remarks for everyone"}
          </button>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState icon="results" title={isFetching ? "Loading…" : "No results for this class and term"}>
          Enter marks on the class result sheet first.
        </EmptyState>
      ) : (
        <ul className="remarks-list">
          {rows.map((r) => {
            const d = drafts[r.result_id];
            const text = texts[r.result_id] ?? "";
            return (
              <li key={r.result_id}>
                <div className="remarks-list__who">
                  <strong>{r.name}</strong>
                  <span className="muted">
                    {[
                      r.roll_number && `Roll ${r.roll_number}`,
                      `${r.percentage}% · ${r.grade}`,
                      r.position && `${ordinal(r.position)} of ${r.out_of}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {r.failed_subjects.length > 0 && (
                    <span className="text-danger">Failed: {r.failed_subjects.join(", ")}</span>
                  )}
                  {r.attendance_rate !== null && r.attendance_rate < 75 && (
                    <span className="text-danger">Attendance {r.attendance_rate}%</span>
                  )}
                </div>
                <div className="remarks-list__text">
                  <textarea
                    dir="auto"
                    lang={language === "ur" ? "ur" : undefined}
                    aria-label={`Remark for ${r.name}`}
                    maxLength={500}
                    value={text}
                    onChange={(e) => setTexts((t) => ({ ...t, [r.result_id]: e.target.value }))}
                  />
                  <div className="remarks-list__meta">
                    {d && (
                      <span className={`badge ${d.source === "ai" ? "info" : "neutral"} pill`}>
                        {d.source === "ai" ? "AI draft" : "Standard remark"}
                        {d.text !== text ? ", edited" : ""}
                      </span>
                    )}
                    <button
                      type="button"
                      className="btn link"
                      disabled={drafting !== null}
                      onClick={() => draft([r.result_id], r.result_id)}
                    >
                      {drafting === r.result_id ? "Drafting…" : text ? "Draft again" : "Draft"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="form-actions">
        <button type="button" className="btn primary" disabled={busy || !changed.length} onClick={save}>
          {busy ? "Saving…" : `Save remarks (${changed.length})`}
        </button>
        <button type="button" className="btn ghost" onClick={onDone}>
          Close
        </button>
      </div>
    </div>
  );
}
