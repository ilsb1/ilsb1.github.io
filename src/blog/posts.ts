import { sanitizeHtml } from "../../shared/sanitize.js";
import { excerptFromHtml, htmlToPlain, isSlug, plainField, wordCount } from "../../shared/text.js";
import type { Session } from "./session";

export type LiveCopy = {
  title: string;
  subtitle: string;
  html: string;
  publishedAt: string;
  updatedAt: string;
};

export type DeskPost = {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string;
  html: string;
  createdAt: string;
  updatedAt: string;
  status: "draft" | "published";
  publishedAt: string | null;
  live: LiveCopy | null;
  syncedAt?: string | null;
};

export type PublicListing = {
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  words: number;
  publishedAt: string;
  updatedAt: string;
  previewOnly: boolean;
};

export type PublicArticle = {
  slug: string;
  title: string;
  subtitle: string;
  html: string;
  words: number;
  publishedAt: string;
  updatedAt: string;
  previewOnly: boolean;
};

export type GithubResult = "ok" | "failed" | "skipped";

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string) {
    super(code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
  }
}

const LOCAL_KEY = "ils.writing.posts.v1";

export function blankPost(): DeskPost {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    slug: null,
    title: "",
    subtitle: "",
    html: "",
    createdAt: now,
    updatedAt: now,
    status: "draft",
    publishedAt: null,
    live: null,
    syncedAt: null,
  };
}

export function isBlank(post: DeskPost) {
  return !post.title.trim() && !post.subtitle.trim() && htmlToPlain(post.html).length === 0;
}

export function isDirty(post: DeskPost) {
  return post.syncedAt !== post.updatedAt;
}

export function hasUnpublishedEdits(post: DeskPost) {
  if (!post.live) return false;
  if (plainField(post.title, 180) !== post.live.title) return true;
  if (plainField(post.subtitle, 240) !== post.live.subtitle) return true;
  return sanitizeHtml(post.html) !== sanitizeHtml(post.live.html);
}

export function readyToPublish(post: DeskPost) {
  return plainField(post.title, 180).length > 0 && wordCount(post.html) > 0;
}

function isLive(value: unknown): value is LiveCopy {
  if (!value || typeof value !== "object") return false;
  const live = value as LiveCopy;
  return typeof live.title === "string" && typeof live.html === "string";
}

export function isDeskPost(value: unknown): value is DeskPost {
  if (!value || typeof value !== "object") return false;
  const post = value as DeskPost;
  return typeof post.id === "string" && typeof post.title === "string" && typeof post.html === "string";
}

function normalize(post: DeskPost): DeskPost {
  const live = isLive(post.live) ? { ...post.live, subtitle: post.live.subtitle || "" } : null;
  return {
    ...post,
    slug: typeof post.slug === "string" ? post.slug : null,
    subtitle: post.subtitle || "",
    status: live ? "published" : "draft",
    publishedAt: live?.publishedAt ?? null,
    live,
    syncedAt: typeof post.syncedAt === "string" ? post.syncedAt : null,
  };
}

export function readLocalPosts(): DeskPost[] {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return [];
    const data = JSON.parse(raw) as { posts?: unknown };
    if (!Array.isArray(data.posts)) return [];
    return data.posts.filter(isDeskPost).map(normalize);
  } catch {
    return [];
  }
}

export function writeLocalPosts(posts: DeskPost[]) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify({ posts }));
  } catch {
    /* storage full or blocked; the server copy still exists */
  }
}

