import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

function parseEnvFile(file, into) {
  if (!existsSync(file)) return;
  const text = readFileSync(file, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!/^[A-Z0-9_]+$/.test(key)) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] != null && process.env[key] !== "") into[key] = process.env[key];
    else into[key] = value;
  }
}

export function readServerEnv(cwd = process.cwd()) {
  const env = {};
  const mode = process.env.NODE_ENV === "production" ? "production" : "development";
  for (const name of [
    ".env",
    ".env.local",
    `.env.${mode}`,
    `.env.${mode}.local`,
  ]) {
    parseEnvFile(path.join(cwd, name), env);
  }
  for (const key of [
    "AUTH_SECRET",
    "GMAIL_USER",
    "GMAIL_APP_PASSWORD",
    "GITHUB_TOKEN",
    "GITHUB_REPO",
    "GITHUB_BRANCH",
    "KV_REST_API_URL",
    "KV_REST_API_TOKEN",
    "UPSTASH_REDIS_REST_URL",
    "UPSTASH_REDIS_REST_TOKEN",
  ]) {
    if (process.env[key]) env[key] = process.env[key];
  }
  return env;
}
