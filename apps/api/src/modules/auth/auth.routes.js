import { Router } from "express";
import { z } from "zod";
import * as authService from "./auth.service.js";
import validate, { requiredText } from "../../middleware/validate.js";
import auth from "../../middleware/auth.js";
import { loginLimiter } from "../../middleware/rateLimit.js";
import { audit } from "../../lib/audit.js";

const loginSchema = z.object({
  email: requiredText(255),
  password: requiredText(255),
});

const router = Router();

router.post("/login", loginLimiter, validate(loginSchema), async (req, res) => {
  const session = await authService.login(req.body.email, req.body.password);
  await audit(req, "auth.login", { userId: session.user.id });
  res.json(session);
});

// The signed-in user's identity, permissions and (for teachers) assigned classes.
router.get("/me", auth, async (req, res) => {
  res.json(await authService.describeSession(await authService.getUser(req.user.id)));
});

export default router;
