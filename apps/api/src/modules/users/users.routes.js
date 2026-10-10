import { Router } from "express";
import { z } from "zod";
import * as userService from "./users.service.js";
import validate, { idParam, optionalId, requiredText } from "../../middleware/validate.js";
import { ROLES } from "../auth/permissions.js";
import { audit } from "../../lib/audit.js";

const password = z.string().min(8, "must be at least 8 characters").max(255);

const createSchema = z.object({
  username: requiredText(100),
  email: z.string().trim().toLowerCase().email("must be a valid email"),
  password,
  role: z.enum(ROLES),
  teacher_id: optionalId(),
});

const updateSchema = z.object({
  username: requiredText(100).optional(),
  role: z.enum(ROLES).optional(),
  is_active: z.boolean().optional(),
  teacher_id: optionalId(),
  password: password.optional(),
});

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await userService.list());
});

router.post("/", validate(createSchema), async (req, res) => {
  const user = await userService.create(req.user, req.body);
  await audit(req, "user.create", { entityType: "user", entityId: user.id, details: { role: user.role } });
  res.status(201).json(user);
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
