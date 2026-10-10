// Builds the Express app. No side effects on import (no listen, no DB writes),
// so tests can import it directly. Startup lives in server.js.
import "dotenv/config";
import express from "express";
import cors from "cors";

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

// ---------- Global middleware ----------
app.use(cors());
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
