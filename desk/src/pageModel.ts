import { normalizeBlocks, normalizeFields, normalizePage } from "../../shared/content.js";
import { PAGE_GROUPS as SHARED_GROUPS, PAGES as SHARED_PAGES } from "../../shared/pages.js";
import { htmlToPlain } from "../../shared/text.js";
import { pageDefaults, type FieldValue, type FieldValues, type ImageValue } from "../../src/content/defaults";
import type { Block, BlockType, PhotoSize } from "../../src/content/types";
import type { PageContent, PageStatus } from "./api";

export type { Block, BlockType, FieldValue, FieldValues, ImageValue, PhotoSize };

export type FieldType = "text" | "multiline" | "rich" | "url" | "image" | "lines";

export type FieldDef = {
  key: string;
  type: FieldType;
  label: string;
  max?: number;
  maxItems?: number;
  section?: string;
  help?: string;
  required?: boolean;
};

export type PageGroup = "main" | "units" | "scripts" | "lists";

export type PageDef = {
  id: string;
  group: PageGroup;
  label: string;
  path: string;
  blocksHint: string;
  unit?: number;
  fields: FieldDef[];
};

export const PAGES = SHARED_PAGES as unknown as PageDef[];
export const PAGE_GROUPS = SHARED_GROUPS as unknown as { id: PageGroup; label: string }[];

export function pageDef(id: string) {
  return PAGES.find((page) => page.id === id) ?? null;
}

export const MAX_PHOTOS = 24;

export type EditPhoto = { key: string; src: string; width: number; height: number; caption: string; upload?: string };

export type EditBlock =
  | { id: string; type: "text"; html: string }
  | { id: string; type: "photos"; size: PhotoSize; items: EditPhoto[] }
  | { id: string; type: "video"; source: "link" | "file"; url: string; src: string; caption: string; upload?: string }
  | { id: string; type: "audio"; src: string; title: string; upload?: string }
  | { id: string; type: "file"; src: string; title: string; name: string; size: number; ext: string; upload?: string }
  | { id: string; type: "link"; url: string; title: string; note: string };

export const BLOCK_LABELS: Record<BlockType, string> = {
  text: "Text",
  photos: "Photos",
  video: "Video",
  audio: "Audio",
  file: "Document",
  link: "Link",
};

export const BLOCK_ORDER: BlockType[] = ["text", "photos", "video", "audio", "file", "link"];

export function newId() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function blankBlock(type: BlockType): EditBlock {
  const id = newId();
  switch (type) {
    case "text":
      return { id, type, html: "" };
    case "photos":
      return { id, type, size: "medium", items: [] };
    case "video":
      return { id, type, source: "link", url: "", src: "", caption: "" };
    case "audio":
      return { id, type, src: "", title: "" };
    case "file":
      return { id, type, src: "", title: "", name: "", size: 0, ext: "" };
    case "link":
      return { id, type, url: "", title: "", note: "" };
  }
}

export function toEdit(blocks: unknown[]): EditBlock[] {
  return (normalizeBlocks(blocks) as Block[]).map((block): EditBlock => {
    switch (block.type) {
      case "photos":
        return { ...block, items: block.items.map((item) => ({ ...item, key: newId() })) };
      case "video":
        return block.source === "file"
          ? { id: block.id, type: "video", source: "file", url: "", src: block.src, caption: block.caption }
          : { id: block.id, type: "video", source: "link", url: block.url, src: "", caption: block.caption };
      default:
        return { ...block };
    }
  });
}

/** Only finished elements go to the website; half-done ones stay in the editor until they're complete. */
export function toBlocks(blocks: EditBlock[]): Block[] {
  const raw = blocks.map((block) => {
    switch (block.type) {
      case "photos":
        return {
          id: block.id,
          type: "photos",
          size: block.size,
          items: block.items
            .filter((item) => item.src && !item.upload)
            .map(({ src, width, height, caption }) => ({ src, width, height, caption })),
        };
      case "video":
        return block.source === "file"
          ? { id: block.id, type: "video", source: "file", src: block.upload ? "" : block.src, caption: block.caption }
          : { id: block.id, type: "video", source: "link", url: block.url, caption: block.caption };
      case "audio":
      case "file":
        return block.upload ? null : block;
      default:
        return block;
    }
  });
  return normalizeBlocks(raw) as Block[];
}

function isImage(value: unknown): value is ImageValue {
  return Boolean(value && typeof value === "object" && typeof (value as ImageValue).src === "string");
}

/** What each field currently says: the saved edit where there is one, otherwise the original. */
export function fieldValues(page: PageDef, fields: Record<string, unknown>): FieldValues {
  const defaults = pageDefaults(page.id);
  const out: FieldValues = {};
  for (const field of page.fields) {
    const fallback = defaults[field.key];
    const value = fields[field.key];
    if (field.type === "lines") {
      const base = Array.isArray(fallback) ? fallback : [];
      const edits = Array.isArray(value) ? value : [];
      out[field.key] = base.map((line, index) =>
        typeof edits[index] === "string" && edits[index].trim() ? (edits[index] as string) : line,
      );
    } else if (field.type === "image") {
      out[field.key] = isImage(value) ? value : isImage(fallback) ? fallback : { src: "", width: 0, height: 0 };
    } else {
      out[field.key] = typeof value === "string" ? value : typeof fallback === "string" ? fallback : "";
    }
  }
  return out;
}

