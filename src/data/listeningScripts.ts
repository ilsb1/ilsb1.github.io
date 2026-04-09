import { units } from "./listenings";
import scriptsRaw from "../../listening_scripts_grouped_by_unit.txt?raw";

export type ScriptBlock =
  | { type: "heading"; text: string }
  | { type: "note"; text: string }
  | { type: "paragraph"; text: string }
  | { type: "dialogue"; speaker: string; text: string };

export type ScriptTrack = {
  title: string;
  file: string;
};

export type UnitScript = {
  unit: number;
  title: string;
  trackLinks: ScriptTrack[];
  blocks: ScriptBlock[];
};

const titleFallback: Record<number, string> = {
  1: "MindTalk Radio: Who We Are and Who We Admire",
  2: "Academic Success Seminar: Learning Styles and Study Strategies",
  3: "Future Tech Cafe Chat",
  4: "The Characters in Famous Paintings",
  5: "Don't Judge a Book by Its Film",
  6: "Student Voices: Fashion, Trends and Online Shopping",
  7: "Healthy Choices for Student Life",
  8: "Budget vs Luxury Travel and Travel Agency Advertisements",
  9: "International Weather Forecast",
  10: "Environmental Challenges and Renewable Solutions",
};

const parseRawSections = (raw: string): Record<number, { title: string; text: string }> => {
  const sectionRegex =
    /(?:^|\n)\s*(?:🎧\s*)?(?:unit|Unit|UNIt)\s*([0-9]+)[^\n]*\n([\s\S]*?)(?=(?:\n\s*(?:🎧\s*)?(?:unit|Unit|UNIt)\s*[0-9]+[^\n]*\n)|$)/g;

  const result: Record<number, { title: string; text: string }> = {};
  let match: RegExpExecArray | null = sectionRegex.exec(raw);

  while (match) {
    const unit = Number(match[1]);
    const body = match[2].trim();
    const firstLine = body.split("\n").map((line) => line.trim()).find(Boolean) ?? "";
    const title = titleFallback[unit] ?? firstLine;
    const existing = result[unit];

    result[unit] = {
      title,
      text: existing ? `${existing.text}\n\n${body}` : body,
    };

    match = sectionRegex.exec(raw);
  }

  return result;
};

const rawScripts = parseRawSections(scriptsRaw);

const normalizeSpeaker = (raw: string): string => raw.replace(/\s+/g, " ").trim();

const cleanLine = (line: string): string =>
  line
    .replace(/^\p{Emoji_Presentation}+/gu, "")
    .replace(/^[\u2600-\u27BF\u{1F300}-\u{1FAFF}]+\s*/gu, "")
    .replace(/\s{2,}/g, " ")
    .replace(/([.!?])([A-Z])/g, "$1 $2")
    .trim();

const isAdvertisementHeading = (line: string): boolean =>
  /^Advertisement\s+\d+\s*[–-]/i.test(line);

const isLikelySpeaker = (candidate: string): boolean => {
  const speaker = normalizeSpeaker(candidate).replace(/[()]/g, "").replace(/\s*[–-]\s*/g, " ");
  if (!speaker) return false;
  if (speaker.length > 35) return false;
  if (speaker.includes(",")) return false;
  if (/[!?]/.test(speaker)) return false;
  const words = speaker.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 7) return false;
  return words.every((word) => /^[A-Za-z0-9.\-']+$/.test(word));
};

const splitLongParagraph = (text: string): string[] => {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= 340) return [normalized];

  const sentences =
    normalized.match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [normalized];

  const chunks: string[] = [];
  let current = "";

  for (const sentence of sentences) {
    if (!current) {
      current = sentence;
      continue;
    }

    const next = `${current} ${sentence}`;
    if (next.length <= 320) {
      current = next;
      continue;
    }

    chunks.push(current);
    current = sentence;
  }

  if (current) chunks.push(current);
  return chunks;
};

const parseScript = (text: string): ScriptBlock[] => {
  const lines = text
    .split("\n")
    .map(cleanLine)
    .filter(Boolean);

  const blocks: ScriptBlock[] = [];
  let paragraphBuffer: string[] = [];
  let pendingSpeaker: string | null = null;

  const flushParagraph = () => {
    if (!paragraphBuffer.length) return;
    const fullParagraph = paragraphBuffer.join(" ");
    for (const part of splitLongParagraph(fullParagraph)) {
      blocks.push({ type: "paragraph", text: part });
    }
    paragraphBuffer = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/^🎧\s*/, "").trim();

    if (/^unit\s+\d+/i.test(line)) {
      flushParagraph();
      continue;
    }

    if (pendingSpeaker) {
      const dialogueSpeakerAndText = line.match(/^([^:]{1,40}):\s*(.+)$/);
      if (dialogueSpeakerAndText && isLikelySpeaker(dialogueSpeakerAndText[1])) {
        blocks.push({
          type: "dialogue",
          speaker: normalizeSpeaker(pendingSpeaker),
          text: line,
        });
        pendingSpeaker = null;
        continue;
      }

      blocks.push({
        type: "dialogue",
        speaker: normalizeSpeaker(pendingSpeaker),
        text: line,
      });
      pendingSpeaker = null;
      continue;
    }

    if (isAdvertisementHeading(line)) {
      flushParagraph();
      blocks.push({ type: "heading", text: line });
      continue;
    }

    const sectionMatch = line.match(/^Section:\s*(.+)$/i);
    if (sectionMatch) {
      flushParagraph();
      blocks.push({ type: "heading", text: sectionMatch[1].trim() });
      continue;
    }

    const sceneMatch = line.match(/^(Scene|Topic|Characters)\s*:\s*(.+)$/i);
    if (sceneMatch) {
      flushParagraph();
      blocks.push({ type: "note", text: `${sceneMatch[1]}: ${sceneMatch[2]}` });
      continue;
    }

    const speakerOnlyMatch = line.match(/^([^:]{1,40}):\s*$/);
    if (speakerOnlyMatch && isLikelySpeaker(speakerOnlyMatch[1])) {
      flushParagraph();
      pendingSpeaker = normalizeSpeaker(speakerOnlyMatch[1]);
      continue;
    }

    const dialogueMatch = line.match(/^([^:]{1,40}):\s*(.+)$/);
    if (dialogueMatch && isLikelySpeaker(dialogueMatch[1])) {
      flushParagraph();
      blocks.push({
        type: "dialogue",
        speaker: normalizeSpeaker(dialogueMatch[1]),
        text: dialogueMatch[2].trim(),
      });
      continue;
    }

    const numberedHeadingMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (numberedHeadingMatch) {
      flushParagraph();
      blocks.push({ type: "heading", text: `${numberedHeadingMatch[1]}. ${numberedHeadingMatch[2]}` });
      continue;
    }

    paragraphBuffer.push(line);
  }

  if (pendingSpeaker) {
    blocks.push({ type: "note", text: `${pendingSpeaker}:` });
  }

  flushParagraph();
  return blocks;
};

export const unitScripts: Record<number, UnitScript> = Object.entries(rawScripts).reduce(
  (acc, [unitKey, value]) => {
    const unit = Number(unitKey);
    acc[unit] = {
      unit,
      title: value.title,
      trackLinks: units[unit] ?? [],
      blocks: parseScript(value.text),
    };
    return acc;
  },
  {} as Record<number, UnitScript>
);

export const scriptUnitNumbers = Object.keys(unitScripts)
  .map(Number)
  .sort((a, b) => a - b);
