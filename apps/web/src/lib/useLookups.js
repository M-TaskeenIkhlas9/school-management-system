import { useMemo } from "react";
import { useClassrooms, useStudents } from "../api/queries.js";

/** Student/class lookups shared by pages (the student list already carries each student's class). */
export function useLookups() {
  const { data: students = [] } = useStudents();
  const { data: classrooms = [] } = useClassrooms();

  return useMemo(() => {
    const studentById = new Map(students.map((s) => [s.id, s]));
    return {
      students,
      classrooms,
      classIdOf: (studentId) => studentById.get(studentId)?.classroom_id ?? null,
      classLabelOf: (studentId) => {
        const s = studentById.get(studentId);
        if (!s?.class_name) return "Unassigned";
        return `${s.class_name}${s.class_section ? ` • ${s.class_section}` : ""}`;
      },
    };
  }, [students, classrooms]);
}
