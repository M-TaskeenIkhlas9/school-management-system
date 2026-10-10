import { Router } from "express";
import * as authService from "./auth.service.js";
import validate from "../../middleware/validate.js";
import auth, { requireRole } from "../../middleware/auth.js";

const router = Router();

router.post(
  "/login",
  validate({ email: { required: true, type: "string" }, password: { required: true, type: "string" } }),
  async (req, res, next) => {
    try {
      const result = await authService.login(req.body.email, req.body.password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }
);

// Only an existing principal can create new accounts.
router.post(
  "/register",
  auth,
  requireRole("principal"),
  validate({
    username: { required: true, type: "string" },
    email: { required: true, type: "string" },
    password: { required: true, type: "string" },
  }),
  async (req, res, next) => {
    try {
      const user = await authService.register(req.body.username, req.body.email, req.body.password);
      res.status(201).json(user);
    } catch (err) {
      next(err);
    }
  }
);

export default router;
