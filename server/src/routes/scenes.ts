import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

router.get("/script/:scriptId", (req: Request, res: Response) => {
  const scenes = db
    .prepare("SELECT * FROM scenes WHERE script_id = ? ORDER BY order_index")
    .all(req.params.scriptId);
  res.json(scenes);
});

router.get("/:id", (req: Request, res: Response) => {
  const scene = db.prepare("SELECT * FROM scenes WHERE id = ?").get(req.params.id);
  if (!scene) return res.status(404).json({ error: "Not found" });
  res.json(scene);
});

export default router;
