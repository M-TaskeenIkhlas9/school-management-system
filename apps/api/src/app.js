// Builds the Express app. No side effects on import (no listen, no DB writes),
// so tests can import it directly. Startup lives in server.js.
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import logger from "./lib/logger.js";

import errorHandler from "./middleware/errorHandler.js";
import auth, { requireRole } from "./middleware/auth.js";

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
import agentRoutes from "./agent/agent.routes.js";

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
app.use(express.json({ limit: "1mb" }));

// ---------- Public routes ----------
app.get("/health", (_req, res) => res.json({ status: "ok" }));
app.use("/auth", authRoutes);

// ---------- Protected routes (require JWT) ----------
app.use(auth);

app.use("/dashboard", dashboardRoutes);
app.use("/students", studentRoutes);
app.use("/teachers", teacherRoutes);
app.use("/classrooms", classroomRoutes);
app.use("/enrollments", enrollmentRoutes);
app.use("/curriculum", curriculumRoutes);
app.use("/attendance", attendanceRoutes);
app.use("/fees", feeRoutes);
app.use("/results", resultRoutes);
app.use("/exams", examRoutes);
app.use("/ai/exams", examRoutes); // backward compatibility: /ai/exams/generate
app.use("/ai", aiRoutes);
app.use("/predict", predictRoutes);

// AI agent: persistent chat + approval-gated actions (principal only)
app.use("/agent", requireRole("principal"), agentRoutes);

// ---------- Error handler ----------
app.use(errorHandler);

export default app;
