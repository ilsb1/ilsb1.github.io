import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { BLOG_URL, type PageStatus } from "./api";
import { Segmented } from "./BlockCards";
import { IconAlert, IconArrowLeft, IconLaptop, IconLock, IconPhone, IconRefresh } from "./icons";

/** "top", a page's added elements, or a point in a post's text (0 to 1). */
export type PreviewScroll = "top" | "blocks" | number;
type Device = "laptop" | "phone";
type Failure = "offline" | "updating" | "slow";

type SiteMessage = { source?: string; type?: string; seq?: number; fallback?: boolean };

const SITE_ORIGIN = new URL(BLOG_URL).origin;
const SITE_HOST = BLOG_URL.replace(/^https?:\/\//, "");
const DEVICE_KEY = "ils.desk.preview.device";
const SHOW_TIMEOUT = 12000;
const READY_TIMEOUT = 5000;

const STATE_TEXT: Record<PageStatus, string> = {
  changed: "Not published yet",
  published: "Published",
  original: "No changes yet",
};

const FAILURES: Record<Failure, { title: string; text: string }> = {
  offline: { title: "You're offline", text: "The preview needs the internet. It will load by itself when you're back online." },
  updating: { title: "The preview isn't ready", text: "The website may be updating. Please try again in a minute." },
  slow: { title: "The preview didn't load", text: "Check your internet connection, then try again." },
};

/** The page's address on the website, opened through the home page so no "not found" hop is needed. */
function frameSrc(path: string) {
  return `${BLOG_URL}/?redirect=${encodeURIComponent(`${path}?preview`)}`;
}

function readDevice(): Device {
  try {
    return localStorage.getItem(DEVICE_KEY) === "phone" ? "phone" : "laptop";
  } catch {
    return "laptop";
  }
}

function useMedia(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    onChange();
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

type Props = {
  open: boolean;
  /** Start loading the website in the background so opening feels instant. */
  warm: boolean;
  kind: "page" | "post";
  id: string;
  label: string;
  /** Where it is (or will be) on the website. */
  path: string;
  content: unknown;
  contentKey: string;
  mediaBase?: string;
  scroll: PreviewScroll;
  status: PageStatus;
  action: ReactNode;
  notes: string[];
  onClose: () => void;
};

/**
 * Shows the real website page or blog post with the unpublished content, drawn
 * by the website itself so it looks exactly like it will after publishing.
 */
export default function PagePreview(props: Props) {
  const { open, warm, kind, id, label, path, content, contentKey, mediaBase = "", scroll, status, action, notes, onClose } = props;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const roomy = useMedia("(min-width: 720px)");
  const [device, setDevice] = useState<Device>(readDevice);
  const [attempt, setAttempt] = useState(0);
  const [mounted, setMounted] = useState(false);
  const [shownKey, setShownKey] = useState<string | null>(null);
  const [waiting, setWaiting] = useState(true);
  const [failure, setFailure] = useState<Failure | null>(null);
  const [fallback, setFallback] = useState(false);
  const [notice, setNotice] = useState({ text: "", on: false });
  const [framePath, setFramePath] = useState(path);

  const siteReady = useRef(false);
  const loaded = useRef(false);
  const seq = useRef(0);
  const sent = useRef(new Map<number, string>());
  const drawnSeq = useRef(0);
  const lastSent = useRef("");
  const waitFor = useRef(0);
  const closing = useRef(0);
  const noticeTimer = useRef(0);
  const latest = useRef({ kind, id, path, content, contentKey, mediaBase, open, scroll, shownKey, waiting, failure, attempt, onClose });

  useLayoutEffect(() => {
    latest.current = { kind, id, path, content, contentKey, mediaBase, open, scroll, shownKey, waiting, failure, attempt, onClose };
  });

  useEffect(() => {
    if (open || warm) setMounted(true);
  }, [open, warm]);

  const send = useCallback((scrollTo: PreviewScroll | null) => {
    const target = frameRef.current?.contentWindow;
    if (!target || !siteReady.current) return;
    const { kind: type, id: sendingId, content: sending, contentKey: key, mediaBase: base } = latest.current;
    seq.current += 1;
    sent.current.set(seq.current, key);
    lastSent.current = key;
    if (scrollTo !== null) waitFor.current = seq.current;
    target.postMessage(
      { source: "ils-desk", type, id: sendingId, seq: seq.current, content: sending, mediaBase: base, scroll: scrollTo },
      SITE_ORIGIN,
    );
  }, []);

  const showNotice = useCallback((text: string) => {
    setNotice({ text, on: true });
    window.clearTimeout(noticeTimer.current);
    noticeTimer.current = window.setTimeout(() => setNotice((current) => ({ ...current, on: false })), 3400);
  }, []);

  const retry = useCallback(() => {
    siteReady.current = false;
    loaded.current = false;
    sent.current.clear();
    drawnSeq.current = 0;
    lastSent.current = "";
    setShownKey(null);
    setWaiting(true);
    setFailure(null);
    setFallback(false);
    setFramePath(latest.current.path);
    setAttempt((value) => value + 1);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    const onMessage = (event: MessageEvent) => {
      const frame = frameRef.current;
      if (!frame || event.source !== frame.contentWindow || event.origin !== SITE_ORIGIN) return;
      const data = event.data as SiteMessage | null;
      if (!data || data.source !== "ils-site") return;
      if (data.type === "ready") {
        siteReady.current = true;
        setFailure(null);
        send(latest.current.open ? latest.current.scroll : null);
      } else if (data.type === "rendered" && typeof data.seq === "number") {
        const key = sent.current.get(data.seq);
        if (key === undefined || data.seq < drawnSeq.current) return;
        drawnSeq.current = data.seq;
        setShownKey(key);
        setFallback(Boolean(data.fallback));
        setFailure(null);
        if (data.seq >= waitFor.current) setWaiting(false);
      } else if (data.type === "fallback") {
        setFallback(true);
      } else if (data.type === "link") {
        showNotice("Links to other pages are turned off in the preview. They work on the website.");
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [mounted, send, showNotice]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open) {
      window.clearTimeout(closing.current);
      dialog.classList.remove("is-closing");
      if (!dialog.open) dialog.showModal();
      return;
    }
    if (dialog.open) {
      dialog.classList.add("is-closing");
      closing.current = window.setTimeout(() => {
        dialog.classList.remove("is-closing");
        dialog.close();
      }, 160);
    }
  }, [open]);

  useEffect(() => () => window.clearTimeout(closing.current), []);

  useEffect(() => {
    if (!open) return;
    if (latest.current.failure && latest.current.failure !== "offline") {
      retry();
      return;
    }
    setNotice((current) => ({ ...current, on: false }));
    setWaiting(latest.current.shownKey !== latest.current.contentKey);
    send(latest.current.scroll);
    if (!navigator.onLine && !siteReady.current) setFailure("offline");
    const timer = window.setTimeout(() => {
      if (!latest.current.waiting) return;
      setFailure(loaded.current && !siteReady.current ? "updating" : navigator.onLine ? "slow" : "offline");
    }, SHOW_TIMEOUT);
    return () => window.clearTimeout(timer);
  }, [open, attempt, send, retry]);

  useEffect(() => {
    if (!open || !siteReady.current || contentKey === lastSent.current) return;
    const timer = window.setTimeout(() => send(null), 120);
    return () => window.clearTimeout(timer);
  }, [open, contentKey, send]);

  useEffect(() => {
    if (failure !== "offline") return;
    window.addEventListener("online", retry);
    return () => window.removeEventListener("online", retry);
  }, [failure, retry]);

  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = "hidden";
    let pushed = false;
    const push = window.setTimeout(() => {
      window.history.pushState({ ...(window.history.state ?? {}), preview: true }, "");
      pushed = true;
    }, 0);
    const onPop = () => {
      if (window.history.state?.preview) return;
      pushed = false;
      latest.current.onClose();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.clearTimeout(push);
      window.removeEventListener("popstate", onPop);
      root.style.overflow = overflow;
      if (pushed && window.history.state?.preview) window.history.back();
    };
  }, [open]);

  function onFrameLoad() {
    loaded.current = true;
    const loadedAttempt = attempt;
    window.setTimeout(() => {
      if (latest.current.attempt !== loadedAttempt || siteReady.current || !latest.current.open) return;
      setFailure("updating");
    }, READY_TIMEOUT);
  }

  function pickDevice(next: Device) {
    setDevice(next);
    try {
      localStorage.setItem(DEVICE_KEY, next);
    } catch {
      /* not remembered; fine */
    }
  }

  const layout = roomy ? device : "compact";
  const visible = shownKey !== null && !waiting && !failure;
  const address = `${SITE_HOST}${path === "/" ? "" : path}`;
  const lines = fallback
    ? [...notes, "Part of this page couldn't be shown, so the website would show the original instead. Try undoing your last change."]
    : notes;

  return (
    <dialog
      ref={dialogRef}
      className={`pv pv--${layout}`}
      aria-label={`Preview of ${label}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="pv-bar">
        <div className="pv-bar__start">
          <button type="button" className="bar-link bar-link--back" aria-label="Back to editing" onClick={onClose}>
            <IconArrowLeft size={17} />
            <span>{roomy ? "Back to editing" : "Edit"}</span>
          </button>
          <span className="pv-bar__title">
            <span className="pv-bar__name">Preview</span>
            <span className={`pv-bar__state pv-bar__state--${status}`}>{STATE_TEXT[status]}</span>
          </span>
        </div>
        {roomy ? (
          <div className="pv-bar__mid">
            <Segmented
              label={kind === "post" ? "Show the post as on a" : "Show the page as on a"}
              value={device}
              options={[
                { value: "laptop", label: "Laptop", icon: <IconLaptop size={16} /> },
                { value: "phone", label: "Phone", icon: <IconPhone size={16} /> },
              ]}
              onChange={pickDevice}
            />
          </div>
        ) : null}
        <div className="pv-bar__end">{action}</div>
      </header>

      {lines.length ? (
        <div className="pv-notes" role="status">
          {lines.map((line) => (
            <p key={line} className="pv-note">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      <div className="pv-stage">
        <div className="pv-frame">
          {layout === "laptop" ? (
            <div className="pv-chrome" aria-hidden="true">
              <span className="pv-chrome__dots">
                <i />
                <i />
                <i />
              </span>
              <span className="pv-chrome__url">
                <IconLock size={12} />
                <span>{address}</span>
              </span>
              <span className="pv-chrome__dots pv-chrome__dots--spacer" />
            </div>
          ) : null}
          <div className="pv-screen">
            {mounted ? (
              <iframe
                key={attempt}
                ref={frameRef}
                className={visible ? "is-shown" : undefined}
                src={frameSrc(framePath)}
                title={`${label} as it will look on the website`}
                allow="accelerometer; autoplay; clipboard-write; compute-pressure; encrypted-media; fullscreen; gyroscope; picture-in-picture; web-share"
                onLoad={onFrameLoad}
              />
            ) : null}
            <PreviewSkeleton kind={kind} hidden={visible || Boolean(failure)} />
            {failure ? (
              <div className="pv-failed" role="alert">
                <IconAlert size={26} />
                <p className="pv-failed__title">{FAILURES[failure].title}</p>
                <p className="pv-failed__text">{FAILURES[failure].text}</p>
                {failure !== "offline" ? (
                  <button type="button" className="btn btn--ghost" onClick={retry}>
                    <IconRefresh size={16} />
                    Try again
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
        <p className={`pv-notice${notice.on ? " is-on" : ""}`} role="status" aria-live="polite">
          {notice.text}
        </p>
      </div>
    </dialog>
  );
}

function PreviewSkeleton({ kind, hidden }: { kind: Props["kind"]; hidden: boolean }) {
  return (
    <div className={`pv-skeleton${hidden ? " is-hidden" : ""}`} role="status" aria-label={hidden ? undefined : "Loading the preview"}>
      <span className="pv-sk pv-sk--header" />
      {kind === "post" ? (
        <span className="pv-sk-col">
          <span className="pv-sk pv-sk--meta" />
          <span className="pv-sk pv-sk--title" />
          <span className="pv-sk pv-sk--sub" />
          <span className="pv-sk pv-sk--byline" />
          <span className="pv-sk pv-sk--line" />
          <span className="pv-sk pv-sk--line" />
          <span className="pv-sk pv-sk--line pv-sk--short" />
        </span>
      ) : (
        <>
          <span className="pv-sk pv-sk--title" />
          <span className="pv-sk pv-sk--sub" />
          <span className="pv-sk pv-sk--line" />
          <span className="pv-sk pv-sk--line pv-sk--short" />
          <span className="pv-sk pv-sk--card" />
        </>
      )}
    </div>
  );
}
