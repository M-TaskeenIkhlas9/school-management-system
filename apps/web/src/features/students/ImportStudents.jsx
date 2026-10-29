import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { keys } from "../../api/queries.js";
import Drawer from "../../components/Drawer.jsx";
import { useToast } from "../../components/Toast.jsx";
import { TEMPLATE_CSV, parseCsv } from "../../lib/csv.js";
import Icon from "../../app/Icon.jsx";

/** Add many students from an Excel/Google Sheets file saved as CSV. */
export default function ImportStudents({ onClose }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [rows, setRows] = useState(null);
  const [fileName, setFileName] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState(null);

  const read = async (file) => {
    if (!file) return;
    setOutcome(null);
    setFileName(file.name);
    try {
      const parsed = parseCsv(await file.text());
      setRows(parsed);
      if (!parsed.length) toast.error("That file has no student rows.");
    } catch {
      toast.error("Couldn't read that file. Save the sheet as CSV and try again.");
    }
  };

  const template = () => {
    const url = URL.createObjectURL(new Blob([TEMPLATE_CSV], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "students-template.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const importRows = async () => {
    setBusy(true);
    try {
      const r = await api.post("/students/import", { rows });
      setOutcome(r);
      toast.success(`Added ${r.added} students${r.failed ? `; ${r.failed} need fixing` : ""}`);
      queryClient.invalidateQueries({ queryKey: keys.students });
      queryClient.invalidateQueries({ queryKey: keys.dashboard });
    } catch (err) {
      if (err.status === 400 && err.message) toast.error(err.message);
      else toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  const missingName = rows?.filter((r) => !r.first_name || !r.last_name).length ?? 0;

  return (
    <Drawer title="Import students" onClose={onClose}>
      <div className="import">
        <h2>Import students</h2>
        <ol className="import__steps">
          <li>
            Put your students in Excel or Google Sheets with columns like <strong>Name</strong>,{" "}
            <strong>Surname</strong>, <strong>Roll No</strong>, <strong>Class</strong>, <strong>Father Name</strong>,{" "}
            <strong>Mobile</strong>.{" "}
            <button type="button" className="btn link" onClick={template}>
              Download a template
            </button>
          </li>
          <li>
            Save it as <strong>CSV</strong> (File → Save as / Download → CSV).
          </li>
          <li>Choose the file below. Class names must match the classes in the school (e.g. “Class 5”).</li>
        </ol>

        <label className="import__drop">
          <Icon name="exams" size={26} />
          <span>{fileName || "Choose a CSV file"}</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => read(e.target.files?.[0])} />
        </label>

        {rows?.length > 0 && !outcome && (
          <>
            <p>
              <strong>{rows.length}</strong> students found
              {missingName ? (
                <span className="danger-text"> · {missingName} without a full name will be skipped</span>
              ) : (
                ""
              )}
              .
            </p>
            <div className="table-card card import__preview">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Roll no.</th>
                    <th>Class</th>
                    <th>Parent</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(0, 6).map((r, i) => (
                    <tr key={i}>
                      <td>
                        {r.first_name} {r.last_name}
                      </td>
                      <td>{r.roll_number || "—"}</td>
                      <td>{r.class || "—"}</td>
                      <td>
                        {r.guardian_name || "—"}
                        {r.guardian_phone ? <div className="muted">{r.guardian_phone}</div> : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rows.length > 6 && <p className="muted">…and {rows.length - 6} more.</p>}
            <div className="form-actions">
              <button type="button" className="btn primary btn--lg" disabled={busy} onClick={importRows}>
                {busy ? "Importing…" : `Import ${rows.length} students`}
              </button>
            </div>
          </>
        )}

        {outcome && (
          <div className="import__result">
            <p>
              <strong className="text-ok">{outcome.added} added</strong>
              {outcome.failed ? (
                <>
                  {" · "}
                  <strong className="danger-text">{outcome.failed} not added</strong> — fix these rows in your sheet and
                  import just them again:
                </>
              ) : (
                " — all done."
              )}
            </p>
            {outcome.failed > 0 && (
              <ul>
                {outcome.results
                  .filter((r) => !r.ok)
                  .map((r) => (
                    <li key={r.row}>
                      <strong>Row {r.row}</strong> — {r.error}
                    </li>
                  ))}
              </ul>
            )}
            <div className="form-actions">
              <button type="button" className="btn primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </Drawer>
  );
}
