import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useClassrooms, useCurriculum, useStudents } from "../../api/queries.js";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";

const emptyClass = { name: "", grade: "", section: "" };

export default function ClassesPage() {
  const { can } = useAuth();
  const { data: classrooms = [] } = useClassrooms();
  const { data: curriculum = [] } = useCurriculum();
  const { data: students = [] } = useStudents();
  const [form, setForm] = useState(emptyClass);
  const [open, setOpen] = useState(false);

  const create = useApiMutation((values) => api.post("/classrooms", values), {
    invalidate: [keys.classrooms],
    success: (c) => `Created ${c.name}`,
  });

  const field = (name) => ({ value: form[name], onChange: (e) => setForm((p) => ({ ...p, [name]: e.target.value })) });

  const submit = (event) => {
    event.preventDefault();
    create.mutate(form, {
      onSuccess: () => {
        setForm(emptyClass);
        setOpen(false);
      },
    });
  };

  return (
    <section className="section">
      <PageHeader title="Classes" subtitle="Each class with its subjects and how many students are in it.">
        {can("classes:write") && !open && (
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Add a class
          </button>
        )}
      </PageHeader>
      {can("classes:write") && open && (
        <div className="card form-card">
          <div className="card__title">
            <h2>Add a class</h2>
          </div>
          <form className="form-row" onSubmit={submit}>
            <label>
              Name
              <input type="text" placeholder="Class 7" required autoFocus {...field("name")} />
            </label>
            <label>
              Grade
              <input type="text" placeholder="7" required {...field("grade")} />
            </label>
            <label>
              Section <span className="label-hint">optional</span>
              <input type="text" placeholder="B" {...field("section")} />
            </label>
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save class"}
              </button>
              <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="class-grid">
        {classrooms.length === 0 && <div className="card empty-card">No classes yet.</div>}
        {classrooms.map((room) => {
          const subjects = curriculum.filter((c) => c.classroom_id === room.id).map((c) => c.subject);
          const studentCount = students.filter((st) => st.classroom_id === room.id).length;
          return (
            <article className="class-card" key={room.id}>
              <div className="class-header">
                <div>
                  <h2>{room.name}</h2>
                  <p>
                    Grade {room.grade}
                    {room.section ? ` · Section ${room.section}` : ""}
                  </p>
                </div>
                <span className="class-count">
                  <strong>{studentCount}</strong> {studentCount === 1 ? "student" : "students"}
                </span>
              </div>
              {subjects.length ? (
                <div className="tag-row">
                  {subjects.map((s) => (
                    <span key={s} className="badge neutral">
                      {s}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="muted">No subjects added yet.</p>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
