import { useState } from "react";
import type { EditLog } from "../api";
import { api } from "../api";

interface Props {
  logs: EditLog[];
  currentUserId: string;
  onReverted: (newLog: EditLog) => void;
}

export default function VersionHistory({ logs, currentUserId, onReverted }: Props) {
  const [reverting, setReverting] = useState<string | null>(null);

  async function handleRevert(log: EditLog) {
    setReverting(log.id);
    try {
      await api.history.revert(log.id, currentUserId);
      const newLogs = await api.history.forScript(log.script_id);
      if (newLogs.length > 0) onReverted(newLogs[0]);
    } catch (e) {
      alert("Revert failed: " + e);
    } finally {
      setReverting(null);
    }
  }

  if (logs.length === 0) {
    return <p className="empty-hint">No edits yet.</p>;
  }

  return (
    <div className="version-history">
      {logs.map((log) => (
        <div key={log.id} className="log-entry">
          <div className="log-header">
            <span className="log-author">{log.author_name}</span>
            <span className="log-time">{new Date(log.created_at).toLocaleString()}</span>
          </div>
          <p className="log-desc">
            Changed <strong>{log.field_name}</strong>
          </p>
          {log.old_value && (
            <p className="log-old">
              <span>Before:</span> {log.old_value}
            </p>
          )}
          {log.new_value && (
            <p className="log-new">
              <span>After:</span> {log.new_value}
            </p>
          )}
          {log.old_value && (
            <button
              className="btn-secondary btn-sm"
              onClick={() => handleRevert(log)}
              disabled={reverting === log.id}
            >
              {reverting === log.id ? "Reverting…" : "Revert"}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
