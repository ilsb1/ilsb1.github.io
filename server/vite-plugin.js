import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { contentTypeFor, fileExtension } from "../shared/content.js";
import { readServerEnv } from "./env.js";
import { createApi } from "./api.js";
import { send, serveApi } from "./http.js";

/** Uploaded files, so the writing app on this computer can show them before the site rebuilds. */
async function serveMedia(req, res, root, pathname) {
  const mediaRoot = path.join(root, "public", "media");
  let file;
  let info;
  try {
    file = path.normalize(path.join(root, "public", decodeURIComponent(pathname)));
    if (!file.startsWith(`${mediaRoot}${path.sep}`)) throw new Error("outside");
    info = await stat(file);
  } catch {
    return send(res, 404, { error: "not_found" });
  }
  if (!info.isFile()) return send(res, 404, { error: "not_found" });
  res.setHeader("Content-Type", contentTypeFor(fileExtension(file)));
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("X-Content-Type-Options", "nosniff");
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) {
      res.statusCode = 416;
      res.setHeader("Content-Range", `bytes */${info.size}`);
      return res.end();
    }
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${info.size}`);
    res.setHeader("Content-Length", String(end - start + 1));
    return createReadStream(file, { start, end }).pipe(res);
  }
  res.statusCode = 200;
  res.setHeader("Content-Length", String(info.size));
  return createReadStream(file).pipe(res);
}

/** Large uploads on this computer when no Blob store is connected: raw bytes, signed-in only. */
async function saveLocalUpload(req, res, api, url) {
  if (!api.userFromHeader(req.headers.authorization)) return send(res, 401, { error: "unauthorized" });
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 320 * 1024 * 1024) return send(res, 413, { error: "too_large" });
    chunks.push(chunk);
  }
  try {
    const file = await api.media.saveLocal(url.searchParams.get("name") || "", Buffer.concat(chunks));
    return send(res, 200, { file });
  } catch (error) {
    return send(res, error.status || 500, { error: error.code || "something_went_wrong" });
  }
}

function attach(server, env) {
  const root = process.cwd();
  const apiPromise = createApi({ root, env });
  server.middlewares.use(async (req, res, next) => {
    const url = new URL(req.url || "/", "http://localhost");
    const pathname = url.pathname;
    if (req.method === "GET" && pathname.startsWith("/media/")) return serveMedia(req, res, root, pathname);
    if (req.method === "PUT" && pathname === "/api/media/local") return saveLocalUpload(req, res, await apiPromise, url);
    if (!pathname.startsWith("/api/")) return next();
    await serveApi(req, res, () => apiPromise);
  });
}

export function authorApiPlugin() {
  return {
    name: "author-api",
    configureServer(server) {
      attach(server, readServerEnv());
    },
    configurePreviewServer(server) {
      attach(server, readServerEnv());
    },
  };
}
