import { Router } from "express";
import { z } from "zod";
import * as payments from "./payments.service.js";
import validate, { idParam, isoDate, optionalText, parseQuery, requiredId } from "../../middleware/validate.js";
import { pageParams } from "../../lib/pagination.js";
import { audit } from "../../lib/audit.js";

// Online fee payments (1Bill, Raast, bank transfers), mounted at /fees/online:
// reading needs fees:read, matching and importing fees:write (see app.js).

const listQuery = z.object({ ...pageParams, status: z.enum(["matched", "unmatched", "ignored"]).optional() });

const statementSchema = z.object({
  channel: z.enum(["raast", "bank"]).default("raast"),
  rows: z
    .array(
      z.object({
        transaction_id: optionalText(64),
        amount: z.coerce.number().positive(),
        paid_on: isoDate(),
        reference: optionalText(140),
        payer: optionalText(150),
      })
    )
    .min(1)
    .max(2000),
});

const router = Router();

router.get("/", async (req, res) => {
  res.json(await payments.list(parseQuery(listQuery, req.query)));
});

router.get("/summary", async (_req, res) => {
  res.json(await payments.summary());
});

router.get("/:id/candidates", async (req, res) => {
  res.json(await payments.candidates(idParam(req), typeof req.query.q === "string" ? req.query.q : ""));
});

router.post("/:id/match", validate(z.object({ fee_id: requiredId() })), async (req, res) => {
  const id = idParam(req);
  const row = await payments.match(id, req.body.fee_id, req.user.id);
  await audit(req, "fees.online_match", { entityType: "fee", entityId: req.body.fee_id, details: { payment: id } });
  res.json(row);
});

router.post("/:id/ignore", validate(z.object({ note: optionalText(200) })), async (req, res) => {
  const id = idParam(req);
  const row = await payments.ignore(id, req.body.note, req.user.id);
  await audit(req, "fees.online_ignore", { entityType: "incoming_payment", entityId: id, details: req.body });
  res.json(row);
});

// Credits from the school account's bank statement; ones with a payment reference are matched at once.
router.post("/import", validate(statementSchema), async (req, res) => {
  const result = await payments.importStatement(req.body);
  await audit(req, "fees.online_import", { details: { channel: req.body.channel, ...result } });
  res.status(201).json(result);
});

export default router;
