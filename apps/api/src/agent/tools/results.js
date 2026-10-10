import { z } from "zod";
import { classScope } from "../../middleware/access.js";
import * as resultService from "../../modules/results/results.service.js";
import { resolveClass } from "./helpers.js";

export default [
  {
    name: "get_results_summary",
    description:
      "Exam/term results: overall average, average per class and term, grade distribution and the 10 lowest results. Optional class and term filters.",
    permission: "results:read",
    input: z.object({
      class_name: z.string().max(100).optional(),
      term: z.string().max(50).optional().describe("e.g. 'Term 1'"),
    }),
    label: () => "Summarising results",
    async run({ class_name, term }, ctx) {
      const room = await resolveClass(ctx, class_name);
      return resultService.summary({ classIds: classScope(ctx.req), classroom_id: room?.id, term });
    },
  },
];
