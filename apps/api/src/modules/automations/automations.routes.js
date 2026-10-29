import { Router } from "express";
import { z } from "zod";
import validate, { idParam, requiredText } from "../../middleware/validate.js";
import { audit } from "../../lib/audit.js";
import * as service from "./automations.service.js";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM, e.g. 09:00");
const schedule = z.discriminatedUnion("frequency", [
  z.object({ frequency: z.literal("daily"), time }),
  z.object({ frequency: z.literal("school_days"), time }),
  z.object({ frequency: z.literal("weekly"), time, weekday: z.coerce.number().int().min(0).max(6) }),
]);
const options = z
  .object({
    channel: z.enum(["whatsapp", "sms", "email"]).optional(),
    days: z.coerce.number().int().min(2).max(30).optional(),
  })
  .optional();

const createSchema = z.object({
  name: requiredText(150),
  kind: z.enum(Object.keys(service.KINDS)),
  schedule,
  options,
  mode: z.enum(["approve", "auto"]).default("approve"),
});
const updateSchema = z.object({
  name: requiredText(150).optional(),
  schedule: schedule.optional(),
  options,
  mode: z.enum(["approve", "auto"]).optional(),
  is_active: z.boolean().optional(),
});

const router = Router();

router.get("/", async (req, res) => {
  res.json(await service.list(req.user));
});

router.post("/", validate(createSchema), async (req, res) => {
  const automation = await service.create(req.user, req.body);
  await audit(req, "automation.create", {
    entityType: "automation",
    entityId: automation.id,
    details: { kind: automation.kind, mode: automation.mode },
  });
  res.status(201).json(automation);
});

router.patch("/:id", validate(updateSchema), async (req, res) => {
  const id = idParam(req);
  const automation = await service.update(req.user, id, req.body);
  await audit(req, "automation.update", { entityType: "automation", entityId: id, details: req.body });
  res.json(automation);
});

router.delete("/:id", async (req, res) => {
  const id = idParam(req);
  await service.remove(req.user, id);
  await audit(req, "automation.delete", { entityType: "automation", entityId: id });
  res.status(204).end();
});

router.get("/:id/runs", async (req, res) => {
  res.json(await service.runs(req.user, idParam(req)));
});

// Try a rule now (it still waits for approval unless the rule is trusted).
router.post("/:id/run", async (req, res) => {
  const id = idParam(req);
  const result = await service.runNow(req.user, id);
  await audit(req, "automation.run", { entityType: "automation", entityId: id, details: { status: result.status } });
  res.json(result);
});

export default router;
