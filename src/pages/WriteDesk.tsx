import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { formatDate, readingMinutes, wordCount } from "../../shared/text.js";
import { clearSession, loadSession, saveSession, type Session } from "../blog/session";
import {
  ApiError,
  blankPost,
  deletePost,
  deskError,
  fetchPosts,
  hasUnpublishedEdits,
  isBlank,
  isDirty,
  mergePosts,
  publishPost,
  readLocalPosts,
  savePost,
  savePostOnExit,
  unpublishPost,
  writeLocalPosts,
  type DeskPost,
  type GithubResult,
} from "../blog/posts";
import DeskSignIn from "../desk/DeskSignIn";
import DeskEditor, { type DeskEditorHandle } from "../desk/DeskEditor";
import Sidebar from "../desk/Sidebar";
import PublishDialog, { type PublishPhase } from "../desk/PublishDialog";
import ConfirmDialog from "../desk/ConfirmDialog";
import PreviewOverlay from "../desk/PreviewOverlay";
import TipsDialog from "../desk/TipsDialog";
import { MOD, initialOf, relativeTime } from "../desk/format";
import {
  IconCheck,
  IconCloudOff,
  IconExternal,
  IconEye,
  IconEyeOff,
  IconHelp,
  IconHome,
  IconLogOut,
  IconMore,
  IconPen,
  IconPlus,
  IconSidebar,
  IconTrash,
} from "../desk/icons";
import "../desk/desk.css";

const SIDEBAR_KEY = "ils.writing.sidebar";
const SIGNED_OUT_NOTE = "You've been signed out to keep the desk safe. Your writing is still here. Sign in to carry on.";

type Boot = { posts: DeskPost[]; offline: boolean };

function byRecent(a: DeskPost, b: DeskPost) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

export default function WriteDesk() {
  const [phase, setPhase] = useState<"checking" | "signed-out" | "ready">("checking");
  const [session, setSession] = useState<Session | null>(null);
  const [boot, setBoot] = useState<Boot | null>(null);
  const [gateNote, setGateNote] = useState("");

  useEffect(() => {
    const meta = document.createElement("meta");
    meta.name = "robots";
    meta.content = "noindex";
    document.head.appendChild(meta);
    const previous = document.title;
    document.title = "Writing desk";
    return () => {
      meta.remove();
      document.title = previous;
    };
  }, []);

  const open = useCallback(async (next: Session, cancelled: () => boolean = () => false) => {
    try {
      const remote = await fetchPosts(next.token);
      if (cancelled()) return;
      setBoot({ posts: mergePosts(remote, readLocalPosts()), offline: false });
      setSession(next);
      setPhase("ready");
    } catch (error) {
      if (cancelled()) return;
      if (error instanceof ApiError && error.status === 401) {
        clearSession();
        setGateNote(SIGNED_OUT_NOTE);
        setPhase("signed-out");
        return;
      }
      setBoot({ posts: readLocalPosts(), offline: true });
      setSession(next);
      setPhase("ready");
    }
  }, []);

  useEffect(() => {
    const existing = loadSession();
    if (!existing) {
      setPhase("signed-out");
      return;
    }
    let cancelled = false;
    void open(existing, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [open]);

  function signedIn(next: Session) {
    saveSession(next);
    setGateNote("");
    setPhase("checking");
    void open(next);
  }

  const signOut = useCallback((note = "") => {
    clearSession();
    setSession(null);
    setBoot(null);
    setGateNote(note);
    setPhase("signed-out");
  }, []);

  if (phase === "checking") return <DeskLoading />;
  if (phase === "signed-out" || !session || !boot) return <DeskSignIn note={gateNote} onSignedIn={signedIn} />;
  return (
    <Workspace session={session} initialPosts={boot.posts} initiallyOffline={boot.offline} onSignOut={signOut} />
  );
}

function DeskLoading() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), 350);
    return () => window.clearTimeout(timer);
  }, []);
  return (
    <div className="desk-loading" role="status" aria-live="polite">
      {visible ? (
        <>
          <span className="spinner spinner--lg" aria-hidden="true" />
          <p>Opening your desk…</p>
        </>
      ) : null}
    </div>
  );
}

