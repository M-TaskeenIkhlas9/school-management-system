import { useState } from "react";
import { api } from "../../api/client.js";
import {
  keys,
  useApiMutation,
  useAttendanceSummary,
  useClassrooms,
  useCurriculum,
  useStudents,
} from "../../api/queries.js";
import PageHeader from "../../components/PageHeader.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import CountUp from "../../components/CountUp.jsx";

const TONES = ["blue", "violet", "green", "amber", "rose"];
import { useAuth } from "../../auth/AuthContext.jsx";
import InlineEditor from "../../components/InlineEditor.jsx";
import Icon from "../../app/Icon.jsx";

const emptyClass = { name: "", grade: "", section: "" };

export default function ClassesPage() {
  const { can } = useAuth();
  const { data: classrooms = [] } = useClassrooms();
  const { data: curriculum = [] } = useCurriculum();
  const { data: students = [] } = useStudents();
  const { data: attendance } = useAttendanceSummary({ enabled: can("attendance:read") });
  const rateOf = new Map((attendance?.by_class ?? []).map((c) => [c.classroom_id, c.rate]));
  const subjectCount = new Set(curriculum.map((c) => c.subject)).size;
  const [form, setForm] = useState(emptyClass);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const canWrite = can("classes:write");
  const saveClass = useApiMutation(({ id, ...values }) => api.put(`/classrooms/${id}`, values), {
    invalidate: [keys.classrooms, keys.students],
    success: (c) => `Saved ${c.name}`,
  });
  const removeClass = useApiMutation((id) => api.del(`/classrooms/${id}`), {
    invalidate: [keys.classrooms],
    success: "Class removed",
  });

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
      <PageHeader
        icon="classes"
        tone="green"
        title="Classes"
        subtitle="Each class with its subjects, students and attendance."
      >
        {can("classes:write") && !open && (
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Add a class
          </button>
        )}
      </PageHeader>
      <StatRow>
        <StatCard tone="green" icon="classes" label="Classes">
          <CountUp value={classrooms.length} />
        </StatCard>
        <StatCard tone="blue" icon="students" label="Students" note="enrolled across classes">
          <CountUp value={students.length} />
        </StatCard>
        <StatCard tone="violet" icon="students" label="Average class size">
          {classrooms.length ? (students.length / classrooms.length).toFixed(1) : "—"}
        </StatCard>
        <StatCard tone="amber" icon="book" label="Subjects" note="in the curriculum">
          <CountUp value={subjectCount} />
        </StatCard>
      </StatRow>

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
        {classrooms.length === 0 && (
          <div className="card span-all">
            <EmptyState icon="classes" title="No classes yet">
              Add a class to start enrolling students.
            </EmptyState>
          </div>
        )}
        {classrooms.map((room, index) => {
          const subjects = curriculum.filter((c) => c.classroom_id === room.id).map((c) => c.subject);
          const studentCount = students.filter((st) => st.classroom_id === room.id).length;
          return (
            <article className={`class-card class-card--${TONES[index % TONES.length]}`} key={room.id}>
              {editingId === room.id ? (
                <InlineEditor
                  fields={[
                    { name: "name", label: "Name", required: true },
                    { name: "grade", label: "Grade", required: true },
                    { name: "section", label: "Section" },
                  ]}
                  initial={room}
                  saving={saveClass.isPending}
                  onCancel={() => setEditingId(null)}
                  onSave={(values) =>
                    saveClass.mutate({ id: room.id, ...values }, { onSuccess: () => setEditingId(null) })
                  }
                />
              ) : (
                <>
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
                  {rateOf.has(room.id) && (
                    <div className="class-card__rate">
                      <span>Attendance</span>
                      <div className="meter">
                        <span className="meter__track">
                          <span
                            className={`meter__fill is-${rateOf.get(room.id) >= 85 ? "good" : rateOf.get(room.id) >= 75 ? "mid" : "low"}`}
                            style={{ width: `${rateOf.get(room.id)}%` }}
                          />
                        </span>
                        <strong>{rateOf.get(room.id)}%</strong>
                      </div>
                    </div>
                  )}
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
                  {canWrite && (
                    <div className="card-actions">
                      <button type="button" className="btn ghost small" onClick={() => setEditingId(room.id)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="icon-btn-danger"
                        aria-label={`Remove ${room.name}`}
                        title="Remove class"
                        onClick={() =>
                          window.confirm(
                            studentCount
                              ? `${room.name} still has ${studentCount} students. Remove it anyway? Move them to another class first if they are staying.`
                              : `Remove ${room.name}?`
                          ) && removeClass.mutate(room.id)
                        }
                      >
                        <Icon name="trash" size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
