import assert from "node:assert/strict";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createApi } from "./api.js";
import { requestIp } from "./http.js";
import { sendLoginCode } from "./mail.js";

const AUTHOR = "sevinjhasanova@yahoo.com";
const POST_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const REDIS_URL = "https://redis.test";
const REDIS_TOKEN = "redis-token";
const HOSTED_ENV = {
  AUTH_SECRET: "a-hosted-secret-that-is-long-enough-123",
  KV_REST_API_URL: REDIS_URL,
  KV_REST_API_TOKEN: REDIS_TOKEN,
  GMAIL_USER: "desk@gmail.com",
  GMAIL_APP_PASSWORD: "abcd efgh ijkl mnop",
};

function respond(data, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

/** Enough of Upstash's REST API for the desk: strings, counters and one hash. */
function fakeUpstash() {
  const strings = new Map();
  const hashes = new Map();
  const exec = ([name, ...args]) => {
    switch (name) {
      case "GET":
        return strings.get(args[0]) ?? null;
      case "SET":
        strings.set(args[0], args[1]);
        return "OK";
      case "DEL":
        return args.filter((key) => strings.delete(key) || hashes.delete(key)).length;
      case "INCR": {
        const next = Number(strings.get(args[0]) ?? 0) + 1;
        strings.set(args[0], String(next));
        return next;
      }
      case "PEXPIRE":
        return 1;
      case "HGETALL":
        return [...(hashes.get(args[0]) ?? new Map())].flat();
      case "HSET": {
        const hash = hashes.get(args[0]) ?? new Map();
        hash.set(args[1], args[2]);
        hashes.set(args[0], hash);
        return 1;
      }
      case "HDEL":
        return hashes.get(args[0])?.delete(args[1]) ? 1 : 0;
      default:
        throw new Error(`unsupported command ${name}`);
    }
  };
  const fetchImpl = async (url, options) => {
    if (options.headers.Authorization !== `Bearer ${REDIS_TOKEN}`) return respond({ error: "unauthorized" }, 401);
    const body = JSON.parse(options.body);
    if (String(url).endsWith("/pipeline")) return respond(body.map((command) => ({ result: exec(command) })));
    return respond({ result: exec(body) });
  };
  return { fetchImpl, strings, hashes };
}

function fakeGithub() {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    const target = String(url);
    if (target.endsWith("/git/ref/heads/site")) return respond({ object: { sha: "parent" } });
    if (target.endsWith("/git/commits/parent")) return respond({ tree: { sha: "tree" } });
    if (target.endsWith("/git/blobs")) return respond({ sha: "blob1" });
    if (target.endsWith("/git/trees")) return respond({ sha: "tree2" });
    if (target.endsWith("/git/commits")) return respond({ sha: "commit2" });
    if (target.includes("/git/refs/heads/site")) return respond({ ref: "ok" });
    return respond({ message: "no" }, 404);
  };
  return { fetchImpl, calls };
}

function fakeMail() {
  const sent = [];
  return {
    sent,
    sendMail: async (message) => {
      sent.push(message);
    },
    lastCode() {
      const match = sent.at(-1)?.text.match(/(\d{3}) (\d{3})/);
      return match ? `${match[1]}${match[2]}` : "";
    },
  };
}

async function setup({ env = {}, redis = fakeUpstash(), github = null } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "ils-hosted-"));
  const transport = fakeMail();
  const fetchImpl = (url, options) =>
    String(url).startsWith(REDIS_URL) ? redis.fetchImpl(url, options) : github.fetchImpl(url, options);
  let clock = Date.parse("2026-03-01T12:00:00Z");
  const start = () =>
    createApi({
      root,
      env: { ...HOSTED_ENV, ...env },
      hosted: true,
      fetchImpl,
      transport,
      wait: async () => {},
      now: () => clock,
    });
  const instances = [await start(), await start()];
  const call = (method, pathname, { body = null, token = "", instance = 0, host = "ilsb1.vercel.app" } = {}) =>
    instances[instance].handle({
      method,
      pathname,
      headers: { host, ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body,
      ip: "203.0.113.7",
    });
  return {
    root,
    redis,
    transport,
    call,
    advance(ms) {
      clock += ms;
    },
    async signIn() {
      await call("POST", "/api/auth/request", { body: { email: AUTHOR } });
      const verified = await call("POST", "/api/auth/verify", { body: { email: AUTHOR, code: transport.lastCode() } });
      return verified.json.token;
    },
    cleanup: () => rm(root, { recursive: true, force: true }),
  };
}

test("refuses to start on Vercel without a long secret or shared storage", async () => {
  await assert.rejects(
    createApi({ root: tmpdir(), env: { ...HOSTED_ENV, AUTH_SECRET: "short" }, hosted: true }),
    { code: "not_configured" },
  );
  await assert.rejects(
    createApi({ root: tmpdir(), env: { ...HOSTED_ENV, KV_REST_API_URL: "" }, hosted: true }),
    { code: "not_configured" },
  );
});

