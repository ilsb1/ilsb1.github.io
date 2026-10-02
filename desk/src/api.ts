import { sanitizeHtml } from "../../shared/sanitize.js";
import { htmlToPlain, plainField, wordCount } from "../../shared/text.js";

const SITE = import.meta.env.DEV ? "http://127.0.0.1:5173" : "https://ilsb1.github.io";
export const BLOG_URL = (import.meta.env.VITE_BLOG_URL || SITE).replace(/\/$/, "");

export type Session = { token: string; email: string; expiresAt: number };

export type LiveCopy = { title: string; subtitle: string; html: string; publishedAt: string; updatedAt: string };

export type Post = {
  id: string;
  slug: string | null;
  title: string;
  subtitle: string;
  html: string;
  createdAt: string;
  updatedAt: string;
  live: LiveCopy | null;
  isNew?: boolean;
};

export type PublishResult = "ok" | "failed" | "skipped";

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

const SESSION_KEY = "ils.writing.session.v1";

export function loadSession(): Session | null {
  try {
    const data = JSON.parse(localStorage.getItem(SESSION_KEY) || "null") as Partial<Session> | null;
    if (!data?.token || !data.email || typeof data.expiresAt !== "number") return null;
    if (data.expiresAt <= Date.now()) {
      localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { token: data.token, email: data.email, expiresAt: data.expiresAt };
  } catch {
    return null;
  }
}

export function saveSession(session: Session) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function blogLink(slug: string | null) {
  return slug ? `${BLOG_URL}/blog/${slug}` : `${BLOG_URL}/blog`;
}

export function blankPost(): Post {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    slug: null,
    title: "",
    subtitle: "",
    html: "",
    createdAt: now,
    updatedAt: now,
    live: null,
    isNew: true,
  };
}

export function isBlank(post: Post) {
  return !post.title.trim() && !post.subtitle.trim() && htmlToPlain(post.html).length === 0;
}

export function canPublish(post: Post) {
  return plainField(post.title, 180).length > 0 && wordCount(post.html) > 0;
}

export function hasUnpublishedEdits(post: Post) {
  if (!post.live) return false;
  if (plainField(post.title, 180) !== post.live.title) return true;
  if (plainField(post.subtitle, 240) !== post.live.subtitle) return true;
  return sanitizeHtml(post.html) !== sanitizeHtml(post.live.html);
}

function asPost(value: unknown): Post {
  const post = value as Partial<Post> | null;
  if (!post || typeof post.id !== "string" || typeof post.title !== "string" || typeof post.html !== "string") {
    throw new ApiError(500, "request_failed");
  }
  return {
    id: post.id,
    slug: typeof post.slug === "string" ? post.slug : null,
    title: post.title,
    subtitle: post.subtitle || "",
    html: post.html,
    createdAt: post.createdAt || "",
    updatedAt: post.updatedAt || "",
    live: post.live && typeof post.live.html === "string" ? { ...post.live, subtitle: post.live.subtitle || "" } : null,
  };
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
  let data: Record<string, unknown> = {};
  try {
    data = (await response.json()) as Record<string, unknown>;
  } catch {
    throw new ApiError(response.ok ? 500 : response.status, "request_failed");
  }
  if (!response.ok) {
    throw new ApiError(response.status, typeof data.error === "string" ? data.error : "request_failed");
  }
  return data;
}

export async function requestCode(email: string) {
  const data = await request("/api/auth/request", { method: "POST", body: { email } });
  return { previewCode: typeof data.previewCode === "string" ? data.previewCode : "" };
}

export async function verifyCode(email: string, code: string): Promise<Session> {
  const data = await request("/api/auth/verify", { method: "POST", body: { email, code } });
  if (typeof data.token !== "string" || typeof data.email !== "string" || typeof data.expiresAt !== "number") {
    throw new ApiError(500, "request_failed");
  }
  return { token: data.token, email: data.email, expiresAt: data.expiresAt };
}

export async function listPosts(token: string) {
  const data = await request("/api/posts", { token });
  return Array.isArray(data.posts) ? data.posts.map(asPost) : [];
}

function content(post: Post) {
  return { title: post.title, subtitle: post.subtitle, html: post.html };
}

export async function savePost(token: string, post: Post) {
  const data = await request(`/api/posts/${post.id}`, { method: "PUT", token, body: content(post) });
  return asPost(data.post);
}

function publishResult(value: unknown): PublishResult {
  return value === "ok" || value === "failed" ? value : "skipped";
}

export async function publishPost(token: string, post: Post) {
  const data = await request(`/api/posts/${post.id}/publish`, { method: "POST", token, body: content(post) });
  return { post: asPost(data.post), result: publishResult(data.github) };
}

export async function unpublishPost(token: string, id: string) {
  const data = await request(`/api/posts/${id}/unpublish`, { method: "POST", token, body: {} });
  return { post: asPost(data.post), result: publishResult(data.github) };
}

export async function deletePost(token: string, id: string) {
  await request(`/api/posts/${id}`, { method: "DELETE", token, body: {} });
}

export function isSignedOut(error: unknown) {
  return error instanceof ApiError && error.status === 401 && error.code === "unauthorized";
}

export function errorMessage(error: unknown) {
  const code = error instanceof ApiError ? error.code : "request_failed";
  switch (code) {
    case "invalid_email":
      return "That doesn't look like an email address. Please check it.";
    case "invalid_code":
      return "Please type all 6 digits from the email.";
    case "code_mismatch":
      return "That code isn't right. Please check the email and try again.";
    case "code_expired":
      return "That code has expired. Please ask for a new one.";
    case "too_many_attempts":
      return "Too many wrong tries. Please ask for a new code.";
    case "rate_limited":
      return "Too many tries for now. Please wait a few minutes.";
    case "mail_failed":
      return "The email couldn't be sent. Please wait a moment and try again.";
    case "mail_not_configured":
    case "not_configured":
    case "publish_not_configured":
      return "The writing desk isn't fully set up yet. Please try again later.";
    case "title_required":
      return "Please give the post a title first.";
    case "body_required":
      return "Please write something in the post first.";
    case "offline":
      return "Can't reach the internet right now. Please check your connection.";
    default:
      return "Something went wrong. Please try again.";
  }
}
