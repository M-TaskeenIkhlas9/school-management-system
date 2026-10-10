import { Router } from "express";
import * as dashboardService from "./dashboard.service.js";

const router = Router();

router.get("/", async (_req, res) => {
  res.json(await dashboardService.getStats());
});

export default router;
