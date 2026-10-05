import { normalizePage } from "../../shared/content.js";
import type { Block } from "./types";

/**
 * Preview mode: the writing desk shows this site in a frame and sends the
 * page's unpublished content, which is cleaned exactly like a published page
 * file and drawn by the same components.
 */

export type PreviewPage = { id: string; seq: number; fields: Record<string, unknown>; blocks: Block[] };

type DeskMessage = {
  source: "ils-desk";
  type: "page";
  id: string;
  seq: number;
  content: unknown;
  mediaBase?: unknown;
  scroll?: "top" | "blocks" | null;
};

const DESK_ORIGINS = ["https://ilsb1.vercel.app"];
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
const RAW_BASE = /^https:\/\/raw\.githubusercontent\.com\/[\w.-]+\/[\w.-]+\/[\w.-]+\/public$/;

export const isPreview =
  typeof window !== "undefined" && window.parent !== window && new URLSearchParams(window.location.search).has("preview");

let current: PreviewPage | null = null;
let failures = 0;
const listeners = new Set<() => void>();

export function subscribePreview(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const previewPage = () => current;

let deskOrigin = "";

function tellDesk(message: Record<string, unknown>) {
  if (deskOrigin) window.parent.postMessage({ source: "ils-site", ...message }, deskOrigin);
}

/** Called when the edited version of a page fails to draw and the original is shown instead. */
export function reportPreviewFallback() {
  failures += 1;
  if (current) tellDesk({ type: "fallback", id: current.id, seq: current.seq });
}

function trusted(origin: string) {
  return DESK_ORIGINS.includes(origin) || (import.meta.env.DEV && LOCAL_ORIGIN.test(origin));
}

/** Uploads are in the repository before the website is rebuilt, so the preview reads them from there. */
function rebase(page: { fields: Record<string, unknown>; blocks: Block[] }, base: string) {
  if (!base) return page;
  const fix = (src: string) => (src.startsWith("/media/") ? `${base}${src}` : src);
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(page.fields)) {
    fields[key] =
      value && typeof value === "object" && !Array.isArray(value) && typeof (value as { src?: unknown }).src === "string"
        ? { ...value, src: fix((value as { src: string }).src) }
        : value;
  }
  const blocks = page.blocks.map((block): Block => {
    if (block.type === "photos") return { ...block, items: block.items.map((item) => ({ ...item, src: fix(item.src) })) };
    if (block.type === "video" && block.source === "file") return { ...block, src: fix(block.src) };
    if (block.type === "audio" || block.type === "file") return { ...block, src: fix(block.src) };
    return block;
  });
  return { fields, blocks };
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Hidden frames may not paint at all, so this never waits longer than a moment. */
function afterPaint() {
  const painted = new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  return Promise.race([painted, wait(150)]);
}

async function mounted() {
  for (let tries = 0; tries < 40 && !document.querySelector(".main-content"); tries += 1) await wait(50);
}

function fontsReady() {
  return Promise.race([document.fonts?.ready ?? Promise.resolve(), wait(1500)]);
}

function scrollPage(target: "top" | "blocks") {
  const blocks = target === "blocks" ? document.querySelector<HTMLElement>(".main-content .page-blocks") : null;
  if (!blocks) {
    window.scrollTo({ top: 0, behavior: "instant" });
    return;
  }
  const header = document.querySelector<HTMLElement>(".header")?.offsetHeight ?? 0;
  window.scrollTo({ top: Math.max(0, blocks.getBoundingClientRect().top + window.scrollY - header - 24), behavior: "instant" });
}

function onMessage(event: MessageEvent) {
  if (event.source !== window.parent || !trusted(event.origin)) return;
  const data = event.data as DeskMessage | null;
  if (!data || data.source !== "ils-desk" || data.type !== "page" || typeof data.id !== "string" || typeof data.seq !== "number") return;
  const clean = normalizePage(data.id, data.content) as { fields: Record<string, unknown>; blocks: Block[] } | null;
  if (!clean) return;
  deskOrigin = event.origin;
  const base = typeof data.mediaBase === "string" && RAW_BASE.test(data.mediaBase) ? data.mediaBase : "";
  current = { id: data.id, seq: data.seq, ...rebase(clean, base) };
  const seen = failures;
  listeners.forEach((listener) => listener());
  const first = !document.documentElement.dataset.previewShown;
  void (async () => {
    await mounted();
    await afterPaint();
    if (first) await fontsReady();
    if (data.scroll) scrollPage(data.scroll);
    document.documentElement.dataset.previewShown = "1";
    tellDesk({ type: "rendered", id: data.id, seq: data.seq, fallback: failures > seen });
  })();
}

/** Links to other pages would leave the preview, so they are kept on this page; outside links open in a new tab. */
function onClick(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0) return;
  const link = (event.target as Element | null)?.closest?.("a[href]");
  if (!(link instanceof HTMLAnchorElement)) return;
  const url = new URL(link.href, window.location.href);
  if (url.origin === window.location.origin) {
    if (url.pathname.startsWith("/media/") || link.hasAttribute("download")) return;
    if (url.pathname === window.location.pathname && url.hash) return;
    event.preventDefault();
    event.stopPropagation();
    tellDesk({ type: "link", href: url.pathname });
    return;
  }
  if (link.target !== "_blank") {
    event.preventDefault();
    event.stopPropagation();
    window.open(url.href, "_blank", "noopener,noreferrer");
  }
}

export function startPreview() {
  if (!isPreview) return;
  document.documentElement.classList.add("is-preview");
  const style = document.createElement("style");
  style.textContent =
    "@media (max-width: 480px) { html.is-preview { scrollbar-width: none; } html.is-preview::-webkit-scrollbar { display: none; } }";
  document.head.append(style);
  window.addEventListener("message", onMessage);
  document.addEventListener("click", onClick, true);
  window.parent.postMessage({ source: "ils-site", type: "ready" }, "*");
}
