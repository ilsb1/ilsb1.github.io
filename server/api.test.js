import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createApi } from "./api.js";

const AUTHOR = "eldarh079@gmail.com";
const POST_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

function respond(data, ok = true, status = 200) {
  return { ok, status, text: async () => JSON.stringify(data) };
}

function githubFetch() {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET", body: options.body || "" });
    const target = String(url);
    if (target.endsWith("/git/ref/heads/main")) return respond({ object: { sha: "parent" } });
    if (target.endsWith("/git/commits/parent")) return respond({ tree: { sha: "tree" } });
    if (target.endsWith("/git/blobs")) return respond({ sha: "blob1" });
    if (target.endsWith("/git/trees")) return respond({ sha: "tree2" });
    if (target.endsWith("/git/commits")) return respond({ sha: "commit2" });
    if (target.includes("/git/refs/heads/main")) return respond({ ref: "ok" });
    return respond({ message: "no" }, false, 404);
  };
  return { fetchImpl, calls };
}

async function setup(env = {}, extra = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "ils-desk-"));
  let clock = Date.parse("2026-03-01T12:00:00Z");
  const { handle } = await createApi({
    root,
    env: { AUTH_SECRET: "test-secret-value-123", ...env },
    wait: async () => {},
    now: () => clock,
    ...extra,
  });
  const call = (method, pathname, { body = null, token = "", host = "localhost:5173", origin } = {}) =>
    handle({
      method,
      pathname,
      headers: {
        host,
        ...(origin ? { origin } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body,
      ip: "127.0.0.1",
    });
  return {
    root,
    call,
    advance(ms) {
      clock += ms;
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("hides codes from unknown emails and shows a preview code locally", async () => {
  const desk = await setup();
  try {
    const stranger = await desk.call("POST", "/api/auth/request", {
      body: { email: "someone@example.com" },
    });
    assert.equal(stranger.status, 200);
    assert.equal(stranger.json.previewCode, undefined);

    const lookalike = await desk.call("POST", "/api/auth/request", {
      body: { email: "sevinjhasanov@yahoo.com" },
    });
    assert.equal(lookalike.json.previewCode, undefined);

    const author = await desk.call("POST", "/api/auth/request", { body: { email: AUTHOR } });
    assert.equal(author.status, 200);
    assert.match(author.json.previewCode, /^\d{6}$/);

    const again = await desk.call("POST", "/api/auth/request", { body: { email: AUTHOR } });
    assert.equal(again.json.alreadySent, true);
    assert.equal(again.json.previewCode, undefined);

    const wrong = await desk.call("POST", "/api/auth/verify", {
      body: { email: AUTHOR, code: "000000" },
    });
    assert.equal(wrong.status, 401);

    const right = await desk.call("POST", "/api/auth/verify", {
      body: { email: AUTHOR, code: author.json.previewCode },
    });
    assert.equal(right.status, 200);
    assert.equal(right.json.email, AUTHOR);
    assert.ok(right.json.token);

    const publicHost = await desk.call("POST", "/api/auth/request", {
      body: { email: AUTHOR },
      host: "ilsb1.github.io",
    });
    assert.equal(publicHost.status, 503);
    assert.equal(publicHost.json.previewCode, undefined);
  } finally {
    await desk.cleanup();
  }
});

test("rejects a foreign website and unsigned writes", async () => {
  const desk = await setup();
  try {
    const blocked = await desk.call("POST", "/api/auth/request", {
      body: { email: AUTHOR },
      origin: "https://evil.example",
    });
    assert.equal(blocked.status, 403);

    const denied = await desk.call("PUT", `/api/posts/${POST_ID}`, {
      body: { title: "Hi", subtitle: "", html: "<p>Hi</p>" },
    });
    assert.equal(denied.status, 401);
  } finally {
    await desk.cleanup();
  }
});

test("publishes a sanitized piece into the preview folder", async () => {
  const desk = await setup();
  try {
    const author = await desk.call("POST", "/api/auth/request", { body: { email: AUTHOR } });
    const signed = await desk.call("POST", "/api/auth/verify", {
      body: { email: AUTHOR, code: author.json.previewCode },
    });
    const token = signed.json.token;
    const body = {
      title: "A morning class",
      subtitle: "Notes from the room",
      html: '<p>Hello <strong>class</strong></p><script>alert(1)</script><a href="javascript:alert(1)">skip</a>',
    };
    const published = await desk.call("POST", `/api/posts/${POST_ID}/publish`, { body, token });
    assert.equal(published.status, 200);
    assert.equal(published.json.github, "skipped");
    assert.equal(published.json.post.slug, "a-morning-class");
    assert.doesNotMatch(published.json.post.html, /script|javascript/i);

    const article = JSON.parse(
      await readFile(path.join(desk.root, "public", "blogs", "a-morning-class.json"), "utf8"),
    );
    assert.equal(article.title, "A morning class");
    assert.doesNotMatch(article.html, /script|javascript/i);
    assert.match(article.html, /Hello/);

    const index = JSON.parse(await readFile(path.join(desk.root, "public", "blogs", "index.json"), "utf8"));
    assert.equal(index.posts.length, 1);
    assert.equal(index.posts[0].slug, "a-morning-class");

    desk.advance(15 * 24 * 60 * 60 * 1000);
    const expired = await desk.call("GET", "/api/posts", { token });
    assert.equal(expired.status, 401);
  } finally {
    await desk.cleanup();
  }
});

test("locks the code after repeated wrong tries", async () => {
  const desk = await setup();
  try {
    const author = await desk.call("POST", "/api/auth/request", { body: { email: "SevinjHasanova@yahoo.com" } });
    assert.match(author.json.previewCode, /^\d{6}$/);
    for (let i = 0; i < 4; i += 1) {
      const attempt = await desk.call("POST", "/api/auth/verify", {
        body: { email: "sevinjhasanova@yahoo.com", code: "111111" },
      });
      assert.equal(attempt.json.error, "code_mismatch");
    }
    const locked = await desk.call("POST", "/api/auth/verify", {
      body: { email: "sevinjhasanova@yahoo.com", code: "111111" },
    });
    assert.equal(locked.json.error, "too_many_attempts");
  } finally {
    await desk.cleanup();
  }
});

test("sends a published piece to GitHub when a token is configured", async () => {
  const github = githubFetch();
  const desk = await setup(
    { GITHUB_TOKEN: "secret-token", GITHUB_REPO: "ilsb1/ilsb1.github.io" },
    { fetchImpl: github.fetchImpl },
  );
  try {
    const author = await desk.call("POST", "/api/auth/request", { body: { email: AUTHOR } });
    const signed = await desk.call("POST", "/api/auth/verify", {
      body: { email: AUTHOR, code: author.json.previewCode },
    });
    const published = await desk.call("POST", `/api/posts/${POST_ID}/publish`, {
      token: signed.json.token,
      body: { title: "Hello", subtitle: "", html: "<p>There</p>" },
    });
    assert.equal(published.json.github, "ok");
    assert.ok(github.calls.some((call) => call.url.includes("/git/refs/heads/main") && call.method === "PATCH"));
    assert.ok(github.calls.every((call) => !call.url.includes("secret-token")));
    assert.equal(JSON.stringify(published.json).includes("secret-token"), false);
  } finally {
    await desk.cleanup();
  }
});
