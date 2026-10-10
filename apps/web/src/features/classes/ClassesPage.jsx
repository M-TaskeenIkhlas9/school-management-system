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

  const create = useApiMutation((values) => api.post("/classrooms", values), {
    invalidate: [keys.classrooms],
    success: (c) => `Created ${c.name}`,
  });

  const field = (name) => ({ value: form[name], onChange: (e) => setForm((p) => ({ ...p, [name]: e.target.value })) });

  const submit = (event) => {
    event.preventDefault();
    create.mutate(form, { onSuccess: () => setForm(emptyClass) });
  };

  return (
    <section className="section active">
      <PageHeader title="Classes & Curriculum" subtitle="Map subjects, books, and AI-ready curriculum tags." />
      {can("classes:write") && (
        <div className="card form-card">
          <div className="card__title">
            <h4>Quick Add Class</h4>
            <span className="ai-pill">Structure</span>
          </div>
          <form className="form-row" onSubmit={submit}>
            <input type="text" placeholder="Class name (e.g., Grade 7B)" required {...field("name")} />
            <input type="text" placeholder="Grade" required {...field("grade")} />
            <input type="text" placeholder="Section" {...field("section")} />
            <div className="form-actions">
              <button type="submit" className="btn primary" disabled={create.isPending}>
                {create.isPending ? "Saving…" : "Save Class"}
              </button>
            </div>
          </form>
        </div>
      )}
      <div className="class-grid">
        {classrooms.length === 0 && <div className="card empty-card">Add classes to see them here.</div>}
        {classrooms.map((room) => {
          const subjects = curriculum.filter((c) => c.classroom_id === room.id).map((c) => c.subject);
          const studentCount = students.filter((st) => st.classroom_id === room.id).length;
          return (
            <div className="class-card" key={room.id}>
              <div className="class-header">
                <div>
                  <h4>{room.name}</h4>
                  <p>Subjects: {subjects.length ? subjects.join(", ") : "No curriculum yet"}</p>
                </div>
                <span className="class-count">{studentCount} students</span>
              </div>
              <div className="tag-row">
                <span className="badge primary">{subjects.length ? "Curriculum Tagged" : "Needs Curriculum"}</span>
                <span className="badge info">Grade {room.grade}</span>
                {room.section && <span className="badge warning">Section {room.section}</span>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
