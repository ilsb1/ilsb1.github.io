import { sanitizeHtml } from "./sanitize.js";
import { plainField, slugify, wordCount } from "./text.js";

export const TITLE_MAX = 180;
export const SUBTITLE_MAX = 240;

/** What readers see of a post, cleaned the same way for publishing and for the preview. */
export function cleanPost(body) {
  return {
    title: plainField(body?.title ?? "", TITLE_MAX),
    subtitle: plainField(body?.subtitle ?? "", SUBTITLE_MAX),
    html: sanitizeHtml(body?.html ?? ""),
  };
}

/** The contents of public/blogs/<slug>.json. */
export function articleFile(slug, live) {
  return {
    slug,
    title: live.title,
    subtitle: live.subtitle,
    html: live.html,
    words: wordCount(live.html),
    publishedAt: live.publishedAt,
    updatedAt: live.updatedAt,
  };
}

const text = (value) => (typeof value === "string" ? value : "");

/** How the blog reads a post file. */
export function readArticle(slug, data) {
  if (!data || typeof data !== "object" || typeof data.title !== "string" || typeof data.html !== "string") return null;
  return {
    slug,
    title: data.title,
    subtitle: text(data.subtitle),
    html: data.html,
    words: typeof data.words === "number" && Number.isFinite(data.words) ? data.words : wordCount(data.html),
    publishedAt: text(data.publishedAt),
    updatedAt: text(data.updatedAt),
  };
}

/** A post that isn't published yet, as the blog will show it once it is. */
export function previewArticle(slug, body, publishedAt, now) {
  const at = typeof publishedAt === "string" && !Number.isNaN(Date.parse(publishedAt)) ? publishedAt : now;
  return readArticle(slug, articleFile(slug, { ...cleanPost(body), publishedAt: at, updatedAt: now }));
}

/** The address a post gets the first time it's published. */
export function uniqueSlug(title, posts, selfId) {
  const base = slugify(title);
  const taken = new Set(posts.filter((post) => post.id !== selfId && post.slug).map((post) => post.slug));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base.slice(0, 56)}-${n}`)) n += 1;
  return `${base.slice(0, 56)}-${n}`;
}
