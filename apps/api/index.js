import "dotenv/config";
import { fileURLToPath } from "node:url";
import express from "express";
import cors from "cors";

import errorHandler from "./middleware/errorHandler.js";
import auth, { requireRole } from "./middleware/auth.js";

import authRoutes from "./routes/auth.js";
import dashboardRoutes from "./routes/dashboard.js";
import studentRoutes from "./routes/students.js";
import teacherRoutes from "./routes/teachers.js";
import classroomRoutes from "./routes/classrooms.js";
import enrollmentRoutes from "./routes/enrollments.js";
import curriculumRoutes from "./routes/curriculum.js";
import attendanceRoutes from "./routes/attendance.js";
import feeRoutes from "./routes/fees.js";
import resultRoutes from "./routes/results.js";
import examRoutes from "./routes/exams.js";
import aiRoutes from "./routes/ai.js";
import agentRoutes from "./routes/agent.js";
import predictRoutes from "./routes/predict.js";

import { ensureDefaultPrincipal } from "./services/authService.js";
import { assertConfig } from "./config.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ---------- Global middleware ----------
app.use(cors());
app.use(express.json());

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

// AI routes mounted at /ai — includes /ai/exams/generate, /ai/students/attention, etc.
app.use("/ai", aiRoutes);

// AI agent: persistent chat + approval-gated actions (principal only)
app.use("/agent", requireRole("principal"), agentRoutes);

// Predict & XAI (risk prediction with explainability)
app.use("/predict", predictRoutes);

// Also mount exam generation under /ai/exams for backward compatibility
app.use("/ai/exams", examRoutes);

// ---------- Error handler ----------
app.use(errorHandler);

// ---------- Start ----------
export async function start() {
  try {
    assertConfig();
    await ensureDefaultPrincipal();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

// Only listen when run directly (node index.js), so tests can import the app.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  start();
}

export default app;
