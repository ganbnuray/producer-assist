import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "./api";
import type { Script, Scene, Comment, Character, ProfileField, EditLog, User } from "./api";
import SceneBlock from "./components/SceneBlock";
import CommentPanel from "./components/CommentPanel";
import CharacterProfile from "./components/CharacterProfile";
import VersionHistory from "./components/VersionHistory";
import "./App.css";

type Panel = "comments" | "characters" | "history";

export default function App() {
  const [scripts, setScripts] = useState<Script[]>([]);
  const [activeScript, setActiveScript] = useState<Script | null>(null);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [comments, setComments] = useState<Comment[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [editLogs, setEditLogs] = useState<EditLog[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [currentUserId, setCurrentUserId] = useState("user-1");
  const [panel, setPanel] = useState<Panel>("comments");
  const [activeCharacterId, setActiveCharacterId] = useState<string | null>(null);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [pendingSelection, setPendingSelection] = useState<{
    scene: Scene;
    start: number;
    end: number;
    text: string;
  } | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadScript(script: Script) {
    setActiveScript(script);
    setScenes([]);
    setComments([]);
    setCharacters([]);
    setEditLogs([]);
    setActiveCharacterId(null);
    setPendingSelection(null);

    const [s, c, h] = await Promise.all([
      api.scenes.forScript(script.id),
      api.comments.forScript(script.id),
      api.history.forScript(script.id),
    ]);
    setScenes(s);
    setComments(c);
    setEditLogs(h);

    const chars = await api.characters.forScript(script.id);
    if (chars.length > 0) {
      const full = await Promise.all(chars.map((ch) => api.characters.get(ch.id)));
      setCharacters(full);
      setActiveCharacterId(full[0].id);
    }
  }

  useEffect(() => {
    api.users.list().then(setUsers).catch(console.error);
    api.scripts.list().then((s) => {
      setScripts(s);
      if (s.length > 0) loadScript(s[0]);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const title = file.name.replace(/\.pdf$/i, "");
      const result = await api.scripts.upload(file, title);
      if (result.error) throw new Error(result.error);
      const updated = await api.scripts.list();
      setScripts(updated);
      const newScript = updated.find((s: Script) => s.id === result.id);
      if (newScript) loadScript(newScript);
    } catch (e) {
      setUploadError(String(e));
    } finally {
      setUploading(false);
    }
  }

  async function handleExtractCharacters() {
    if (!activeScript) return;
    setExtracting(true);
    try {
      await api.scripts.extractCharacters(activeScript.id);
      const chars = await api.characters.forScript(activeScript.id);
      const full = await Promise.all(chars.map((c) => api.characters.get(c.id)));
      setCharacters(full);
      if (full.length > 0) {
        setActiveCharacterId(full[0].id);
        setPanel("characters");
      }
    } catch (e) {
      alert("Extraction failed: " + e);
    } finally {
      setExtracting(false);
    }
  }

  function handleTextSelect(scene: Scene, start: number, end: number, text: string) {
    setPendingSelection({ scene, start, end, text });
    setPanel("comments");
  }

  const handleFieldUpdated = useCallback(
    async (_charId: string, _field: ProfileField, _scriptUpdate: unknown) => {
      if (!activeScript) return;
      const [updatedScenes, logs] = await Promise.all([
        api.scenes.forScript(activeScript.id),
        api.history.forScript(activeScript.id),
      ]);
      setScenes(updatedScenes);
      setEditLogs(logs);
    },
    [activeScript]
  );

  const activeCharacter = characters.find((c) => c.id === activeCharacterId) ?? null;

  const [conflictTexts, setConflictTexts] = useState(new Set<string>());

  useEffect(() => {
    if (!activeCharacterId) return;
    api.characters.conflicts(activeCharacterId).then((cs) => {
      setConflictTexts(new Set(cs.map((c) => c.conflicting_text)));
    }).catch(() => {});
  }, [activeCharacterId]);

  return (
    <div className="app-layout">
      <header className="app-header">
        <span className="logo">Sputo</span>

        <div className="header-scripts">
          {scripts.map((s) => (
            <button
              key={s.id}
              className={`script-tab${activeScript?.id === s.id ? " active" : ""}`}
              onClick={() => loadScript(s)}
            >
              {s.title}
            </button>
          ))}
          <button
            className="btn-upload"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? "Uploading…" : "+ Upload"}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleUpload(file);
              e.target.value = "";
            }}
          />
        </div>

        <div className="header-right">
          <select
            value={currentUserId}
            onChange={(e) => setCurrentUserId(e.target.value)}
            className="user-picker"
          >
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </div>
      </header>

      {uploadError && <div className="upload-error">{uploadError}</div>}

      {!activeScript ? (
        <div className="empty-state">
          <p>Upload a script PDF to get started.</p>
        </div>
      ) : (
        <div className="main-content">
          <div className="script-viewer">
            <div className="script-actions">
              <h1 className="script-title">{activeScript.title}</h1>
              {characters.length === 0 ? (
                <button onClick={handleExtractCharacters} disabled={extracting} className="btn-extract">
                  {extracting ? "Extracting characters…" : "Extract Characters"}
                </button>
              ) : (
                <span className="char-count">{characters.length} characters extracted</span>
              )}
            </div>
            <div className="screenplay">
              {scenes.map((scene) => (
                <SceneBlock
                  key={scene.id}
                  scene={scene}
                  comments={comments}
                  onTextSelect={handleTextSelect}
                  activeCommentId={activeCommentId}
                  conflictTexts={conflictTexts}
                />
              ))}
            </div>
          </div>

          <aside className="side-panel">
            <div className="panel-tabs">
              <button
                className={panel === "comments" ? "active" : ""}
                onClick={() => setPanel("comments")}
              >
                Comments{comments.length > 0 ? ` (${comments.length})` : ""}
              </button>
              <button
                className={panel === "characters" ? "active" : ""}
                onClick={() => setPanel("characters")}
              >
                Characters
              </button>
              <button
                className={panel === "history" ? "active" : ""}
                onClick={() => setPanel("history")}
              >
                History
              </button>
            </div>

            <div className="panel-body">
              {panel === "comments" && (
                <CommentPanel
                  comments={comments}
                  scenes={scenes}
                  activeCommentId={activeCommentId}
                  onSelect={setActiveCommentId}
                  onDeleted={(id) => setComments((prev) => prev.filter((c) => c.id !== id))}
                  pendingSelection={pendingSelection}
                  onCommentCreated={(c) => {
                    setComments((prev) => [c, ...prev]);
                    setActiveCommentId(c.id);
                  }}
                  onCancelPending={() => setPendingSelection(null)}
                  currentUserId={currentUserId}
                />
              )}

              {panel === "characters" && (
                <div className="characters-panel">
                  <div className="character-tabs">
                    {characters.map((c) => (
                      <button
                        key={c.id}
                        className={activeCharacterId === c.id ? "active" : ""}
                        onClick={() => setActiveCharacterId(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                  {activeCharacter ? (
                    <CharacterProfile
                      key={activeCharacter.id}
                      character={activeCharacter}
                      currentUserId={currentUserId}
                      onFieldUpdated={handleFieldUpdated}
                      onCharacterUpdated={(updated) =>
                        setCharacters((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
                      }
                    />
                  ) : (
                    <p className="empty-hint">
                      {characters.length === 0
                        ? "Click 'Extract Characters' to analyse the script."
                        : "Select a character."}
                    </p>
                  )}
                </div>
              )}

              {panel === "history" && (
                <VersionHistory
                  logs={editLogs}
                  currentUserId={currentUserId}
                  onReverted={async () => {
                    if (!activeScript) return;
                    const [logs, chars, updatedScenes] = await Promise.all([
                      api.history.forScript(activeScript.id),
                      Promise.all(characters.map((c) => api.characters.get(c.id))),
                      api.scenes.forScript(activeScript.id),
                    ]);
                    setEditLogs(logs);
                    setCharacters(chars);
                    setScenes(updatedScenes);
                  }}
                />
              )}
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}
