import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useCurriculum, useTeachers } from "../../api/queries.js";
import { fullName } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import Avatar from "../../components/Avatar.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";

const emptyTeacher = { first_name: "", last_name: "", subject: "", phone: "", email: "" };

export default function TeachersPage() {
  const { can } = useAuth();
  const { data: teachers = [] } = useTeachers();
  const { data: curriculum = [] } = useCurriculum();
  const subjects = [...new Set(curriculum.map((c) => c.subject).filter(Boolean))];
  const [form, setForm] = useState(emptyTeacher);
  const [open, setOpen] = useState(false);

  const create = useApiMutation((values) => api.post("/teachers", values), {
    invalidate: [keys.teachers],
    success: (t) => `Added ${fullName(t)}`,
  });

  const field = (name) => ({ value: form[name], onChange: (e) => setForm((p) => ({ ...p, [name]: e.target.value })) });

  const submit = (event) => {
    event.preventDefault();
    create.mutate(form, {
      onSuccess: () => {
        setForm(emptyTeacher);
        setOpen(false);
      },
    });
  };

  return (
    <section className="section">
      <PageHeader title="Teachers" subtitle="The staff list, with each teacher's subject and how to reach them.">
        {can("teachers:write") && !open && (
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Add a teacher
          </button>
        )}
      </PageHeader>
      {can("teachers:write") && open && (
        <div className="card form-card">
          <div className="card__title">
            <h2>Add a teacher</h2>
            <span>To let them sign in, create their account under Users &amp; access.</span>
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
              Subject <span className="label-hint">optional</span>
              <input type="text" list="teacher-subjects" {...field("subject")} />
            </label>
            <datalist id="teacher-subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <label>
              Phone <span className="label-hint">optional</span>
              <input type="tel" {...field("phone")} />
            </label>
            <label>
              Email <span className="label-hint">optional</span>
              <input type="email" {...field("email")} />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save teacher"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="class-grid">
        {teachers.length === 0 && <div className="card empty-card">No teachers yet.</div>}
        {teachers.map((teacher) => (
          <article className="card teacher-card" key={teacher.id}>
            <div className="teacher-header">
              <Avatar name={fullName(teacher)} size={46} />
              <div>
                <h2>{fullName(teacher)}</h2>
                <p className="teacher-meta">{teacher.subject || "No subject set"}</p>
              </div>
            </div>
            <dl className="teacher-contact">
              <dt>Phone</dt>
              <dd>{teacher.phone || <span className="muted">—</span>}</dd>
              <dt>Email</dt>
              <dd>{teacher.email || <span className="muted">—</span>}</dd>
            </dl>
          </article>
        ))}
      </div>
    </section>
  );
}
