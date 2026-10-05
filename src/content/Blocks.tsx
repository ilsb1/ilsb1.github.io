import { useEffect, useRef, useState, type CSSProperties, type TouchEvent } from "react";
import { createPortal } from "react-dom";
import { fileKind, formatBytes, videoEmbed } from "../../shared/content.js";
import {
  IconArrowRight,
  IconAudio,
  IconChevronLeft,
  IconChevronRight,
  IconClose,
  IconDownload,
  IconExternal,
  IconFile,
  IconPlay,
} from "../components/icons";
import ErrorBoundary from "./ErrorBoundary";
import { RichHtml } from "./RichText";
import type { Block, PhotoItem, PhotoSize } from "./types";
import "./content.css";

type Shared = { mediaBase: string; onInternalLink?: (href: string) => void };

/** Files kept with the site are stored as /media/…; the writing app shows them from GitHub until the site rebuilds. */
export function mediaUrl(src: string, mediaBase = "") {
  return src.startsWith("/media/") ? `${mediaBase}${src}` : src;
}

function isBlobUrl(src: string) {
  return /^https:\/\/[^/]+\.public\.blob\.vercel-storage\.com\//i.test(src);
}

function downloadUrl(src: string, mediaBase: string) {
  const url = mediaUrl(src, mediaBase);
  return isBlobUrl(url) ? `${url}${url.includes("?") ? "&" : "?"}download=1` : url;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

type Props = {
  blocks: Block[];
  mediaBase?: string;
  onInternalLink?: (href: string) => void;
  className?: string;
};

export default function PageBlocks({ blocks, mediaBase = "", onInternalLink, className = "" }: Props) {
  if (!Array.isArray(blocks) || !blocks.length) return null;
  return (
    <div className={`page-blocks ${className}`.trim()}>
      {blocks.map((block) => (
        <ErrorBoundary key={block.id} fallback={null}>
          <BlockView block={block} mediaBase={mediaBase} onInternalLink={onInternalLink} />
        </ErrorBoundary>
      ))}
    </div>
  );
}

export function BlockView({ block, mediaBase, onInternalLink }: { block: Block } & Shared) {
  switch (block.type) {
    case "text":
      return <RichHtml className="pb-text rich-text" html={block.html} onInternalLink={onInternalLink} />;
    case "photos":
      return <Photos items={block.items} size={block.size} mediaBase={mediaBase} />;
    case "video":
      return block.source === "file" ? (
        <VideoFile src={mediaUrl(block.src, mediaBase)} caption={block.caption} />
      ) : (
        <VideoLink url={block.url} caption={block.caption} />
      );
    case "audio":
      return (
        <div className="pb-audio">
          <p className="pb-audio__title">
            <IconAudio size={18} />
            <span>{block.title || "Listen"}</span>
          </p>
          <audio className="pb-audio__player" controls preload="metadata" src={mediaUrl(block.src, mediaBase)} />
        </div>
      );
    case "file":
      return <FileCard block={block} mediaBase={mediaBase} />;
    case "link":
      return <LinkCard url={block.url} title={block.title} note={block.note} />;
    default:
      return null;
  }
}

/** Picks a column count that leaves the last row as full as possible, so galleries stay balanced. */
function galleryColumns(count: number, size: PhotoSize) {
  const max = size === "small" ? 4 : size === "medium" ? 3 : 2;
  if (count <= max) return count;
  let best = max;
  let bestEmpty = Number.POSITIVE_INFINITY;
  for (let cols = max; cols >= 2; cols -= 1) {
    const empty = (cols - (count % cols)) % cols;
    if (empty < bestEmpty) {
      best = cols;
      bestEmpty = empty;
    }
  }
  return best;
}

function Photos({ items, size, mediaBase }: { items: PhotoItem[]; size: PhotoSize; mediaBase: string }) {
  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [open, setOpen] = useState<number | null>(null);
  const shown = items.filter((item) => !failed.has(item.src));
  if (!shown.length) return null;

  const markFailed = (src: string) =>
    setFailed((current) => {
      const next = new Set(current);
      next.add(src);
      return next;
    });

  const viewer =
    open !== null && shown[open] ? (
      <Lightbox items={shown} index={open} mediaBase={mediaBase} onIndex={setOpen} onClose={() => setOpen(null)} />
    ) : null;

  if (shown.length === 1) {
    const item = shown[0];
    return (
      <figure className={`pb-photo pb-photo--${size}`}>
        <button
          type="button"
          className="pb-photo__open"
          onClick={() => setOpen(0)}
          aria-label={item.caption ? `Enlarge photo: ${item.caption}` : "Enlarge photo"}
        >
          <img
            src={mediaUrl(item.src, mediaBase)}
            width={item.width || undefined}
            height={item.height || undefined}
            alt={item.caption}
            loading="lazy"
            decoding="async"
            onError={() => markFailed(item.src)}
          />
        </button>
        {item.caption ? <figcaption className="pb-caption">{item.caption}</figcaption> : null}
        {viewer}
      </figure>
    );
  }

  const cols = galleryColumns(shown.length, size);
  const style = {
    "--pb-cols": cols,
    "--pb-cols-phone": Math.min(cols, size === "large" ? 1 : 2),
  } as CSSProperties;
  return (
    <div className={`pb-gallery pb-gallery--${size}`} style={style}>
      {shown.map((item, index) => (
        <figure className="pb-gallery__item" key={`${item.src}-${index}`}>
          <button
            type="button"
            className="pb-gallery__open"
            onClick={() => setOpen(index)}
            aria-label={item.caption ? `Enlarge photo: ${item.caption}` : `Enlarge photo ${index + 1}`}
          >
            <img
              src={mediaUrl(item.src, mediaBase)}
              alt={item.caption}
              loading="lazy"
              decoding="async"
              onError={() => markFailed(item.src)}
            />
          </button>
          {item.caption ? <figcaption className="pb-caption">{item.caption}</figcaption> : null}
        </figure>
      ))}
      {viewer}
    </div>
  );
}

function Lightbox({
  items,
  index,
  mediaBase,
  onIndex,
  onClose,
}: {
  items: PhotoItem[];
  index: number;
  mediaBase: string;
  onIndex: (index: number) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const touchX = useRef<number | null>(null);
  const count = items.length;
  const item = items[index];
  const go = (step: number) => onIndex((index + step + count) % count);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus?.();
    };
  }, []);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      else if (event.key === "ArrowLeft" && count > 1) onIndex((index - 1 + count) % count);
      else if (event.key === "ArrowRight" && count > 1) onIndex((index + 1) % count);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, index, onClose, onIndex]);

  function onTouchStart(event: TouchEvent) {
    touchX.current = event.touches[0]?.clientX ?? null;
  }

  function onTouchEnd(event: TouchEvent) {
    const start = touchX.current;
    touchX.current = null;
    const end = event.changedTouches[0]?.clientX;
    if (start === null || end === undefined || count < 2) return;
    if (Math.abs(end - start) > 50) go(end < start ? 1 : -1);
  }

  return createPortal(
    <div
      className="pb-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={item.caption || "Photo"}
      onClick={onClose}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <figure className="pb-lightbox__figure" onClick={(event) => event.stopPropagation()}>
        <img src={mediaUrl(item.src, mediaBase)} alt={item.caption} />
        {item.caption || count > 1 ? (
          <figcaption>
            {item.caption}
            {count > 1 ? <span className="pb-lightbox__count">{`${index + 1} / ${count}`}</span> : null}
          </figcaption>
        ) : null}
      </figure>
      <button ref={closeRef} type="button" className="pb-lightbox__btn pb-lightbox__close" onClick={onClose} aria-label="Close">
        <IconClose size={22} />
      </button>
      {count > 1 ? (
        <>
          <button
            type="button"
            className="pb-lightbox__btn pb-lightbox__prev"
            onClick={(event) => {
              event.stopPropagation();
              go(-1);
            }}
            aria-label="Previous photo"
          >
            <IconChevronLeft size={26} />
          </button>
          <button
            type="button"
            className="pb-lightbox__btn pb-lightbox__next"
            onClick={(event) => {
              event.stopPropagation();
              go(1);
            }}
            aria-label="Next photo"
          >
            <IconChevronRight size={26} />
          </button>
        </>
      ) : null}
    </div>,
    document.body,
  );
}

