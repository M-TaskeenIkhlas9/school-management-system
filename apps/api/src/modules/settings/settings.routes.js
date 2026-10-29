import { Router } from "express";
import { z } from "zod";
import validate from "../../middleware/validate.js";
import { audit } from "../../lib/audit.js";
import { refreshSchool, updateSchool } from "./school.js";

const text = (max) => z.string().trim().max(max);
const schoolSchema = z.object({
  name: text(150).optional(),
  address: text(255).optional(),
  phone: text(50).optional(),
  bank_details: text(255).optional(),
  late_fine: z.coerce.number().min(0).max(100000).optional(),
});

const router = Router();

router.get("/school", async (_req, res) => {
  res.json(await refreshSchool());
});

// The principal (or admin) updates the school's details; they show on challans, cards and messages.
router.put("/school", validate(schoolSchema), async (req, res) => {
  const school = await updateSchool(req.body, req.user.id);
  await audit(req, "settings.school", { details: Object.keys(req.body) });
  res.json(school);
});

export default router;
