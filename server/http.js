export function send(res, status, json) {
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
    req.on("data", (data) => {
      const chunk = typeof data === "string" ? Buffer.from(data) : data;
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

/** Only trust forwarding headers behind a proxy that overwrites them, such as Vercel's edge. */
export function requestIp(req, { behindProxy = false } = {}) {
  if (behindProxy) {
    const real = req.headers["x-real-ip"];
    if (typeof real === "string" && real.trim()) return real.trim();
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
  }
  return req.socket?.remoteAddress || "local";
}

export async function serveApi(req, res, getApi, { behindProxy = false } = {}) {
  try {
    const method = req.method || "GET";
    const pathname = (req.url || "").split("?")[0];
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
    const api = await getApi();
    const result = await api.handle({
      method,
      pathname,
      headers: headerMap(req),
      body,
      ip: requestIp(req, { behindProxy }),
    });
    send(res, result.status, result.json);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error("Desk API error", error.code || error.message || "error");
    send(res, status, { error: error.code || "something_went_wrong" });
  }
}
