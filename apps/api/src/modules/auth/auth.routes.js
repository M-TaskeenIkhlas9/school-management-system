import { Router } from "express";
import { z } from "zod";
import * as authService from "./auth.service.js";
import { refreshSchool } from "../settings/school.js";
import validate, { requiredText } from "../../middleware/validate.js";
import auth from "../../middleware/auth.js";
import { loginLimiter } from "../../middleware/rateLimit.js";
import { audit } from "../../lib/audit.js";

const loginSchema = z.object({
  email: requiredText(255),
  password: requiredText(255),
});

const passwordSchema = z.object({
  current_password: requiredText(255),
  new_password: z.string().min(8, "must be at least 8 characters").max(255),
});

const router = Router();

router.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  let session;
  try {
    session = await authService.login(req.body.email, req.body.password);
  } catch (err) {
    if (err.code === "INVALID_CREDENTIALS") {
      await audit(req, "auth.login_failed", { details: { email: String(req.body.email).toLowerCase() } });
    }
    throw err;
  }
  await audit(req, "auth.login", { userId: session.user.id });
  res.json(session);
});

// Change your own password. Other devices are signed out; the response carries a fresh token.
router.post("/password", auth, loginLimiter, validate(passwordSchema), async (req, res) => {
  const result = await authService.changeOwnPassword(req.user.id, req.body.current_password, req.body.new_password);
  await audit(req, "auth.password_change", { entityType: "user", entityId: req.user.id });
  res.json(result);
});

// Shown before sign-in: the school's name (nothing private).
router.get("/school", async (_req, res) => {
  await refreshSchool();
  res.json(authService.schoolInfo());
});

// The signed-in user's identity, permissions and (for teachers) assigned classes.
router.get("/me", auth, async (req, res) => {
  res.json(await authService.describeSession(await authService.getUser(req.user.id)));
});

export default router;
