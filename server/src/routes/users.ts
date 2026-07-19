import { Router, Request, Response } from "express";
import db from "../db";

const router = Router();

router.get("/", (_req: Request, res: Response) => {
  const users = db.prepare("SELECT * FROM users ORDER BY name").all();
  res.json(users);
});

export default router;
