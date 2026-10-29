import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useAttention } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { badgeClass, formatDate, fullName } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import StudentForm from "./StudentForm.jsx";
import StudentProfileCard from "./StudentProfileCard.jsx";
import Avatar from "../../components/Avatar.jsx";
import Icon from "../../app/Icon.jsx";
import ImportStudents from "./ImportStudents.jsx";
import StatCard, { StatRow } from "../../components/StatCard.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import CountUp from "../../components/CountUp.jsx";

export default function StudentsPage() {
  const { can } = useAuth();
  const canEdit = can("students:write");
  const canSeeFees = can("fees:read");
  const canSeeRisk = can("reports:read");
  const { students, classrooms, classIdOf, classLabelOf } = useLookups();
  const { data: attention } = useAttention({ enabled: canSeeRisk });

  const [params, setParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState(() => Number(params.get("id")) || null);

  // Opened from search (?id=): show that student, then tidy the address.
  useEffect(() => {
    const id = Number(params.get("id"));
    if (id) {
      setSelectedId(id);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  const [editing, setEditing] = useState(null); // student being edited
  const [adding, setAdding] = useState(false);
  const [importing, setImporting] = useState(false);
  const removeStudent = useApiMutation((id) => api.del(`/students/${id}`), {
    invalidate: [keys.students],
    success: "Student removed",
  });
  const [search, setSearch] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [feeFilter, setFeeFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState("");

  const feeStatusOf = (id) => students.find((s) => s.id === id)?.latest_fee_status ?? null;
  const riskOf = useMemo(() => {
    const flagged = new Set((attention?.students || []).map((s) => s.student_id));
    return (id) => (flagged.has(id) ? "High" : "Low");
  }, [attention]);

  const visible = students.filter((s) => {
    if (search && !fullName(s).toLowerCase().includes(search.toLowerCase())) return false;
    if (classFilter && String(classIdOf(s.id)) !== classFilter) return false;
    if (feeFilter && feeStatusOf(s.id) !== feeFilter) return false;
    if (riskFilter && riskOf(s.id) !== riskFilter) return false;
    return true;
  });

  const save = useApiMutation(
    ({ id, values }) => (id ? api.put(`/students/${id}`, values) : api.post("/students", values)),
    {
      invalidate: [keys.students],
      success: (student) => `Saved ${fullName(student)}`,
    }
  );

  const handleSubmit = async (values) => {
    try {
      const student = await save.mutateAsync({ id: editing?.id, values });
      setSelectedId(student.id);
      setEditing(null);
      setAdding(false);
      return true;
    } catch {
      return false; // error already shown as a toast
    }
  };

  const editInitial = useMemo(
    () =>
      editing && {
        first_name: editing.first_name || "",
        last_name: editing.last_name || "",
        roll_number: editing.roll_number || "",
        date_of_birth: formatDate(editing.date_of_birth) === "—" ? "" : formatDate(editing.date_of_birth),
        guardian_name: editing.guardian_name || "",
        guardian_phone: editing.guardian_phone || "",
        guardian_email: editing.guardian_email || "",
        classroom_id: classIdOf(editing.id) ? String(classIdOf(editing.id)) : "",
      },
    [editing, classIdOf]
  );

  return (
    <section className="section">
      <PageHeader
        icon="students"
        tone="blue"
        title="Students"
        subtitle="Find a student, see their class, parents and progress."
      >
        {canEdit && !adding && !editing && (
          <>
            <button type="button" className="btn ghost" onClick={() => setImporting(true)}>
              <Icon name="exams" size={18} /> Import from Excel
            </button>
            <button type="button" className="btn primary" onClick={() => setAdding(true)}>
              <Icon name="plus" size={18} strokeWidth={2} /> Add student
            </button>
          </>
        )}
      </PageHeader>

      <StatRow>
        <StatCard tone="blue" icon="students" label="Students" note={`in ${classrooms.length} classes`}>
          <CountUp value={students.length} />
        </StatCard>
        <StatCard tone="green" icon="message" label="Parents reachable" note="with an email or phone on file">
          <CountUp value={students.filter((s) => s.guardian_email || s.guardian_phone).length} />
        </StatCard>
        {canSeeFees && (
          <StatCard tone="amber" icon="fees" label="Behind on fees" note="pending or partly paid">
            <CountUp value={students.filter((s) => ["pending", "partial"].includes(s.latest_fee_status)).length} />
          </StatCard>
        )}
        {canSeeRisk && (
          <StatCard tone="rose" icon="predict" label="Flagged" note="low attendance or marks">
            <CountUp value={attention?.students?.length ?? 0} />
          </StatCard>
        )}
      </StatRow>

      {canEdit && (adding || editing) && (
        <StudentForm
          classrooms={classrooms}
          initial={editInitial}
          saving={save.isPending}
          onSubmit={handleSubmit}
          onCancel={() => {
            setEditing(null);
            setAdding(false);
          }}
        />
      )}

      <div className="card table-card">
        <div className="filters">
          <input
            type="search"
            placeholder="Search by name"
            aria-label="Search students"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)} aria-label="Class">
            <option value="">All classes</option>
            {classrooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} {room.section ? `• ${room.section}` : ""}
              </option>
            ))}
          </select>
          {canSeeFees && (
            <select value={feeFilter} onChange={(e) => setFeeFilter(e.target.value)} aria-label="Fee status">
              <option value="">Any fee status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
            </select>
          )}
          {canSeeRisk && (
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)} aria-label="Risk">
              <option value="">Any risk</option>
              <option value="High">High risk</option>
              <option value="Low">Low risk</option>
            </select>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Parent email</th>
              {canSeeFees && <th>Fees</th>}
              {canSeeRisk && <th>Risk</th>}
              {canEdit && <th aria-label="Actions" />}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3 + canSeeFees + canSeeRisk + canEdit}>
                  <EmptyState
                    icon="students"
                    title={students.length ? "No students match these filters" : "No students yet"}
                    action={
                      !students.length && canEdit ? (
                        <button type="button" className="btn primary small" onClick={() => setAdding(true)}>
                          Add student
                        </button>
                      ) : null
                    }
                  >
                    {students.length
                      ? "Try clearing a filter or searching another name."
                      : canEdit
                        ? "Add the first student to start their record."
                        : "No students are assigned to you yet."}
                  </EmptyState>
                </td>
              </tr>
            ) : (
              visible.map((student) => (
                <tr
                  key={student.id}
                  className={student.id === selectedId ? "row-active" : ""}
                  onClick={() => setSelectedId(student.id)}
                >
                  <td>
                    <div className="student-cell">
                      <Avatar name={fullName(student)} size={38} />
                      <div>
                        <div className="student-name">{fullName(student)}</div>
                        <div className="student-meta">{student.roll_number || "No roll number"}</div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className="badge neutral">{classLabelOf(student.id)}</span>
                  </td>
                  <td>{student.guardian_email || <span className="muted">—</span>}</td>
                  {canSeeFees && (
                    <td>
                      {feeStatusOf(student.id) ? (
                        <span className={`badge ${badgeClass(feeStatusOf(student.id))}`}>
                          {feeStatusOf(student.id)}
                        </span>
                      ) : (
                        <span className="muted">No fees</span>
                      )}
                    </td>
                  )}
                  {canSeeRisk && (
                    <td>
                      <span className={`badge ${badgeClass(riskOf(student.id))}`}>{riskOf(student.id)}</span>
                    </td>
                  )}
                  {canEdit && (
                    <td>
                      <div className="row-actions">
                        <button
                          type="button"
                          className="btn ghost small"
                          onClick={(event) => {
                            event.stopPropagation();
                            setEditing(student);
                            setAdding(false);
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="icon-btn-danger"
                          aria-label={`Remove ${fullName(student)}`}
                          title="Remove (left the school)"
                          onClick={(event) => {
                            event.stopPropagation();
                            if (
                              window.confirm(
                                `Remove ${fullName(student)}? Use this when a student has left the school.`
                              )
                            ) {
                              removeStudent.mutate(student.id);
                            }
                          }}
                        >
                          <Icon name="trash" size={16} />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {selectedId && (
        <StudentProfileCard
          studentId={selectedId}
          classLabel={classLabelOf(selectedId)}
          risk={canSeeRisk ? riskOf(selectedId) : null}
          feeStatus={canSeeFees ? feeStatusOf(selectedId) : null}
          showFees={canSeeFees}
          onClose={() => setSelectedId(null)}
        />
      )}
      {importing && <ImportStudents onClose={() => setImporting(false)} />}
    </section>
  );
}
