import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import { sanitizeHtml } from "../shared/sanitize.js";
import {
  excerptFromHtml,
  htmlToPlain,
  isPostId,
  isSlug,
  plainField,
  slugify,
  wordCount,
} from "../shared/text.js";
import { commitToGithub, githubConfigured } from "./github.js";

const TITLE_MAX = 180;
const SUBTITLE_MAX = 240;
const MAX_POSTS = 200;

function postsFile(root) {
  return path.join(root, "server", "data", "posts.json");
}

function blogsDir(root) {
  return path.join(root, "public", "blogs");
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

async function readPosts(root) {
  try {
    const raw = await readFile(postsFile(root), "utf8");
    const data = JSON.parse(raw);
    return Array.isArray(data.posts) ? data.posts : [];
  } catch {
    return [];
  }
}

async function writePosts(root, posts) {
  await writeJson(postsFile(root), { posts });
}

/** Keeps every piece in server/data/posts.json, for the desk running on this computer. */
export function createFilePosts(root) {
  return {
    all: () => readPosts(root),
    async put(post) {
      const posts = await readPosts(root);
      const index = posts.findIndex((item) => item.id === post.id);
      if (index === -1) posts.push(post);
      else posts[index] = post;
      await writePosts(root, posts);
    },
    async remove(id) {
      const posts = await readPosts(root);
      await writePosts(root, posts.filter((item) => item.id !== id));
    },
  };
}

export async function loadSecret(root, env) {
  if (env.AUTH_SECRET && env.AUTH_SECRET.length >= 16) return env.AUTH_SECRET;
  const file = path.join(root, "server", "data", "auth-secret");
  try {
    const existing = (await readFile(file, "utf8")).trim();
    if (existing.length >= 16) return existing;
  } catch {
    /* create one below */
  }
  const secret = randomBytes(32).toString("hex");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${secret}\n`, { encoding: "utf8", mode: 0o600 });
  return secret;
}

function toClient(post) {
  return {
    id: post.id,
    slug: post.slug,
    title: post.title,
    subtitle: post.subtitle,
    html: post.html,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    status: post.live ? "published" : "draft",
    publishedAt: post.live?.publishedAt ?? null,
    live: post.live
      ? {
          title: post.live.title,
          subtitle: post.live.subtitle,
          html: post.live.html,
          publishedAt: post.live.publishedAt,
          updatedAt: post.live.updatedAt,
        }
      : null,
  };
}

function articleJson(post) {
  return {
    slug: post.slug,
    title: post.live.title,
    subtitle: post.live.subtitle,
    html: post.live.html,
    words: wordCount(post.live.html),
    publishedAt: post.live.publishedAt,
    updatedAt: post.live.updatedAt,
  };
}

function indexEntry(post) {
  return {
    slug: post.slug,
    title: post.live.title,
    subtitle: post.live.subtitle,
    excerpt: excerptFromHtml(post.live.html, 220),
    words: wordCount(post.live.html),
    publishedAt: post.live.publishedAt,
    updatedAt: post.live.updatedAt,
  };
}

async function writePublic(root, posts, { changedSlug = null, removedSlug = null, writeFiles = true } = {}) {
  const published = posts
    .filter((post) => post.live && isSlug(post.slug))
    .sort((a, b) => Date.parse(b.live.publishedAt) - Date.parse(a.live.publishedAt));

  const index = { posts: published.map(indexEntry) };
  const slugs = new Set(published.map((post) => post.slug));

  if (writeFiles) {
    const dir = blogsDir(root);
    await mkdir(dir, { recursive: true });
    await writeJson(path.join(dir, "index.json"), index);
    for (const post of published) {
      await writeJson(path.join(dir, `${post.slug}.json`), articleJson(post));
    }
    if (removedSlug && !slugs.has(removedSlug)) {
      await rm(path.join(dir, `${removedSlug}.json`), { force: true });
    }
  }

  const files = [];
  files.push({
    path: "public/blogs/index.json",
    content: `${JSON.stringify(index, null, 2)}\n`,
  });
  if (changedSlug && slugs.has(changedSlug)) {
    const post = published.find((item) => item.slug === changedSlug);
    files.push({
      path: `public/blogs/${changedSlug}.json`,
      content: `${JSON.stringify(articleJson(post), null, 2)}\n`,
    });
  }
  const deletions = removedSlug && !slugs.has(removedSlug) ? [`public/blogs/${removedSlug}.json`] : [];
  return { files, deletions };
}

function uniqueSlug(title, posts, selfId) {
  const base = slugify(title);
  const taken = new Set(posts.filter((post) => post.id !== selfId && post.slug).map((post) => post.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base.slice(0, 56)}-${n}`)) n += 1;
  return `${base.slice(0, 56)}-${n}`;
}

