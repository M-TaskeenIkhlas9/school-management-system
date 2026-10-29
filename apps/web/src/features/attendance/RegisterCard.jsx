import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client.js";
import { keys } from "../../api/queries.js";
import { useToast } from "../../components/Toast.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Avatar from "../../components/Avatar.jsx";

const STATUSES = [
  ["present", "P", "Present"],
  ["late", "L", "Late"],
  ["absent", "A", "Absent"],
];

/** Today's date in the school's time zone, as YYYY-MM-DD. */
const todayIn = (timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());

/**
 * The daily class register: every student in roll-number order, all Present to start with, so the
 * teacher only taps the absent and late ones and saves once. Re-opening a day shows what was saved.
 */
export default function RegisterCard({ classrooms, timeZone }) {
  const toast = useToast();
  const queryClient = useQueryClient();
  const [classId, setClassId] = useState(classrooms[0]?.id ? String(classrooms[0].id) : "");
  const [day, setDay] = useState(() => todayIn(timeZone));
  const [marks, setMarks] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!classId && classrooms[0]) setClassId(String(classrooms[0].id));
  }, [classrooms, classId]);

  const { data: register, isFetching } = useQuery({
    queryKey: ["attendance", "register", classId, day],
    queryFn: () => api.get(`/attendance/register?classroom_id=${classId}&day=${day}`),
    enabled: Boolean(classId),
  });

  // Start from what was saved for that day; unmarked students default to Present.
  useEffect(() => {
    if (!register) return;
    setMarks(Object.fromEntries(register.students.map((s) => [s.student_id, s.status ?? "present"])));
  }, [register]);

  const students = useMemo(() => register?.students ?? [], [register]);
  const alreadySaved = students.some((s) => s.status);
  const counts = STATUSES.map(([key, , label]) => [label, Object.values(marks).filter((m) => m === key).length]);

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.post("/attendance/register", {
        classroom_id: Number(classId),
        day,
        entries: students.map((s) => ({ student_id: s.student_id, status: marks[s.student_id] ?? "present" })),
      });
      toast.success(`Register saved: ${result.present} present, ${result.late} late, ${result.absent} absent`);
      queryClient.invalidateQueries({ queryKey: keys.attendance });
      queryClient.invalidateQueries({ queryKey: ["attendance", "register"] });
      queryClient.invalidateQueries({ queryKey: keys.dashboard });
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  if (!classrooms.length) {
    return (
      <div className="card">
        <EmptyState icon="classes" title="No classes yet">
          Add a class and its students to start the daily register.
        </EmptyState>
      </div>
    );
  }

  return (
    <div className="card register-card">
      <div className="card__head">
        <div>
          <h2>Daily register</h2>
          <p>Everyone starts as present — tap only those who are late or absent, then save.</p>
        </div>
        <div className="register-card__pickers">
          <select value={classId} onChange={(e) => setClassId(e.target.value)} aria-label="Class">
            {classrooms.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.section ? ` • ${c.section}` : ""}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={day}
            max={todayIn(timeZone)}
            onChange={(e) => setDay(e.target.value)}
            aria-label="Date"
          />
        </div>
      </div>

      {alreadySaved && (
        <p className="register-card__note">
          This day is already marked — change anything and save again to correct it.
        </p>
      )}

      {students.length === 0 ? (
        <EmptyState icon="students" title={isFetching ? "Loading…" : "No students in this class"}>
          {!isFetching && "Add students to this class on the Students page."}
        </EmptyState>
      ) : (
        <>
          <div className="register-card__bulk">
            <span className="muted">{counts.map(([label, n]) => `${n} ${label.toLowerCase()}`).join(" · ")}</span>
            <button
              type="button"
              className="btn link"
              onClick={() => setMarks(Object.fromEntries(students.map((s) => [s.student_id, "present"])))}
            >
              Mark everyone present
            </button>
          </div>
          <ul className="register-list">
            {students.map((s) => (
              <li key={s.student_id} className={`is-${marks[s.student_id]}`}>
                <span className="register-list__roll">{s.roll_number || "—"}</span>
                <Avatar name={s.student_name} size={34} />
                <span className="register-list__name">{s.student_name}</span>
                <div className="register-list__marks" role="radiogroup" aria-label={`${s.student_name}`}>
                  {STATUSES.map(([key, short, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={marks[s.student_id] === key}
                      aria-label={label}
                      title={label}
                      className={`mark mark--${key} ${marks[s.student_id] === key ? "is-on" : ""}`}
                      onClick={() => setMarks((m) => ({ ...m, [s.student_id]: key }))}
                    >
                      {short}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
          <div className="form-actions register-card__save">
            <button type="button" className="btn primary btn--lg" disabled={saving} onClick={save}>
              {saving ? "Saving…" : alreadySaved ? "Save corrections" : `Save register (${students.length} students)`}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
