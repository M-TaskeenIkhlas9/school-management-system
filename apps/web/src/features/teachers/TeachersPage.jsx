import { useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useCurriculum, useTeachers } from "../../api/queries.js";
import { fullName } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import Avatar from "../../components/Avatar.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import CountUp from "../../components/CountUp.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import InlineEditor from "../../components/InlineEditor.jsx";
import Icon from "../../app/Icon.jsx";

const emptyTeacher = { first_name: "", last_name: "", subject: "", phone: "", email: "" };

export default function TeachersPage() {
  const { can } = useAuth();
  const { data: teachers = [] } = useTeachers();
  const { data: curriculum = [] } = useCurriculum();
  const subjects = [...new Set(curriculum.map((c) => c.subject).filter(Boolean))];
  const [form, setForm] = useState(emptyTeacher);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const canWrite = can("teachers:write");
  const saveTeacher = useApiMutation(({ id, ...values }) => api.put(`/teachers/${id}`, values), {
    invalidate: [keys.teachers],
    success: (t) => `Saved ${fullName(t)}`,
  });
  const removeTeacher = useApiMutation((id) => api.del(`/teachers/${id}`), {
    invalidate: [keys.teachers],
    success: "Teacher removed",
  });

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
      <PageHeader
        icon="teachers"
        tone="violet"
        title="Teachers"
        subtitle="The staff list, with each teacher's subject and how to reach them."
      >
        {can("teachers:write") && !open && (
          <button type="button" className="btn primary" onClick={() => setOpen(true)}>
            Add a teacher
          </button>
        )}
      </PageHeader>
      <StatRow>
        <StatCard tone="violet" icon="teachers" label="Teachers">
          <CountUp value={teachers.length} />
        </StatCard>
        <StatCard tone="blue" icon="book" label="Subjects taught">
          <CountUp value={new Set(teachers.map((t) => t.subject).filter(Boolean)).size} />
        </StatCard>
        <StatCard tone="green" icon="message" label="Reachable" note="with a phone or email">
          <CountUp value={teachers.filter((t) => t.phone || t.email).length} />
        </StatCard>
      </StatRow>

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
        {teachers.length === 0 && (
          <div className="card span-all">
            <EmptyState icon="teachers" title="No teachers yet">
              Add the staff list to assign classes and create their accounts.
            </EmptyState>
          </div>
        )}
        {teachers.map((teacher) => (
          <article className="card teacher-card" key={teacher.id}>
            {editingId === teacher.id ? (
              <InlineEditor
                fields={[
                  { name: "first_name", label: "First name", required: true },
                  { name: "last_name", label: "Last name", required: true },
                  { name: "subject", label: "Subject" },
                  { name: "phone", label: "Phone", type: "tel" },
                  { name: "email", label: "Email", type: "email" },
                ]}
                initial={teacher}
                saving={saveTeacher.isPending}
                onCancel={() => setEditingId(null)}
                onSave={(values) =>
                  saveTeacher.mutate({ id: teacher.id, ...values }, { onSuccess: () => setEditingId(null) })
                }
              />
            ) : (
              <>
                <div className="teacher-header">
                  <Avatar name={fullName(teacher)} size={46} />
                  <div>
                    <h2>{fullName(teacher)}</h2>
                    {teacher.subject ? (
                      <span className="badge info">{teacher.subject}</span>
                    ) : (
                      <p className="teacher-meta">No subject set</p>
                    )}
                  </div>
                </div>
                <dl className="teacher-contact">
                  <dt>Phone</dt>
                  <dd>{teacher.phone || <span className="muted">—</span>}</dd>
                  <dt>Email</dt>
                  <dd>{teacher.email || <span className="muted">—</span>}</dd>
                </dl>
                {canWrite && (
                  <div className="card-actions">
                    <button type="button" className="btn ghost small" onClick={() => setEditingId(teacher.id)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="icon-btn-danger"
                      aria-label={`Remove ${fullName(teacher)}`}
                      title="Remove (left the school)"
                      onClick={() =>
                        window.confirm(`Remove ${fullName(teacher)} from the staff list?`) &&
                        removeTeacher.mutate(teacher.id)
                      }
                    >
                      <Icon name="trash" size={16} />
                    </button>
                  </div>
                )}
              </>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
