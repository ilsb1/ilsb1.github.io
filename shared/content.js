import { safeHref, sanitizeHtml } from "./sanitize.js";
import { htmlToPlain, plainField } from "./text.js";
import { pageById } from "./pages.js";

export const BLOCK_TYPES = ["text", "photos", "video", "audio", "file", "link"];
export const PHOTO_SIZES = ["small", "medium", "large"];

const MAX_BLOCKS = 60;
const MAX_PHOTOS = 24;
const MAX_RICH = 100_000;

/** Files up to this size are stored with the site on GitHub; larger ones go to Vercel Blob. */
export const SMALL_UPLOAD_MAX = 3 * 1024 * 1024;

export const UPLOAD_KINDS = {
  image: {
    extensions: ["jpg", "jpeg", "png", "gif", "webp", "avif"],
    maxBytes: 40 * 1024 * 1024,
    label: "photo",
  },
  video: { extensions: ["mp4", "m4v", "webm", "mov"], maxBytes: 300 * 1024 * 1024, label: "video" },
  audio: { extensions: ["mp3", "m4a", "aac", "wav", "ogg", "oga"], maxBytes: 80 * 1024 * 1024, label: "audio file" },
  file: {
    extensions: [
      "pdf",
      "doc",
      "docx",
      "ppt",
      "pptx",
      "pps",
      "ppsx",
      "xls",
      "xlsx",
      "csv",
      "odt",
      "odp",
      "ods",
      "rtf",
      "txt",
      "epub",
      "zip",
    ],
    maxBytes: 100 * 1024 * 1024,
    label: "file",
  },
};

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  mp4: "video/mp4",
  m4v: "video/mp4",
  webm: "video/webm",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  aac: "audio/aac",
  wav: "audio/wav",
  ogg: "audio/ogg",
  oga: "audio/ogg",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  pps: "application/vnd.ms-powerpoint",
  ppsx: "application/vnd.openxmlformats-officedocument.presentationml.slideshow",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  csv: "text/csv",
  odt: "application/vnd.oasis.opendocument.text",
  odp: "application/vnd.oasis.opendocument.presentation",
  ods: "application/vnd.oasis.opendocument.spreadsheet",
  rtf: "application/rtf",
  txt: "text/plain",
  epub: "application/epub+zip",
  zip: "application/zip",
};

export function fileExtension(name) {
  const match = String(name ?? "").toLowerCase().match(/\.([a-z0-9]{1,8})$/);
  return match ? match[1] : "";
}

export function contentTypeFor(ext) {
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

/** Which upload rules apply to a file, judged by its extension. */
export function uploadKind(name) {
  const ext = fileExtension(name);
  for (const [kind, rule] of Object.entries(UPLOAD_KINDS)) {
    if (rule.extensions.includes(ext)) return kind;
  }
  return null;
}

export function fileKind(ext) {
  const value = String(ext || "").toLowerCase();
  if (value === "pdf") return "pdf";
  if (["doc", "docx", "odt", "rtf", "txt", "epub"].includes(value)) return "document";
  if (["ppt", "pptx", "pps", "ppsx", "odp"].includes(value)) return "slides";
  if (["xls", "xlsx", "csv", "ods"].includes(value)) return "sheet";
  if (value === "zip") return "zip";
  if (UPLOAD_KINDS.audio.extensions.includes(value)) return "audio";
  if (UPLOAD_KINDS.video.extensions.includes(value)) return "video";
  if (UPLOAD_KINDS.image.extensions.includes(value)) return "image";
  return "other";
}

export function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n <= 0) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(n < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

const MEDIA_PATH = /^\/media\/[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*){0,6}$/;

/** Uploaded files live either with the site (/media/…) or in the Vercel Blob store. */
export function isMediaSrc(value) {
  if (typeof value !== "string" || value.length > 600) return false;
  if (MEDIA_PATH.test(value)) return !value.includes("..");
  try {
    const parsed = new URL(value);
    return (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/i.test(parsed.hostname) &&
      !/[<>"'\s]/.test(value)
    );
  } catch {
    return false;
  }
}

function webUrl(value) {
  const href = safeHref(value);
  return href && /^https?:\/\//i.test(href) ? href : "";
}

function wholeNumber(value, max) {
  const n = Math.round(Number(value));
  return Number.isFinite(n) && n > 0 && n <= max ? n : 0;
}

/** YouTube, Vimeo and Google Drive links become players; anything else is shown as a link. */
export function videoEmbed(value) {
  const href = webUrl(value);
  if (!href) return null;
  let parsed;
  try {
    parsed = new URL(href);
  } catch {
    return null;
  }
  const host = parsed.hostname.replace(/^(www|m)\./, "").toLowerCase();
  const segments = parsed.pathname.split("/").filter(Boolean);
  const isId = (id, re) => typeof id === "string" && re.test(id);

  if (host === "youtu.be" || host.endsWith("youtube.com") || host === "youtube-nocookie.com") {
    let id = "";
    if (host === "youtu.be") id = segments[0];
    else if (segments[0] === "watch") id = parsed.searchParams.get("v") || "";
    else if (["embed", "shorts", "live", "v"].includes(segments[0])) id = segments[1];
    if (!isId(id, /^[A-Za-z0-9_-]{6,20}$/)) return null;
    const start = Number.parseInt(parsed.searchParams.get("t") || parsed.searchParams.get("start") || "", 10);
    const query = Number.isFinite(start) && start > 0 ? `?start=${start}` : "";
    return { provider: "youtube", embedUrl: `https://www.youtube-nocookie.com/embed/${id}${query}` };
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const id = segments.find((part) => /^\d{5,12}$/.test(part));
    if (!id) return null;
    const hashIndex = segments.indexOf(id) + 1;
    const privateHash = /^[a-f0-9]{6,20}$/i.test(segments[hashIndex] || "") ? segments[hashIndex] : parsed.searchParams.get("h");
    const query = privateHash && /^[a-f0-9]{6,20}$/i.test(privateHash) ? `?h=${privateHash}` : "";
    return { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}${query}` };
  }
  if (host === "drive.google.com") {
    const id = segments[0] === "file" && segments[1] === "d" ? segments[2] : parsed.searchParams.get("id");
    if (!isId(id, /^[A-Za-z0-9_-]{10,80}$/)) return null;
    return { provider: "drive", embedUrl: `https://drive.google.com/file/d/${id}/preview` };
  }
  return null;
}

function cleanImage(value) {
  if (!value || typeof value !== "object" || !isMediaSrc(value.src)) return null;
  return {
    src: value.src,
    width: wholeNumber(value.width, 20000),
    height: wholeNumber(value.height, 20000),
  };
}

function cleanMultiline(value, max) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => plainField(line, max))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
}

