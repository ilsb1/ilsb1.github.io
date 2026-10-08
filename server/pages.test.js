import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { createApi } from "./api.js";

const AUTHOR = "eldarh079@gmail.com";
const PNG = Buffer.from("89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489", "hex");

function respond(data, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(data), json: async () => data };
}

/** GitHub's git data API, with a switch to make the next ref update lose a race. */
function fakeGithub({ existing = new Set(), failRefOnce = false, failAll = false } = {}) {
  const calls = [];
  let refFailures = failRefOnce ? 1 : 0;
  const fetchImpl = async (url, options = {}) => {
    const target = String(url);
    const body = options.body ? JSON.parse(options.body) : null;
    calls.push({ url: target, method: options.method || "GET", body });
    if (failAll) return respond({ message: "down" }, 500);
    if (target.endsWith("/git/ref/heads/main")) return respond({ object: { sha: "parent" } });
    if (target.endsWith("/git/commits/parent")) return respond({ tree: { sha: "tree" } });
    if (target.endsWith("/git/blobs")) return respond({ sha: "blob1" });
    if (target.endsWith("/git/trees")) return respond({ sha: "tree2" });
    if (target.endsWith("/git/commits")) return respond({ sha: "commit2" });
    if (target.includes("/contents/")) {
      const file = decodeURIComponent(target.split("/contents/")[1].split("?")[0]);
      return existing.has(file) ? respond({ sha: "file" }) : respond({ message: "Not Found" }, 404);
    }
    if (target.includes("/git/refs/heads/main")) {
      if (refFailures > 0) {
        refFailures -= 1;
        return respond({ message: "Update is not a fast forward" }, 422);
      }
      return respond({ ref: "ok" });
    }
    return respond({ message: "no" }, 404);
  };
  return { fetchImpl, calls };
}

async function setup({ env = {}, github } = {}) {
  const root = await mkdtemp(path.join(tmpdir(), "ils-pages-"));
  const api = await createApi({
    root,
    env: { AUTH_SECRET: "test-secret-value-123", ...env },
    wait: async () => {},
    now: () => Date.parse("2026-10-05T12:00:00Z"),
    fetchImpl: github?.fetchImpl,
  });
  const call = (method, pathname, { body = null, token = "" } = {}) =>
    api.handle({
      method,
      pathname,
      headers: { host: "localhost:5174", ...(token ? { authorization: `Bearer ${token}` } : {}) },
      body,
      ip: "127.0.0.1",
    });
  const requested = await call("POST", "/api/auth/request", { body: { email: AUTHOR } });
  const verified = await call("POST", "/api/auth/verify", { body: { email: AUTHOR, code: requested.json.previewCode } });
  return { root, call, token: verified.json.token, cleanup: () => rm(root, { recursive: true, force: true }) };
}

const UNIT_EDIT = {
  fields: { description: "<p>Listen <b>twice</b>.</p><script>x</script>", tracks: ["First"] },
  blocks: [
    { id: "b-photo", type: "photos", size: "medium", items: [{ src: "/media/2026/10/a1-photo.jpg", width: 800, height: 600 }] },
    { id: "b-bad", type: "photos", items: [{ src: "https://evil.example/x.jpg" }] },
  ],
};

