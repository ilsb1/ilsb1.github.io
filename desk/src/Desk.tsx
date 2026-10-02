import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatDate } from "../../shared/text.js";
import {
  ApiError,
  blankPost,
  blogLink,
  canPublish,
  deletePost,
  errorMessage,
  hasUnpublishedEdits,
  isBlank,
  isSignedOut,
  listPosts,
  publishPost,
  savePost,
  unpublishPost,
  type Post,
  type PublishResult,
  type Session,
} from "./api";
import Dialog from "./Dialog";
import Editor, { type EditorHandle } from "./Editor";
import { IconArrowLeft, IconCheck, IconExternal, IconPen, IconPlus } from "./icons";

const SIGNED_OUT = "For safety, you've been signed out. Please sign in again.";

type SaveState = "saved" | "saving" | "error";

type Props = { session: Session; onSignOut: (note?: string) => void };

function postIdFromUrl() {
  return window.location.hash.slice(1) || null;
}

function byRecent(a: Post, b: Post) {
  return Date.parse(b.updatedAt) - Date.parse(a.updatedAt);
}

export default function Desk({ session, onSignOut }: Props) {
  const token = session.token;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loadError, setLoadError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [openId, setOpenId] = useState<string | null>(postIdFromUrl);
  const [saveState, setSaveState] = useState<SaveState>("saved");

  const postsRef = useRef<Post[]>([]);
  const pending = useRef(new Set<string>());
  const inflight = useRef<Promise<boolean> | null>(null);
  const timer = useRef(0);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);

  const commit = useCallback((next: Post[]) => {
    postsRef.current = next;
    setPosts(next);
  }, []);

  const update = useCallback(
    (id: string, changes: Partial<Post>) => {
      commit(postsRef.current.map((post) => (post.id === id ? { ...post, ...changes } : post)));
    },
    [commit],
  );

  useEffect(() => {
    let cancelled = false;
    listPosts(token).then(
      (list) => {
        if (!cancelled) commit(list);
      },
      (error) => {
        if (cancelled) return;
        if (isSignedOut(error)) onSignOut(SIGNED_OUT);
        else setLoadError(errorMessage(error));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [token, attempt, commit, onSignOut]);

  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    if (pending.current.size === 0) return true;

    const run = (async () => {
      setSaveState("saving");
      for (const id of [...pending.current]) {
        const post = postsRef.current.find((item) => item.id === id);
        if (!post || (post.isNew && isBlank(post))) {
          pending.current.delete(id);
          continue;
        }
        const sent = post.updatedAt;
        try {
          const saved = await savePost(token, post);
          const latest = postsRef.current.find((item) => item.id === id);
          if (latest?.updatedAt === sent) pending.current.delete(id);
          if (latest) update(id, { slug: saved.slug, live: saved.live, isNew: false });
        } catch (error) {
          if (isSignedOut(error)) {
            onSignOut(SIGNED_OUT);
            return false;
          }
          setSaveState("error");
          timer.current = window.setTimeout(() => void flushRef.current(), 8000);
          return false;
        }
      }
      if (pending.current.size > 0) {
        timer.current = window.setTimeout(() => void flushRef.current(), 600);
      } else {
        setSaveState("saved");
      }
      return true;
    })();

    inflight.current = run;
    try {
      return await run;
    } finally {
      inflight.current = null;
    }
  }, [token, update, onSignOut]);

  useLayoutEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (pending.current.size > 0 || inflight.current) event.preventDefault();
    };
    const onPop = () => setOpenId(postIdFromUrl());
    window.addEventListener("beforeunload", warn);
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.removeEventListener("popstate", onPop);
      window.clearTimeout(timer.current);
    };
  }, []);

  function edit(id: string, changes: Partial<Pick<Post, "title" | "subtitle" | "html">>) {
    update(id, { ...changes, updatedAt: new Date().toISOString() });
    pending.current.add(id);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flushRef.current(), 1000);
  }

  function dropIfEmpty(id: string | null) {
    const post = postsRef.current.find((item) => item.id === id);
    if (post?.isNew && isBlank(post)) {
      pending.current.delete(post.id);
      commit(postsRef.current.filter((item) => item.id !== post.id));
    }
  }

  function openPost(id: string) {
    window.history.pushState({ desk: true }, "", `#${id}`);
    setOpenId(id);
  }

  function newPost() {
    const post = blankPost();
    commit([post, ...postsRef.current]);
    openPost(post.id);
  }

  function backToList() {
    dropIfEmpty(openId);
    void flushRef.current();
    if (window.history.state?.desk) window.history.back();
    else window.history.replaceState(null, "", window.location.pathname);
    setOpenId(null);
  }

  async function signOut() {
    await flushRef.current();
    onSignOut();
  }

  async function publish(id: string) {
    await flushRef.current();
    const post = postsRef.current.find((item) => item.id === id);
    if (!post) return { error: errorMessage(null) };
    try {
      const { post: saved, result } = await publishPost(token, post);
      const latest = postsRef.current.find((item) => item.id === id);
      if (latest?.updatedAt === post.updatedAt) pending.current.delete(id);
      update(id, { slug: saved.slug, live: saved.live, isNew: false });
      return { result };
    } catch (error) {
      if (isSignedOut(error)) onSignOut(SIGNED_OUT);
      return { error: errorMessage(error) };
    }
  }

  async function unpublish(id: string) {
    try {
      const { post } = await unpublishPost(token, id);
      update(id, { slug: post.slug, live: null });
      return "";
    } catch (error) {
      if (isSignedOut(error)) onSignOut(SIGNED_OUT);
      return errorMessage(error);
    }
  }

  async function remove(id: string) {
    const post = postsRef.current.find((item) => item.id === id);
    if (!post) return "";
    try {
      if (!post.isNew) await deletePost(token, id);
    } catch (error) {
      if (!(error instanceof ApiError && error.status === 404)) {
        if (isSignedOut(error)) onSignOut(SIGNED_OUT);
        return errorMessage(error);
      }
    }
    pending.current.delete(id);
    commit(postsRef.current.filter((item) => item.id !== id));
    backToList();
    return "";
  }

  const open = posts?.find((post) => post.id === openId) ?? null;

  if (open) {
    return (
      <PostScreen
        key={open.id}
        post={open}
        saveState={saveState}
        onEdit={(changes) => edit(open.id, changes)}
        onBack={backToList}
        onPublish={() => publish(open.id)}
        onUnpublish={() => unpublish(open.id)}
        onDelete={() => remove(open.id)}
      />
    );
  }

  return (
    <div className="screen">
      <header className="bar">
        <span className="brand">
          <IconPen size={17} />
          Writing desk
        </span>
        <div className="bar__end">
          <a className="bar-link" href={blogLink(null)} target="_blank" rel="noopener noreferrer">
            View blog
            <IconExternal size={15} />
          </a>
          <button type="button" className="bar-link" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </header>

      <main className="list">
        <div className="list__head">
          <h1>Your posts</h1>
          {posts ? (
            <button type="button" className="btn btn--primary" onClick={newPost}>
              <IconPlus size={17} />
              New post
            </button>
          ) : null}
        </div>

        {posts === null && !loadError ? <p className="list__note">Loading your posts…</p> : null}

        {posts === null && loadError ? (
          <div className="list__note">
            <p className="error">{loadError}</p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setLoadError("");
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : null}

        {posts && posts.length === 0 ? (
          <div className="empty">
            <p className="empty__title">No posts yet</p>
            <p className="empty__text">Write something, then press Publish when you&apos;re happy with it.</p>
            <button type="button" className="btn btn--primary" onClick={newPost}>
              <IconPlus size={17} />
              Write your first post
            </button>
          </div>
        ) : null}

        {posts && posts.length > 0 ? (
          <ul className="rows">
            {[...posts].sort(byRecent).map((post) => (
              <li key={post.id}>
                <button type="button" className="row" onClick={() => openPost(post.id)}>
                  <span className={`row__title${post.title.trim() ? "" : " is-untitled"}`}>
                    {post.title.trim() || "Untitled"}
                  </span>
                  <span className="row__meta">
                    <Status post={post} />
                    <span>Edited {formatDate(post.updatedAt)}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="list__foot">Signed in as {session.email}</p>
      </main>
    </div>
  );
}

function Status({ post }: { post: Post }) {
  if (!post.live) return <span className="tag">Draft</span>;
  if (hasUnpublishedEdits(post)) return <span className="tag tag--changed">Changes not published</span>;
  return <span className="tag tag--live">Published</span>;
}

function fit(element: HTMLTextAreaElement | null) {
  if (!element) return;
  element.style.height = "0px";
  element.style.height = `${element.scrollHeight}px`;
}

type PublishStep = { step: "closed" } | { step: "confirm"; error: string } | { step: "working" } | { step: "done"; result: PublishResult };

type PostScreenProps = {
  post: Post;
  saveState: SaveState;
  onEdit: (changes: Partial<Pick<Post, "title" | "subtitle" | "html">>) => void;
  onBack: () => void;
  onPublish: () => Promise<{ result?: PublishResult; error?: string }>;
  onUnpublish: () => Promise<string>;
  onDelete: () => Promise<string>;
};

function PostScreen({ post, saveState, onEdit, onBack, onPublish, onUnpublish, onDelete }: PostScreenProps) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const subtitleRef = useRef<HTMLTextAreaElement>(null);
  const editorRef = useRef<EditorHandle>(null);
  const [publishing, setPublishing] = useState<PublishStep>({ step: "closed" });
  const [confirm, setConfirm] = useState<"unpublish" | "delete" | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [busy, setBusy] = useState(false);
  const [startsBlank] = useState(() => isBlank(post));

  const changed = hasUnpublishedEdits(post);

  useLayoutEffect(() => {
    fit(titleRef.current);
    fit(subtitleRef.current);
    if (startsBlank) titleRef.current?.focus();
    const onResize = () => {
      fit(titleRef.current);
      fit(subtitleRef.current);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [startsBlank]);

  async function publish() {
    setPublishing({ step: "working" });
    const outcome = await onPublish();
    if (outcome.result) setPublishing({ step: "done", result: outcome.result });
    else setPublishing({ step: "confirm", error: outcome.error || "" });
  }

  async function runConfirm() {
    setBusy(true);
    setConfirmError("");
    const error = confirm === "delete" ? await onDelete() : await onUnpublish();
    setBusy(false);
    if (error) setConfirmError(error);
    else setConfirm(null);
  }

  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "error" ? "Not saved – check your internet" : "Saved";

  return (
    <div className="screen">
      <header className="bar">
        <button type="button" className="bar-link bar-link--back" aria-label="All posts" onClick={onBack}>
          <IconArrowLeft size={17} />
          <span>All posts</span>
        </button>
        <span className={`save save--${saveState}`} role="status">
          {saveLabel}
        </span>
        <div className="bar__end">
          {post.live && !changed ? (
            <span className="published">
              <IconCheck size={16} />
              Published
            </span>
          ) : (
            <button type="button" className="btn btn--primary" onClick={() => setPublishing({ step: "confirm", error: "" })}>
              {post.live ? "Publish changes" : "Publish"}
            </button>
          )}
        </div>
      </header>

      <Editor
        ref={editorRef}
        initialHtml={post.html}
        onChange={(html) => onEdit({ html })}
        header={
          <div className="page__head">
            <p className="page__meta">
              <Status post={post} />
              {post.live && post.slug ? (
                <a href={blogLink(post.slug)} target="_blank" rel="noopener noreferrer">
                  View on the blog
                  <IconExternal size={14} />
                </a>
              ) : null}
            </p>
            <textarea
              ref={titleRef}
              className="title-input"
              rows={1}
              maxLength={180}
              placeholder="Title"
              aria-label="Title"
              value={post.title}
              onChange={(event) => {
                onEdit({ title: event.target.value });
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
              className="subtitle-input"
              rows={1}
              maxLength={240}
              placeholder="Subtitle (optional)"
              aria-label="Subtitle"
              value={post.subtitle}
              onChange={(event) => {
                onEdit({ subtitle: event.target.value });
                fit(event.target);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  editorRef.current?.focus();
                }
              }}
            />
          </div>
        }
        footer={
          <div className="page__actions">
            {post.live ? (
              <button type="button" className="text-btn" onClick={() => setConfirm("unpublish")}>
                Take off the blog
              </button>
            ) : null}
            <button type="button" className="text-btn text-btn--danger" onClick={() => setConfirm("delete")}>
              Delete post
            </button>
          </div>
        }
      />

      <Dialog
        open={publishing.step !== "closed"}
        title={publishTitle(publishing, post)}
        onClose={() => publishing.step !== "working" && setPublishing({ step: "closed" })}
      >
        {publishing.step === "confirm" || publishing.step === "working" ? (
          canPublish(post) ? (
            <>
              <p>It will appear on the blog for everyone to read, usually within two minutes.</p>
              {publishing.step === "confirm" && publishing.error ? <p className="error">{publishing.error}</p> : null}
              <div className="dialog__actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  disabled={publishing.step === "working"}
                  onClick={() => setPublishing({ step: "closed" })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn--primary"
                  disabled={publishing.step === "working"}
                  onClick={() => void publish()}
                >
                  {publishing.step === "working" ? "Publishing…" : "Publish"}
                </button>
              </div>
            </>
          ) : (
            <>
              <p>Please give the post a title and write something in it first.</p>
              <div className="dialog__actions">
                <button type="button" className="btn btn--primary" onClick={() => setPublishing({ step: "closed" })}>
                  OK
                </button>
              </div>
            </>
          )
        ) : null}

        {publishing.step === "done" ? (
          <>
            <p>
              {publishing.result === "failed"
                ? "Your post is saved, but the blog couldn't be updated just now. Please press Publish again in a few minutes."
                : publishing.result === "ok"
                  ? "It will be on the blog in about two minutes."
                  : "Saved on this computer only, because GitHub isn't connected here."}
            </p>
            <div className="dialog__actions">
              {publishing.result === "ok" && post.slug ? (
                <a className="btn btn--ghost" href={blogLink(post.slug)} target="_blank" rel="noopener noreferrer">
                  Open the blog
                  <IconExternal size={15} />
                </a>
              ) : null}
              <button type="button" className="btn btn--primary" onClick={() => setPublishing({ step: "closed" })}>
                Done
              </button>
            </div>
          </>
        ) : null}
      </Dialog>

      <Dialog
        open={confirm !== null}
        title={confirm === "delete" ? "Delete this post?" : "Take this post off the blog?"}
        onClose={() => {
          if (busy) return;
          setConfirm(null);
          setConfirmError("");
        }}
      >
        <p>
          {confirm === "delete"
            ? post.live
              ? "It will be deleted here and taken off the blog. This can't be undone."
              : "It will be deleted. This can't be undone."
            : "Readers won't see it any more. It stays here as a draft, so you can publish it again later."}
        </p>
        {confirmError ? <p className="error">{confirmError}</p> : null}
        <div className="dialog__actions">
          <button
            type="button"
            className="btn btn--ghost"
            disabled={busy}
            onClick={() => {
              setConfirm(null);
              setConfirmError("");
            }}
          >
            Cancel
          </button>
          <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void runConfirm()}>
            {busy ? "One moment…" : confirm === "delete" ? "Delete" : "Take it off"}
          </button>
        </div>
      </Dialog>
    </div>
  );
}

function publishTitle(state: PublishStep, post: Post) {
  if (state.step === "done") return state.result === "failed" ? "Not on the blog yet" : "Published";
  if (!canPublish(post)) return "Almost ready";
  return post.live ? "Publish your changes?" : "Publish this post?";
}
