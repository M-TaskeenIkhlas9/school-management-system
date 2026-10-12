import { Router } from "express";
import * as dashboardService from "./dashboard.service.js";
import { classScope, hasPermission } from "../../middleware/access.js";
import pool from "../../db/pool.js";

const router = Router();

router.get("/", async (req, res) => {
  res.json(
    await dashboardService.getStats({ classIds: classScope(req), includeFees: hasPermission(req, "fees:read") })
  );
});

router.get("/trends", async (req, res) => {
  res.json(await dashboardService.getTrends({ classIds: classScope(req) }));
});

// Recent activity for the overview: the whole school for people who manage users, else your own.
router.get("/activity", async (req, res) => {
  const everyone = hasPermission(req, "users:manage");
  const [rows] = await pool.query(
    `SELECT a.id, a.action, a.entity_type, a.entity_id, a.details, a.created_at, u.username, u.role,
            target.username AS target_name
     FROM audit_log a
     LEFT JOIN users u ON u.id = a.user_id
     LEFT JOIN users target ON a.entity_type = 'user' AND target.id = a.entity_id
     WHERE a.action NOT LIKE 'auth.%' ${everyone ? "" : "AND a.user_id = ?"}
     ORDER BY a.id DESC LIMIT 6`,
    everyone ? [] : [req.user.id]
  );
  res.json({
    scope: everyone ? "school" : "mine",
    items: rows.map((r) => ({ ...r, details: typeof r.details === "string" ? JSON.parse(r.details) : r.details })),
  });
});

export default router;
