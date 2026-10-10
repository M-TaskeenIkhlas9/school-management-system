import { useEffect, useState } from "react";
import { assistantApi } from "./api.js";

const STATUS_BADGE = { ok: "success", error: "warning", denied: "danger" };

/** Every model and tool step of one run: what was called, outcome, time and tokens. */
export default function RunTrace({ runId }) {
  const [run, setRun] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    assistantApi
      .getRun(runId)
      .then(setRun)
      .catch((err) => setError(err.message));
  }, [runId]);

  if (error) return <div className="trace muted">{error}</div>;
  if (!run) return <div className="trace muted">Loading steps…</div>;
  return (
    <div className="trace">
      <div className="trace__summary">
        {run.status} · {run.step_count} steps · {run.input_tokens + run.output_tokens} tokens · {run.model}
      </div>
      <ol className="trace__steps">
        {run.steps.map((s) => (
          <li key={s.id}>
            <span className={`badge ${STATUS_BADGE[s.status] ?? "info"}`}>{s.status}</span>{" "}
            {s.type === "model" ? (
              <span>
                Model{s.output?.tool_calls?.length ? ` asked for ${s.output.tool_calls.join(", ")}` : " answered"}
              </span>
            ) : (
              <span>
                Tool <code>{s.tool_name}</code>
                {s.error ? <span className="muted"> — {s.error}</span> : null}
              </span>
            )}
            <span className="muted">
              {" "}
              · {s.duration_ms ?? 0} ms
              {s.type === "model" ? ` · ${(s.input_tokens ?? 0) + (s.output_tokens ?? 0)} tokens` : ""}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
