import { Router } from "express";
import * as link from "./link.js";
import { audit } from "../../lib/audit.js";

// Your own WhatsApp link (mounted at /account/whatsapp): see it, get a code to link, unlink.
const router = Router();

router.get("/", async (req, res) => {
  res.json(await link.linkStatus(req.user.id));
});

router.post("/code", async (req, res) => {
  const code = await link.newLinkCode(req.user.id);
  await audit(req, "whatsapp.link_code", { entityType: "user", entityId: req.user.id });
  res.status(201).json(code);
});

router.delete("/", async (req, res) => {
  await link.unlink(req);
  res.json(await link.linkStatus(req.user.id));
});

export default router;
