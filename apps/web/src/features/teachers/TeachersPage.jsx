import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useCurriculum, useTeachers } from "../../api/queries.js";
import { fullName } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";

const teacherThemes = ["teacher-theme-blue", "teacher-theme-rose"];
const emptyTeacher = { first_name: "", last_name: "", subject: "", phone: "", email: "" };

export default function TeachersPage() {
  const { can } = useAuth();
  const { data: teachers = [] } = useTeachers();
  const { data: curriculum = [] } = useCurriculum();
  const subjects = [...new Set(curriculum.map((c) => c.subject).filter(Boolean))];
  const [form, setForm] = useState(emptyTeacher);

  const create = useApiMutation((values) => api.post("/teachers", values), {
    invalidate: [keys.teachers],
    success: (t) => `Added ${fullName(t)}`,
  });

  const field = (name) => ({ value: form[name], onChange: (e) => setForm((p) => ({ ...p, [name]: e.target.value })) });

  const submit = (event) => {
    event.preventDefault();
    create.mutate(form, { onSuccess: () => setForm(emptyTeacher) });
  };

  return (
    <section className="section active">
      <PageHeader title="Teachers" subtitle="Staff directory and subjects." />
      {can("teachers:write") && (
        <div className="card form-card">
          <div className="card__title">
            <h4>Quick Add Teacher</h4>
            <span className="ai-pill">Basic Info</span>
          </div>
          <form className="form-row" onSubmit={submit}>
            <input type="text" placeholder="First name" required {...field("first_name")} />
            <input type="text" placeholder="Last name" required {...field("last_name")} />
            <input type="text" placeholder="Subject" list="teacher-subjects" {...field("subject")} />
            <datalist id="teacher-subjects">
              {subjects.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <input type="text" placeholder="Phone" {...field("phone")} />
            <input type="email" placeholder="Email" {...field("email")} />
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save Teacher"}
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="grid-2">
        {teachers.length === 0 && <div className="card empty-card">Add teachers to see them here.</div>}
        {teachers.map((teacher, index) => (
          <div className={`card teacher-card ${teacherThemes[index % teacherThemes.length]}`} key={teacher.id}>
            <div className="teacher-header">
              <div className="teacher-avatar">
                {teacher.first_name?.[0]}
                {teacher.last_name?.[0]}
              </div>
              <div>
                <h4>{fullName(teacher)}</h4>
                <p className="teacher-meta">{teacher.subject || "No subject set"}</p>
              </div>
            </div>
            <div className="tag-row">
              {teacher.phone && <span className="badge info">{teacher.phone}</span>}
              {teacher.email && <span className="badge primary">{teacher.email}</span>}
              {!teacher.phone && !teacher.email && <span className="muted">No contact details</span>}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
