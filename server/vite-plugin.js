import { readFile } from "node:fs/promises";
import path from "node:path";
import { readServerEnv } from "./env.js";
import { createApi } from "./api.js";

function send(res, status, json) {
  const body = JSON.stringify(json);
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("X-Frame-Options", "DENY");
  res.end(body);
}

function headerMap(req) {
  const headers = {};
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") headers[key.toLowerCase()] = value;
    else if (Array.isArray(value)) headers[key.toLowerCase()] = value.join(", ");
  }
  return headers;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 350_000) {
        const error = new Error("too_large");
        error.status = 413;
        error.code = "too_large";
        reject(error);
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function sendBlogFile(res, name) {
  try {
    const body = await readFile(path.join(process.cwd(), "public", "blogs", `${name}.json`), "utf8");
    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.end(body);
  } catch {
    send(res, 404, { error: "not_found" });
  }
}

function attach(server, env) {
  const apiPromise = createApi({ root: process.cwd(), env });
  server.middlewares.use(async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
    const blogFile = req.method === "GET" ? pathname.match(/^\/blogs\/([a-z0-9-]{1,80})\.json$/) : null;
    if (blogFile) {
      await sendBlogFile(res, blogFile[1]);
      return;
    }
    if (!pathname.startsWith("/api/")) return next();
    try {
      const method = req.method || "GET";
      let body = null;
      if (method === "POST" || method === "PUT" || method === "DELETE") {
        const raw = await readBody(req);
        if (raw) {
          const type = String(req.headers["content-type"] || "");
          if (!type.includes("application/json")) {
            send(res, 415, { error: "unsupported_type" });
            return;
          }
          try {
            body = JSON.parse(raw);
          } catch {
            send(res, 400, { error: "bad_body" });
            return;
          }
        }
      }
      const api = await apiPromise;
      const result = await api.handle({
        method,
        pathname,
        headers: headerMap(req),
        body,
        ip: req.socket?.remoteAddress || "local",
      });
      send(res, result.status, result.json);
    } catch (error) {
      const status = error.status || 500;
      send(res, status, { error: error.code || "something_went_wrong" });
    }
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
