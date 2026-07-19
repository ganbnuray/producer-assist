import Anthropic from "@anthropic-ai/sdk";
import db from "../db";

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

interface CharacterField {
  field_name: string;
  field_value: string;
  anchor_text: string;
  anchor_scene_number: string;
}

interface ExtractedCharacter {
  name: string;
  fields: CharacterField[];
}

export async function extractCharacters(scriptId: string): Promise<ExtractedCharacter[]> {
  const scenes = db.prepare("SELECT * FROM scenes WHERE script_id = ? ORDER BY order_index").all(scriptId) as Array<{
    id: string;
    scene_number: string;
    heading: string;
    text_content: string;
  }>;

  const scriptText = scenes
    .map((s) => `[SCENE ${s.scene_number}: ${s.heading}]\n${s.text_content}`)
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `You are analyzing a screenplay extract. Extract character profiles for every named character who appears in a scene or has dialogue.

For each character, provide:
- name: Character's full name as it appears in the script
- fields: Array of profile fields. For each field, include:
  - field_name: one of "Name", "Age", "Appearance", "Values", "Gifts", "Challenges"
  - field_value: the value inferred from the script
  - anchor_text: a short verbatim quote from the script (5-20 words) that is the primary evidence for this field value. Must be exact text from the screenplay.
  - anchor_scene_number: the scene number where anchor_text appears

Return ONLY valid JSON in this exact format:
{
  "characters": [
    {
      "name": "CHARACTER NAME",
      "fields": [
        {
          "field_name": "Name",
          "field_value": "...",
          "anchor_text": "exact quote from script",
          "anchor_scene_number": "9"
        }
      ]
    }
  ]
}

Only include characters with enough script presence to infer at least 2 fields. Skip very minor background characters.

SCREENPLAY:
${scriptText}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("No JSON found in Claude response");

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.characters as ExtractedCharacter[];
}

export async function rewriteAnchorPassage(
  anchorText: string,
  fieldName: string,
  oldValue: string,
  newValue: string
): Promise<string> {
  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are rewriting a passage in a screenplay to reflect an updated character detail.

Original passage (verbatim from screenplay):
"${anchorText}"

The character's ${fieldName} has changed:
- Old: ${oldValue}
- New: ${newValue}

Rewrite ONLY the passage above so it reflects the new ${fieldName}. Keep the same tone, style, and length as the original. Keep as much of the original wording as possible — only change what is necessary. Return ONLY the rewritten passage, no explanation.`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");
  return content.text.trim();
}

export async function detectValueConflicts(
  characterName: string,
  fieldName: string,
  newValue: string,
  scriptText: string
): Promise<Array<{ scene_id: string; conflicting_text: string; reasoning: string }>> {
  const response = await client.messages.create({
    model: "claude-opus-4-5",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `A character's ${fieldName} has been updated to: "${newValue}"

Review the screenplay below and identify any actions, dialogue, or descriptions of ${characterName} that contradict or are inconsistent with this ${fieldName}.

Return ONLY valid JSON:
{
  "conflicts": [
    {
      "conflicting_text": "exact quote from screenplay",
      "reasoning": "brief explanation of why this conflicts"
    }
  ]
}

If there are no conflicts, return: { "conflicts": [] }

SCREENPLAY:
${scriptText}`,
      },
    ],
  });

  const content = response.content[0];
  if (content.type !== "text") throw new Error("Unexpected response type");

  const jsonMatch = content.text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  const parsed = JSON.parse(jsonMatch[0]);
  return parsed.conflicts || [];
}
