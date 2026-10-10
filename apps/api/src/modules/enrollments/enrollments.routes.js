import { Router } from "express";
import * as enrollmentService from "./enrollments.service.js";
import validate from "../../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await enrollmentService.getAll());
  } catch (err) { next(err); }
});

router.post(
  "/",
  validate({ student_id: { required: true, type: "number" }, classroom_id: { required: true, type: "number" } }),
  async (req, res, next) => {
    try {
      const enrollment = await enrollmentService.create(req.body);
      res.status(201).json(enrollment);
    } catch (err) { next(err); }
  }
);

router.put("/:id", async (req, res, next) => {
  try {
    const enrollment = await enrollmentService.update(Number(req.params.id), req.body);
    if (!enrollment) return res.status(404).json({ error: "Enrollment not found" });
    res.json(enrollment);
  } catch (err) { next(err); }
});

export default router;
