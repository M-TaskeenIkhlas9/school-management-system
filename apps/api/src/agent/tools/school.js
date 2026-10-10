import { z } from "zod";
import { classScope, hasPermission } from "../../middleware/access.js";
import * as dashboardService from "../../modules/dashboard/dashboard.service.js";
import * as classroomService from "../../modules/classrooms/classrooms.service.js";
import * as studentService from "../../modules/students/students.service.js";

export default [
  {
    name: "get_school_overview",
    description:
      "Headline numbers: students, teachers, classes, today's attendance %, and (if allowed) fees collected/billed/unpaid. Limited to the user's classes for teachers.",
    permission: "dashboard:read",
    input: z.object({}),
    label: () => "Checking the school overview",
    run: (_input, ctx) =>
      dashboardService.getStats({ classIds: classScope(ctx.req), includeFees: hasPermission(ctx.req, "fees:read") }),
  },
  {
    name: "list_classes",
    description: "Classes the user can see, with grade, section and number of active students.",
    permission: "classes:read",
    input: z.object({}),
    label: () => "Listing classes",
    async run(_input, ctx) {
      const classIds = classScope(ctx.req);
      const [rooms, students] = await Promise.all([
        classroomService.getAll({ classIds }),
        studentService.getAll({ classIds }),
      ]);
      return rooms.map((r) => ({
        id: r.id,
        name: r.name,
        grade: r.grade,
        section: r.section,
        students: students.filter((s) => s.classroom_id === r.id).length,
      }));
    },
  },
];