test("keeps page drafts private until published, then writes the page file", async () => {
  const { root, call, token, cleanup } = await setup();
  try {
    assert.equal((await call("GET", "/api/pages")).status, 401);
    const list = await call("GET", "/api/pages", { token });
    assert.equal(list.json.pages.find((page) => page.id === "unit-3").status, "original");
    assert.equal(list.json.mediaBase, "");

    const saved = await call("PUT", "/api/pages/unit-3", { token, body: UNIT_EDIT });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.page.status, "changed");
    assert.equal(saved.json.page.draft.fields.description, "<p>Listen <strong>twice</strong>.</p>");
    assert.equal(saved.json.page.draft.blocks.length, 1);
    await assert.rejects(stat(path.join(root, "content", "pages", "unit-3.json")));

    const published = await call("POST", "/api/pages/unit-3/publish", { token, body: UNIT_EDIT });
    assert.equal(published.status, 200);
    assert.equal(published.json.github, "skipped");
    assert.equal(published.json.page.status, "published");
    const file = JSON.parse(await readFile(path.join(root, "content", "pages", "unit-3.json"), "utf8"));
    assert.equal(file.page, "unit-3");
    assert.deepEqual(file.fields.tracks, ["First"]);

    const edited = await call("PUT", "/api/pages/unit-3", { token, body: { fields: {}, blocks: [] } });
    assert.equal(edited.json.page.status, "changed");
    const discarded = await call("POST", "/api/pages/unit-3/discard", { token });
    assert.equal(discarded.json.page.status, "published");
    assert.deepEqual(discarded.json.page.draft.fields.tracks, ["First"]);

    const reset = await call("POST", "/api/pages/unit-3/reset", { token });
    assert.equal(reset.json.page.status, "original");
    await assert.rejects(stat(path.join(root, "content", "pages", "unit-3.json")));

    assert.equal((await call("PUT", "/api/pages/unit-11", { token, body: UNIT_EDIT })).status, 404);
    assert.equal((await call("PUT", "/api/pages/__proto__", { token, body: UNIT_EDIT })).status, 404);
  } finally {
    await cleanup();
  }
});

test("publishes pages through GitHub, retrying when another save got there first", async () => {
  const github = fakeGithub({ failRefOnce: true, existing: new Set(["content/pages/home.json"]) });
  const { call, token, cleanup } = await setup({
    env: { GITHUB_TOKEN: "gh-token", GITHUB_REPO: "ilsb1/ilsb1.github.io" },
    github,
  });
  try {
    const published = await call("POST", "/api/pages/home/publish", { token, body: { fields: { heading: "Hello" }, blocks: [] } });
    assert.equal(published.status, 200);
    assert.equal(published.json.github, "ok");
    const patches = github.calls.filter((call) => call.method === "PATCH");
    assert.equal(patches.length, 2);
    const tree = github.calls.findLast((call) => call.url.endsWith("/git/trees"));
    assert.equal(tree.body.tree[0].path, "content/pages/home.json");

    const reset = await call("POST", "/api/pages/home/reset", { token });
    assert.equal(reset.json.page.status, "original");
    const deletion = github.calls.findLast((call) => call.url.endsWith("/git/trees"));
    assert.deepEqual(deletion.body.tree, [{ path: "content/pages/home.json", mode: "100644", type: "blob", sha: null }]);
  } finally {
    await cleanup();
  }
});

test("keeps the draft and says so when GitHub is down", async () => {
  const github = fakeGithub({ failAll: true });
  const { call, token, cleanup } = await setup({
    env: { GITHUB_TOKEN: "gh-token", GITHUB_REPO: "ilsb1/ilsb1.github.io" },
    github,
  });
  try {
    const published = await call("POST", "/api/pages/home/publish", { token, body: { fields: { heading: "Hi" }, blocks: [] } });
    assert.equal(published.status, 502);
    assert.equal(published.json.error, "publish_failed");
    const page = await call("GET", "/api/pages/home", { token });
    assert.equal(page.json.page.status, "changed");
    assert.equal(page.json.page.draft.fields.heading, "Hi");
    assert.equal(page.json.page.live, null);
  } finally {
    await cleanup();
  }
});

