import { readFile } from "node:fs/promises";
import path from "node:path";
import { readServerEnv } from "./env.js";
import { createApi } from "./api.js";
import { send, serveApi } from "./http.js";

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
