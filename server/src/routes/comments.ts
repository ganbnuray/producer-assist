import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db";

const router = Router();

router.get("/script/:scriptId", (req: Request, res: Response) => {
  const comments = db
    .prepare(
      `SELECT c.*, u.name as author_name
       FROM comments c
       JOIN users u ON u.id = c.author_id
       WHERE c.script_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(req.params.scriptId);
  res.json(comments);
});

router.post("/", (req: Request, res: Response) => {
  const { script_id, scene_id, start_offset, end_offset, highlighted_text, note_text, author_id } = req.body;
  if (!script_id || !scene_id || start_offset == null || end_offset == null || !highlighted_text || !note_text || !author_id) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  const id = uuidv4();
  db.prepare(
    `INSERT INTO comments (id, script_id, scene_id, start_offset, end_offset, highlighted_text, note_text, author_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
  ).run(id, script_id, scene_id, start_offset, end_offset, highlighted_text, note_text, author_id);

  const comment = db
    .prepare(`SELECT c.*, u.name as author_name FROM comments c JOIN users u ON u.id = c.author_id WHERE c.id = ?`)
    .get(id);
  res.status(201).json(comment);
});

router.delete("/:id", (req: Request, res: Response) => {
  db.prepare("DELETE FROM comments WHERE id = ?").run(req.params.id);
  res.status(204).end();
});

export default router;
