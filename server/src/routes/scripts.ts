import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { v4 as uuidv4 } from "uuid";
import db from "../db";
import { parsePdf } from "../services/parser";
import { extractCharacters } from "../services/claude";

const router = Router();

const UPLOADS_DIR = path.join(__dirname, "../../../data/uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

router.get("/", (_req: Request, res: Response) => {
  const scripts = db.prepare("SELECT * FROM scripts ORDER BY created_at DESC").all();
  res.json(scripts);
});

router.get("/:id", (req: Request, res: Response) => {
  const script = db.prepare("SELECT * FROM scripts WHERE id = ?").get(req.params.id);
  if (!script) return res.status(404).json({ error: "Not found" });
  res.json(script);
});

router.post("/upload", upload.single("pdf"), async (req: Request, res: Response) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });

  const scriptId = uuidv4();
  const title = req.body.title || path.basename(req.file.originalname, ".pdf");

  try {
    const scenes = await parsePdf(req.file.path);

    const insertScript = db.prepare(
      "INSERT INTO scripts (id, title, raw_pdf_path, created_at) VALUES (?, ?, ?, datetime('now'))"
    );
    const insertScene = db.prepare(
      "INSERT INTO scenes (id, script_id, scene_number, heading, text_content, order_index) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const txn = db.transaction(() => {
      insertScript.run(scriptId, title, req.file!.path);
      for (const scene of scenes) {
        insertScene.run(uuidv4(), scriptId, scene.sceneNumber, scene.heading, scene.textContent, scene.orderIndex);
      }
    });
    txn();

    res.json({ id: scriptId, title, sceneCount: scenes.length });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

router.post("/:id/extract-characters", async (req: Request, res: Response) => {
  const { id } = req.params;
  const script = db.prepare("SELECT * FROM scripts WHERE id = ?").get(id) as { id: string } | undefined;
  if (!script) return res.status(404).json({ error: "Not found" });

  try {
    const existing = db.prepare("SELECT id FROM characters WHERE script_id = ?").all(id);
    if (existing.length > 0) {
      const chars = db.prepare("SELECT * FROM characters WHERE script_id = ?").all(id);
      return res.json(chars);
    }

    const extracted = await extractCharacters(id);

    const insertChar = db.prepare(
      "INSERT INTO characters (id, script_id, name) VALUES (?, ?, ?)"
    );
    const insertField = db.prepare(
      "INSERT INTO profile_fields (id, character_id, field_name, field_value, source_anchor_id) VALUES (?, ?, ?, ?, ?)"
    );
    const insertAnchor = db.prepare(
      "INSERT INTO source_anchors (id, script_id, scene_id, anchor_text, field_id, character_id) VALUES (?, ?, ?, ?, ?, ?)"
    );

    const characters: Array<{ id: string; name: string }> = [];

    const txn = db.transaction(() => {
      for (const char of extracted) {
        const charId = uuidv4();
        insertChar.run(charId, id, char.name);
        characters.push({ id: charId, name: char.name });

        for (const field of char.fields) {
          const fieldId = uuidv4();
          const anchorId = uuidv4();

          const scene = db
            .prepare("SELECT id FROM scenes WHERE script_id = ? AND scene_number = ?")
            .get(id, field.anchor_scene_number) as { id: string } | undefined;

          insertAnchor.run(anchorId, id, scene?.id ?? null, field.anchor_text, fieldId, charId);
          insertField.run(fieldId, charId, field.field_name, field.field_value, anchorId);
        }
      }
    });
    txn();

    res.json(characters);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

export default router;
