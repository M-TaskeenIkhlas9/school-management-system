import { Router } from "express";
import * as studentService from "../services/studentService.js";
import validate from "../middleware/validate.js";

const router = Router();

router.get("/", async (_req, res, next) => {
  try {
    res.json(await studentService.getAll());
  } catch (err) { next(err); }
});

router.get("/:id", async (req, res, next) => {
  try {
    const profile = await studentService.getProfile(Number(req.params.id));
    if (!profile) return res.status(404).json({ error: "Student not found" });
    res.json(profile);
  } catch (err) { next(err); }
});

router.post(
  "/",
  validate({ first_name: { required: true, type: "string" }, last_name: { required: true, type: "string" } }),
  async (req, res, next) => {
    try {
      const student = await studentService.create(req.body);
      res.status(201).json(student);
    } catch (err) { next(err); }
  }
);

router.put("/:id", async (req, res, next) => {
  try {
    const student = await studentService.update(Number(req.params.id), req.body);
    if (!student) return res.status(404).json({ error: "Student not found" });
    res.json(student);
  } catch (err) { next(err); }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await studentService.remove(Number(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

export default router;
