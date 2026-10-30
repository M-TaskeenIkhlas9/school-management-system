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
  // Admission form
  gr_number: "",
  admission_date: "",
  gender: "",
  b_form: "",
  father_name: "",
  father_cnic: "",
  religion: "",
  address: "",
  previous_school: "",
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
        <h2>{initial ? `Edit ${initial.first_name} ${initial.last_name}` : "Add a student"}</h2>
      </div>
      <form className="form-row" onSubmit={submit}>
        <label>
          First name
          <input type="text" required autoFocus {...field("first_name")} />
        </label>
        <label>
          Last name
          <input type="text" required {...field("last_name")} />
        </label>
        <label>
          Roll number <span className="label-hint">optional</span>
          <input type="text" {...field("roll_number")} />
        </label>
        <label>
          Date of birth <span className="label-hint">optional</span>
          <input type="date" {...field("date_of_birth")} />
        </label>
        <label>
          Class
          <select required {...field("classroom_id")}>
            <option value="">Choose a class…</option>
            {classrooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.section ? ` • ${room.section}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Parent or guardian
          <input type="text" {...field("guardian_name")} />
        </label>
        <label>
          Their phone
          <input type="tel" placeholder="0300 1234567" {...field("guardian_phone")} />
        </label>
        <label>
          Their email
          <input type="email" {...field("guardian_email")} />
        </label>
        <h3 className="form-row__heading">Admission details</h3>
        <label>
          GR number <span className="label-hint">{initial ? "" : "empty: next in the register"}</span>
          <input type="text" maxLength={30} {...field("gr_number")} />
        </label>
        <label>
          Admission date <span className="label-hint">{initial ? "" : "empty: today"}</span>
          <input type="date" {...field("admission_date")} />
        </label>
        <label>
          Gender
          <select {...field("gender")}>
            <option value="">—</option>
            <option value="male">Boy</option>
            <option value="female">Girl</option>
          </select>
        </label>
        <label>
          B-Form number
          <input type="text" inputMode="numeric" placeholder="35202-1234567-1" {...field("b_form")} />
        </label>
        <label>
          Father&apos;s name
          <input type="text" maxLength={150} {...field("father_name")} />
        </label>
        <label>
          Father&apos;s CNIC
          <input type="text" inputMode="numeric" placeholder="35202-1234567-1" {...field("father_cnic")} />
        </label>
        <label>
          Religion
          <input type="text" maxLength={50} {...field("religion")} />
        </label>
        <label>
          Previous school <span className="label-hint">optional</span>
          <input type="text" maxLength={150} {...field("previous_school")} />
        </label>
        <label className="form-row__wide">
          Home address
          <input type="text" maxLength={255} {...field("address")} />
        </label>
        <div className="form-actions">
          <button type="submit" className="btn primary" disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Add student"}
          </button>
          <button type="button" className="btn ghost" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
