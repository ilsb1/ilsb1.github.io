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
import { commitToGithub } from "./github.js";

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

async function writePublic(root, posts, { changedSlug = null, removedSlug = null } = {}) {
  const dir = blogsDir(root);
  await mkdir(dir, { recursive: true });
  const published = posts
    .filter((post) => post.live && isSlug(post.slug))
    .sort((a, b) => Date.parse(b.live.publishedAt) - Date.parse(a.live.publishedAt));

  const index = { posts: published.map(indexEntry) };
  await writeJson(path.join(dir, "index.json"), index);

  const slugs = new Set(published.map((post) => post.slug));
  for (const post of published) {
    await writeJson(path.join(dir, `${post.slug}.json`), articleJson(post));
  }
  if (removedSlug && !slugs.has(removedSlug)) {
    await rm(path.join(dir, `${removedSlug}.json`), { force: true });
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

function cleanInput(body) {
  if (!body || typeof body !== "object") {
    const error = new Error("bad_body");
    error.status = 400;
    error.code = "bad_body";
    throw error;
  }
  const title = plainField(body.title, TITLE_MAX);
  const subtitle = plainField(body.subtitle, SUBTITLE_MAX);
  const html = sanitizeHtml(body.html);
  if (String(body.html ?? "").length > 200_000) {
    const error = new Error("too_large");
    error.status = 413;
    error.code = "too_large";
    throw error;
  }
  return { title, subtitle, html };
}

function requireText(cleaned) {
  if (!cleaned.title) {
    const error = new Error("title_required");
    error.status = 400;
    error.code = "title_required";
    throw error;
  }
  if (!htmlToPlain(cleaned.html)) {
    const error = new Error("body_required");
    error.status = 400;
    error.code = "body_required";
    throw error;
  }
}

export function createStore({ root, env, fetchImpl }) {
  let chain = Promise.resolve();
  const lock = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  };

  async function list() {
    const posts = await readPosts(root);
    return posts.map(toClient);
  }

  async function save(id, body, now) {
    if (!isPostId(id)) {
      const error = new Error("bad_id");
      error.status = 400;
      error.code = "bad_id";
      throw error;
    }
    const cleaned = cleanInput(body);
    const posts = await readPosts(root);
    const index = posts.findIndex((post) => post.id === id);
    const timestamp = new Date(now).toISOString();
    if (index === -1) {
      if (posts.length >= MAX_POSTS) {
        const error = new Error("too_many");
        error.status = 400;
        error.code = "too_many";
        throw error;
      }
      posts.push({
        id,
        slug: null,
        title: cleaned.title,
        subtitle: cleaned.subtitle,
        html: cleaned.html,
        createdAt: timestamp,
        updatedAt: timestamp,
        live: null,
      });
    } else {
      posts[index] = {
        ...posts[index],
        title: cleaned.title,
        subtitle: cleaned.subtitle,
        html: cleaned.html,
        updatedAt: timestamp,
      };
    }
    await writePosts(root, posts);
    return toClient(posts[index === -1 ? posts.length - 1 : index]);
  }

  async function publish(id, body, now) {
    const cleaned = cleanInput(body);
    requireText(cleaned);
    await save(id, cleaned, now);
    const posts = await readPosts(root);
    const post = posts.find((item) => item.id === id);
    if (!post) {
      const error = new Error("not_found");
      error.status = 404;
      error.code = "not_found";
      throw error;
    }
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
    await writePosts(root, posts);
    const { files, deletions } = await writePublic(root, posts, { changedSlug: post.slug });
    let github = "skipped";
    try {
      github = await commitToGithub({
        env,
        fetchImpl,
        message: `Publish “${cleaned.title}”`,
        files,
        deletions,
      });
    } catch (error) {
      console.error("GitHub publish failed", error.githubStatus || error.code || "error");
      github = "failed";
    }
    return { post: toClient(post), github };
  }

  async function unpublish(id, now) {
    const posts = await readPosts(root);
    const post = posts.find((item) => item.id === id);
    if (!post) {
      const error = new Error("not_found");
      error.status = 404;
      error.code = "not_found";
      throw error;
    }
    const removedSlug = post.slug;
    post.live = null;
    post.updatedAt = new Date(now).toISOString();
    await writePosts(root, posts);
    const { files, deletions } = await writePublic(root, posts, { removedSlug });
    let github = "skipped";
    if (removedSlug) {
      try {
        github = await commitToGithub({
          env,
          fetchImpl,
          message: `Unpublish “${post.title || "Untitled"}”`,
          files,
          deletions,
        });
      } catch (error) {
        console.error("GitHub unpublish failed", error.githubStatus || error.code || "error");
        github = "failed";
      }
    }
    return { post: toClient(post), github };
  }

  async function remove(id) {
    const posts = await readPosts(root);
    const post = posts.find((item) => item.id === id);
    if (!post) {
      const error = new Error("not_found");
      error.status = 404;
      error.code = "not_found";
      throw error;
    }
    const removedSlug = post.live ? post.slug : null;
    const next = posts.filter((item) => item.id !== id);
    await writePosts(root, next);
    const { files, deletions } = await writePublic(root, next, { removedSlug });
    let github = "skipped";
    if (removedSlug) {
      try {
        github = await commitToGithub({
          env,
          fetchImpl,
          message: `Remove “${post.title || "Untitled"}”`,
          files,
          deletions,
        });
      } catch (error) {
        console.error("GitHub delete failed", error.githubStatus || error.code || "error");
        github = "failed";
      }
    }
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
