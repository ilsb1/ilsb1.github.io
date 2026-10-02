import "./dom.js";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { isAllowedEmail, normalizeEmail } from "../shared/allowlist.js";
import { isPostId } from "../shared/text.js";
import { signSession, verifySession } from "../shared/session.js";
import { mailIsConfigured, sendLoginCode } from "./mail.js";
import { createStore, loadSecret } from "./store.js";

const OTP_MS = 10 * 60 * 1000;
const RESEND_MS = 30 * 1000;
const MAX_ATTEMPTS = 5;
const IP_WINDOW_MS = 15 * 60 * 1000;
const IP_MAX = 30;

function looksLikeEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

function clientIp(request) {
  return request.ip || "local";
}

function isLocalHost(host) {
  if (!host || typeof host !== "string") return false;
  const hostname = host.split(":")[0].replace(/^\[|\]$/g, "").toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function sameOrigin(request) {
  const origin = request.headers.origin;
  const host = request.headers.host;
  if (!origin) return true;
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

function hashCode(secret, email, code) {
  return createHmac("sha256", secret).update(`otp:${email}:${code}`).digest();
}

function bearer(header) {
  if (typeof header !== "string") return "";
  const match = header.match(/^Bearer\s+(\S+)$/i);
  return match ? match[1] : "";
}

function fail(error) {
  const status = error.status || 500;
  const code = status >= 500 && !error.code ? "something_went_wrong" : error.code || "bad_request";
  if (status >= 500) console.error(code);
  return { status, json: { error: code } };
}

export async function createApi({ root, env, fetchImpl, wait, now = () => Date.now() }) {
  const secret = await loadSecret(root, env);
  const store = createStore({ root, env, fetchImpl });
  const otps = new Map();
  const ipHits = new Map();
  const pause = wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  function rateLimit(ip, current) {
    const recent = (ipHits.get(ip) || []).filter((stamp) => current - stamp < IP_WINDOW_MS);
    if (recent.length >= IP_MAX) return false;
    recent.push(current);
    ipHits.set(ip, recent);
    return true;
  }

  function requireUser(request, current) {
    const session = verifySession(bearer(request.headers.authorization), secret, current);
    if (!session) {
      const error = new Error("unauthorized");
      error.status = 401;
      error.code = "unauthorized";
      throw error;
    }
    return session;
  }

  async function requestCode(request) {
    const current = now();
    await pause(120);
    if (!rateLimit(clientIp(request), current)) {
      return { status: 429, json: { error: "rate_limited" } };
    }
    const email = normalizeEmail(request.body?.email);
    if (!looksLikeEmail(email)) return { status: 400, json: { error: "invalid_email" } };

    const localPreview = isLocalHost(request.headers.host) && !env.RESEND_API_KEY;
    if (!localPreview && !mailIsConfigured(env)) {
      return { status: 503, json: { error: "mail_not_configured" } };
    }

    hashCode(secret, email, "000000");
    if (!isAllowedEmail(email)) return { status: 200, json: { ok: true, delivery: localPreview ? "preview" : "email" } };

    const existing = otps.get(email);
    if (existing && existing.exp > current && current - existing.sentAt < RESEND_MS) {
      return {
        status: 200,
        json: { ok: true, delivery: localPreview ? "preview" : "email", alreadySent: true },
      };
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    otps.set(email, {
      hash: hashCode(secret, email, code),
      exp: current + OTP_MS,
      attempts: 0,
      sentAt: current,
    });

    if (!localPreview) {
      try {
        await sendLoginCode({ env, email, code, fetchImpl });
      } catch (error) {
        otps.delete(email);
        throw error;
      }
      return { status: 200, json: { ok: true, delivery: "email" } };
    }
    return { status: 200, json: { ok: true, delivery: "preview", previewCode: code } };
  }

  async function verifyCode(request) {
    const current = now();
    await pause(120);
    if (!rateLimit(clientIp(request), current)) {
      return { status: 429, json: { error: "rate_limited" } };
    }
    const email = normalizeEmail(request.body?.email);
    const code = String(request.body?.code ?? "").replace(/\s+/g, "");
    if (!looksLikeEmail(email) || !/^\d{6}$/.test(code)) {
      return { status: 400, json: { error: "invalid_code" } };
    }
    const record = otps.get(email);
    const actual = hashCode(secret, email, code);
    if (!record) return { status: 401, json: { error: "code_mismatch" } };
    if (record.exp < current) {
      otps.delete(email);
      return { status: 401, json: { error: "code_expired" } };
    }
    const matches = actual.length === record.hash.length && timingSafeEqual(actual, record.hash);
    if (!matches) {
      record.attempts += 1;
      if (record.attempts >= MAX_ATTEMPTS) {
        otps.delete(email);
        return { status: 401, json: { error: "too_many_attempts" } };
      }
      return { status: 401, json: { error: "code_mismatch" } };
    }
    otps.delete(email);
    const session = signSession(email, secret, current);
    return {
      status: 200,
      json: { ok: true, token: session.token, email: session.email, expiresAt: session.expiresAt },
    };
  }

  async function dispatch(request) {
    try {
      if (!sameOrigin(request)) return { status: 403, json: { error: "forbidden" } };
      const { method, pathname } = request;
      if (method === "POST" && pathname === "/api/auth/request") return await requestCode(request);
      if (method === "POST" && pathname === "/api/auth/verify") return await verifyCode(request);

      const current = now();
      const postMatch = pathname.match(/^\/api\/posts\/([^/]+)$/);
      const actionMatch = pathname.match(/^\/api\/posts\/([^/]+)\/(publish|unpublish)$/);

      if (method === "GET" && pathname === "/api/posts") {
        requireUser(request, current);
        return { status: 200, json: { posts: await store.list() } };
      }
      if (method === "PUT" && postMatch) {
        requireUser(request, current);
        if (!isPostId(postMatch[1])) return { status: 400, json: { error: "bad_id" } };
        const post = await store.save(postMatch[1], request.body, current);
        return { status: 200, json: { post } };
      }
      if (method === "POST" && actionMatch?.[2] === "publish") {
        requireUser(request, current);
        const result = await store.publish(actionMatch[1], request.body, current);
        return { status: 200, json: result };
      }
      if (method === "POST" && actionMatch?.[2] === "unpublish") {
        requireUser(request, current);
        const result = await store.unpublish(actionMatch[1], current);
        return { status: 200, json: result };
      }
      if (method === "DELETE" && postMatch) {
        requireUser(request, current);
        const result = await store.remove(postMatch[1], current);
        return { status: 200, json: result };
      }
      return { status: 404, json: { error: "not_found" } };
    } catch (error) {
      return fail(error);
    }
  }

  let chain = Promise.resolve();
  function handle(request) {
    const run = chain.then(() => dispatch(request));
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  }

  return { handle, secret };
}