function failure(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

function cleanInput(body) {
  if (!body || typeof body !== "object") throw failure(400, "bad_body");
  if (String(body.html ?? "").length > 200_000) throw failure(413, "too_large");
  return {
    title: plainField(body.title, TITLE_MAX),
    subtitle: plainField(body.subtitle, SUBTITLE_MAX),
    html: sanitizeHtml(body.html),
  };
}

function requireText(cleaned) {
  if (!cleaned.title) throw failure(400, "title_required");
  if (!htmlToPlain(cleaned.html)) throw failure(400, "body_required");
}

/**
 * `hosted` means a read-only server: nothing is written to disk, and publishing
 * needs GitHub because the commit is what updates the public blog.
 */
export function createStore({ root, env, fetchImpl, posts: db = createFilePosts(root), hosted = false }) {
  const writeFiles = !hosted;
  let chain = Promise.resolve();
  const lock = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  };

  function requireGithub() {
    if (hosted && !githubConfigured(env)) throw failure(503, "publish_not_configured");
  }

  async function sync(message, posts, options) {
    const { files, deletions } = await writePublic(root, posts, { ...options, writeFiles });
    try {
      return await commitToGithub({ env, fetchImpl, message, files, deletions });
    } catch (error) {
      console.error("GitHub commit failed", error.githubStatus || error.code || "error");
      return "failed";
    }
  }

  async function list() {
    const posts = await db.all();
    return posts.map(toClient);
  }

  async function save(id, body, now) {
    if (!isPostId(id)) throw failure(400, "bad_id");
    const cleaned = cleanInput(body);
    const posts = await db.all();
    const existing = posts.find((post) => post.id === id);
    if (!existing && posts.length >= MAX_POSTS) throw failure(400, "too_many");
    const timestamp = new Date(now).toISOString();
    const post = existing
      ? { ...existing, title: cleaned.title, subtitle: cleaned.subtitle, html: cleaned.html, updatedAt: timestamp }
      : {
          id,
          slug: null,
          title: cleaned.title,
          subtitle: cleaned.subtitle,
          html: cleaned.html,
          createdAt: timestamp,
          updatedAt: timestamp,
          live: null,
        };
    await db.put(post);
    return toClient(post);
  }

  async function publish(id, body, now) {
    requireGithub();
    const cleaned = cleanInput(body);
    requireText(cleaned);
    await save(id, cleaned, now);
    const posts = await db.all();
    const post = posts.find((item) => item.id === id);
    if (!post) throw failure(404, "not_found");
    const timestamp = new Date(now).toISOString();
    if (!post.slug) post.slug = uniqueSlug(cleaned.title, posts, post.id);
    const publishedAt = post.live?.publishedAt || timestamp;
    post.title = cleaned.title;
    post.subtitle = cleaned.subtitle;
    post.html = cleaned.html;
    post.updatedAt = timestamp;
    post.live = {
      title: cleaned.title,
      subtitle: cleaned.subtitle,
      html: cleaned.html,
      publishedAt,
      updatedAt: timestamp,
    };
    await db.put(post);
    const github = await sync(`Publish “${cleaned.title}”`, posts, { changedSlug: post.slug });
    return { post: toClient(post), github };
  }

  async function unpublish(id, now) {
    const posts = await db.all();
    const post = posts.find((item) => item.id === id);
    if (!post) throw failure(404, "not_found");
    const removedSlug = post.live ? post.slug : null;
    if (removedSlug) requireGithub();
    post.live = null;
    post.updatedAt = new Date(now).toISOString();
    await db.put(post);
    const github = removedSlug
      ? await sync(`Unpublish “${post.title || "Untitled"}”`, posts, { removedSlug })
      : "skipped";
    return { post: toClient(post), github };
  }

  async function remove(id) {
    const posts = await db.all();
    const post = posts.find((item) => item.id === id);
    if (!post) throw failure(404, "not_found");
    const removedSlug = post.live ? post.slug : null;
    if (removedSlug) requireGithub();
    await db.remove(id);
    const next = posts.filter((item) => item.id !== id);
    const github = removedSlug ? await sync(`Remove “${post.title || "Untitled"}”`, next, { removedSlug }) : "skipped";
    return { ok: true, github };
  }

  return {
    list: () => lock(list),
    save: (id, body, now) => lock(() => save(id, body, now)),
    publish: (id, body, now) => lock(() => publish(id, body, now)),
    unpublish: (id, now) => lock(() => unpublish(id, now)),
    remove: (id, now) => lock(() => remove(id, now)),
  };
}
