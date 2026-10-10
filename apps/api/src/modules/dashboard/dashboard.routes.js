import { Router } from "express";
import * as dashboardService from "./dashboard.service.js";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await dashboardService.getStats());
});

router.get("/trends", async (_req, res) => {
  res.json(await dashboardService.getTrends());
});

export default router;
