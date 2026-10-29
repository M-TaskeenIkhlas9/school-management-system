import { useState } from "react";

/** A compact edit form inside a card: fields = [{ name, label, type?, required? }]. */
export default function InlineEditor({ fields, initial, saving, onSave, onCancel }) {
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, initial[f.name] ?? ""])));
  return (
    <form
      className="inline-editor"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(values);
      }}
    >
      {fields.map((f, i) => (
        <label key={f.name} className="field-label">
          {f.label}
          <input
            type={f.type ?? "text"}
            required={f.required}
            autoFocus={i === 0}
            value={values[f.name]}
            onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
          />
        </label>
      ))}
      <div className="form-actions">
        <button type="submit" className="btn primary small" disabled={saving}>
          {saving ? "Saving…" : "Save changes"}
        </button>
        <button type="button" className="btn link" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