export function mergePosts(remote: DeskPost[], local: DeskPost[]) {
  const merged = new Map<string, DeskPost>();
  for (const post of remote) merged.set(post.id, normalize({ ...post, syncedAt: post.updatedAt }));
  for (const mine of local) {
    const theirs = merged.get(mine.id);
    if (!theirs) {
      if (!mine.syncedAt && !isBlank(mine)) merged.set(mine.id, mine);
      continue;
    }
    if (isDirty(mine) && Date.parse(mine.updatedAt) > Date.parse(theirs.updatedAt)) {
      merged.set(mine.id, {
        ...theirs,
        title: mine.title,
        subtitle: mine.subtitle,
        html: mine.html,
        updatedAt: mine.updatedAt,
        syncedAt: theirs.updatedAt,
      });
    }
  }
  return [...merged.values()];
}

async function request(path: string, options: { method?: string; token?: string; body?: unknown } = {}) {
  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: {
        Accept: "application/json",
        ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
        ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      },
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "offline");
  }
  const type = response.headers.get("content-type") || "";
  if (!type.includes("json")) throw new ApiError(0, "offline");
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    data = {};
  }
  if (!response.ok) {
    throw new ApiError(response.status, typeof data.error === "string" ? data.error : "request_failed");
  }
  return data;
}

export async function requestCode(email: string) {
  const data = await request("/api/auth/request", { method: "POST", body: { email } });
  return {
    delivery: data.delivery === "preview" ? "preview" : "email",
    previewCode: typeof data.previewCode === "string" ? data.previewCode : "",
    alreadySent: data.alreadySent === true,
  };
}

export async function verifyCode(email: string, code: string): Promise<Session> {
  const data = await request("/api/auth/verify", { method: "POST", body: { email, code } });
  if (typeof data.token !== "string" || typeof data.email !== "string" || typeof data.expiresAt !== "number") {
    throw new ApiError(500, "request_failed");
  }
  return { token: data.token, email: data.email, expiresAt: data.expiresAt };
}

export async function fetchPosts(token: string) {
  const data = await request("/api/posts", { token });
  return Array.isArray(data.posts) ? data.posts.filter(isDeskPost).map(normalize) : [];
}

function githubResult(value: unknown): GithubResult {
  if (value === "ok" || value === "failed" || value === "skipped") return value;
  return "skipped";
}

function payload(post: DeskPost) {
  return { title: post.title, subtitle: post.subtitle, html: post.html };
}

export async function savePost(token: string, post: DeskPost) {
  const data = await request(`/api/posts/${post.id}`, { method: "PUT", token, body: payload(post) });
  if (!isDeskPost(data.post)) throw new ApiError(500, "request_failed");
  return normalize(data.post);
}

export function savePostOnExit(token: string, post: DeskPost) {
  try {
    void fetch(`/api/posts/${post.id}`, {
      method: "PUT",
      keepalive: true,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(payload(post)),
    });
  } catch {
    /* the local copy is kept and synced next time */
  }
}

export async function publishPost(token: string, post: DeskPost) {
  const data = await request(`/api/posts/${post.id}/publish`, {
    method: "POST",
    token,
    body: payload(post),
  });
  if (!isDeskPost(data.post)) throw new ApiError(500, "request_failed");
  return { post: normalize(data.post), github: githubResult(data.github) };
}

export async function unpublishPost(token: string, id: string) {
  const data = await request(`/api/posts/${id}/unpublish`, { method: "POST", token, body: {} });
  if (!isDeskPost(data.post)) throw new ApiError(500, "request_failed");
  return { post: normalize(data.post), github: githubResult(data.github) };
}

export async function deletePost(token: string, id: string) {
  await request(`/api/posts/${id}`, { method: "DELETE", token, body: {} });
}