type WorkspaceProps = {
  session: Session;
  initialPosts: DeskPost[];
  initiallyOffline: boolean;
  onSignOut: (note?: string) => void;
};

type PublishState = {
  open: boolean;
  phase: PublishPhase;
  result: GithubResult | null;
  error: string;
  firstTime: boolean;
};

const PUBLISH_CLOSED: PublishState = { open: false, phase: "review", result: null, error: "", firstTime: true };

function fit(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

function Workspace({ session, initialPosts, initiallyOffline, onSignOut }: WorkspaceProps) {
  const [posts, setPosts] = useState<DeskPost[]>(initialPosts);
  const [activeId, setActiveId] = useState<string | null>(() => [...initialPosts].sort(byRecent)[0]?.id ?? null);
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1100) return false;
    return localStorage.getItem(SIDEBAR_KEY) !== "closed";
  });
  const [saving, setSaving] = useState(false);
  const [offline, setOffline] = useState(initiallyOffline);
  const [lastSaved, setLastSaved] = useState<number | null>(initiallyOffline ? null : Date.now());
  const [now, setNow] = useState(() => Date.now());
  const [publish, setPublish] = useState<PublishState>(PUBLISH_CLOSED);
  const [confirm, setConfirm] = useState<"delete" | "unpublish" | null>(null);
  const [busy, setBusy] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [tipsOpen, setTipsOpen] = useState(false);
  const [menu, setMenu] = useState<"more" | "account" | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const postsRef = useRef(posts);
  const activeRef = useRef(activeId);
  const pending = useRef(new Set(initialPosts.filter((post) => isDirty(post) && !isBlank(post)).map((post) => post.id)));
  const saveTimer = useRef(0);
  const retryTimer = useRef(0);
  const inflight = useRef<Promise<void> | null>(null);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<DeskEditorHandle>(null);

  activeRef.current = activeId;

  const active = posts.find((post) => post.id === activeId) ?? null;
  const words = active ? wordCount(active.html) : 0;
  const pendingEdits = active ? hasUnpublishedEdits(active) : false;

  const commit = useCallback((next: DeskPost[]) => {
    postsRef.current = next;
    setPosts(next);
    writeLocalPosts(next);
  }, []);

  const patch = useCallback(
    (id: string, changes: Partial<DeskPost>) => {
      commit(postsRef.current.map((post) => (post.id === id ? { ...post, ...changes } : post)));
    },
    [commit],
  );

  const showToast = useCallback((text: string) => {
    setToast({ id: Date.now(), text });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const flush = useCallback(async () => {
    window.clearTimeout(saveTimer.current);
    window.clearTimeout(retryTimer.current);
    if (inflight.current) await inflight.current;
    if (pending.current.size === 0) return true;

    let failed = false;
    const run = (async () => {
      setSaving(true);
      for (const id of [...pending.current]) {
        const post = postsRef.current.find((item) => item.id === id);
        if (!post || (isBlank(post) && !post.syncedAt)) {
          pending.current.delete(id);
          continue;
        }
        const sent = post.updatedAt;
        try {
          const saved = await savePost(session.token, post);
          const latest = postsRef.current.find((item) => item.id === id);
          if (!latest) {
            pending.current.delete(id);
            continue;
          }
          if (latest.updatedAt === sent) pending.current.delete(id);
          patch(id, {
            slug: saved.slug ?? latest.slug,
            live: saved.live,
            status: saved.status,
            publishedAt: saved.publishedAt,
            syncedAt: sent,
          });
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            onSignOut(SIGNED_OUT_NOTE);
            return;
          }
          failed = true;
          break;
        }
      }
      setSaving(false);
      setOffline(failed);
      if (failed) {
        retryTimer.current = window.setTimeout(() => void flushRef.current(), 10000);
      } else {
        setLastSaved(Date.now());
        if (pending.current.size) saveTimer.current = window.setTimeout(() => void flushRef.current(), 900);
      }
    })();

    inflight.current = run;
    try {
      await run;
    } finally {
      inflight.current = null;
    }
    return !failed;
  }, [onSignOut, patch, session.token]);

  flushRef.current = flush;

  useEffect(() => {
    if (pending.current.size) void flushRef.current();
    const tick = window.setInterval(() => setNow(Date.now()), 30000);
    const onExit = () => {
      for (const id of pending.current) {
        const post = postsRef.current.find((item) => item.id === id);
        if (post && !isBlank(post)) savePostOnExit(session.token, post);
      }
    };
    window.addEventListener("pagehide", onExit);
    return () => {
      window.clearInterval(tick);
      window.clearTimeout(saveTimer.current);
      window.clearTimeout(retryTimer.current);
      window.removeEventListener("pagehide", onExit);
      onExit();
    };
  }, [session.token]);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_KEY, sidebarOpen ? "open" : "closed");
  }, [sidebarOpen]);

  useEffect(() => {
    if (activeId || posts.length === 0) return;
    setActiveId([...posts].sort(byRecent)[0].id);
  }, [activeId, posts]);

  useLayoutEffect(() => {
    fit(titleRef.current);
    fit(subtitleRef.current);
    const post = postsRef.current.find((item) => item.id === activeId);
    if (post && !post.title && isBlank(post)) titleRef.current?.focus();
  }, [activeId]);

  useEffect(() => {
    let wide = window.innerWidth >= 1100;
    const onResize = () => {
      fit(titleRef.current);
      fit(subtitleRef.current);
      const nowWide = window.innerWidth >= 1100;
      if (wide && !nowWide) setSidebarOpen(false);
      wide = nowWide;
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const saveNow = useCallback(async () => {
    const saved = await flushRef.current();
    showToast(saved ? "All changes saved." : "Saved on this computer. It will sync when the desk reconnects.");
  }, [showToast]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && window.innerWidth < 1100 && !document.querySelector("dialog[open]")) {
        setSidebarOpen(false);
        return;
      }
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void saveNow();
      } else if (key === "\\") {
        event.preventDefault();
        setSidebarOpen((value) => !value);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [saveNow]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      if ((event.target as Element | null)?.closest(".pop, .pop-trigger")) return;
      setMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenu(null);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  function editActive(changes: Partial<Pick<DeskPost, "title" | "subtitle" | "html">>) {
    const id = activeRef.current;
    if (!id) return;
    const stamp = new Date().toISOString();
    commit(postsRef.current.map((post) => (post.id === id ? { ...post, ...changes, updatedAt: stamp } : post)));
    pending.current.add(id);
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void flushRef.current(), 1200);
  }

  function dropBlankActive() {
    const current = postsRef.current.find((post) => post.id === activeRef.current);
    if (current && isBlank(current) && !current.syncedAt) {
      pending.current.delete(current.id);
      commit(postsRef.current.filter((post) => post.id !== current.id));
    }
  }

  function selectPiece(id: string) {
    if (window.innerWidth < 1100) setSidebarOpen(false);
    if (id === activeRef.current) return;
    dropBlankActive();
    void flushRef.current();
    setActiveId(id);
    setMenu(null);
  }

  function newPiece() {
    if (window.innerWidth < 1100) setSidebarOpen(false);
    const current = postsRef.current.find((post) => post.id === activeRef.current);
    if (current && isBlank(current) && !current.syncedAt) {
      titleRef.current?.focus();
      return;
    }
    void flushRef.current();
    const post = blankPost();
    commit([post, ...postsRef.current]);
    setActiveId(post.id);
  }

  function openPublish() {
    const post = postsRef.current.find((item) => item.id === activeRef.current);
    setPublish({ open: true, phase: "review", result: null, error: "", firstTime: !post?.live });
  }

  async function confirmPublish() {
    const id = activeRef.current;
    if (!id) return;
    setPublish((state) => ({ ...state, phase: "working", error: "" }));
    await flushRef.current();
    const post = postsRef.current.find((item) => item.id === id);
    if (!post) return;
    const sent = post.updatedAt;
    try {
      const result = await publishPost(session.token, post);
      const latest = postsRef.current.find((item) => item.id === id);
      const clean = latest?.updatedAt === sent;
      if (clean) pending.current.delete(id);
      patch(id, {
        slug: result.post.slug,
        live: result.post.live,
        status: result.post.status,
        publishedAt: result.post.publishedAt,
        syncedAt: clean ? sent : latest?.syncedAt ?? null,
      });
      setOffline(false);
      setLastSaved(Date.now());
      setPublish((state) => ({ ...state, open: true, phase: "done", result: result.github, error: "" }));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignOut(SIGNED_OUT_NOTE);
        return;
      }
      setPublish((state) => ({
        ...state,
        phase: "review",
        error: deskError(error instanceof ApiError ? error.code : "request_failed"),
      }));
    }
  }

  async function confirmUnpublish() {
    const id = activeRef.current;
    if (!id) return;
    setBusy(true);
    try {
      const result = await unpublishPost(session.token, id);
      patch(id, { live: null, status: "draft", publishedAt: null, slug: result.post.slug });
      setConfirm(null);
      setPublish((state) => ({ ...state, open: false }));
      showToast("Taken off the blog. It's back with your drafts.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignOut(SIGNED_OUT_NOTE);
        return;
      }
      setConfirm(null);
      showToast(deskError(error instanceof ApiError ? error.code : "request_failed"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    const id = activeRef.current;
    const post = postsRef.current.find((item) => item.id === id);
    if (!id || !post) return;
    setBusy(true);
    try {
      if (post.syncedAt || post.live) {
        try {
          await deletePost(session.token, id);
        } catch (error) {
          if (!(error instanceof ApiError && error.status === 404)) throw error;
        }
      }
      pending.current.delete(id);
      const next = postsRef.current.filter((item) => item.id !== id);
      commit(next);
      setActiveId([...next].sort(byRecent)[0]?.id ?? null);
      setConfirm(null);
      showToast(post.live ? "Deleted, and taken off the blog." : "Deleted.");
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onSignOut(SIGNED_OUT_NOTE);
        return;
      }
      setConfirm(null);
      showToast(deskError(error instanceof ApiError ? error.code : "request_failed"));
    } finally {
      setBusy(false);
    }
  }

  function viewOnBlog() {
    const slug = postsRef.current.find((item) => item.id === activeRef.current)?.slug;
    if (slug) window.open(`/blog/${slug}`, "_blank", "noopener");
  }

  const saveStatus = useMemo(() => {
    if (offline) return { tone: "warn", text: "Saved on this computer", tip: deskError("offline") };
    if (saving || pending.current.size > 0) return { tone: "busy", text: "Saving…", tip: "" };
    return {
      tone: "ok",
      text: lastSaved && now - lastSaved > 60000 ? `Saved ${relativeTime(lastSaved, now)}` : "All changes saved",
      tip: "",
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offline, saving, lastSaved, now, posts]);

  const signedInUntil = formatDate(new Date(session.expiresAt).toISOString());

  return (
    <div className={`desk${sidebarOpen ? " has-sidebar" : ""}`}>
      <header className="topbar">
        <div className="topbar__left">
          <button
            type="button"
            className={`icon-btn${sidebarOpen ? " is-on" : ""}`}
            aria-label={sidebarOpen ? "Hide your pieces" : "Show your pieces"}
            aria-pressed={sidebarOpen}
            data-tip={`${sidebarOpen ? "Hide" : "Show"} your pieces · ${MOD}\\`}
            onClick={() => setSidebarOpen((value) => !value)}
          >
            <IconSidebar />
          </button>
          <span className="topbar__brand">
            <IconPen size={16} />
            Writing desk
          </span>
          {active ? (
            <span className={`save save--${saveStatus.tone}`} title={saveStatus.tip || undefined} role="status">
              {saveStatus.tone === "warn" ? (
                <IconCloudOff size={15} />
              ) : saveStatus.tone === "busy" ? (
                <span className="save__pulse" aria-hidden="true" />
              ) : (
                <IconCheck size={15} />
              )}
              {saveStatus.text}
            </span>
          ) : null}
        </div>

        <div className="topbar__right">
          <button
            type="button"
            className="icon-btn"
            aria-label="Tips and shortcuts"
            data-tip="Tips and shortcuts"
            onClick={() => setTipsOpen(true)}
          >
            <IconHelp />
          </button>
          {active ? (
            <>
              <button type="button" className="btn btn--ghost" onClick={() => setPreviewOpen(true)}>
                <IconEye size={17} />
                Preview
              </button>
              {active.live && !pendingEdits ? (
                <button
                  type="button"
                  className="btn btn--published"
                  onClick={openPublish}
                >
                  <IconCheck size={16} />
                  Published
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={openPublish}
                >
                  {active.live ? "Update the blog" : "Publish"}
                </button>
              )}
              <div className="pop-wrap">
                <button
                  type="button"
                  className={`icon-btn pop-trigger${menu === "more" ? " is-on" : ""}`}
                  aria-label="More options"
                  aria-haspopup="menu"
                  aria-expanded={menu === "more"}
                  data-tip="More options"
                  onClick={() => setMenu(menu === "more" ? null : "more")}
                >
                  <IconMore />
                </button>
                {menu === "more" ? (
                  <div className="pop" role="menu">
                    {active.live && active.slug ? (
                      <MenuItem
                        icon={<IconExternal size={17} />}
                        label="See it on the blog"
                        onClick={() => {
                          setMenu(null);
                          viewOnBlog();
                        }}
                      />
                    ) : null}
                    {active.live ? (
                      <MenuItem
                        icon={<IconEyeOff size={17} />}
                        label="Take it off the blog"
                        onClick={() => {
                          setMenu(null);
                          setConfirm("unpublish");
                        }}
                      />
                    ) : null}
                    {active.live ? <div className="pop__sep" /> : null}
                    <MenuItem
                      icon={<IconTrash size={17} />}
                      label="Delete this piece"
                      danger
                      onClick={() => {
                        setMenu(null);
                        setConfirm("delete");
                      }}
                    />
                  </div>
                ) : null}
              </div>
            </>
          ) : null}
          <div className="pop-wrap">
            <button
              type="button"
              className={`avatar pop-trigger${menu === "account" ? " is-on" : ""}`}
              aria-label="Your account"
              aria-haspopup="menu"
              aria-expanded={menu === "account"}
              onClick={() => setMenu(menu === "account" ? null : "account")}
            >
              {initialOf(session.email)}
            </button>
            {menu === "account" ? (
              <div className="pop pop--account" role="menu">
                <div className="pop__head">
                  <span className="avatar avatar--lg" aria-hidden="true">
                    {initialOf(session.email)}
                  </span>
                  <div>
                    <p className="pop__email">{session.email}</p>
                    <p className="pop__note">Signed in on this computer until {signedInUntil}</p>
                  </div>
                </div>
                <div className="pop__sep" />
                <Link to="/" className="pop__item" role="menuitem">
                  <IconHome size={17} />
                  Back to the website
                </Link>
                <MenuItem
                  icon={<IconLogOut size={17} />}
                  label="Sign out"
                  onClick={() => {
                    void flushRef.current();
                    onSignOut();
                  }}
                />
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="desk__body">
        <Sidebar posts={posts} activeId={activeId} now={now} onSelect={selectPiece} onNew={newPiece} />
        {sidebarOpen ? <div className="desk__scrim" aria-hidden="true" onClick={() => setSidebarOpen(false)} /> : null}

        <main className="desk__main">
          {active ? (
            <>
              <DeskEditor
                key={active.id}
                ref={editorRef}
                initialHtml={active.html}
                onChange={(html) => editActive({ html })}
                onHint={showToast}
                onSaveShortcut={() => void saveNow()}
                header={
                  <div className="ed-head">
                    <p className="ed-state">
                      <StatePill post={active} pending={pendingEdits} />
                      <span className="ed-state__time">Edited {relativeTime(active.updatedAt, now)}</span>
                    </p>
                    <textarea
                      ref={titleRef}
                      className="ed-title"
                      rows={1}
                      maxLength={180}
                      placeholder="Title"
                      aria-label="Title"
                      value={active.title}
                      onChange={(event) => {
                        editActive({ title: event.target.value });
                        fit(event.target);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          subtitleRef.current?.focus();
                        }
                      }}
                    />
                    <textarea
                      ref={subtitleRef}
                      className="ed-subtitle"
                      rows={1}
                      maxLength={240}
                      placeholder="Add a subtitle (optional)"
                      aria-label="Subtitle"
                      value={active.subtitle}
                      onChange={(event) => {
                        editActive({ subtitle: event.target.value });
                        fit(event.target);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          editorRef.current?.focus();
                        }
                      }}
                    />
                    <div className="ed-rule" aria-hidden="true" />
                  </div>
                }
              />
              <footer className="desk__status">
                <span>
                  {words.toLocaleString()} {words === 1 ? "word" : "words"}
                  {words > 0 ? <span className="desk__status-sep"> · </span> : null}
                  {words > 0 ? `${readingMinutes(words)} min read` : null}
                </span>
                <button type="button" className="desk__status-link" onClick={() => setTipsOpen(true)}>
                  Tips and shortcuts
                </button>
              </footer>
            </>
          ) : (
            <Welcome onStart={newPiece} onTips={() => setTipsOpen(true)} />
          )}
        </main>
      </div>

      <PublishDialog
        open={publish.open}
        post={active}
        phase={publish.phase}
        result={publish.result}
        error={publish.error}
        firstTime={publish.firstTime}
        onPublish={() => void confirmPublish()}
        onClose={() => setPublish((state) => ({ ...state, open: false }))}
        onView={() => {
          viewOnBlog();
          setPublish((state) => ({ ...state, open: false }));
        }}
        onUnpublish={() => {
          setPublish((state) => ({ ...state, open: false }));
          setConfirm("unpublish");
        }}
      />

      <ConfirmDialog
        open={confirm === "unpublish"}
        title="Take this piece off the blog?"
        body="Readers won't be able to see it any more. It stays here with your drafts, so you can publish it again whenever you like."
        confirmLabel="Take it off"
        cancelLabel="Keep it on the blog"
        busy={busy}
        onConfirm={() => void confirmUnpublish()}
        onCancel={() => !busy && setConfirm(null)}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        title="Delete this piece?"
        body={
          active?.live
            ? "It will be removed from your desk and taken off the blog. This can't be undone."
            : "It will be removed from your desk. This can't be undone."
        }
        confirmLabel="Delete"
        cancelLabel="Keep it"
        danger
        busy={busy}
        onConfirm={() => void confirmDelete()}
        onCancel={() => !busy && setConfirm(null)}
      />
      <PreviewOverlay open={previewOpen} post={active} onClose={() => setPreviewOpen(false)} />
      <TipsDialog open={tipsOpen} onClose={() => setTipsOpen(false)} />

      {toast ? (
        <div className="toast" role="status" key={toast.id}>
          {toast.text}
        </div>
      ) : null}
    </div>
  );
}

function StatePill({ post, pending }: { post: DeskPost; pending: boolean }) {
  if (!post.live) return <span className="pill">Draft</span>;
  if (pending) {
    return (
      <span className="pill pill--amber">
        <span className="dot dot--amber" />
        On the blog · new changes not published
      </span>
    );
  }
  return (
    <span className="pill pill--green">
      <span className="dot dot--green" />
      On the blog
    </span>
  );
}

function MenuItem({
  icon,
  label,
  danger = false,
  onClick,
}: {
  icon: ReactNode;
  label: string;
  danger?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" role="menuitem" className={`pop__item${danger ? " pop__item--danger" : ""}`} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function Welcome({ onStart, onTips }: { onStart: () => void; onTips: () => void }) {
  return (
    <div className="welcome">
      <div className="welcome__art" aria-hidden="true">
        <span className="welcome__sheet welcome__sheet--back" />
        <span className="welcome__sheet">
          <span className="welcome__line welcome__line--title" />
          <span className="welcome__line" />
          <span className="welcome__line" />
          <span className="welcome__line welcome__line--short" />
        </span>
        <span className="welcome__pen">
          <IconPen size={22} />
        </span>
      </div>
      <h1 className="welcome__title">Welcome to your writing desk</h1>
      <p className="welcome__text">
        Write your essays here. Everything saves as you type, and nothing is public until you press Publish.
      </p>
      <div className="welcome__actions">
        <button type="button" className="btn btn--primary btn--lg" onClick={onStart}>
          <IconPlus size={18} />
          Start your first piece
        </button>
        <button type="button" className="btn btn--text" onClick={onTips}>
          How does it work?
        </button>
      </div>
    </div>
  );
}
