import { readServerEnv } from "./env.js";
import { createApi } from "./api.js";
import { serveApi } from "./http.js";

function attach(server, env) {
  const apiPromise = createApi({ root: process.cwd(), env });
  server.middlewares.use(async (req, res, next) => {
    const pathname = (req.url || "").split("?")[0];
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
