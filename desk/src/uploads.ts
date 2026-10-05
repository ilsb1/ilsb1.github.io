import { SMALL_UPLOAD_MAX, UPLOAD_KINDS, fileExtension, formatBytes, uploadKind } from "../../shared/content.js";
import { ApiError, errorMessage } from "./api";

export type UploadKind = "image" | "video" | "audio" | "file";

export type Uploaded = { src: string; name: string; size: number; ext: string; width: number; height: number };

export type Phase = "waiting" | "preparing" | "sending" | "finishing";

type Hooks = { signal: AbortSignal; onProgress: (fraction: number) => void; onPhase: (phase: Phase) => void };

/** Formats a browser can usually open, which are turned into JPEG or WebP before uploading. */
const CONVERTIBLE = ["heic", "heif", "tif", "tiff", "bmp", "svg", "jfif", "pjpeg"];
const MAX_SIDE = 2400;
const KEEP_AS_IS = 1.5 * 1024 * 1024;

export function kindOf(file: File): UploadKind | null {
  const kind = uploadKind(file.name) as UploadKind | null;
  if (kind) return kind;
  const ext = fileExtension(file.name);
  if (CONVERTIBLE.includes(ext) || file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  if (file.type === "application/pdf") return "file";
  return null;
}

const KIND_WORDS: Record<UploadKind, string> = { image: "Photos", video: "Videos", audio: "Audio files", file: "Documents" };

/** A friendly reason a file can't be added, or "" when it's fine. */
export function fileProblem(file: File, kind: UploadKind | null) {
  if (!kind) return `“${file.name}” can't be added. Photos, videos, audio, PDFs and Office documents work.`;
  if (!file.size) return `“${file.name}” is empty.`;
  const max = UPLOAD_KINDS[kind].maxBytes as number;
  if (kind !== "image" && file.size > max) {
    const hint = kind === "video" ? " For longer videos, upload to YouTube and add the link instead." : "";
    return `“${file.name}” is ${formatBytes(file.size)}. ${KIND_WORDS[kind]} can be up to ${formatBytes(max)}.${hint}`;
  }
  return "";
}

type Decoded = { source: CanvasImageSource; width: number; height: number; close: () => void };

async function decode(file: Blob): Promise<Decoded | null> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close() };
  } catch {
    /* try an <img> instead, which handles more formats in some browsers */
  }
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    if (!image.naturalWidth) throw new Error("empty");
    return { source: image, width: image.naturalWidth, height: image.naturalHeight, close: () => URL.revokeObjectURL(url) };
  } catch {
    URL.revokeObjectURL(url);
    return null;
  }
}

function hasTransparency(source: CanvasImageSource, width: number, height: number) {
  const canvas = document.createElement("canvas");
  canvas.width = Math.min(64, width);
  canvas.height = Math.min(64, height);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return false;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  for (let index = 3; index < data.length; index += 4) if (data[index] < 250) return true;
  return false;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

function baseName(name: string) {
  return name.replace(/\.[^.]+$/, "") || "photo";
}

const EXT_BY_TYPE: Record<string, string> = {
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
  "application/pdf": "pdf",
};

/** Files without a usual ending (some phones do this) get one from their type. */
function serverName(file: File) {
  if (uploadKind(file.name)) return file.name;
  const ext = EXT_BY_TYPE[file.type];
  return ext ? `${baseName(file.name)}.${ext}` : file.name;
}

export class UploadError extends Error {
  code: string;
  constructor(code: string, message = "") {
    super(message || code);
    this.code = code;
  }
}

/**
 * Photos are made web-sized (at most 2400 px). JPEGs are always saved again,
 * which also removes hidden details such as where the photo was taken.
 */
export async function prepareImage(file: File): Promise<{ blob: Blob; name: string; width: number; height: number }> {
  const ext = fileExtension(file.name);
  const decoded = await decode(file);
  if (!decoded) {
    if (["gif", "png", "webp", "avif"].includes(ext)) return { blob: file, name: file.name, width: 0, height: 0 };
    throw new UploadError(
      "unreadable",
      ext === "heic" || ext === "heif"
        ? "This photo is in Apple's HEIC format, which this browser can't open. Export it as JPEG (in Photos: File → Export) or use Safari."
        : "This photo can't be opened. Try saving it as JPEG or PNG first.",
    );
  }
  try {
    const { width, height } = decoded;
    if (ext === "gif") return { blob: file, name: file.name, width, height };
    const fits = Math.max(width, height) <= MAX_SIDE;
    if (fits && ["png", "webp", "avif"].includes(ext) && file.size <= KEEP_AS_IS) {
      return { blob: file, name: file.name, width, height };
    }
    const scale = Math.min(1, MAX_SIDE / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new UploadError("unreadable", "This photo can't be prepared in this browser.");
    const transparent = ext !== "jpg" && ext !== "jpeg" && hasTransparency(decoded.source, width, height);
    if (!transparent) {
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, canvas.width, canvas.height);
    }
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(decoded.source, 0, 0, canvas.width, canvas.height);

    let blob: Blob | null = null;
    let out = "jpg";
    if (transparent) {
      blob = await toBlob(canvas, "image/webp", 0.9);
      out = blob?.type === "image/webp" ? "webp" : "png";
      if (out === "png") blob = await toBlob(canvas, "image/png");
    } else {
      blob = await toBlob(canvas, "image/jpeg", 0.86);
    }
    if (!blob) throw new UploadError("unreadable", "This photo can't be prepared in this browser.");
    const keepOriginal = fits && ["png", "webp", "avif"].includes(ext) && blob.size >= file.size;
    if (keepOriginal) return { blob: file, name: file.name, width, height };
    return { blob, name: `${baseName(file.name)}.${out}`, width: canvas.width, height: canvas.height };
  } finally {
    decoded.close();
  }
}

function toBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const text = String(reader.result || "");
      resolve(text.slice(text.indexOf(",") + 1));
    };
    reader.onerror = () => reject(new UploadError("unreadable", "This file couldn't be read. Please try again."));
    reader.readAsDataURL(blob);
  });
}

