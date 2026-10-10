import { useMemo } from "react";
import { useClassrooms, useEnrollments, useStudents } from "../api/queries.js";
import { fullName } from "./format.js";

/** Name/class lookups shared by pages that show students next to other records. */
export function useLookups() {
  const { data: students = [] } = useStudents();
  const { data: classrooms = [] } = useClassrooms();
  const { data: enrollments = [] } = useEnrollments();

  return useMemo(() => {
    const studentById = new Map(students.map((s) => [s.id, s]));
    const classroomById = new Map(classrooms.map((c) => [c.id, c]));
    const classIdByStudent = new Map();
    for (const e of enrollments) {
      if (e.is_active && !classIdByStudent.has(e.student_id)) classIdByStudent.set(e.student_id, e.classroom_id);
    }

    return {
      students,
      classrooms,
      studentName: (id) => (studentById.has(id) ? fullName(studentById.get(id)) : "Student"),
      classroomName: (id) => classroomById.get(id)?.name ?? "Class",
      classIdOf: (studentId) => classIdByStudent.get(studentId) ?? null,
      classLabelOf: (studentId) => {
        const room = classroomById.get(classIdByStudent.get(studentId));
        return room ? `${room.name}${room.section ? ` • ${room.section}` : ""}` : "Unassigned";
      },
    };
  }, [students, classrooms, enrollments]);
}
