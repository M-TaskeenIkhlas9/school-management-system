import { Router } from "express";
import { z } from "zod";
import * as authService from "./auth.service.js";
import validate, { requiredText } from "../../middleware/validate.js";
import auth, { requireRole } from "../../middleware/auth.js";

const loginSchema = z.object({
  email: requiredText(255),
  password: requiredText(255),
});

const registerSchema = z.object({
  username: requiredText(100),
  email: z.string().trim().email("must be a valid email"),
  password: z.string().min(8, "must be at least 8 characters").max(255),
});

const router = Router();

router.post("/login", validate(loginSchema), async (req, res) => {
  res.json(await authService.login(req.body.email, req.body.password));
});

// Only an existing principal can create new accounts.
router.post("/register", auth, requireRole("principal"), validate(registerSchema), async (req, res) => {
  const user = await authService.register(req.body.username, req.body.email, req.body.password);
  res.status(201).json(user);
});

export default router;