function send(
  method: string,
  url: string,
  token: string,
  body: Blob | string,
  contentType: string,
  { signal, onProgress }: Pick<Hooks, "signal" | "onProgress">,
) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("Content-Type", contentType);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && event.total) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => {
      let data: Record<string, unknown> = {};
      try {
        data = JSON.parse(xhr.responseText || "{}") as Record<string, unknown>;
      } catch {
        /* handled below */
      }
      if (xhr.status >= 200 && xhr.status < 300) resolve(data);
      else reject(new ApiError(xhr.status, typeof data.error === "string" ? data.error : "upload_failed"));
    };
    xhr.onerror = () => reject(new ApiError(0, "offline"));
    xhr.onabort = () => reject(new DOMException("Cancelled", "AbortError"));
    const abort = () => xhr.abort();
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.onloadend = () => signal.removeEventListener("abort", abort);
    xhr.send(body);
  });
}

function asUploaded(value: unknown, width: number, height: number): Uploaded {
  const file = value as Partial<Uploaded> | null;
  if (!file || typeof file.src !== "string") throw new ApiError(500, "upload_failed");
  return {
    src: file.src,
    name: String(file.name || ""),
    size: Number(file.size) || 0,
    ext: String(file.ext || fileExtension(file.src)),
    width,
    height,
  };
}

const MAX_PARALLEL = 2;
let running = 0;
const queue: (() => void)[] = [];

async function inTurn<T>(signal: AbortSignal, run: () => Promise<T>) {
  if (running >= MAX_PARALLEL) {
    await new Promise<void>((resolve) => queue.push(resolve));
  }
  running += 1;
  try {
    if (signal.aborted) throw new DOMException("Cancelled", "AbortError");
    return await run();
  } finally {
    running -= 1;
    queue.shift()?.();
  }
}

function blobError(error: unknown) {
  const name = error instanceof Error ? error.name : "";
  if (name === "AbortError" || name === "BlobRequestAbortedError") return new DOMException("Cancelled", "AbortError");
  if (name === "BlobContentTypeNotAllowedError") return new ApiError(415, "file_type");
  if (name === "BlobFileTooLargeError") return new ApiError(413, "too_large");
  if (!navigator.onLine) return new ApiError(0, "offline");
  return new ApiError(502, "upload_failed");
}

/** Small files are kept with the website on GitHub; bigger ones go to the Vercel Blob store. */
export function uploadFile(token: string, file: File, kind: UploadKind, hooks: Hooks): Promise<Uploaded> {
  hooks.onPhase("waiting");
  return inTurn(hooks.signal, async () => {
    let blob: Blob = file;
    let name = serverName(file);
    let width = 0;
    let height = 0;
    if (kind === "image") {
      hooks.onPhase("preparing");
      const ready = await prepareImage(file);
      ({ blob, name, width, height } = ready);
      if (blob.size > (UPLOAD_KINDS.image.maxBytes as number)) {
        throw new UploadError("too_large", `This photo is too big (${formatBytes(blob.size)}), even after resizing.`);
      }
    }
    if (hooks.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    hooks.onPhase("sending");

    if (blob.size <= SMALL_UPLOAD_MAX) {
      const data = await toBase64(blob);
      const progress = (fraction: number) => {
        hooks.onProgress(fraction * 0.85);
        if (fraction >= 1) hooks.onPhase("finishing");
      };
      const result = await send("POST", "/api/media", token, JSON.stringify({ name, data }), "application/json", {
        signal: hooks.signal,
        onProgress: progress,
      });
      return asUploaded(result.file, width, height);
    }

    const grant = await send("POST", "/api/media/token", token, JSON.stringify({ name, size: blob.size }), "application/json", {
      signal: hooks.signal,
      onProgress: () => {},
    });
    if (grant.local) {
      const result = await send("PUT", `/api/media/local?name=${encodeURIComponent(name)}`, token, blob, "application/octet-stream", {
        signal: hooks.signal,
        onProgress: (fraction) => {
          hooks.onProgress(fraction * 0.95);
          if (fraction >= 1) hooks.onPhase("finishing");
        },
      });
      return asUploaded(result.file, width, height);
    }
    if (typeof grant.token !== "string" || typeof grant.pathname !== "string") throw new ApiError(500, "upload_failed");

    const { put } = await import("@vercel/blob/client");
    try {
      const result = await put(grant.pathname, blob, {
        access: "public",
        token: grant.token,
        contentType: typeof grant.contentType === "string" ? grant.contentType : undefined,
        multipart: blob.size > 20 * 1024 * 1024,
        abortSignal: hooks.signal,
        onUploadProgress: ({ percentage }) => hooks.onProgress(Math.min(0.99, percentage / 100)),
      });
      return { src: result.url, name, size: blob.size, ext: fileExtension(name), width, height };
    } catch (error) {
      throw blobError(error);
    }
  });
}

export function isCancel(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

export function uploadErrorMessage(error: unknown) {
  if (error instanceof UploadError) return error.message;
  if (error instanceof ApiError && error.code === "unauthorized") return "You've been signed out. Please sign in again.";
  return errorMessage(error);
}
