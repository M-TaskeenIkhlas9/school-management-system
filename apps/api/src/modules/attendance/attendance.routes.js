import { Router } from "express";
import * as attendanceService from "./attendance.service.js";
import validate from "../../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await attendanceService.getAll());
  } catch (err) { next(err); }
});

router.post(
  "/",
  validate({
    student_id: { required: true, type: "number" },
    classroom_id: { required: true, type: "number" },
    status: { enum: ["present", "absent", "late"] },
  }),
  async (req, res, next) => {
    try {
      const row = await attendanceService.create({
        ...req.body,
        marked_by: req.user ? req.user.id : null,
      });
      res.status(201).json(row);
    } catch (err) { next(err); }
  }
);

router.put("/:id", async (req, res, next) => {
  try {
    const row = await attendanceService.update(Number(req.params.id), req.body);
    if (!row) return res.status(404).json({ error: "Attendance record not found" });
    res.json(row);
  } catch (err) { next(err); }
});

export default router;