test("emails the code instead of showing it, even when the host claims to be localhost", async () => {
  const desk = await setup();
  try {
    const sent = await desk.call("POST", "/api/auth/request", { body: { email: AUTHOR }, host: "localhost:5173" });
    assert.equal(sent.status, 200);
    assert.equal(sent.json.delivery, "email");
    assert.equal(sent.json.previewCode, undefined);
    assert.equal(desk.transport.sent.length, 1);
    assert.equal(desk.transport.sent[0].to, AUTHOR);
    assert.equal(desk.transport.sent[0].from.address, HOSTED_ENV.GMAIL_USER);

    const verified = await desk.call("POST", "/api/auth/verify", {
      body: { email: AUTHOR, code: desk.transport.lastCode() },
      instance: 1,
    });
    assert.equal(verified.status, 200);
    assert.equal(verified.json.email, AUTHOR);
  } finally {
    await desk.cleanup();
  }
});

test("won't sign in on Vercel until email sending is set up", async () => {
  const desk = await setup({ env: { GMAIL_APP_PASSWORD: "" } });
  try {
    const sent = await desk.call("POST", "/api/auth/request", { body: { email: AUTHOR } });
    assert.equal(sent.status, 503);
    assert.equal(sent.json.error, "mail_not_configured");
  } finally {
    await desk.cleanup();
  }
});

test("counts wrong codes across server instances", async () => {
  const desk = await setup();
  try {
    await desk.call("POST", "/api/auth/request", { body: { email: AUTHOR } });
    const code = desk.transport.lastCode();
    const wrong = code === "111111" ? "222222" : "111111";
    for (let i = 0; i < 4; i += 1) {
      const attempt = await desk.call("POST", "/api/auth/verify", {
        body: { email: AUTHOR, code: wrong },
        instance: i % 2,
      });
      assert.equal(attempt.json.error, "code_mismatch");
    }
    const fifth = await desk.call("POST", "/api/auth/verify", { body: { email: AUTHOR, code: wrong }, instance: 1 });
    assert.equal(fifth.json.error, "too_many_attempts");
    const late = await desk.call("POST", "/api/auth/verify", { body: { email: AUTHOR, code } });
    assert.equal(late.status, 401);
  } finally {
    await desk.cleanup();
  }
});

test("keeps drafts in Redis and never writes to the server's disk", async () => {
  const desk = await setup();
  try {
    const token = await desk.signIn();
    const saved = await desk.call("PUT", `/api/posts/${POST_ID}`, {
      token,
      body: { title: "A draft", subtitle: "", html: "<p>Hello</p>" },
    });
    assert.equal(saved.status, 200);

    const listed = await desk.call("GET", "/api/posts", { token, instance: 1 });
    assert.deepEqual(
      listed.json.posts.map((post) => [post.id, post.title, post.status]),
      [[POST_ID, "A draft", "draft"]],
    );
    assert.deepEqual(await readdir(desk.root), []);
  } finally {
    await desk.cleanup();
  }
});

test("won't publish on Vercel without GitHub, and commits straight to GitHub when it can", async () => {
  const unconfigured = await setup();
  try {
    const token = await unconfigured.signIn();
    const refused = await unconfigured.call("POST", `/api/posts/${POST_ID}/publish`, {
      token,
      body: { title: "Hello", subtitle: "", html: "<p>World</p>" },
    });
    assert.equal(refused.status, 503);
    assert.equal(refused.json.error, "publish_not_configured");
    const listed = await unconfigured.call("GET", "/api/posts", { token });
    assert.deepEqual(listed.json.posts, []);
  } finally {
    await unconfigured.cleanup();
  }

  const github = fakeGithub();
  const desk = await setup({
    env: { GITHUB_TOKEN: "gh-token", GITHUB_REPO: "ilsb1/ilsb1.github.io", GITHUB_BRANCH: "site" },
    github,
  });
  try {
    const token = await desk.signIn();
    const published = await desk.call("POST", `/api/posts/${POST_ID}/publish`, {
      token,
      body: { title: "Hello", subtitle: "", html: "<p>World</p>" },
    });
    assert.equal(published.status, 200);
    assert.equal(published.json.github, "ok");
    assert.equal(published.json.post.status, "published");
    assert.ok(github.calls.some((call) => call.url.endsWith("/git/refs/heads/site") && call.method === "PATCH"));
    assert.deepEqual(await readdir(desk.root), []);
  } finally {
    await desk.cleanup();
  }
});

test("trusts forwarding headers only behind Vercel's proxy", () => {
  const req = {
    headers: { "x-forwarded-for": "198.51.100.4, 10.0.0.1" },
    socket: { remoteAddress: "10.0.0.9" },
  };
  assert.equal(requestIp(req, { behindProxy: true }), "198.51.100.4");
  assert.equal(requestIp({ ...req, headers: { ...req.headers, "x-real-ip": "198.51.100.5" } }, { behindProxy: true }), "198.51.100.5");
  assert.equal(requestIp(req), "10.0.0.9");
});

test("reports a failed email as mail_failed without leaking details", async () => {
  const broken = {
    sendMail: async () => {
      throw Object.assign(new Error("Invalid login: 535 secret details"), { responseCode: 535 });
    },
  };
  await assert.rejects(
    sendLoginCode({ env: HOSTED_ENV, email: AUTHOR, code: "123456", transport: broken }),
    (error) => error.code === "mail_failed" && error.status === 502 && !error.message.includes("535"),
  );
});
