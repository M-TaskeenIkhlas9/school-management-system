import { Router } from "express";
import { z } from "zod";
import * as admissions from "./admissions.service.js";
import validate, {
  idParam,
  optionalDate,
  optionalId,
  optionalText,
  parseQuery,
  requiredId,
} from "../../middleware/validate.js";
import { audit } from "../../lib/audit.js";

// (Mounted for students:write — admission records are office work. See app.js.)

const registerQuery = z.object({
  q: optionalText(100),
  status: z.enum(["current", "former"]).optional(),
});

const leaveSchema = z.object({
  left_on: optionalDate(),
  reason: optionalText(200),
  conduct: optionalText(50),
  ignore_dues: z.boolean().optional(),
});

const promoteSchema = z.object({
  from_classroom_id: requiredId(),
  to_classroom_id: optionalId(), // empty: the class passes out of school
  decisions: z.record(z.string(), z.enum(["promote", "retain", "leave"])).default({}),
  date: optionalDate(),
});

const router = Router();

// The General Register: ?q= (name, GR no. or father) &status=current|former
router.get("/register", async (req, res) => {
  res.json(await admissions.register(parseQuery(registerQuery, req.query)));
});

// Year-end promotion: a class's students with their latest result and a suggestion.
router.get("/promotion", async (req, res) => {
  const { classroom_id } = parseQuery(z.object({ classroom_id: requiredId() }), req.query);
  res.json(await admissions.promotionList(classroom_id));
});

router.post("/promotion", validate(promoteSchema), async (req, res) => {
  const result = await admissions.promote(req.body);
  await audit(req, "admissions.promote", {
    entityType: "classroom",
    entityId: req.body.from_classroom_id,
    details: { to: req.body.to_classroom_id ?? null, ...result },
  });
  res.status(201).json(result);
});

// Strike a student off the rolls; the response is their School Leaving Certificate.
router.post("/:id/leave", validate(leaveSchema), async (req, res) => {
  const id = idParam(req);
  const certificate = await admissions.leave(id, req.body);
  await audit(req, "admissions.leave", {
    entityType: "student",
    entityId: id,
    details: { slc_number: certificate.slc_number, reason: certificate.reason, dues: certificate.dues },
  });
  res.status(201).json(certificate);
});

router.post("/:id/readmit", validate(z.object({ classroom_id: requiredId() })), async (req, res) => {
  const id = idParam(req);
  await admissions.readmit(id, req.body);
  await audit(req, "admissions.readmit", { entityType: "student", entityId: id, details: req.body });
  res.json({ success: true });
});

router.get("/:id/certificate", async (req, res) => {
  res.json(await admissions.certificate(idParam(req)));
});

export default router;
