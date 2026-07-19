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
      if (remaining.trim()) segments.push({ text: remaining, type: "action" });
      break;
    }

    if (match.index > 0) {
      const before = remaining.slice(0, match.index);
      if (before.trim()) segments.push({ text: before, type: "action" });
    }

    const type = match[1].toLowerCase() as Segment["type"];
    segments.push({ text: match[2], type });
    remaining = remaining.slice(match.index + match[0].length);
  }

  return segments;
}

function buildHighlightedText(
  plainText: string,
  comments: Comment[],
  sceneId: string,
  activeCommentId: string | null,
  conflictTexts: Set<string>
): React.ReactNode[] {
  interface Span {
    start: number;
    end: number;
    commentId: string;
    isActive: boolean;
    note: string;
    author: string;
  }

  const spans: Span[] = comments
    .filter((c) => c.scene_id === sceneId)
    .map((c) => ({
      start: c.start_offset,
      end: c.end_offset,
      commentId: c.id,
      isActive: c.id === activeCommentId,
      note: c.note_text,
      author: c.author_name,
    }));

  if (spans.length === 0 && conflictTexts.size === 0) return [plainText];

  const nodes: React.ReactNode[] = [];
  let pos = 0;

  const events: Array<{ pos: number; type: "open" | "close"; span: Span }> = [];
  for (const span of spans) {
    events.push({ pos: span.start, type: "open", span });
    events.push({ pos: span.end, type: "close", span });
  }
  events.sort((a, b) => a.pos - b.pos || (a.type === "close" ? -1 : 1));

  let key = 0;
  for (const ev of events) {
    if (ev.pos > pos) {
      const slice = plainText.slice(pos, ev.pos);
      nodes.push(slice);
      pos = ev.pos;
    }
    if (ev.type === "open") {
      const highlighted = plainText.slice(ev.span.start, ev.span.end);
      nodes.push(
        <mark
          key={key++}
          className={`highlight ${ev.span.isActive ? "highlight-active" : ""}`}
          title={`${ev.span.author}: ${ev.span.note}`}
        >
          {highlighted}
        </mark>
      );
      pos = ev.span.end;
    }
  }

  if (pos < plainText.length) nodes.push(plainText.slice(pos));

  return nodes;
}

function getPlainText(content: string): string {
  return content.replace(/\[\/?(CHARACTER|DIALOGUE|PARENTHETICAL|TRANSITION)\]/g, "").replace(/\n/g, " ");
}

export default function SceneBlock({ scene, comments, onTextSelect, activeCommentId, conflictTexts }: Props) {
  const segments = parseTextContent(scene.text_content);

  function handleMouseUp(e: React.MouseEvent<HTMLDivElement>) {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed) return;

    const selected = selection.toString().trim();
    if (!selected) return;

    const container = e.currentTarget;
    const range = selection.getRangeAt(0);
    const preRange = document.createRange();
    preRange.selectNodeContents(container);
    preRange.setEnd(range.startContainer, range.startOffset);
    const start = preRange.toString().length;
    const end = start + selected.length;

    onTextSelect(scene, start, end, selected);
  }

  function renderSegment(seg: Segment, segIdx: number): React.ReactNode {
    const hasConflict = conflictTexts.has(seg.text.trim());
    const sceneComments = comments.filter((c) => c.scene_id === scene.id);
    const highlighted = buildHighlightedText(seg.text, sceneComments, scene.id, activeCommentId, conflictTexts);

    switch (seg.type) {
      case "character":
        return (
          <p key={segIdx} className="sp-character">
            {seg.text}
          </p>
        );
      case "dialogue":
        return (
          <p key={segIdx} className={`sp-dialogue${hasConflict ? " conflict" : ""}`}>
            {highlighted}
          </p>
        );
      case "parenthetical":
        return (
          <p key={segIdx} className="sp-parenthetical">
            {seg.text}
          </p>
        );
      case "transition":
        return (
          <p key={segIdx} className="sp-transition">
            {seg.text}
          </p>
        );
      default:
        return (
          <p key={segIdx} className={`sp-action${hasConflict ? " conflict" : ""}`}>
            {highlighted}
          </p>
        );
    }
  }

  return (
    <div className="scene-block" id={`scene-${scene.id}`} onMouseUp={handleMouseUp}>
      <h2 className="sp-heading">
        <span className="scene-num">{scene.scene_number}</span>
        {scene.heading}
      </h2>
      {segments.map((seg, i) => renderSegment(seg, i))}
    </div>
  );
}

export { getPlainText };
