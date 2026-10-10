import { useEffect, useState } from "react";

export const emptyStudent = {
  first_name: "",
  last_name: "",
  roll_number: "",
  date_of_birth: "",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
  classroom_id: "",
};

/** Create/edit form. `initial` switches it to edit mode; `onSubmit(values)` returns a promise. */
export default function StudentForm({ classrooms, initial, saving, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial || emptyStudent);
  useEffect(() => setForm(initial || emptyStudent), [initial]);

  const field = (name) => ({
    value: form[name] ?? "",
    onChange: (event) => setForm((prev) => ({ ...prev, [name]: event.target.value })),
  });

  const submit = async (event) => {
    event.preventDefault();
    const ok = await onSubmit(form);
    if (ok && !initial) setForm(emptyStudent);
  };

  return (
    <div className="card form-card">
      <div className="card__title">
        <h4>{initial ? "Edit Student" : "Quick Add Student"}</h4>
        <span className="ai-pill">Basic Info</span>
      </div>
      <form className="form-row" onSubmit={submit}>
        <input type="text" placeholder="First name" required {...field("first_name")} />
        <input type="text" placeholder="Last name" required {...field("last_name")} />
        <input type="text" placeholder="Roll number" {...field("roll_number")} />
        <input type="date" placeholder="Date of birth" {...field("date_of_birth")} />
        <select required {...field("classroom_id")}>
          <option value="">Select class</option>
          {classrooms.map((room) => (
            <option key={room.id} value={room.id}>
              {room.name} {room.section ? `• ${room.section}` : ""}
            </option>
          ))}
        </select>
        <input type="text" placeholder="Guardian name" {...field("guardian_name")} />
        <input type="text" placeholder="Guardian phone" {...field("guardian_phone")} />
        <input type="email" placeholder="Guardian email (for reminders)" {...field("guardian_email")} />
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : initial ? "Update Student" : "Save Student"}
          </button>
          {initial && (
            <button type="button" className="btn ghost" onClick={onCancel}>
              Cancel
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
