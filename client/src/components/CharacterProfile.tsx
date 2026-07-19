import { useState, useEffect } from "react";
import type { Character, ProfileField, ValueConflict } from "../api";
import { api } from "../api";

interface Props {
  character: Character;
  currentUserId: string;
  onFieldUpdated: (charId: string, field: ProfileField, scriptUpdate: unknown) => void;
  onCharacterUpdated: (c: Character) => void;
}

const FIELD_ORDER = ["Name", "Age", "Appearance", "Values", "Gifts", "Challenges"];

export default function CharacterProfile({ character, currentUserId, onFieldUpdated, onCharacterUpdated }: Props) {
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingVideo, setGeneratingVideo] = useState(false);
  const [conflicts, setConflicts] = useState<ValueConflict[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.characters.conflicts(character.id).then(setConflicts).catch(() => {});
  }, [character.id]);

  const sortedFields = [...character.fields].sort((a, b) => {
    const ai = FIELD_ORDER.indexOf(a.field_name);
    const bi = FIELD_ORDER.indexOf(b.field_name);
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
  });

  function startEdit(field: ProfileField) {
    setEditingFieldId(field.id);
    setEditValue(field.field_value);
    setError(null);
  }

  async function saveEdit(field: ProfileField) {
    if (!editValue.trim() || editValue === field.field_value) {
      setEditingFieldId(null);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const result = await api.characters.updateField(character.id, field.id, editValue, currentUserId);
      onFieldUpdated(character.id, result.field, result.scriptUpdate);
      setEditingFieldId(null);

      const updated = await api.characters.get(character.id);
      onCharacterUpdated(updated);

      if (field.field_name === "Values") {
        const newConflicts = await api.characters.conflicts(character.id);
        setConflicts(newConflicts);
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleGenerateImage() {
    setGeneratingImage(true);
    setError(null);
    try {
      const { image_url } = await api.characters.generateImage(character.id);
      onCharacterUpdated({ ...character, image_url });
    } catch (e) {
      setError(String(e));
    } finally {
      setGeneratingImage(false);
    }
  }

  async function handleGenerateVideo() {
    setGeneratingVideo(true);
    setError(null);
    try {
      const { video_url } = await api.characters.generateVideo(character.id);
      onCharacterUpdated({ ...character, video_url });
    } catch (e) {
      setError(String(e));
    } finally {
      setGeneratingVideo(false);
    }
  }

  const conflictFieldIds = new Set(conflicts.map((c) => c.field_id));

  return (
    <div className="character-profile">
      <div className="char-media">
        {character.video_url ? (
          <video
            src={character.video_url!}
            autoPlay
            loop
            muted
            playsInline
            className="char-video"
          />
        ) : character.image_url ? (
          <img
            src={character.image_url!}
            alt={character.name}
            className="char-image"
          />
        ) : (
          <div className="char-placeholder">
            <span>No image</span>
          </div>
        )}

        <div className="char-media-actions">
          <button onClick={handleGenerateImage} disabled={generatingImage || generatingVideo}>
            {generatingImage ? "Generating…" : character.image_url ? "Regenerate Image" : "Generate Image"}
          </button>
          {character.image_url && (
            <button onClick={handleGenerateVideo} disabled={generatingVideo || generatingImage}>
              {generatingVideo ? "Generating video…" : character.video_url ? "Regenerate Video" : "Generate Video"}
            </button>
          )}
        </div>
      </div>

      {error && <p className="error">{error}</p>}

      {conflicts.length > 0 && (
        <div className="conflict-banner">
          <strong>Value conflicts detected</strong>
          <ul>
            {conflicts.map((c) => (
              <li key={c.id} title={c.reasoning}>
                "{c.conflicting_text.slice(0, 60)}…"
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="profile-fields">
        {sortedFields.map((field) => (
          <div key={field.id} className={`profile-field${conflictFieldIds.has(field.id) ? " has-conflict" : ""}`}>
            <label className="field-name">{field.field_name}</label>

            {editingFieldId === field.id ? (
              <div className="field-edit">
                <textarea
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  rows={3}
                  autoFocus
                />
                <div className="field-edit-actions">
                  <button onClick={() => saveEdit(field)} disabled={saving}>
                    {saving ? "Saving…" : "Save"}
                  </button>
                  <button onClick={() => setEditingFieldId(null)} className="btn-secondary">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="field-display" onClick={() => startEdit(field)}>
                <span className="field-value">{field.field_value || <em>—</em>}</span>
                <span className="field-edit-hint">click to edit</span>
              </div>
            )}

            {field.anchor_text && (
              <p className="field-anchor">Source: "{field.anchor_text.slice(0, 80)}"</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
