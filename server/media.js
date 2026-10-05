import { randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { SMALL_UPLOAD_MAX, UPLOAD_KINDS, contentTypeFor, fileExtension, uploadKind } from "../shared/content.js";
import { plainField, slugify } from "../shared/text.js";
import { commitToGithub, githubConfigured } from "./github.js";

function failure(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

function startsWith(bytes, signature, offset = 0) {
  if (bytes.length < offset + signature.length) return false;
  return signature.every((value, index) => bytes[offset + index] === value);
}

const ascii = (text) => [...text].map((char) => char.charCodeAt(0));

/** Photos and PDFs must really be what their name says; other documents are served as downloads. */
export function looksLike(ext, bytes) {
  switch (ext) {
    case "jpg":
    case "jpeg":
      return startsWith(bytes, [0xff, 0xd8, 0xff]);
    case "png":
      return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    case "gif":
      return startsWith(bytes, ascii("GIF8"));
    case "webp":
      return startsWith(bytes, ascii("RIFF")) && startsWith(bytes, ascii("WEBP"), 8);
    case "avif":
      return startsWith(bytes, ascii("ftyp"), 4);
    case "pdf":
      return startsWith(bytes, ascii("%PDF"));
    default:
      return bytes.length > 0;
  }
}

function storedName(name, ext, now) {
  const date = new Date(now);
  const year = String(date.getUTCFullYear());
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const base = slugify(name.replace(/\.[^.]*$/, "")).slice(0, 40).replace(/-+$/, "") || "file";
  return { folder: `${year}/${month}`, file: `${randomBytes(4).toString("hex")}-${base}.${ext}` };
}

function describe(name) {
  const clean = plainField(name, 200);
  const ext = fileExtension(clean);
  const kind = uploadKind(clean);
  if (!clean || !kind) throw failure(415, "file_type");
  return { name: clean, ext, kind };
}

export function createMedia({ root, env, fetchImpl, hosted = false, now = () => Date.now() }) {
  let chain = Promise.resolve();
  const lock = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  };

  async function uploadSmall(body) {
    if (!body || typeof body !== "object" || typeof body.data !== "string") throw failure(400, "bad_body");
    const { name, ext, kind } = describe(body.name);
    if (body.data.length > Math.ceil((SMALL_UPLOAD_MAX * 4) / 3) + 8) throw failure(413, "too_large");
    const bytes = Buffer.from(body.data, "base64");
    if (!bytes.length) throw failure(400, "empty_file");
    if (bytes.length > SMALL_UPLOAD_MAX) throw failure(413, "too_large");
    if (!looksLike(ext, bytes)) throw failure(415, "file_damaged");

    const useGithub = githubConfigured(env);
    if (hosted && !useGithub) throw failure(503, "publish_not_configured");
    const { folder, file } = storedName(name, ext, now());
    const relative = useGithub ? `media/${folder}/${file}` : `media/dev/${file}`;

    if (!hosted) {
      const local = path.join(root, "public", relative);
      await mkdir(path.dirname(local), { recursive: true });
      await writeFile(local, bytes);
    }
    if (useGithub) {
      try {
        await commitToGithub({
          env,
          fetchImpl,
          message: `Add “${name}”`,
          files: [{ path: `public/${relative}`, content: bytes.toString("base64"), encoding: "base64" }],
        });
      } catch (error) {
        console.error("Media commit failed", error.githubStatus || error.code || "error");
        throw failure(502, "upload_failed");
      }
    }
    return { src: `/${relative}`, name, size: bytes.length, ext, kind };
  }

  async function blobToken(body) {
    if (!body || typeof body !== "object") throw failure(400, "bad_body");
    const { name, ext, kind } = describe(body.name);
    const size = Number(body.size);
    if (!Number.isFinite(size) || size <= 0) throw failure(400, "empty_file");
    if (size > UPLOAD_KINDS[kind].maxBytes) throw failure(413, "too_large");

    const token = env.BLOB_READ_WRITE_TOKEN || "";
    if (!token) {
      if (hosted) throw failure(503, "uploads_not_configured");
      return { local: true };
    }
    const { folder, file } = storedName(name, ext, now());
    const pathname = `media/${folder}/${file}`;
    const contentType = contentTypeFor(ext);
    const { generateClientTokenFromReadWriteToken } = await import("@vercel/blob/client");
    const clientToken = await generateClientTokenFromReadWriteToken({
      token,
      pathname,
      maximumSizeInBytes: UPLOAD_KINDS[kind].maxBytes,
      allowedContentTypes: [contentType],
      validUntil: now() + 60 * 60 * 1000,
      addRandomSuffix: false,
      allowOverwrite: false,
    });
    return { token: clientToken, pathname, contentType, name, ext, kind };
  }

  /** Large files on this computer, when no Blob store is connected. */
  async function saveLocal(name, bytes) {
    if (hosted) throw failure(404, "not_found");
    const info = describe(name);
    if (bytes.length > UPLOAD_KINDS[info.kind].maxBytes) throw failure(413, "too_large");
    if (!looksLike(info.ext, bytes)) throw failure(415, "file_damaged");
    const { file } = storedName(info.name, info.ext, now());
    const relative = `media/dev/${file}`;
    const local = path.join(root, "public", relative);
    await mkdir(path.dirname(local), { recursive: true });
    await writeFile(local, bytes);
    return { src: `/${relative}`, name: info.name, size: bytes.length, ext: info.ext, kind: info.kind };
  }

  return {
    uploadSmall: (body) => lock(() => uploadSmall(body)),
    blobToken,
    saveLocal,
  };
}
