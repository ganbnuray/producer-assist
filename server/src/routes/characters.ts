import { Router, Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";
import db from "../db";
import { rewriteAnchorPassage, detectValueConflicts } from "../services/claude";
import { generateCharacterImage, generateCharacterVideo } from "../services/replicate";

const router = Router();

router.get("/script/:scriptId", (req: Request, res: Response) => {
  const characters = db
    .prepare("SELECT * FROM characters WHERE script_id = ?")
    .all(req.params.scriptId);
  res.json(characters);
});

router.get("/:id", (req: Request, res: Response) => {
  const char = db.prepare("SELECT * FROM characters WHERE id = ?").get(req.params.id) as {
    id: string;
    script_id: string;
    name: string;
    image_url: string | null;
    video_url: string | null;
  } | undefined;
  if (!char) return res.status(404).json({ error: "Not found" });

  const fields = db
    .prepare(
      `SELECT pf.*, sa.anchor_text, sa.scene_id as anchor_scene_id
       FROM profile_fields pf
       LEFT JOIN source_anchors sa ON sa.id = pf.source_anchor_id
       WHERE pf.character_id = ?`
    )
    .all(char.id);

  res.json({ ...char, fields });
});

router.patch("/:id/fields/:fieldId", async (req: Request, res: Response) => {
  const { id: charId, fieldId } = req.params;
  const { field_value, author_id } = req.body;
  if (!field_value || !author_id) return res.status(400).json({ error: "Missing required fields" });

  const field = db.prepare(
    `SELECT pf.*, sa.anchor_text, sa.scene_id, sa.id as anchor_id
     FROM profile_fields pf
     LEFT JOIN source_anchors sa ON sa.id = pf.source_anchor_id
     WHERE pf.id = ? AND pf.character_id = ?`
  ).get(fieldId, charId) as {
    id: string;
    field_name: string;
    field_value: string;
    anchor_text: string | null;
    scene_id: string | null;
    anchor_id: string | null;
    source_anchor_id: string | null;
  } | undefined;

  if (!field) return res.status(404).json({ error: "Field not found" });

  const char = db.prepare("SELECT * FROM characters WHERE id = ?").get(charId) as {
    id: string;
    script_id: string;
    name: string;
  };

  const oldValue = field.field_value;

  let scriptUpdateInfo: { sceneId: string; oldText: string; newText: string } | null = null;

  if (field.anchor_text && field.scene_id) {
    try {
      const newAnchorText = await rewriteAnchorPassage(
        field.anchor_text,
        field.field_name,
        oldValue,
        field_value
      );

      const scene = db.prepare("SELECT * FROM scenes WHERE id = ?").get(field.scene_id) as {
        id: string;
        text_content: string;
      } | undefined;

      if (scene) {
        const updatedContent = scene.text_content.replace(field.anchor_text, newAnchorText);
        db.prepare("UPDATE scenes SET text_content = ? WHERE id = ?").run(updatedContent, scene.id);
        if (field.anchor_id) {
          db.prepare("UPDATE source_anchors SET anchor_text = ? WHERE id = ?").run(newAnchorText, field.anchor_id);
        }
        scriptUpdateInfo = { sceneId: scene.id, oldText: field.anchor_text, newText: newAnchorText };
      }
    } catch (err) {
      console.error("Anchor rewrite failed:", err);
    }
  }

  db.prepare("UPDATE profile_fields SET field_value = ? WHERE id = ?").run(field_value, fieldId);

  const logId = uuidv4();
  db.prepare(
    `INSERT INTO edit_log (id, script_id, entity_type, entity_id, field_name, old_value, new_value, author_id, created_at)
     VALUES (?, ?, 'profile_field', ?, ?, ?, ?, ?, datetime('now'))`
  ).run(logId, char.script_id, fieldId, field.field_name, oldValue, field_value, author_id);

  if (field.field_name === "Values") {
    try {
      const scenes = db
        .prepare("SELECT * FROM scenes WHERE script_id = ? ORDER BY order_index")
        .all(char.script_id) as Array<{ id: string; scene_number: string; text_content: string }>;

      const fullText = scenes.map((s) => `[Scene ${s.scene_number}] ${s.text_content}`).join("\n\n");
      const conflicts = await detectValueConflicts(char.name, field.field_name, field_value, fullText);

      const insertConflict = db.prepare(
        `INSERT INTO value_conflicts (id, character_id, field_id, scene_id, conflicting_text, reasoning)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      db.prepare("DELETE FROM value_conflicts WHERE character_id = ? AND field_id = ?").run(charId, fieldId);

      for (const conflict of conflicts) {
        const matchedScene = scenes.find((s) => s.text_content.includes(conflict.conflicting_text));
        if (matchedScene) {
          insertConflict.run(uuidv4(), charId, fieldId, matchedScene.id, conflict.conflicting_text, conflict.reasoning);
        }
      }
    } catch (err) {
      console.error("Conflict detection failed:", err);
    }
  }

  const updatedField = db
    .prepare(
      `SELECT pf.*, sa.anchor_text, sa.scene_id as anchor_scene_id
       FROM profile_fields pf
       LEFT JOIN source_anchors sa ON sa.id = pf.source_anchor_id
       WHERE pf.id = ?`
    )
    .get(fieldId);

  res.json({ field: updatedField, scriptUpdate: scriptUpdateInfo });
});

router.post("/:id/generate-image", async (req: Request, res: Response) => {
  const char = db.prepare("SELECT * FROM characters WHERE id = ?").get(req.params.id) as {
    id: string;
    script_id: string;
    name: string;
    image_url: string | null;
  } | undefined;
  if (!char) return res.status(404).json({ error: "Not found" });

  const fields = db
    .prepare("SELECT field_name, field_value FROM profile_fields WHERE character_id = ?")
    .all(char.id) as Array<{ field_name: string; field_value: string }>;

  const appearance = fields.find((f) => f.field_name === "Appearance")?.field_value ?? "";
  const values = fields.find((f) => f.field_name === "Values")?.field_value ?? "";

  try {
    const imageUrl = await generateCharacterImage(char.name, appearance, values);
    db.prepare("UPDATE characters SET image_url = ? WHERE id = ?").run(imageUrl, char.id);
    res.json({ image_url: imageUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

router.post("/:id/generate-video", async (req: Request, res: Response) => {
  const char = db.prepare("SELECT * FROM characters WHERE id = ?").get(req.params.id) as {
    id: string;
    image_url: string | null;
  } | undefined;
  if (!char) return res.status(404).json({ error: "Not found" });
  if (!char.image_url) return res.status(400).json({ error: "Generate image first" });

  try {
    const videoUrl = await generateCharacterVideo(char.image_url, req.params.id);
    db.prepare("UPDATE characters SET video_url = ? WHERE id = ?").run(videoUrl, char.id);
    res.json({ video_url: videoUrl });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: String(err) });
  }
});

router.get("/:id/conflicts", (req: Request, res: Response) => {
  const conflicts = db
    .prepare("SELECT * FROM value_conflicts WHERE character_id = ?")
    .all(req.params.id);
  res.json(conflicts);
});

export default router;
