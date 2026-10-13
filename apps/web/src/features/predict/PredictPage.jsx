import { useState } from "react";
import { api } from "../../api/client.js";
import { useStudents } from "../../api/queries.js";
import { fullName } from "../../lib/format.js";
import { useToast } from "../../components/Toast.jsx";
import PageHeader from "../../components/PageHeader.jsx";

function Contributions({ result }) {
  return (
    <div className="xai-waterfall">
      <div className="xai-head">
        <Gauge value={Math.round(result.risk_score * 100)} />
        <div>
          <p className="xai-summary">{result.student_name || "These figures"}</p>
          <span className={`badge ${result.risk_score >= 0.5 ? "danger" : "success"}`}>{result.prediction}</span>
        </div>
      </div>
      <div className="xai-bars">
        {(result.contributions || []).map((c) => {
          const tone = c.shap_value >= 0 ? "positive" : "negative";
          return (
            <div key={c.feature} className="xai-bar-row">
              <span className="xai-bar-label">{factorLabel(c.feature)}</span>
              <div className="xai-bar-track">
                <div
                  className={`xai-bar-fill ${tone}`}
                  style={{ width: `${Math.min(100, Math.abs(c.shap_value) * 150)}%` }}
                />
              </div>
              <span className={`xai-bar-value ${tone}`}>
                {c.shap_value >= 0 ? "+" : ""}
                {c.shap_value}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// "fee_status = Pending" → "Fees: Pending"
const FACTOR = { fee_status: "Fees", average_score: "Average mark", attendance_rate: "Attendance" };
const factorLabel = (feature) =>
  String(feature).replace(/^(\w+)\s*=\s*/, (_, key) => `${FACTOR[key] ?? key.replace(/_/g, " ")}: `);

/** A half-dial from 0 to 100% risk; the needle swings into place. */
function Gauge({ value }) {
  const tone = value >= 60 ? "high" : value >= 35 ? "mid" : "low";
  return (
    <div className={`gauge gauge--${tone}`} style={{ "--v": value }} role="img" aria-label={`${value}% risk`}>
      <svg viewBox="0 0 120 70" aria-hidden="true">
        <path d="M10 62a50 50 0 0 1 100 0" className="gauge__track" pathLength="100" />
        <path d="M10 62a50 50 0 0 1 100 0" className="gauge__value" pathLength="100" />
      </svg>
      <strong>{value}%</strong>
      <span>risk</span>
    </div>
  );
}

export default function PredictPage() {
  const toast = useToast();
  const { data: students = [] } = useStudents();
  const [studentId, setStudentId] = useState("");
  const [custom, setCustom] = useState({ attendance_rate: "", average_score: "", fee_status: "Clear" });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async (request) => {
    setLoading(true);
    setResult(null);
    try {
      setResult(await request());
    } catch (err) {
      toast.error(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="section">
      <PageHeader
        icon="predict"
        tone="rose"
        title="Risk predictions"
        subtitle="How likely a student is to fall behind, and which factors push the estimate up or down."
      />
      <div className="grid-2 predict-xai-grid">
        <div className="card">
          <div className="card__title">
            <h2>A student</h2>
          </div>
          <div className="form-row">
            <label>
              Student
              <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
                <option value="">Choose a student…</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fullName(s)}
                  </option>
                ))}
              </select>
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="btn primary"
                disabled={!studentId || loading}
                onClick={() => run(() => api.get(`/predict/explain/${studentId}`))}
              >
                {loading ? "Working…" : "Explain"}
              </button>
            </div>
          </div>
        </div>
        <div className="card">
          <div className="card__title">
            <h2>What if…</h2>
            <span>Try made-up figures</span>
          </div>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api.post("/predict/explain/custom", custom));
            }}
          >
            <label>
              Attendance %
              <input
                type="number"
                min="0"
                max="100"
                value={custom.attendance_rate}
                onChange={(e) => setCustom((p) => ({ ...p, attendance_rate: e.target.value }))}
              />
            </label>
            <label>
              Average mark %
              <input
                type="number"
                min="0"
                max="100"
                value={custom.average_score}
                onChange={(e) => setCustom((p) => ({ ...p, average_score: e.target.value }))}
              />
            </label>
            <label>
              Fees
              <select
                value={custom.fee_status}
                onChange={(e) => setCustom((p) => ({ ...p, fee_status: e.target.value }))}
              >
                <option value="Clear">Paid up</option>
                <option value="Pending">Behind</option>
              </select>
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={loading}>
                {loading ? "Working…" : "Estimate"}
              </button>
            </div>
          </form>
        </div>
        <div className="card span-2 xai-chart-card">
          <div className="card__title">
            <h2>What drives the estimate</h2>
            <span>Red pushes the risk up, green brings it down</span>
          </div>
          {result ? (
            <Contributions result={result} />
          ) : (
            !loading && <p className="muted">Choose a student and press Explain, or try figures under What if….</p>
          )}
        </div>
      </div>
    </section>
  );
}
