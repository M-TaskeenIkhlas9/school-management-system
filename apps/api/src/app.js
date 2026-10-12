// Builds the Express app. No side effects on import (no listen, no DB writes),
// so tests can import it directly. Startup lives in server.js.
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import logger from "./lib/logger.js";

import errorHandler from "./middleware/errorHandler.js";
import auth from "./middleware/auth.js";
import { byMethod, requirePermission } from "./middleware/access.js";

import authRoutes from "./modules/auth/auth.routes.js";
import dashboardRoutes from "./modules/dashboard/dashboard.routes.js";
import studentRoutes from "./modules/students/students.routes.js";
import teacherRoutes from "./modules/teachers/teachers.routes.js";
import classroomRoutes from "./modules/classrooms/classrooms.routes.js";
import enrollmentRoutes from "./modules/enrollments/enrollments.routes.js";
import curriculumRoutes from "./modules/curriculum/curriculum.routes.js";
import attendanceRoutes from "./modules/attendance/attendance.routes.js";
import feeRoutes from "./modules/fees/fees.routes.js";
import resultRoutes from "./modules/results/results.routes.js";
import examRoutes from "./modules/exams/exams.routes.js";
import aiRoutes from "./modules/ai/ai.routes.js";
import predictRoutes from "./modules/predict/predict.routes.js";
import userRoutes from "./modules/users/users.routes.js";
import guardianRoutes from "./modules/guardians/guardians.routes.js";
import agentRoutes from "./agent/agent.routes.js";
import messageRoutes from "./modules/messages/messages.routes.js";
import webhookRoutes from "./modules/webhooks/webhooks.routes.js";

const app = express();

// Allowed browser origins (comma-separated). In development the Vite proxy makes
// requests same-origin, so CORS only matters for other clients.
const corsOrigins = (process.env.CORS_ORIGINS || "http://localhost:5173,http://localhost:5174")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// ---------- Global middleware ----------
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: corsOrigins }));
app.use(
  pinoHttp({
    logger,
    autoLogging: { ignore: (req) => req.url === "/health" },
    customLogLevel: (_req, res, err) =>
      err || res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info",
    customSuccessMessage: (req, res, ms) =>
      `${req.method} ${req.originalUrl || req.url} → ${res.statusCode} (${Math.round(ms)}ms)`,
    customErrorMessage: (req, res) => `${req.method} ${req.originalUrl || req.url} → ${res.statusCode}`,
    // Keep only what is useful; never log headers (tokens) or bodies.
    serializers: {
      req: (req) => ({ id: req.id, method: req.method, url: req.url }),
      res: (res) => ({ statusCode: res.statusCode }),
    },
  })
);
// Provider callbacks verify signatures over the raw body, so they come before the JSON parser.
app.use("/webhooks", webhookRoutes);
app.use(express.json({ limit: "1mb" }));

// ---------- Public routes ----------
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/auth", authRoutes);

// ---------- Protected routes (require JWT) ----------
app.use(auth);

// Each section checks its permission: GET needs "x:read", anything else "x:write".
// Teachers are further limited to their classes inside the modules.
app.use("/dashboard", requirePermission("dashboard:read"), dashboardRoutes);
app.use("/students", byMethod("students:read", "students:write"), studentRoutes);
app.use("/enrollments", byMethod("students:read", "students:write"), enrollmentRoutes);
app.use("/guardians", byMethod("students:read", "students:write"), guardianRoutes);
app.use("/teachers", byMethod("teachers:read", "teachers:write"), teacherRoutes);
app.use("/classrooms", byMethod("classes:read", "classes:write"), classroomRoutes);
app.use("/curriculum", byMethod("classes:read", "classes:write"), curriculumRoutes);
app.use("/attendance", byMethod("attendance:read", "attendance:write"), attendanceRoutes);
app.use("/fees", byMethod("fees:read", "fees:write"), feeRoutes);
app.use("/results", byMethod("results:read", "results:write"), resultRoutes);
app.use("/exams", byMethod("exams:read", "exams:write"), examRoutes);
app.use("/ai/exams", byMethod("exams:read", "exams:write"), examRoutes); // backward compatibility
app.use("/ai", requirePermission("reports:read"), aiRoutes);
app.use("/predict", requirePermission("reports:read"), predictRoutes);
app.use("/users", requirePermission("users:manage"), userRoutes);
app.use("/assistant", requirePermission("assistant:use"), agentRoutes);
app.use("/messages", requirePermission("messages:read"), messageRoutes);

// ---------- Error handler ----------
app.use(errorHandler);

export default app;
