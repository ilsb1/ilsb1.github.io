import { createHmac, timingSafeEqual } from "node:crypto";
import { isAllowedEmail, normalizeEmail } from "./allowlist.js";

export const SESSION_MS = 14 * 24 * 60 * 60 * 1000;

export function signSession(email, secret, now = Date.now()) {
  const payload = {
    v: 1,
    sub: normalizeEmail(email),
    iat: now,
    exp: now + SESSION_MS,
  };
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return { token: `${body}.${sig}`, expiresAt: payload.exp, email: payload.sub };
}

export function verifySession(token, secret, now = Date.now()) {
  if (typeof token !== "string") return null;
  const dot = token.indexOf(".");
  if (dot <= 0 || dot !== token.lastIndexOf(".")) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest();
  let actual;
  try {
    actual = Buffer.from(sig, "base64url");
  } catch {
    return null;
  }
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (!payload || payload.v !== 1 || typeof payload.exp !== "number") return null;
  if (payload.exp < now || payload.exp > now + SESSION_MS + 1000) return null;
  if (!isAllowedEmail(payload.sub)) return null;
  return { email: normalizeEmail(payload.sub), expiresAt: payload.exp };
}
