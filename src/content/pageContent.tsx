import { createContext, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { parsePageFile } from "../../shared/content.js";
import { pageDefaults, type FieldValue, type ImageValue } from "./defaults";
import ErrorBoundary from "./ErrorBoundary";
import { previewPage, reportPreviewFallback, subscribePreview } from "./preview";
import type { Block } from "./types";

type Published = { fields: Record<string, unknown>; blocks: Block[] };

const files = import.meta.glob("/content/pages/*.json", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

const published = new Map<string, Published>();
for (const [file, raw] of Object.entries(files)) {
  const id = file.slice(file.lastIndexOf("/") + 1).replace(/\.json$/, "");
  const page = parsePageFile(id, raw) as Published | null;
  if (page) published.set(id, page);
}

export type PageView = {
  text: (key: string) => string;
  html: (key: string) => string;
  lines: (key: string) => string[];
  image: (key: string) => ImageValue | null;
  blocks: Block[];
};

function isImage(value: unknown): value is ImageValue {
  return Boolean(value && typeof value === "object" && typeof (value as ImageValue).src === "string");
}

function makeView(pageId: string, edits: Published | undefined): PageView {
  const defaults = pageDefaults(pageId);
  const pick = (key: string): unknown => {
    const value = edits?.fields[key];
    return value === undefined ? defaults[key] : value;
  };
  const asString = (key: string) => {
    const value = pick(key);
    if (typeof value === "string") return value;
    const fallback: FieldValue | undefined = defaults[key];
    return typeof fallback === "string" ? fallback : "";
  };
  return {
    text: asString,
    html: asString,
    lines(key) {
      const value = pick(key);
      const fallback = Array.isArray(defaults[key]) ? (defaults[key] as string[]) : [];
      if (!Array.isArray(value)) return fallback;
      return fallback.map((line, index) => (typeof value[index] === "string" && value[index].trim() ? value[index] : line));
    },
    image(key) {
      const value = pick(key);
      if (isImage(value)) return value;
      const fallback = defaults[key];
      return isImage(fallback) ? fallback : null;
    },
    blocks: edits?.blocks ?? [],
  };
}

const views = new Map<string, PageView>();
const originals = new Map<string, PageView>();

const OriginalsOnly = createContext(false);

const noPreview = () => null;

export function usePage(pageId: string): PageView {
  const originalsOnly = useContext(OriginalsOnly);
  const preview = useSyncExternalStore(subscribePreview, previewPage, noPreview);
  const previewed = !originalsOnly && preview?.id === pageId ? preview : null;
  const previewView = useMemo(() => (previewed ? makeView(pageId, previewed) : null), [pageId, previewed]);
  if (previewView) return previewView;
  const cache = originalsOnly ? originals : views;
  let view = cache.get(pageId);
  if (!view) {
    view = makeView(pageId, originalsOnly ? undefined : published.get(pageId));
    cache.set(pageId, view);
  }
  return view;
}

/**
 * If a page breaks while showing edited content, it is drawn again with the
 * original built-in content; if even that fails, a short notice is shown.
 */
export function PageBoundary({ children }: { children: ReactNode }) {
  const preview = useSyncExternalStore(subscribePreview, previewPage, noPreview);
  return (
    <ErrorBoundary
      fallback={
        <div className="error-state">
          <h2>This page could not be shown</h2>
          <p>Please try again in a moment.</p>
        </div>
      }
    >
      <ErrorBoundary
        resetKey={preview?.seq}
        onError={preview ? reportPreviewFallback : undefined}
        fallback={<OriginalsOnly.Provider value={true}>{children}</OriginalsOnly.Provider>}
      >
        {children}
      </ErrorBoundary>
    </ErrorBoundary>
  );
}