test("stores small uploads with the site and checks they are what they claim to be", async () => {
  const { root, call, token, cleanup } = await setup();
  try {
    const upload = (name, bytes) => call("POST", "/api/media", { token, body: { name, data: bytes.toString("base64") } });
    assert.equal((await call("POST", "/api/media", { body: { name: "a.png", data: PNG.toString("base64") } })).status, 401);

    const ok = await upload("My Photo.PNG", PNG);
    assert.equal(ok.status, 200);
    assert.match(ok.json.file.src, /^\/media\/dev\/[0-9a-f]{8}-my-photo\.png$/);
    assert.equal(ok.json.file.kind, "image");
    const saved = await readdir(path.join(root, "public", "media", "dev"));
    assert.equal(saved.length, 1);

    assert.equal((await upload("fake.jpg", Buffer.from("<html>nope</html>"))).json.error, "file_damaged");
    assert.equal((await upload("page.html", Buffer.from("<p>hi</p>"))).json.error, "file_type");
    assert.equal((await upload("drawing.svg", Buffer.from("<svg/>"))).json.error, "file_type");
    assert.equal((await upload("big.pdf", Buffer.alloc(3 * 1024 * 1024 + 10, 0x25))).json.error, "too_large");
    assert.equal((await upload("empty.pdf", Buffer.alloc(0))).json.error, "empty_file");
  } finally {
    await cleanup();
  }
});

test("commits small uploads to GitHub as binary files", async () => {
  const github = fakeGithub();
  const { root, call, token, cleanup } = await setup({
    env: { GITHUB_TOKEN: "gh-token", GITHUB_REPO: "ilsb1/ilsb1.github.io" },
    github,
  });
  try {
    const ok = await call("POST", "/api/media", { token, body: { name: "cover.png", data: PNG.toString("base64") } });
    assert.equal(ok.status, 200);
    assert.match(ok.json.file.src, /^\/media\/2026\/10\/[0-9a-f]{8}-cover\.png$/);
    const blob = github.calls.find((call) => call.url.endsWith("/git/blobs"));
    assert.equal(blob.body.encoding, "base64");
    assert.equal(Buffer.from(blob.body.content, "base64").equals(PNG), true);
    const tree = github.calls.find((call) => call.url.endsWith("/git/trees"));
    assert.equal(tree.body.tree[0].path, `public${ok.json.file.src}`);
    assert.ok((await stat(path.join(root, "public", ok.json.file.src))).isFile());
  } finally {
    await cleanup();
  }
});

test("hands out a one-file Blob upload permission for large files", async () => {
  const local = await setup();
  try {
    const noStore = await local.call("POST", "/api/media/token", { token: local.token, body: { name: "talk.mp4", size: 50_000_000 } });
    assert.deepEqual(noStore.json, { local: true });
  } finally {
    await local.cleanup();
  }

  const { call, token, cleanup } = await setup({ env: { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_store123_secretpart" } });
  try {
    const granted = await call("POST", "/api/media/token", { token, body: { name: "Class Talk.MOV", size: 50_000_000 } });
    assert.equal(granted.status, 200);
    assert.match(granted.json.token, /^vercel_blob_client_store123_/);
    assert.match(granted.json.pathname, /^media\/2026\/10\/[0-9a-f]{8}-class-talk\.mov$/);
    assert.equal(granted.json.contentType, "video/quicktime");
    const payload = JSON.parse(Buffer.from(Buffer.from(granted.json.token.split("_").slice(4).join("_"), "base64").toString().split(".")[1], "base64").toString());
    assert.equal(payload.pathname, granted.json.pathname);

    const tooBig = await call("POST", "/api/media/token", { token, body: { name: "huge.mp4", size: 400 * 1024 * 1024 } });
    assert.equal(tooBig.json.error, "too_large");
    const wrongType = await call("POST", "/api/media/token", { token, body: { name: "run.exe", size: 10 } });
    assert.equal(wrongType.json.error, "file_type");
  } finally {
    await cleanup();
  }
});

test("finds the Blob token when the store was connected with its own prefix", async () => {
  const { call, token, cleanup } = await setup({
    env: { OTHER_READ_WRITE_TOKEN: "not-a-blob-token", B_READ_WRITE_TOKEN: "vercel_blob_rw_store456_secretpart" },
  });
  try {
    const granted = await call("POST", "/api/media/token", { token, body: { name: "talk.mp4", size: 50_000_000 } });
    assert.equal(granted.status, 200);
    assert.match(granted.json.token, /^vercel_blob_client_store456_/);
  } finally {
    await cleanup();
  }
});
