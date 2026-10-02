import "./dom.js";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { isAllowedEmail, normalizeEmail } from "../shared/allowlist.js";
import { isPostId } from "../shared/text.js";
import { signSession, verifySession } from "../shared/session.js";
import { mailIsConfigured, sendLoginCode } from "./mail.js";
import { createRedis, createRedisPosts, createRedisState, redisConfig } from "./redis.js";
import { createMemoryState } from "./state.js";
import { createFilePosts, createStore, loadSecret } from "./store.js";

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

function notConfigured(what) {
  const error = new Error(`${what}_not_configured`);
  error.status = 503;
  error.code = "not_configured";
  return error;
}

/**
 * `hosted` is for the public deployment: it never shows codes on the page,
 * never writes to disk, and refuses to start without a secret and shared storage.
 */
export async function createApi({
  root,
  env,
  fetchImpl,
  wait,
  now = () => Date.now(),
  hosted = false,
  redis: redisClient,
  transport,
}) {
  if (hosted && !(env.AUTH_SECRET && env.AUTH_SECRET.length >= 32)) throw notConfigured("secret");
  const config = redisConfig(env);
  const redis = redisClient ?? (config ? createRedis(config, fetchImpl) : null);
  if (hosted && !redis) throw notConfigured("storage");

  const secret = hosted ? env.AUTH_SECRET : await loadSecret(root, env);
  const state = redis ? createRedisState(redis) : createMemoryState();
  const posts = redis ? createRedisPosts(redis) : createFilePosts(root);
  const store = createStore({ root, env, fetchImpl, posts, hosted });
  const pause = wait || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));

  async function rateLimit(ip, current) {
    return (await state.countHit(ip, IP_WINDOW_MS, current)) <= IP_MAX;
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
    if (!(await rateLimit(clientIp(request), current))) {
      return { status: 429, json: { error: "rate_limited" } };
    }
    const email = normalizeEmail(request.body?.email);
    if (!looksLikeEmail(email)) return { status: 400, json: { error: "invalid_email" } };

    const localPreview = !hosted && isLocalHost(request.headers.host) && !mailIsConfigured(env);
    if (!localPreview && !mailIsConfigured(env)) {
      return { status: 503, json: { error: "mail_not_configured" } };
    }

    hashCode(secret, email, "000000");
    if (!isAllowedEmail(email)) return { status: 200, json: { ok: true, delivery: localPreview ? "preview" : "email" } };

    const existing = await state.getCode(email);
    if (existing && existing.exp > current && current - existing.sentAt < RESEND_MS) {
      return {
        status: 200,
        json: { ok: true, delivery: localPreview ? "preview" : "email", alreadySent: true },
      };
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
    await state.putCode(
      email,
      { hash: hashCode(secret, email, code).toString("hex"), exp: current + OTP_MS, sentAt: current },
      OTP_MS,
    );

    if (!localPreview) {
      try {
        await sendLoginCode({ env, email, code, transport });
      } catch (error) {
        await state.dropCode(email);
        throw error;
      }
      return { status: 200, json: { ok: true, delivery: "email" } };
    }
    return { status: 200, json: { ok: true, delivery: "preview", previewCode: code } };
  }

  async function verifyCode(request) {
    const current = now();
    await pause(120);
    if (!(await rateLimit(clientIp(request), current))) {
      return { status: 429, json: { error: "rate_limited" } };
    }
    const email = normalizeEmail(request.body?.email);
    const code = String(request.body?.code ?? "").replace(/\s+/g, "");
    if (!looksLikeEmail(email) || !/^\d{6}$/.test(code)) {
      return { status: 400, json: { error: "invalid_code" } };
    }
    const record = await state.getCode(email);
    const actual = hashCode(secret, email, code);
    if (!record) return { status: 401, json: { error: "code_mismatch" } };
    if (record.exp < current) {
      await state.dropCode(email);
      return { status: 401, json: { error: "code_expired" } };
    }
    // Count the try before comparing, so parallel guesses can't get past the limit.
    const tries = await state.countTry(email, OTP_MS);
    if (tries > MAX_ATTEMPTS) {
      await state.dropCode(email);
      return { status: 401, json: { error: "too_many_attempts" } };
    }
    const expected = Buffer.from(String(record.hash), "hex");
    const matches = actual.length === expected.length && timingSafeEqual(actual, expected);
    if (!matches) {
      if (tries >= MAX_ATTEMPTS) {
        await state.dropCode(email);
        return { status: 401, json: { error: "too_many_attempts" } };
      }
      return { status: 401, json: { error: "code_mismatch" } };
    }
    await state.dropCode(email);
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
