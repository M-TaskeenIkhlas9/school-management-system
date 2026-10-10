import { Router } from "express";
import * as dashboardService from "../services/dashboardService.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await dashboardService.getStats());
  } catch (err) { next(err); }
});

export default router;
