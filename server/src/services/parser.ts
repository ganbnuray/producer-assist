import pdfParse from "pdf-parse";
import fs from "fs";

export interface ParsedScene {
  sceneNumber: string;
  heading: string;
  textContent: string;
  orderIndex: number;
}

type Context = "action" | "character" | "dialogue";

const HEADING_RE = /^(INT\.|EXT\.|INT\/EXT\.|I\/E\.)/i;
const TRAILING_NUM_RE = /^(.*?)\s*(\d+)\s*$/;
const CHARACTER_RE = /^[A-Z][A-Z0-9\s\-\.']+(\s*\([^)]+\))?$/;
const PARENTHETICAL_RE = /^\(.*\)$/;
const PAGE_NUM_RE = /^\d+\.$/;

function isHeading(line: string): boolean {
  return HEADING_RE.test(line.trim());
}

function isCharacter(line: string): boolean {
  const t = line.trim();
  if (t.length === 0 || t.length > 60) return false;
  if (/[a-z]/.test(t)) return false;
  if (PARENTHETICAL_RE.test(t)) return false;
  return CHARACTER_RE.test(t);
}

function extractSceneNumber(headingLine: string): { sceneNumber: string; heading: string } {
  const trimmed = headingLine.trim();
  const m = trimmed.match(TRAILING_NUM_RE);
  if (m) {
    const possibleNum = m[2];
    const possibleHeading = m[1].trim();
    if (HEADING_RE.test(possibleHeading)) {
      return { sceneNumber: possibleNum, heading: possibleHeading };
    }
  }
  return { sceneNumber: "?", heading: trimmed };
}

export async function parsePdf(filePath: string): Promise<ParsedScene[]> {
  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);
  return parseScreenplayText(data.text);
}

export function parseScreenplayText(text: string): ParsedScene[] {
  const lines: string[] = text.split("\n").map((l) => l.trimEnd());

  const scenes: ParsedScene[] = [];
  let currentScene: ParsedScene | null = null;
  let orderIndex = 0;

  let ctx: Context = "action";
  let buffer: string[] = [];

  function appendToScene(part: string) {
    if (!currentScene || !part.trim()) return;
    currentScene.textContent += (currentScene.textContent ? "\n" : "") + part;
  }

  function flushBuffer() {
    if (buffer.length === 0) return;
    const joined = buffer.join(" ").trim();
    buffer = [];
    if (!joined || !currentScene) return;

    if (ctx === "dialogue") {
      appendToScene(`[DIALOGUE]${joined}[/DIALOGUE]`);
    } else {
      appendToScene(joined);
    }
  }

  for (const raw of lines) {
    const trimmed = raw.trim();

    if (!trimmed || PAGE_NUM_RE.test(trimmed)) {
      flushBuffer();
      if (ctx === "dialogue") ctx = "action";
      continue;
    }

    if (isHeading(trimmed)) {
      flushBuffer();
      ctx = "action";
      if (currentScene) scenes.push(currentScene);

      const { sceneNumber, heading } = extractSceneNumber(trimmed);
      currentScene = { sceneNumber, heading, textContent: "", orderIndex: orderIndex++ };
      continue;
    }

    if (!currentScene) continue;

    if (PARENTHETICAL_RE.test(trimmed) && ctx === "dialogue") {
      flushBuffer();
      appendToScene(`[PARENTHETICAL]${trimmed}[/PARENTHETICAL]`);
      continue;
    }

    if (isCharacter(trimmed)) {
      flushBuffer();
      ctx = "character";
      appendToScene(`[CHARACTER]${trimmed}[/CHARACTER]`);
      ctx = "dialogue";
      continue;
    }

    if (ctx === "dialogue") {
      buffer.push(trimmed);
      continue;
    }

    buffer.push(trimmed);
  }

  flushBuffer();
  if (currentScene) scenes.push(currentScene);

  return scenes;
}