export function deskError(code: string) {
  switch (code) {
    case "invalid_email":
      return "That doesn't look like an email address. Check it and try again.";
    case "invalid_code":
      return "Enter all 6 digits from the email.";
    case "code_mismatch":
      return "That code didn't match. Check the email and try again.";
    case "code_expired":
      return "That code has expired. Send yourself a new one.";
    case "too_many_attempts":
      return "Too many tries with that code. Send yourself a new one.";
    case "rate_limited":
      return "Too many tries for now. Please wait a few minutes.";
    case "mail_not_configured":
      return "Email sign-in isn't set up on this website yet. Open the desk on the computer where the site is being prepared.";
    case "mail_failed":
      return "The email couldn't be sent. Wait a moment and try again.";
    case "title_required":
      return "Give the piece a title before publishing.";
    case "body_required":
      return "Write something in the page before publishing.";
    case "unauthorized":
      return "Please sign in again.";
    case "offline":
      return "The desk can't reach its server right now. Your writing is kept safely on this computer.";
    default:
      return "Something went wrong. Please try again.";
  }
}

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asListing(value: unknown): PublicListing | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PublicListing>;
  if (typeof row.slug !== "string" || !isSlug(row.slug) || typeof row.title !== "string") return null;
  return {
    slug: row.slug,
    title: row.title,
    subtitle: typeof row.subtitle === "string" ? row.subtitle : "",
    excerpt: typeof row.excerpt === "string" ? row.excerpt : "",
    words: numberOr(row.words, 0),
    publishedAt: typeof row.publishedAt === "string" ? row.publishedAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
    previewOnly: false,
  };
}

async function fetchJson(path: string): Promise<unknown> {
  const response = await fetch(path, { cache: "no-store" });
  if (!response.ok) return null;
  const type = response.headers.get("content-type") || "";
  if (!type.includes("json")) return null;
  return response.json();
}

export async function loadPublicList(): Promise<PublicListing[]> {
  let remote: PublicListing[] = [];
  try {
    const data = (await fetchJson("/blogs/index.json")) as { posts?: unknown } | null;
    if (data && Array.isArray(data.posts)) {
      remote = data.posts.map(asListing).filter((post): post is PublicListing => !!post);
    }
  } catch {
    remote = [];
  }

  const local = readLocalPosts()
    .filter((post) => post.live && isSlug(post.slug))
    .map((post) => ({
      slug: post.slug as string,
      title: post.live?.title || post.title,
      subtitle: post.live?.subtitle || "",
      excerpt: excerptFromHtml(post.live?.html || "", 220),
      words: wordCount(post.live?.html || ""),
      publishedAt: post.live?.publishedAt || post.updatedAt,
      updatedAt: post.live?.updatedAt || post.updatedAt,
      previewOnly: true,
    }));

  const bySlug = new Map(remote.map((post) => [post.slug, post]));
  for (const post of local) {
    const existing = bySlug.get(post.slug);
    if (!existing || Date.parse(post.updatedAt) > Date.parse(existing.updatedAt) + 1000) {
      bySlug.set(post.slug, post);
    }
  }
  return [...bySlug.values()].sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

export async function loadPublicArticle(slug: string): Promise<PublicArticle | null> {
  if (!isSlug(slug)) return null;
  let remote: PublicArticle | null = null;
  try {
    const data = (await fetchJson(`/blogs/${slug}.json`)) as Partial<PublicArticle> | null;
    if (data && typeof data.title === "string" && typeof data.html === "string") {
      remote = {
        slug,
        title: data.title,
        subtitle: typeof data.subtitle === "string" ? data.subtitle : "",
        html: data.html,
        words: numberOr(data.words, wordCount(data.html)),
        publishedAt: typeof data.publishedAt === "string" ? data.publishedAt : "",
        updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : "",
        previewOnly: false,
      };
    }
  } catch {
    remote = null;
  }

  const local = readLocalPosts().find((post) => post.slug === slug && post.live);
  if (local?.live && (!remote || Date.parse(local.live.updatedAt) > Date.parse(remote.updatedAt) + 1000)) {
    return {
      slug,
      title: local.live.title,
      subtitle: local.live.subtitle,
      html: local.live.html,
      words: wordCount(local.live.html),
      publishedAt: local.live.publishedAt,
      updatedAt: local.live.updatedAt,
      previewOnly: true,
    };
  }
  return remote;
}
