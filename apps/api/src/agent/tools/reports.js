import { z } from "zod";
import * as aiService from "../../modules/ai/ai.service.js";

export default [
  {
    name: "get_attention_report",
    description: "Students who need attention: attendance below 75% or average score below 50%, with the reasons.",
    permission: "reports:read",
    input: z.object({}),
    label: () => "Finding students who need attention",
    run: () => aiService.getStudentsNeedingAttention(),
  },
];
