import React from "react";
import type { Scene, Comment } from "../api";

interface Props {
  scene: Scene;
  comments: Comment[];
  onTextSelect: (scene: Scene, start: number, end: number, text: string) => void;
  activeCommentId: string | null;
  conflictTexts: Set<string>;
}

interface Segment {
  text: string;
  type: "action" | "character" | "dialogue" | "parenthetical" | "transition";
}

function parseTextContent(content: string): Segment[] {
  const segments: Segment[] = [];
  let remaining = content;
  const tagRe = /\[(CHARACTER|DIALOGUE|PARENTHETICAL|TRANSITION)\]([\s\S]*?)\[\/\1\]/;

  while (remaining.length > 0) {
    const match = tagRe.exec(remaining);
    if (!match) {
      if (remaining.trim()) segments.push({ text: remaining.trim(), type: "action" });
      break;
    }
    if (match.index > 0) {
      const before = remaining.slice(0, match.index).trim();
      if (before) segments.push({ text: before, type: "action" });
    }
    segments.push({ text: match[2].trim(), type: match[1].toLowerCase() as Segment["type"] });
    remaining = remaining.slice(match.index + match[0].length);
  }

  return segments;
}

function applyHighlights(
  text: string,
  sceneComments: Comment[],
  activeCommentId: string | null
): React.ReactNode {
  if (sceneComments.length === 0) return text;

  const parts: React.ReactNode[] = [];
  let remaining = text;
  let offset = 0;

  for (const comment of sceneComments) {
    const idx = remaining.indexOf(comment.highlighted_text);
    if (idx === -1) continue;

    if (idx > 0) {
      parts.push(remaining.slice(0, idx));
    }

    parts.push(
      <mark
        key={comment.id + offset}
        className={`highlight${comment.id === activeCommentId ? " highlight-active" : ""}`}
        title={`${comment.author_name}: ${comment.note_text}`}
      >
        {comment.highlighted_text}
      </mark>
    );

    remaining = remaining.slice(idx + comment.highlighted_text.length);
    offset += idx + comment.highlighted_text.length;
  }

  if (remaining) parts.push(remaining);
  return parts.length > 0 ? <>{parts}</> : text;
}

export default function SceneBlock({ scene, comments, onTextSelect, activeCommentId, conflictTexts }: Props) {
  const segments = parseTextContent(scene.text_content);
  const sceneComments = comments.filter((c) => c.scene_id === scene.id);

  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selected = selection.toString().trim();
    if (!selected || selected.length < 2) return;

    const container = e.currentTarget;
    const range = selection.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + selected.length;

    selection.removeAllRanges();
    onTextSelect(scene, start, end, selected);
  }

  function renderSegment(seg: Segment, idx: number): React.ReactNode {
    const hasConflict = [...conflictTexts].some((ct) => seg.text.includes(ct));
    const content = applyHighlights(seg.text, sceneComments, activeCommentId);

    switch (seg.type) {
      case "character":
        return <p key={idx} className="sp-character">{seg.text}</p>;
      case "dialogue":
        return (
          <p key={idx} className={`sp-dialogue${hasConflict ? " conflict" : ""}`}>
            {content}
          </p>
        );
      case "parenthetical":
        return <p key={idx} className="sp-parenthetical">{seg.text}</p>;
      case "transition":
        return <p key={idx} className="sp-transition">{seg.text}</p>;
      default:
        return (
          <p key={idx} className={`sp-action${hasConflict ? " conflict" : ""}`}>
            {content}
          </p>
        );
    }
  }

  return (
    <div className="scene-block" id={`scene-${scene.id}`}>
      <h2 className="sp-heading">
        <span className="scene-num">{scene.scene_number}</span>
        {scene.heading}
      </h2>
      <div onMouseUp={handleMouseUp}>
        {segments.map((seg, i) => renderSegment(seg, i))}
      </div>
    </div>
  );
}