export function originalValue(page: PageDef, key: string): FieldValue {
  return fieldValues(page, {})[key];
}

function cleanOne(page: PageDef, key: string, value: unknown) {
  return (normalizeFields(page, { [key]: value }) as Record<string, unknown>)[key];
}

/** Only what differs from the original is saved, so untouched text keeps following the book. */
export function changedFields(page: PageDef, values: FieldValues) {
  const defaults = pageDefaults(page.id);
  const out: Record<string, unknown> = {};
  for (const field of page.fields) {
    const value = values[field.key];
    const fallback = defaults[field.key];
    if (field.type === "lines") {
      const base = Array.isArray(fallback) ? fallback : [];
      const lines = Array.isArray(value) ? value : [];
      const edits = base.map((line, index) => {
        const next = typeof lines[index] === "string" ? lines[index].trim() : "";
        return next && next !== line ? next : "";
      });
      if (edits.some(Boolean)) out[field.key] = cleanOne(page, field.key, edits);
      continue;
    }
    const clean = cleanOne(page, field.key, value);
    if (clean === undefined) continue;
    if (JSON.stringify(clean) !== JSON.stringify(cleanOne(page, field.key, fallback))) out[field.key] = clean;
  }
  return out;
}

/** True when a field shows something the original doesn't. Empty required fields count as original. */
export function fieldProblem(field: FieldDef, value: FieldValue): string {
  if (field.type === "url" && typeof value === "string" && value.trim()) {
    const page = { fields: [field] } as PageDef;
    if (cleanOne(page, field.key, value) === undefined) {
      return "That doesn't look like a web address. The original link stays until this is fixed.";
    }
  }
  if (field.required) {
    const empty =
      typeof value === "string" && (field.type === "rich" ? !htmlToPlain(value).trim() : !value.trim());
    if (empty) return "This can't be empty, so the original is shown on the website.";
  }
  return "";
}

export function draftContent(page: PageDef, values: FieldValues, blocks: EditBlock[]): PageContent {
  return normalizePage(page.id, { fields: changedFields(page, values), blocks: toBlocks(blocks) }) as PageContent;
}

const EMPTY: PageContent = { fields: {}, blocks: [] };

function same(a: unknown, b: unknown) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

export function localStatus(content: PageContent, live: PageContent | null): PageStatus {
  if (live) return same(content, live) ? "published" : "changed";
  return !Object.keys(content.fields).length && !content.blocks.length ? "original" : "changed";
}

function fieldTitle(page: PageDef, key: string) {
  let section = "";
  for (const field of page.fields) {
    if (field.section) section = field.section;
    if (field.key === key) return section && !field.label.includes(":") ? `${section}: ${field.label}` : field.label;
  }
  return key;
}

function quote(text: string, max = 48) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  return `“${clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean}”`;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export function describeBlock(block: Block) {
  switch (block.type) {
    case "text": {
      const words = quote(htmlToPlain(block.html), 40);
      return words ? `text ${words}` : "a text section";
    }
    case "photos":
      return block.items.length === 1 ? "a photo" : `${block.items.length} photos`;
    case "video":
      return block.caption ? `the video ${quote(block.caption)}` : "a video";
    case "audio":
      return block.title ? `the recording ${quote(block.title)}` : "a recording";
    case "file":
      return `the document ${quote(block.title || block.name || "Document")}`;
    case "link": {
      const label = block.title || hostOf(block.url);
      return label ? `a link to ${quote(label)}` : "a link";
    }
  }
}

function sentence(text: string) {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** The plain-English list shown before publishing. */
export function summarizeChanges(page: PageDef, content: PageContent, live: PageContent | null) {
  const base = live ?? EMPTY;
  const lines: string[] = [];
  for (const field of page.fields) {
    const now = content.fields[field.key];
    const before = base.fields[field.key];
    if (same(now, before)) continue;
    const title = `“${fieldTitle(page, field.key)}”`;
    lines.push(now === undefined ? `${title} goes back to the original` : `Changed ${title}`);
  }
  const blocks = content.blocks as Block[];
  const baseBlocks = base.blocks as Block[];
  const before = new Map(baseBlocks.map((block) => [block.id, block]));
  const after = new Map(blocks.map((block) => [block.id, block]));
  for (const block of blocks) {
    const old = before.get(block.id);
    if (!old) lines.push(sentence(`added ${describeBlock(block)}`));
    else if (!same(old, block)) lines.push(sentence(`updated ${describeBlock(block)}`));
  }
  for (const block of baseBlocks) {
    if (!after.has(block.id)) lines.push(sentence(`removed ${describeBlock(block)}`));
  }
  const kept = blocks.filter((block) => before.has(block.id)).map((block) => block.id);
  const keptBefore = baseBlocks.filter((block) => after.has(block.id)).map((block) => block.id);
  if (!same(kept, keptBefore)) lines.push("Changed the order of the added elements");
  return lines;
}

export function prettyName(name: string) {
  const base = name.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return base.slice(0, 200);
}
