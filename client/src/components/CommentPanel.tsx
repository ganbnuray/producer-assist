import { useState } from "react";
import type { Comment, Scene } from "../api";
import { api } from "../api";

interface Props {
  comments: Comment[];
  scenes: Scene[];
  activeCommentId: string | null;
  onSelect: (id: string | null) => void;
  onDeleted: (id: string) => void;
  pendingSelection: { scene: Scene; start: number; end: number; text: string } | null;
  onCommentCreated: (c: Comment) => void;
  onCancelPending: () => void;
  currentUserId: string;
}

export default function CommentPanel({
  comments,
  scenes,
  activeCommentId,
  onSelect,
  onDeleted,
  pendingSelection,
  onCommentCreated,
  onCancelPending,
  currentUserId,
}: Props) {
  const [noteText, setNoteText] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sceneMap = Object.fromEntries(scenes.map((s) => [s.id, s]));

  async function handleSaveComment() {
    if (!pendingSelection || !noteText.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const c = await api.comments.create({
        script_id: pendingSelection.scene.script_id,
        scene_id: pendingSelection.scene.id,
        start_offset: pendingSelection.start,
        end_offset: pendingSelection.end,
        highlighted_text: pendingSelection.text,
        note_text: noteText.trim(),
        author_id: currentUserId,
      });
      onCommentCreated(c);
      setNoteText("");
      onCancelPending();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await api.comments.delete(id);
    onDeleted(id);
  }

  return (
    <div className="comment-panel">
      <h3>Comments</h3>

      {pendingSelection && (
        <div className="pending-comment">
          <p className="pending-quote">"{pendingSelection.text}"</p>
          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note..."
            rows={3}
            autoFocus
          />
          {error && <p className="error">{error}</p>}
          <div className="pending-actions">
            <button onClick={handleSaveComment} disabled={saving || !noteText.trim()}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button onClick={onCancelPending} className="btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="comment-list">
        {comments.length === 0 && !pendingSelection && (
          <p className="empty-hint">Select text in the script to add a comment.</p>
        )}
        {comments.map((c) => {
          const scene = sceneMap[c.scene_id];
          return (
            <div
              key={c.id}
              className={`comment-item${activeCommentId === c.id ? " active" : ""}`}
              onClick={() => onSelect(activeCommentId === c.id ? null : c.id)}
            >
              <p className="comment-quote">"{c.highlighted_text}"</p>
              {scene && <p className="comment-scene">Scene {scene.scene_number}</p>}
              <p className="comment-note">{c.note_text}</p>
              <div className="comment-meta">
                <span className="comment-author">{c.author_name}</span>
                <span className="comment-time">{new Date(c.created_at).toLocaleDateString()}</span>
                <button
                  className="btn-danger-sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(c.id);
                  }}
                >
                  ×
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