function VideoLink({ url, caption }: { url: string; caption: string }) {
  const embed = videoEmbed(url);
  if (!embed) return <LinkCard url={url} title={caption || "Watch the video"} note="" icon="play" />;
  return (
    <figure className="pb-video">
      <div className="pb-video__frame">
        <iframe
          src={embed.embedUrl}
          title={caption || "Video"}
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
        />
      </div>
      {caption ? <figcaption className="pb-caption">{caption}</figcaption> : null}
    </figure>
  );
}

function VideoFile({ src, caption }: { src: string; caption: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return <LinkCard url={src} title={caption || "Open the video"} note="" icon="play" />;
  return (
    <figure className="pb-video">
      <video className="pb-video__file" controls preload="metadata" playsInline src={src} onError={() => setFailed(true)} />
      {caption ? <figcaption className="pb-caption">{caption}</figcaption> : null}
    </figure>
  );
}

const VIEWABLE = new Set(["pdf", "image", "audio", "video"]);

function FileCard({ block, mediaBase }: { block: Extract<Block, { type: "file" }> } & Pick<Shared, "mediaBase">) {
  const kind = fileKind(block.ext);
  const ext = (block.ext || "file").toUpperCase();
  const meta = [ext, formatBytes(block.size)].filter(Boolean).join(" · ");
  const href = mediaUrl(block.src, mediaBase);
  return (
    <div className={`pb-file pb-file--${kind}`}>
      <span className="pb-file__icon" aria-hidden="true">
        <IconFile size={26} />
        <span className="pb-file__ext">{ext.slice(0, 4)}</span>
      </span>
      <div className="pb-file__body">
        <p className="pb-file__title">{block.title || block.name || "Document"}</p>
        <p className="pb-file__meta">{meta}</p>
      </div>
      <div className="pb-file__actions">
        {VIEWABLE.has(kind) ? (
          <a className="pb-file__btn" href={href} target="_blank" rel="noopener noreferrer">
            <IconExternal size={16} />
            <span>Open</span>
          </a>
        ) : null}
        <a className="pb-file__btn pb-file__btn--primary" href={downloadUrl(block.src, mediaBase)} download={block.name || true}>
          <IconDownload size={16} />
          <span>Download</span>
        </a>
      </div>
    </div>
  );
}

function LinkCard({ url, title, note, icon = "link" }: { url: string; title: string; note: string; icon?: "link" | "play" }) {
  const host = hostOf(url);
  return (
    <a className="pb-link" href={url} target="_blank" rel="noopener noreferrer">
      <span className="pb-link__icon" aria-hidden="true">
        {icon === "play" ? <IconPlay size={20} /> : <IconExternal size={20} />}
      </span>
      <span className="pb-link__body">
        <span className="pb-link__title">{title || host || "Open link"}</span>
        {note ? <span className="pb-link__note">{note}</span> : null}
        {host ? <span className="pb-link__host">{host}</span> : null}
      </span>
      <IconArrowRight className="pb-link__arrow" size={18} />
    </a>
  );
}
