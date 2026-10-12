import { Router } from "express";
import { z } from "zod";
import * as userService from "./users.service.js";
import validate, { idParam, optionalId, parseQuery, requiredText } from "../../middleware/validate.js";
import { ROLES } from "../auth/permissions.js";
import { audit } from "../../lib/audit.js";
import { pageParams } from "../../lib/pagination.js";

const password = z.string().min(8, "must be at least 8 characters").max(255);

const createSchema = z.object({
  username: requiredText(100),
  email: z.string().trim().toLowerCase().email("must be a valid email"),
  password,
  role: z.enum(ROLES),
  teacher_id: optionalId(),
  classroom_ids: z.array(z.coerce.number().int().positive()).max(100).optional(),
});

const updateSchema = z.object({
  username: requiredText(100).optional(),
  role: z.enum(ROLES).optional(),
  is_active: z.boolean().optional(),
  teacher_id: optionalId(),
  password: password.optional(),
  classroom_ids: z.array(z.coerce.number().int().positive()).max(100).optional(),
});

const activityQuery = z.object({
  ...pageParams,
  user_id: z.coerce.number().int().positive().optional(),
  action: z.string().trim().max(50).optional(),
});

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await userService.list());
});

router.get("/roles", (req, res) => {
  res.json(userService.roles(req.user));
});

// Who did what: logins (and failed attempts), account and class changes, approvals.
router.get("/activity", async (req, res) => {
  res.json(await userService.activity(parseQuery(activityQuery, req.query)));
});

router.post("/", validate(createSchema), async (req, res) => {
  const user = await userService.create(req.user, req.body);
  await audit(req, "user.create", {
    entityType: "user",
    entityId: user.id,
    details: { role: user.role, ...(req.body.classroom_ids ? { classroom_ids: req.body.classroom_ids } : {}) },
  });
  res.status(201).json(user);
});

router.post("/:id/sign-out", async (req, res) => {
  const id = idParam(req);
  await userService.signOutEverywhere(req.user, id);
  await audit(req, "user.sign_out_everywhere", { entityType: "user", entityId: id });
  res.status(204).end();
});

router.patch("/:id", validate(updateSchema), async (req, res) => {
  const id = idParam(req);
  const user = await userService.update(req.user, id, req.body);
  const { password: _omit, ...changed } = req.body;
  await audit(req, "user.update", {
    entityType: "user",
    entityId: id,
    details: { ...changed, password_changed: Boolean(req.body.password) },
  });
  res.json(user);
});

export default router;
