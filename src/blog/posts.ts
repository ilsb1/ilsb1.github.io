import { isSlug, wordCount } from "../../shared/text.js";

export type PublicListing = {
  slug: string;
  title: string;
  subtitle: string;
  excerpt: string;
  words: number;
  publishedAt: string;
  updatedAt: string;
};

export type PublicArticle = {
  slug: string;
  title: string;
  subtitle: string;
  html: string;
  words: number;
  publishedAt: string;
  updatedAt: string;
};

function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asListing(value: unknown): PublicListing | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Partial<PublicListing>;
  if (typeof row.slug !== "string" || !isSlug(row.slug) || typeof row.title !== "string") return null;
  return {
    slug: row.slug,
    title: row.title,
    subtitle: text(row.subtitle),
    excerpt: text(row.excerpt),
    words: numberOr(row.words, 0),
    publishedAt: text(row.publishedAt),
    updatedAt: text(row.updatedAt),
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
  try {
    const data = (await fetchJson("/blogs/index.json")) as { posts?: unknown } | null;
    if (!data || !Array.isArray(data.posts)) return [];
    return data.posts
      .map(asListing)
      .filter((post): post is PublicListing => !!post)
      .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
  } catch {
    return [];
  }
}

export async function loadPublicArticle(slug: string): Promise<PublicArticle | null> {
  if (!isSlug(slug)) return null;
  try {
    const data = (await fetchJson(`/blogs/${slug}.json`)) as Partial<PublicArticle> | null;
    if (!data || typeof data.title !== "string" || typeof data.html !== "string") return null;
    return {
      slug,
      title: data.title,
      subtitle: text(data.subtitle),
      html: data.html,
      words: numberOr(data.words, wordCount(data.html)),
      publishedAt: text(data.publishedAt),
      updatedAt: text(data.updatedAt),
    };
  } catch {
    return null;
  }
}
