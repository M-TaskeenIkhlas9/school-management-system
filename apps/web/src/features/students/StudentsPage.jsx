import { useMemo, useState } from "react";
import { api } from "../../api/client.js";
import { keys, useApiMutation, useAttention } from "../../api/queries.js";
import { useLookups } from "../../lib/useLookups.js";
import { badgeClass, formatDate, fullName } from "../../lib/format.js";
import PageHeader from "../../components/PageHeader.jsx";
import { useAuth } from "../../auth/AuthContext.jsx";
import StudentForm from "./StudentForm.jsx";
import StudentProfileCard from "./StudentProfileCard.jsx";

export default function StudentsPage() {
  const { can } = useAuth();
  const canEdit = can("students:write");
  const canSeeFees = can("fees:read");
  const canSeeRisk = can("reports:read");
  const { students, classrooms, classIdOf, classLabelOf } = useLookups();
  const { data: attention } = useAttention({ enabled: canSeeRisk });

  const [selectedId, setSelectedId] = useState(null);
  const [editing, setEditing] = useState(null); // student being edited
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
    <section className="section active">
      <PageHeader title="Students" subtitle="Search, filter, and review student profiles." />

      {canEdit && (
        <StudentForm
          classrooms={classrooms}
          initial={editInitial}
          saving={save.isPending}
          onSubmit={handleSubmit}
          onCancel={() => setEditing(null)}
        />
      )}

      <div className="card table-card">
        <div className="filters">
          <input type="text" placeholder="Search students" value={search} onChange={(e) => setSearch(e.target.value)} />
          <select value={classFilter} onChange={(e) => setClassFilter(e.target.value)}>
            <option value="">All Classes</option>
            {classrooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name} {room.section ? `• ${room.section}` : ""}
              </option>
            ))}
          </select>
          {canSeeFees && (
            <select value={feeFilter} onChange={(e) => setFeeFilter(e.target.value)}>
              <option value="">Fee Status</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="partial">Partial</option>
            </select>
          )}
          {canSeeRisk && (
            <select value={riskFilter} onChange={(e) => setRiskFilter(e.target.value)}>
              <option value="">Performance Risk</option>
              <option value="High">High</option>
              <option value="Low">Low</option>
            </select>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>Student</th>
              <th>Class</th>
              <th>Guardian email</th>
              {canSeeFees && <th>Fee Status</th>}
              {canSeeRisk && <th>AI Risk</th>}
              {canEdit && <th>Actions</th>}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={3 + canSeeFees + canSeeRisk + canEdit}>
                  <div className="empty-state">
                    <div className="empty-icon">👩‍🎓</div>
                    <div>
                      <h5>{students.length ? "No students match these filters" : "No students yet"}</h5>
                      <p>
                        {students.length
                          ? "Try clearing a filter."
                          : canEdit
                            ? "Add your first student with the form above."
                            : "No students are assigned to you yet."}
                      </p>
                    </div>
                  </div>
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
                      <div className="student-avatar">
                        {student.first_name?.[0]}
                        {student.last_name?.[0]}
                      </div>
                      <div>
                        <div className="student-name">{fullName(student)}</div>
                        <div className="student-meta">{student.roll_number || "No roll number"}</div>
                      </div>
                    </div>
                  </td>
                  <td>{classLabelOf(student.id)}</td>
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
                      <button
                        className="btn ghost small"
                        onClick={(event) => {
                          event.stopPropagation();
                          setEditing(student);
                          setSelectedId(student.id);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        Edit
                      </button>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <StudentProfileCard
        studentId={selectedId}
        classLabel={selectedId ? classLabelOf(selectedId) : ""}
        risk={canSeeRisk && selectedId ? riskOf(selectedId) : null}
        feeStatus={canSeeFees && selectedId ? feeStatusOf(selectedId) : null}
        showFees={canSeeFees}
      />
    </section>
  );
}