function cleanField(field, value) {
  const clean = cleanFieldValue(field, value);
  return field.required && clean === "" ? undefined : clean;
}

function cleanFieldValue(field, value) {
  switch (field.type) {
    case "text":
      return typeof value === "string" ? plainField(value, field.max) : undefined;
    case "multiline":
      return typeof value === "string" ? cleanMultiline(value, field.max) : undefined;
    case "rich": {
      if (typeof value !== "string") return undefined;
      if (value.length > MAX_RICH) return undefined;
      const html = sanitizeHtml(value);
      return htmlToPlain(html) ? html : "";
    }
    case "url": {
      if (typeof value !== "string") return undefined;
      if (!value.trim()) return "";
      return webUrl(value) || undefined;
    }
    case "image":
      return cleanImage(value) ?? undefined;
    case "lines":
      if (!Array.isArray(value)) return undefined;
      return value.slice(0, field.maxItems).map((line) => plainField(line, field.max));
    default:
      return undefined;
  }
}

/** Keeps only the fields the page defines, each in a safe shape. Missing fields mean "use the original". */
export function normalizeFields(page, input) {
  const out = {};
  if (!page || !input || typeof input !== "object") return out;
  for (const field of page.fields) {
    if (!Object.prototype.hasOwnProperty.call(input, field.key)) continue;
    const value = cleanField(field, input[field.key]);
    if (value !== undefined) out[field.key] = value;
  }
  return out;
}

function cleanPhoto(item) {
  if (!item || typeof item !== "object" || !isMediaSrc(item.src)) return null;
  return {
    src: item.src,
    width: wholeNumber(item.width, 20000),
    height: wholeNumber(item.height, 20000),
    caption: plainField(item.caption, 300),
  };
}

function cleanBlock(block) {
  if (!block || typeof block !== "object") return null;
  switch (block.type) {
    case "text": {
      if (typeof block.html !== "string" || block.html.length > MAX_RICH) return null;
      const html = sanitizeHtml(block.html);
      return htmlToPlain(html) ? { type: "text", html } : null;
    }
    case "photos": {
      const items = (Array.isArray(block.items) ? block.items : []).map(cleanPhoto).filter(Boolean).slice(0, MAX_PHOTOS);
      if (!items.length) return null;
      const size = PHOTO_SIZES.includes(block.size) ? block.size : "medium";
      return { type: "photos", size, items };
    }
    case "video": {
      const caption = plainField(block.caption, 300);
      if (block.source === "file" && isMediaSrc(block.src)) return { type: "video", source: "file", src: block.src, caption };
      const href = webUrl(block.url);
      return href ? { type: "video", source: "link", url: href, caption } : null;
    }
    case "audio":
      return isMediaSrc(block.src) ? { type: "audio", src: block.src, title: plainField(block.title, 200) } : null;
    case "file": {
      if (!isMediaSrc(block.src)) return null;
      const ext = /^[a-z0-9]{1,8}$/.test(String(block.ext || "")) ? block.ext : fileExtension(block.name || block.src);
      return {
        type: "file",
        src: block.src,
        title: plainField(block.title, 200),
        name: plainField(block.name, 200),
        size: wholeNumber(block.size, 10 * 1024 * 1024 * 1024),
        ext,
      };
    }
    case "link": {
      const href = webUrl(block.url);
      if (!href) return null;
      return { type: "link", url: href, title: plainField(block.title, 200), note: plainField(block.note, 300) };
    }
    default:
      return null;
  }
}

const BLOCK_ID = /^[A-Za-z0-9_-]{4,40}$/;

/** Drops anything broken or unknown rather than failing, so one bad element never takes a page down. */
export function normalizeBlocks(input) {
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    if (out.length >= MAX_BLOCKS) break;
    const block = cleanBlock(raw);
    if (!block) continue;
    let id = typeof raw.id === "string" && BLOCK_ID.test(raw.id) ? raw.id : `block-${out.length + 1}`;
    while (seen.has(id)) id = `${id.slice(0, 34)}-${out.length + 1}`;
    seen.add(id);
    out.push({ id, ...block });
  }
  return out;
}

export function normalizePage(pageId, input) {
  const page = pageById(pageId);
  if (!page || !input || typeof input !== "object") return null;
  return { fields: normalizeFields(page, input.fields), blocks: normalizeBlocks(input.blocks) };
}

/** A published page file, as committed to content/pages/<id>.json and read by the public site. */
export function parsePageFile(pageId, raw) {
  try {
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    return normalizePage(pageId, data);
  } catch {
    return null;
  }
}
