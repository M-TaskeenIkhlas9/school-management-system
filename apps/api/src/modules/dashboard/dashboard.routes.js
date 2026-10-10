import { Router } from "express";
import * as dashboardService from "./dashboard.service.js";
import { classScope, hasPermission } from "../../middleware/access.js";

const router = Router();

router.get("/", async (req, res) => {
  res.json(
    await dashboardService.getStats({ classIds: classScope(req), includeFees: hasPermission(req, "fees:read") })
  );
});

router.get("/trends", async (req, res) => {
  res.json(await dashboardService.getTrends({ classIds: classScope(req) }));
});

export default router;
