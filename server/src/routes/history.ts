import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db";

const router = Router();

router.get("/script/:scriptId", (req: Request, res: Response) => {
  const logs = db
    .prepare(
      `SELECT el.*, u.name as author_name
       FROM edit_log el
       JOIN users u ON u.id = el.author_id
       WHERE el.script_id = ?
       ORDER BY el.created_at DESC`
    )
    .all(req.params.scriptId);
  res.json(logs);
});

router.post("/:logId/revert", (req: Request, res: Response) => {
  const log = db.prepare("SELECT * FROM edit_log WHERE id = ?").get(req.params.logId) as {
    id: string;
    script_id: string;
    entity_type: string;
    entity_id: string;
    field_name: string | null;
    old_value: string | null;
    new_value: string | null;
    author_id: string;
  } | undefined;

  if (!log) return res.status(404).json({ error: "Log entry not found" });

  const { author_id } = req.body;
  if (!author_id) return res.status(400).json({ error: "author_id required" });

  if (log.entity_type === "profile_field" && log.old_value !== null) {
    const field = db.prepare("SELECT * FROM profile_fields WHERE id = ?").get(log.entity_id) as {
      id: string;
      field_value: string;
      source_anchor_id: string | null;
    } | undefined;

    if (!field) return res.status(404).json({ error: "Field no longer exists" });

    const currentValue = field.field_value;
    db.prepare("UPDATE profile_fields SET field_value = ? WHERE id = ?").run(log.old_value, log.entity_id);

    const newLogId = uuidv4();
    db.prepare(
      `INSERT INTO edit_log (id, script_id, entity_type, entity_id, field_name, old_value, new_value, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).run(newLogId, log.script_id, log.entity_type, log.entity_id, log.field_name, currentValue, log.old_value, author_id);

    return res.json({ reverted: true, newLogId });
  }

  res.status(400).json({ error: "Revert not supported for this entity type" });
});

export default router;
