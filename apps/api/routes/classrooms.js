import { Router } from "express";
import * as classroomService from "../services/classroomService.js";
import validate from "../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await classroomService.getAll());
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const classroom = await classroomService.getById(Number(req.params.id));
    if (!classroom) return res.status(404).json({ error: "Classroom not found" });
    res.json(classroom);
  } catch (err) { next(err); }
});

router.post(
  "/",
  validate({ name: { required: true, type: "string" }, grade: { required: true, type: "string" } }),
  async (req, res, next) => {
    try {
      const classroom = await classroomService.create(req.body);
      res.status(201).json(classroom);
    } catch (err) { next(err); }
  }
);

router.put("/:id", async (req, res, next) => {
  try {
    const classroom = await classroomService.update(Number(req.params.id), req.body);
    if (!classroom) return res.status(404).json({ error: "Classroom not found" });
    res.json(classroom);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await classroomService.remove(Number(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
