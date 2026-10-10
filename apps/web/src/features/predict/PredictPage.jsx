import { useState } from "react";
import { api } from "../../api/client.js";
import { useStudents } from "../../api/queries.js";
import { fullName } from "../../lib/format.js";
import { useToast } from "../../components/Toast.jsx";
import PageHeader from "../../components/PageHeader.jsx";

function Contributions({ result }) {
  return (
    <div className="xai-waterfall">
      <p className="xai-summary">
        {result.student_name} — Risk: {(result.risk_score * 100).toFixed(1)}% ({result.prediction})
      </p>
      <div className="xai-bars">
        {(result.contributions || []).map((c) => {
          const tone = c.shap_value >= 0 ? "positive" : "negative";
          return (
            <div key={c.feature} className="xai-bar-row">
              <span className="xai-bar-label">{c.feature}</span>
              <div className="xai-bar-track">
                <div className={`xai-bar-fill ${tone}`} style={{ width: `${Math.min(100, Math.abs(c.shap_value) * 150)}%` }} />
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
    <section className="section active">
      <PageHeader
        title="Predict & XAI"
        subtitle="Risk prediction with explainable feature contributions. Pick a student or try custom values."
      />
      <div className="grid-2 predict-xai-grid">
        <div className="card">
          <div className="card__title">
            <h4>Existing Student</h4>
          </div>
          <div className="form-row">
            <select value={studentId} onChange={(e) => setStudentId(e.target.value)}>
              <option value="">Select a student...</option>
              {students.map((s) => (
                <option key={s.id} value={s.id}>
                  {fullName(s)}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="btn primary"
              disabled={!studentId || loading}
              onClick={() => run(() => api.get(`/predict/explain/${studentId}`))}
            >
              {loading ? "Loading..." : "Explain"}
            </button>
          </div>
        </div>
        <div className="card">
          <div className="card__title">
            <h4>What-if (custom values)</h4>
          </div>
          <form
            className="form-row"
            onSubmit={(e) => {
              e.preventDefault();
              run(() => api.post("/predict/explain/custom", custom));
            }}
          >
            <input
              type="number"
              placeholder="Attendance % (0-100)"
              min="0"
              max="100"
              value={custom.attendance_rate}
              onChange={(e) => setCustom((p) => ({ ...p, attendance_rate: e.target.value }))}
            />
            <input
              type="number"
              placeholder="Average score % (0-100)"
              min="0"
              max="100"
              value={custom.average_score}
              onChange={(e) => setCustom((p) => ({ ...p, average_score: e.target.value }))}
            />
            <select value={custom.fee_status} onChange={(e) => setCustom((p) => ({ ...p, fee_status: e.target.value }))}>
              <option value="Clear">Fee Clear</option>
              <option value="Pending">Fee Pending</option>
            </select>
            <button type="submit" className="btn primary" disabled={loading}>
              {loading ? "Predicting..." : "Predict"}
            </button>
          </form>
        </div>
        <div className="card span-2 xai-chart-card">
          <div className="card__title">
            <h4>Feature Contributions</h4>
            <span className="ai-pill success">{result?.prediction || "—"}</span>
          </div>
          {result ? (
            <Contributions result={result} />
          ) : (
            !loading && <p className="muted">Select a student and click Explain, or enter custom values and Predict.</p>
          )}
        </div>
      </div>
    </section>
  );
}
