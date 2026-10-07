import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  closestCenter,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  useCallback,
  useDeferredValue,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fileExtension, videoEmbed } from "../../shared/content.js";
import { mediaUrl } from "../../src/content/Blocks";
import {
  BLOG_URL,
  SIGNED_OUT,
  discardPage,
  errorMessage,
  getPage,
  isSignedOut,
  publishPage,
  resetPage,
  savePage,
  siteLink,
  type PageContent,
  type PageRecord,
  type PageStatus,
  type PublishResult,
  type Session,
} from "./api";
import { BlockCard, BlockIcon, blockSummary } from "./BlockCards";
import Dialog from "./Dialog";
import { EditorContext, type EditorApi } from "./editorContext";
import PageTextCard from "./FieldEditors";
import { pickFiles } from "./filePick";
import { IconArrowLeft, IconCheck, IconClose, IconExternal, IconEye, IconMore, IconPlus } from "./icons";
import Menu, { type MenuItem } from "./Menu";
import PagePreview, { type PreviewScroll } from "./PagePreview";
import { goBack } from "./nav";
import {
  BLOCK_LABELS,
  BLOCK_ORDER,
  MAX_PHOTOS,
  PAGE_GROUPS,
  blankBlock,
  changedFields,
  draftContent,
  fieldProblem,
  fieldValues,
  localStatus,
  newId,
  originalValue,
  pageDef,
  prettyName,
  summarizeChanges,
  toBlocks,
  toEdit,
  type BlockType,
  type EditBlock,
  type EditPhoto,
  type FieldValue,
  type FieldValues,
  type PageDef,
} from "./pageModel";
import { useToasts } from "./Toasts";
import { fileProblem, kindOf, type UploadKind, type Uploaded } from "./uploads";
import { useUploads } from "./useUploads";

type Props = { id: string; session: Session; onSignOut: (note?: string) => void };

type Loaded = { record: PageRecord; mediaBase: string; version: number };

const MAX_BLOCKS = 60;

export default function PageEditor({ id, session, onSignOut }: Props) {
  const page = pageDef(id);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!page) return;
    let cancelled = false;
    getPage(session.token, page.id).then(
      ({ page: record, mediaBase }) => {
        if (!cancelled) setLoaded((current) => ({ record, mediaBase, version: (current?.version ?? 0) + 1 }));
      },
      (failure) => {
        if (cancelled) return;
        if (isSignedOut(failure)) onSignOut(SIGNED_OUT);
        else setError(errorMessage(failure));
      },
    );
    return () => {
      cancelled = true;
    };
  }, [page, session.token, attempt, onSignOut]);

  const replace = useCallback((record: PageRecord) => {
    setLoaded((current) => (current ? { record, mediaBase: current.mediaBase, version: current.version + 1 } : current));
  }, []);

  if (!page) {
    return (
      <Shell title="Page not found">
        <div className="list__note">
          <p>This page doesn&apos;t exist. It may have been renamed.</p>
          <button type="button" className="btn btn--primary" onClick={() => goBack("pages")}>
            Back to website pages
          </button>
        </div>
      </Shell>
    );
  }

  if (!loaded) {
    return (
      <Shell title={page.label}>
        {error ? (
          <div className="list__note">
            <p className="error">{error}</p>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setError("");
                setAttempt((value) => value + 1);
              }}
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="pe-skeleton" aria-label="Loading the page" role="status">
            <span className="sk sk--title" />
            <span className="sk sk--line" />
            <span className="sk sk--card" />
            <span className="sk sk--card sk--short" />
          </div>
        )}
      </Shell>
    );
  }

  return (
    <Workbench
      key={loaded.version}
      page={page}
      record={loaded.record}
      mediaBase={loaded.mediaBase}
      session={session}
      onSignOut={onSignOut}
      onReplace={replace}
    />
  );
}

function Shell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="screen">
      <header className="bar bar--editor">
        <button type="button" className="bar-link bar-link--back" onClick={() => goBack("pages")}>
          <IconArrowLeft size={17} />
          <span>Website pages</span>
        </button>
        <span className="bar__title">
          <span className="bar__page">{title}</span>
        </span>
      </header>
      <main className="pe-main pe-main--solo">{children}</main>
    </div>
  );
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

/** True while the on-screen keyboard is likely open, so the bottom bar can step aside. */
function useTyping() {
  const [typing, setTyping] = useState(false);
  useEffect(() => {
    const check = () => {
      const element = document.activeElement as HTMLElement | null;
      const typingNow = Boolean(
        element &&
          (element.isContentEditable ||
            element.tagName === "TEXTAREA" ||
            (element.tagName === "INPUT" && !["button", "checkbox", "radio", "file"].includes((element as HTMLInputElement).type))),
      );
      setTyping(typingNow);
    };
    const onOut = () => window.setTimeout(check, 0);
    document.addEventListener("focusin", check);
    document.addEventListener("focusout", onOut);
    return () => {
      document.removeEventListener("focusin", check);
      document.removeEventListener("focusout", onOut);
    };
  }, []);
  return typing;
}

const backupKey = (id: string) => `ils.desk.page.${id}`;

function readBackup(id: string, base: string | null): PageContent | null {
  try {
    const data = JSON.parse(localStorage.getItem(backupKey(id)) || "null") as { base: string | null; content: PageContent } | null;
    return data && data.base === base && data.content ? data.content : null;
  } catch {
    return null;
  }
}

function writeBackup(id: string, base: string | null, content: PageContent) {
  try {
    localStorage.setItem(backupKey(id), JSON.stringify({ base, content }));
  } catch {
    /* storage full or blocked; the server copy still works */
  }
}

function clearBackup(id: string) {
  try {
    localStorage.removeItem(backupKey(id));
  } catch {
    /* ignore */
  }
}

type SaveState = "saved" | "pending" | "saving" | "error" | "offline";

type PublishStep =
  | { step: "closed" }
  | { step: "confirm"; error: string }
  | { step: "working" }
  | { step: "done"; result: PublishResult };

type Drag = { type: "palette"; block: BlockType } | { type: "block"; id: string } | null;

type FileTarget = { slot: number } | { photos: string };

const SAVE_LABELS: Record<SaveState, string> = {
  saved: "Saved",
  pending: "Saving…",
  saving: "Saving…",
  error: "Not saved yet. Trying again…",
  offline: "Offline. Your changes will save when you're back online.",
};

function applyUpload(block: EditBlock, id: string, result: Uploaded): EditBlock {
  if (block.type === "photos") {
    if (!block.items.some((item) => item.upload === id)) return block;
    return {
      ...block,
      items: block.items.map((item) =>
        item.upload === id ? { ...item, src: result.src, width: result.width, height: result.height, upload: undefined } : item,
      ),
    };
  }
  if ((block.type === "video" || block.type === "audio" || block.type === "file") && block.upload === id) {
    if (block.type === "file") {
      return { ...block, src: result.src, upload: undefined, name: result.name || block.name, size: result.size || block.size, ext: result.ext || block.ext };
    }
    return { ...block, src: result.src, upload: undefined };
  }
  return block;
}

function Workbench({
  page,
  record,
  mediaBase,
  session,
  onSignOut,
  onReplace,
}: {
  page: PageDef;
  record: PageRecord;
  mediaBase: string;
  session: Session;
  onSignOut: (note?: string) => void;
  onReplace: (record: PageRecord) => void;
}) {
  const token = session.token;
  const toasts = useToasts();
  const { show } = toasts;
  const wide = useMedia("(min-width: 1080px)");
  const typing = useTyping();

  const [initial] = useState(() => {
    const backup = readBackup(page.id, record.updatedAt);
    const restored = Boolean(backup && JSON.stringify(backup) !== JSON.stringify(record.draft));
    return { content: restored && backup ? backup : record.draft, restored };
  });
  const [values, setValues] = useState<FieldValues>(() => fieldValues(page, initial.content.fields));
  const [blocks, setBlocks] = useState<EditBlock[]>(() => toEdit(initial.content.blocks));
  const [live, setLive] = useState<PageContent | null>(record.live);
  const [versions, setVersions] = useState<Record<string, number>>({});
  const [imageUploads, setImageUploads] = useState<Record<string, string>>({});
  const [chooser, setChooser] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewWarm, setPreviewWarm] = useState(false);
  const [previewScroll, setPreviewScroll] = useState<PreviewScroll>("top");
  const [drag, setDrag] = useState<Drag>(null);
  const [overSlot, setOverSlot] = useState<number | null>(null);
  const [fileTarget, setFileTarget] = useState<FileTarget | null>(null);
  const [flash, setFlash] = useState<{ id: string; focus: boolean } | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [publishing, setPublishing] = useState<PublishStep>({ step: "closed" });
  const [confirm, setConfirm] = useState<"discard" | "reset" | "leave" | null>(null);
  const [confirmError, setConfirmError] = useState("");
  const [busy, setBusy] = useState(false);

  const blocksRef = useRef(blocks);
  const imageUploadsRef = useRef(imageUploads);
  const finished = useRef(new Map<string, Uploaded>());
  const focusedBlock = useRef<string | null>(null);
  const disposed = useRef(false);

  useLayoutEffect(() => {
    blocksRef.current = blocks;
    imageUploadsRef.current = imageUploads;
  }, [blocks, imageUploads]);

  const signedOut = useCallback(() => onSignOut(SIGNED_OUT), [onSignOut]);

  const onUploaded = useCallback((id: string, result: Uploaded) => {
    finished.current.set(id, result);
    setBlocks((current) => current.map((block) => applyUpload(block, id, result)));
    const fieldKey = Object.keys(imageUploadsRef.current).find((key) => imageUploadsRef.current[key] === id);
    if (fieldKey) {
      setValues((current) => ({ ...current, [fieldKey]: { src: result.src, width: result.width, height: result.height } }));
      setImageUploads((current) => {
        const next = { ...current };
        delete next[fieldKey];
        return next;
      });
    }
  }, []);

  const uploads = useUploads({ token, onDone: onUploaded, onSignedOut: signedOut });
  const { start: startUpload, cancel: cancelUpload, previewFor } = uploads;
  const uploadsActive = useRef(0);

  useLayoutEffect(() => {
    uploadsActive.current = uploads.active;
  }, [uploads.active]);

  /** Brings back anything that finished uploading while its element was removed. */
  const settle = useCallback((block: EditBlock) => {
    let next = block;
    finished.current.forEach((result, id) => {
      next = applyUpload(next, id, result);
    });
    return next;
  }, []);

  const deferredValues = useDeferredValue(values);
  const deferredBlocks = useDeferredValue(blocks);
  const content = useMemo(() => draftContent(page, deferredValues, deferredBlocks), [page, deferredValues, deferredBlocks]);
  const changed = useMemo(() => changedFields(page, deferredValues), [page, deferredValues]);
  const contentKey = useMemo(() => JSON.stringify(content), [content]);
  const status: PageStatus = localStatus(content, live);

  const latest = useRef({ content, key: contentKey });
  const savedKey = useRef(
    JSON.stringify(draftContent(page, fieldValues(page, record.draft.fields), toEdit(record.draft.blocks))),
  );
  const serverStamp = useRef(record.updatedAt);
  const inflight = useRef<Promise<boolean> | null>(null);
  const timer = useRef(0);
  const flushRef = useRef<() => Promise<boolean>>(async () => true);

  useLayoutEffect(() => {
    latest.current = { content, key: contentKey };
  }, [content, contentKey]);

  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    if (disposed.current) return true;
    const { content: sending, key } = latest.current;
    if (key === savedKey.current) {
      setSaveState("saved");
      clearBackup(page.id);
      return true;
    }
    const run = (async () => {
      setSaveState("saving");
      try {
        const saved = await savePage(token, page.id, sending);
        savedKey.current = key;
        serverStamp.current = saved.updatedAt;
        if (latest.current.key === key) {
          setSaveState("saved");
          clearBackup(page.id);
        } else {
          timer.current = window.setTimeout(() => void flushRef.current(), 600);
        }
        return true;
      } catch (error) {
        if (isSignedOut(error)) {
          signedOut();
          return false;
        }
        setSaveState(navigator.onLine ? "error" : "offline");
        timer.current = window.setTimeout(() => void flushRef.current(), navigator.onLine ? 5000 : 15000);
        return false;
      }
    })();
    inflight.current = run;
    try {
      return await run;
    } finally {
      inflight.current = null;
    }
  }, [page.id, token, signedOut]);

  useLayoutEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  useEffect(() => {
    if (disposed.current) return;
    if (contentKey === savedKey.current) {
      if (!inflight.current) setSaveState((state) => (state === "pending" ? "saved" : state));
      return;
    }
    writeBackup(page.id, serverStamp.current, latest.current.content);
    setSaveState((state) => (state === "error" || state === "offline" ? state : "pending"));
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flushRef.current(), 900);
  }, [contentKey, page.id]);

  useEffect(() => {
    if (initial.restored) show("Brought back changes that hadn't been saved last time.", { tone: "success" });
  }, [initial.restored, show]);

  useEffect(() => {
    const onOnline = () => void flushRef.current();
    const onUnload = (event: BeforeUnloadEvent) => {
      if (disposed.current) return;
      if (latest.current.key !== savedKey.current || inflight.current || uploadsActive.current > 0) event.preventDefault();
    };
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void flushRef.current().then((ok) => {
          if (ok) show("All changes are saved.", { tone: "success", duration: 2200 });
        });
      }
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", onUnload);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", onUnload);
      window.removeEventListener("keydown", onKey);
      window.clearTimeout(timer.current);
      if (!disposed.current) void flushRef.current();
    };
  }, [show]);

  const update = useCallback((id: string, change: (block: EditBlock) => EditBlock) => {
    setBlocks((current) => current.map((block) => (block.id === id ? change(block) : block)));
  }, []);

  const insertBlocks = useCallback(
    (index: number, list: EditBlock[], focus: boolean) => {
      if (!list.length) return;
      const room = MAX_BLOCKS - blocksRef.current.length;
      if (room <= 0) {
        show(`A page can have up to ${MAX_BLOCKS} elements. Remove one to add another.`, { tone: "error" });
        return;
      }
      const adding = list.slice(0, room);
      setBlocks((current) => {
        const next = [...current];
        next.splice(Math.min(index, next.length), 0, ...adding);
        return next;
      });
      setFlash({ id: adding[0].id, focus });
    },
    [show],
  );

  const reportProblems = useCallback(
    (problems: string[]) => {
      if (!problems.length) return;
      show(problems.length > 1 ? `${problems[0]} (and ${problems.length - 1} more)` : problems[0], { tone: "error" });
    },
    [show],
  );

  const addFiles = useCallback(
    (files: File[], target: FileTarget) => {
      const problems: string[] = [];
      const photos: EditPhoto[] = [];
      const singles: EditBlock[] = [];
      for (const file of files) {
        const kind = kindOf(file);
        const problem = fileProblem(file, kind);
        if (problem || !kind) {
          problems.push(problem);
          continue;
        }
        const upload = startUpload(file, kind);
        if (kind === "image") {
          photos.push({ key: newId(), src: "", width: 0, height: 0, caption: "", upload });
        } else if (kind === "video") {
          singles.push({ id: newId(), type: "video", source: "file", url: "", src: "", caption: "", upload });
        } else if (kind === "audio") {
          singles.push({ id: newId(), type: "audio", src: "", title: prettyName(file.name), upload });
        } else {
          singles.push({
            id: newId(),
            type: "file",
            src: "",
            title: prettyName(file.name),
            name: file.name,
            size: file.size,
            ext: fileExtension(file.name),
            upload,
          });
        }
      }
      reportProblems(problems);

      const current = blocksRef.current;
      const into =
        "photos" in target ? current.find((block) => block.id === target.photos && block.type === "photos") : undefined;
      const room = into?.type === "photos" ? Math.max(0, MAX_PHOTOS - into.items.length) : 0;
      const joining = photos.slice(0, room);
      const rest = photos.slice(room);
      const made: EditBlock[] = [];
      for (let start = 0; start < rest.length; start += MAX_PHOTOS) {
        made.push({ id: newId(), type: "photos", size: "medium", items: rest.slice(start, start + MAX_PHOTOS) });
      }
      made.push(...singles);
      if (into && rest.length) show(`A gallery holds up to ${MAX_PHOTOS} photos, so the rest start a new one.`);

      if (into && joining.length) {
        setBlocks((list) =>
          list.map((block) => (block.id === into.id && block.type === "photos" ? { ...block, items: [...block.items, ...joining] } : block)),
        );
        if (!made.length) setFlash({ id: into.id, focus: false });
      }
      const index = into ? current.findIndex((block) => block.id === into.id) + 1 : "slot" in target ? target.slot : current.length;
      insertBlocks(index, made, false);
    },
    [startUpload, reportProblems, insertBlocks, show],
  );

  const addPhotos = useCallback((blockId: string, files: File[]) => addFiles(files, { photos: blockId }), [addFiles]);

  const setFile = useCallback(
    (blockId: string, file: File) => {
      const block = blocksRef.current.find((item) => item.id === blockId);
      if (!block || (block.type !== "video" && block.type !== "audio" && block.type !== "file")) return;
      const kind = kindOf(file);
      const expected: UploadKind = block.type;
      if (kind !== expected) {
        const words: Record<UploadKind, string> = { image: "a photo", video: "a video", audio: "a recording", file: "a document" };
        show(`That's ${kind ? words[kind] : "not a file that can be added"}. Please choose ${words[expected]} here.`, { tone: "error" });
        return;
      }
      const problem = fileProblem(file, kind);
      if (problem) {
        show(problem, { tone: "error" });
        return;
      }
      if (block.upload) cancelUpload(block.upload);
      const upload = startUpload(file, kind);
      update(blockId, (current) => {
        if (current.type === "file") {
          return { ...current, upload, name: file.name, size: file.size, ext: fileExtension(file.name), title: current.title || prettyName(file.name) };
        }
        if (current.type === "audio") return { ...current, upload, title: current.title || prettyName(file.name) };
        if (current.type === "video") return { ...current, upload };
        return current;
      });
    },
    [startUpload, cancelUpload, update, show],
  );

  const removeBlock = useCallback(
    (id: string) => {
      const index = blocksRef.current.findIndex((block) => block.id === id);
      const block = blocksRef.current[index];
      if (!block) return;
      setBlocks((current) => current.filter((item) => item.id !== id));
      show(`${BLOCK_LABELS[block.type]} removed.`, {
        action: {
          label: "Undo",
          run: () => {
            setBlocks((current) => {
              if (current.some((item) => item.id === id)) return current;
              const next = [...current];
              next.splice(Math.min(index, next.length), 0, settle(block));
              return next;
            });
            setFlash({ id, focus: false });
          },
        },
      });
    },
    [show, settle],
  );

  const removePhoto = useCallback(
    (blockId: string, key: string) => {
      const block = blocksRef.current.find((item) => item.id === blockId);
      if (block?.type !== "photos") return;
      const index = block.items.findIndex((item) => item.key === key);
      const photo = block.items[index];
      if (!photo) return;
      update(blockId, (current) => (current.type === "photos" ? { ...current, items: current.items.filter((item) => item.key !== key) } : current));
      if (photo.upload && !photo.src && !finished.current.has(photo.upload)) return;
      show("Photo removed.", {
        action: {
          label: "Undo",
          run: () =>
            update(blockId, (current) => {
              if (current.type !== "photos" || current.items.some((item) => item.key === key)) return current;
              const items = [...current.items];
              items.splice(Math.min(index, items.length), 0, photo);
              return settle({ ...current, items });
            }),
        },
      });
    },
    [update, show, settle],
  );

  const moveBlock = useCallback((id: string, step: number) => {
    setBlocks((current) => {
      const from = current.findIndex((block) => block.id === id);
      const to = from + step;
      if (from < 0 || to < 0 || to >= current.length) return current;
      return arrayMove(current, from, to);
    });
  }, []);

  const addOfType = useCallback(
    (type: BlockType, index: number, fromDrag = false) => {
      setChooser(null);
      if (!fromDrag && (type === "photos" || type === "audio" || type === "file")) {
        void pickFiles(type === "photos" ? "image" : type).then((files) => {
          if (files.length) addFiles(files, { slot: index });
        });
        return;
      }
      insertBlocks(index, [blankBlock(type)], !fromDrag || type === "text");
    },
    [addFiles, insertBlocks],
  );

  const display = useCallback((src: string) => previewFor(src) ?? mediaUrl(src, mediaBase), [previewFor, mediaBase]);

  const api = useMemo<EditorApi>(
    () => ({ mediaBase, uploads, display, update, addPhotos, removePhoto, setFile, notify: (text: string) => show(text) }),
    [mediaBase, uploads, display, update, addPhotos, removePhoto, setFile, show],
  );

  useEffect(() => {
    if (!flash) return;
    const element = document.querySelector<HTMLElement>(`[data-block-id="${flash.id}"]`);
    if (!element) return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    element.scrollIntoView({ block: "center", behavior: calm ? "auto" : "smooth" });
    element.classList.add("is-new");
    if (flash.focus) {
      element.querySelector<HTMLElement>('[contenteditable="true"], input[type="url"], input:not([type]), textarea')?.focus({ preventScroll: true });
    }
    const timeout = window.setTimeout(() => element.classList.remove("is-new"), 1600);
    return () => window.clearTimeout(timeout);
  }, [flash]);

  useEffect(() => {
    const onFocus = (event: FocusEvent) => {
      const id = (event.target as Element | null)?.closest?.("[data-block-id]")?.getAttribute("data-block-id");
      if (id) focusedBlock.current = id;
    };
    document.addEventListener("focusin", onFocus);
    return () => document.removeEventListener("focusin", onFocus);
  }, []);

  const afterFocused = useCallback(() => {
    const index = blocksRef.current.findIndex((block) => block.id === focusedBlock.current);
    return index === -1 ? blocksRef.current.length : index + 1;
  }, []);

  useEffect(() => {
    const onFiles = (event: Event) => {
      const files = (event as CustomEvent<File[]>).detail;
      if (Array.isArray(files) && files.length) addFiles(files, { slot: afterFocused() });
    };
    const onPaste = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.("input, textarea, [contenteditable='true'], dialog")) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length) {
        event.preventDefault();
        addFiles(files, { slot: afterFocused() });
        return;
      }
      const text = (event.clipboardData?.getData("text/plain") || "").trim();
      if (!/^https?:\/\/\S+$/i.test(text)) return;
      event.preventDefault();
      const block: EditBlock = videoEmbed(text)
        ? { ...(blankBlock("video") as Extract<EditBlock, { type: "video" }>), url: text }
        : { ...(blankBlock("link") as Extract<EditBlock, { type: "link" }>), url: text };
      insertBlocks(afterFocused(), [block], false);
      show(block.type === "video" ? "Added the video from the link you pasted." : "Added the link you pasted.");
    };
    window.addEventListener("desk:files", onFiles);
    document.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("desk:files", onFiles);
      document.removeEventListener("paste", onPaste);
    };
  }, [addFiles, afterFocused, insertBlocks, show]);

  useEffect(() => {
    let depth = 0;
    let frame = 0;
    const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer?.types ?? []).includes("Files");
    const targetAt = (event: DragEvent): FileTarget | null => {
      const element = event.target as Element | null;
      if (element?.closest?.("[data-own-drop]")) return null;
      const photos = element?.closest?.("[data-photos-drop]")?.getAttribute("data-photos-drop");
      if (photos) return { photos };
      let best: number | null = null;
      let distance = Number.POSITIVE_INFINITY;
      document.querySelectorAll<HTMLElement>("[data-slot]").forEach((slot) => {
        const rect = slot.getBoundingClientRect();
        const gap = Math.abs(event.clientY - (rect.top + rect.height / 2));
        if (gap < distance) {
          distance = gap;
          best = Number(slot.dataset.slot);
        }
      });
      return best === null ? { slot: blocksRef.current.length } : { slot: best };
    };
    const same = (a: FileTarget | null, b: FileTarget | null) => JSON.stringify(a) === JSON.stringify(b);
    const onEnter = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth += 1;
    };
    const onOver = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const next = targetAt(event);
        setFileTarget((current) => (same(current, next) ? current : next));
      });
    };
    const clear = () => {
      depth = 0;
      cancelAnimationFrame(frame);
      setFileTarget(null);
    };
    const onLeave = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) clear();
    };
    const onDrop = (event: DragEvent) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      const target = targetAt(event);
      clear();
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length && target) addFiles(files, target);
    };
    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragover", onOver);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("dragend", clear);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragover", onOver);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("dragend", clear);
    };
  }, [addFiles]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const collision = useCallback<CollisionDetection>((args) => {
    if (String(args.active.id).startsWith("palette:")) {
      const pointer = args.pointerCoordinates;
      const zone = args.droppableRects.get("zone");
      if (!pointer || !zone) return [];
      const inside =
        pointer.x >= zone.left - 60 && pointer.x <= zone.right + 60 && pointer.y >= zone.top - 120 && pointer.y <= zone.bottom + 120;
      if (!inside) return [];
      let best: (typeof args.droppableContainers)[number] | null = null;
      let distance = Number.POSITIVE_INFINITY;
      for (const container of args.droppableContainers) {
        if (!String(container.id).startsWith("slot:")) continue;
        const rect = args.droppableRects.get(container.id);
        if (!rect) continue;
        const gap = Math.abs(pointer.y - (rect.top + rect.height / 2));
        if (gap < distance) {
          distance = gap;
          best = container;
        }
      }
      return best ? [{ id: best.id, data: { droppableContainer: best, value: distance } }] : [];
    }
    return closestCenter({
      ...args,
      droppableContainers: args.droppableContainers.filter((container) => {
        const id = String(container.id);
        return !id.startsWith("slot:") && id !== "zone";
      }),
    });
  }, []);

  const labelFor = useCallback((id: UniqueIdentifier) => {
    const key = String(id);
    if (key.startsWith("palette:")) return `New ${BLOCK_LABELS[key.slice(8) as BlockType].toLowerCase()}`;
    const block = blocksRef.current.find((item) => item.id === key);
    return block ? BLOCK_LABELS[block.type] : "Element";
  }, []);

  const positionOf = useCallback((id: UniqueIdentifier) => {
    const key = String(id);
    if (key.startsWith("slot:")) return Number(key.slice(5)) + 1;
    return blocksRef.current.findIndex((item) => item.id === key) + 1;
  }, []);

  const announcements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) => `Picked up ${labelFor(active.id)}.`,
      onDragOver: ({ active, over }) =>
        over ? `${labelFor(active.id)} is at position ${positionOf(over.id)}.` : `${labelFor(active.id)} is not over the page.`,
      onDragEnd: ({ active, over }) =>
        over ? `${labelFor(active.id)} was placed at position ${positionOf(over.id)}.` : `${labelFor(active.id)} was put back.`,
      onDragCancel: ({ active }) => `Moving cancelled. ${labelFor(active.id)} was put back.`,
    }),
    [labelFor, positionOf],
  );

  function onDragStart(event: DragStartEvent) {
    const id = String(event.active.id);
    setChooser(null);
    setDrag(id.startsWith("palette:") ? { type: "palette", block: id.slice(8) as BlockType } : { type: "block", id });
  }

  function onDragOver(event: DragOverEvent) {
    if (!String(event.active.id).startsWith("palette:")) return;
    const over = event.over ? String(event.over.id) : "";
    setOverSlot(over.startsWith("slot:") ? Number(over.slice(5)) : null);
  }

  function onDragEnd(event: DragEndEvent) {
    const active = String(event.active.id);
    const over = event.over ? String(event.over.id) : "";
    setDrag(null);
    setOverSlot(null);
    if (active.startsWith("palette:")) {
      if (over.startsWith("slot:")) addOfType(active.slice(8) as BlockType, Number(over.slice(5)), true);
      return;
    }
    if (!over || over === active || over.startsWith("slot:")) return;
    setBlocks((current) => {
      const from = current.findIndex((block) => block.id === active);
      const to = current.findIndex((block) => block.id === over);
      return from < 0 || to < 0 ? current : arrayMove(current, from, to);
    });
  }

  function onDragCancel() {
    setDrag(null);
    setOverSlot(null);
  }

  function changeField(key: string, value: FieldValue) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function restoreField(key: string) {
    const before = values[key];
    const uploading = imageUploads[key];
    if (uploading) {
      cancelUpload(uploading);
      setImageUploads((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    }
    setValues((current) => ({ ...current, [key]: originalValue(page, key) }));
    setVersions((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
    const field = page.fields.find((item) => item.key === key);
    show(`“${field?.label ?? key}” is back to the original.`, {
      action: {
        label: "Undo",
        run: () => {
          setValues((current) => ({ ...current, [key]: before }));
          setVersions((current) => ({ ...current, [key]: (current[key] ?? 0) + 1 }));
        },
      },
    });
  }

  function setFieldImage(key: string, file: File) {
    const kind = kindOf(file);
    if (kind !== "image") {
      show("Please choose a photo here.", { tone: "error" });
      return;
    }
    const problem = fileProblem(file, kind);
    if (problem) {
      show(problem, { tone: "error" });
      return;
    }
    const previous = imageUploads[key];
    if (previous) cancelUpload(previous);
    const id = startUpload(file, "image");
    setImageUploads((current) => ({ ...current, [key]: id }));
  }

  function cancelFieldImage(key: string) {
    const id = imageUploads[key];
    if (id) cancelUpload(id);
    setImageUploads((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  async function leave() {
    setConfirm(null);
    await Promise.race([flush(), new Promise((resolve) => window.setTimeout(resolve, 4000))]);
    goBack("pages");
  }

  function back() {
    if (uploads.active > 0) {
      setConfirm("leave");
      return;
    }
    void leave();
  }

  async function publish() {
    setPublishing({ step: "working" });
    window.clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    const { content: sending, key } = latest.current;
    try {
      const { page: saved, result } = await publishPage(token, page.id, sending);
      savedKey.current = key;
      serverStamp.current = saved.updatedAt;
      setLive(saved.live);
      clearBackup(page.id);
      if (latest.current.key === key) setSaveState("saved");
      else timer.current = window.setTimeout(() => void flushRef.current(), 300);
      setPublishing({ step: "done", result });
    } catch (error) {
      if (isSignedOut(error)) {
        signedOut();
        return;
      }
      setPublishing({ step: "confirm", error: errorMessage(error) });
    }
  }

  async function runConfirm() {
    if (confirm !== "discard" && confirm !== "reset") return;
    setBusy(true);
    setConfirmError("");
    window.clearTimeout(timer.current);
    if (inflight.current) await inflight.current;
    try {
      const next = confirm === "discard" ? await discardPage(token, page.id) : (await resetPage(token, page.id)).page;
      disposed.current = true;
      clearBackup(page.id);
      setBusy(false);
      setConfirm(null);
      show(
        confirm === "discard"
          ? "Unpublished changes discarded."
          : live
            ? "The original page will be back on the website in about two minutes."
            : "This page is back to the original.",
        { tone: "success" },
      );
      onReplace(next);
    } catch (error) {
      setBusy(false);
      if (isSignedOut(error)) {
        signedOut();
        return;
      }
      setConfirmError(errorMessage(error));
    }
  }

  useEffect(() => {
    if (!wide) return;
    const timer = window.setTimeout(() => setPreviewWarm(true), 2500);
    return () => window.clearTimeout(timer);
  }, [wide]);

  const warmPreview = () => setPreviewWarm(true);

  function openPreview() {
    const section = document.getElementById("pe-blocks")?.closest("section");
    const lookingAtBlocks = Boolean(section && content.blocks.length && section.getBoundingClientRect().top < window.innerHeight * 0.45);
    setPreviewScroll(lookingAtBlocks ? "blocks" : "top");
    setPublishing({ step: "closed" });
    setPreviewWarm(true);
    setPreviewOpen(true);
  }

  const group = PAGE_GROUPS.find((item) => item.id === page.group)?.label ?? "";
  const siteHost = BLOG_URL.replace(/^https?:\/\//, "");
  const menuItems: MenuItem[] = [{ label: "Open this page on the website", href: siteLink(page.path), icon: <IconExternal size={16} /> }];
  if (status === "changed") {
    menuItems.push({ label: live ? "Discard unpublished changes" : "Discard all changes", onSelect: () => setConfirm("discard") });
  }
  if (live || status === "changed") {
    menuItems.push({ label: "Restore the original page", onSelect: () => setConfirm("reset"), danger: true });
  }

  const pendingUploads = uploads.active;
  const unfinished = blocks.filter((block) => !toBlocks([block]).length).length;

  let publishControl: ReactNode;
  if (pendingUploads > 0) {
    publishControl = (
      <button type="button" className="btn btn--primary" disabled>
        <span className="spinner" aria-hidden="true" />
        Uploading…
      </button>
    );
  } else if (status === "changed") {
    publishControl = (
      <button
        type="button"
        className="btn btn--primary"
        onPointerEnter={warmPreview}
        onClick={() => setPublishing({ step: "confirm", error: "" })}
      >
        {live && wide ? "Publish changes" : "Publish"}
      </button>
    );
  } else if (status === "published") {
    publishControl = (
      <span className="published">
        <IconCheck size={16} />
        Published
      </span>
    );
  } else {
    publishControl = <span className="published published--muted">No changes yet</span>;
  }

  const previewNotes: string[] = [];
  if (pendingUploads) {
    previewNotes.push(
      pendingUploads === 1
        ? "A file is still uploading. It will appear here when it's done."
        : `${pendingUploads} files are still uploading. They will appear here when they're done.`,
    );
  }
  if (unfinished) {
    previewNotes.push(unfinished === 1 ? "One element isn't finished, so it isn't shown." : `${unfinished} elements aren't finished, so they aren't shown.`);
  }
  if (uploads.failed) {
    previewNotes.push(
      uploads.failed === 1 ? "One file couldn't be uploaded, so it's left out." : `${uploads.failed} files couldn't be uploaded, so they're left out.`,
    );
  }
  const brokenFields = page.fields.filter((field) => fieldProblem(field, values[field.key])).map((field) => `“${field.label}”`);
  if (brokenFields.length) {
    previewNotes.push(
      brokenFields.length === 1
        ? `${brokenFields[0]} needs fixing, so the original is shown for now.`
        : `${brokenFields.slice(0, -1).join(", ")} and ${brokenFields[brokenFields.length - 1]} need fixing, so the originals are shown for now.`,
    );
  }

  const lines = publishing.step === "confirm" || publishing.step === "working" ? summarizeChanges(page, content, live) : [];
  const shownLines = lines.slice(0, 8);

  const dragBlock = drag?.type === "block" ? blocks.find((block) => block.id === drag.id) : undefined;
  const activeSlot = drag?.type === "palette" ? overSlot : fileTarget && "slot" in fileTarget ? fileTarget.slot : null;
  const photoTarget = fileTarget && "photos" in fileTarget ? fileTarget.photos : null;

  const slot = (index: number) => (
    <Slot
      index={index}
      active={activeSlot === index}
      open={chooser === index}
      onOpen={() => setChooser(index)}
      onClose={() => setChooser(null)}
      onChoose={(type) => addOfType(type, index)}
    />
  );

  return (
    <EditorContext.Provider value={api}>
      <DndContext
        sensors={sensors}
        collisionDetection={collision}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        accessibility={{ announcements }}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
        onDragCancel={onDragCancel}
      >
        <div className={`screen pe${wide ? " pe--wide" : " pe--narrow"}${fileTarget ? " is-file-drag" : ""}`}>
          <header className="bar bar--editor">
            <button type="button" className="bar-link bar-link--back" aria-label="Back to website pages" onClick={back}>
              <IconArrowLeft size={17} />
              <span>Website pages</span>
            </button>
            <span className="bar__title">
              <span className="bar__page">{page.label}</span>
              <span className={`save save--${saveState}`} role="status">
                {SAVE_LABELS[saveState]}
              </span>
            </span>
            <div className="bar__end">
              <Menu label="More" trigger={<IconMore size={20} />} items={menuItems} className="menu--right" />
              <button
                type="button"
                className="btn btn--ghost btn--preview"
                aria-label="Preview the page"
                title="See the page exactly as it will look on the website"
                onClick={openPreview}
                onPointerEnter={warmPreview}
                onFocus={warmPreview}
                onTouchStart={warmPreview}
              >
                <IconEye size={18} />
                <span>Preview</span>
              </button>
              {publishControl}
            </div>
          </header>

          <div className="pe-layout">
            <main className="pe-main">
              <div className="pe-head">
                <p className="pe-kicker">{group}</p>
                <h1 className="pe-title">{page.label}</h1>
                <p className="pe-meta">
                  <StatusTag status={status} />
                  <a className="pe-link" href={siteLink(page.path)} target="_blank" rel="noopener noreferrer">
                    {siteHost}
                    {page.path === "/" ? "" : page.path}
                    <IconExternal size={14} />
                  </a>
                </p>
                <p className="pe-lede">
                  {status === "original"
                    ? "Everything you change is saved here as you go. The website only changes when you press Publish."
                    : status === "changed"
                      ? "Your changes are saved here. Press Publish to put them on the website."
                      : "The website shows your latest version."}
                </p>
              </div>

              <section className="pe-section" aria-labelledby="pe-text">
                <div className="pe-section__head">
                  <h2 id="pe-text">Text on the page</h2>
                </div>
                {page.group === "scripts" ? (
                  <p className="pe-section__hint">The script itself stays exactly as it is in the book.</p>
                ) : null}
                <div className="panel">
                  <PageTextCard
                    page={page}
                    values={values}
                    changed={changed}
                    versions={versions}
                    imageUploads={imageUploads}
                    onChange={changeField}
                    onUseOriginal={restoreField}
                    onImage={setFieldImage}
                    onCancelImage={cancelFieldImage}
                  />
                </div>
              </section>

              <section className="pe-section" aria-labelledby="pe-blocks">
                <div className="pe-section__head">
                  <h2 id="pe-blocks">Added to the page</h2>
                </div>
                <p className="pe-section__hint">{page.blocksHint}</p>

                <BlocksZone className={`blocks${drag?.type === "block" ? " is-sorting" : ""}${drag?.type === "palette" ? " is-receiving" : ""}`}>
                  {blocks.length === 0 ? (
                    <EmptyZone active={activeSlot === 0} wide={wide} onChoose={(type) => addOfType(type, 0)} />
                  ) : (
                    <SortableContext items={blocks.map((block) => block.id)} strategy={verticalListSortingStrategy}>
                      {blocks.map((block, index) => (
                        <SortableBlock
                          key={block.id}
                          block={block}
                          index={index}
                          count={blocks.length}
                          highlight={photoTarget === block.id}
                          slot={slot(index)}
                          onMove={moveBlock}
                          onRemove={removeBlock}
                        />
                      ))}
                      {slot(blocks.length)}
                    </SortableContext>
                  )}
                </BlocksZone>
              </section>
            </main>

            {wide ? <Palette onAdd={(type) => addOfType(type, blocksRef.current.length)} /> : null}
          </div>

          {!wide && !typing ? <AddBar onAdd={(type) => addOfType(type, blocksRef.current.length)} /> : null}
        </div>

        <DragOverlay dropAnimation={null}>
          {drag?.type === "palette" ? (
            <div className="tile tile--overlay">
              <BlockIcon type={drag.block} size={22} />
              <span>{BLOCK_LABELS[drag.block]}</span>
            </div>
          ) : dragBlock ? (
            <div className="card-ghost">
              <BlockIcon type={dragBlock.type} size={18} />
              <span>{BLOCK_LABELS[dragBlock.type]}</span>
              {blockSummary(dragBlock) ? <span className="card-ghost__meta">{blockSummary(dragBlock)}</span> : null}
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <PagePreview
        open={previewOpen}
        warm={previewWarm}
        kind="page"
        id={page.id}
        label={page.label}
        path={page.path}
        content={content}
        contentKey={contentKey}
        mediaBase={mediaBase}
        scroll={previewScroll}
        status={status}
        action={pendingUploads > 0 || status === "changed" ? publishControl : null}
        notes={previewNotes}
        onClose={() => setPreviewOpen(false)}
      />

      <Dialog
        open={publishing.step !== "closed"}
        title={publishing.step === "done" ? (publishing.result === "failed" ? "Not on the website yet" : "Published") : "Publish these changes?"}
        onClose={() => publishing.step !== "working" && setPublishing({ step: "closed" })}
      >
        {publishing.step === "confirm" || publishing.step === "working" ? (
          <>
            <p>The website will show them in about two minutes.</p>
            {shownLines.length ? (
              <ul className="changes">
                {shownLines.map((line, index) => (
                  <li key={index}>{line}</li>
                ))}
                {lines.length > shownLines.length ? <li className="changes__more">and {lines.length - shownLines.length} more</li> : null}
              </ul>
            ) : null}
            {uploads.failed ? (
              <p className="note note--warn">
                {uploads.failed === 1 ? "One file couldn't be uploaded and" : `${uploads.failed} files couldn't be uploaded and`} will be left out.
              </p>
            ) : null}
            {unfinished ? (
              <p className="note">
                {unfinished === 1 ? "One element isn't finished yet, so it" : `${unfinished} elements aren't finished yet, so they`} won&apos;t show
                until you complete {unfinished === 1 ? "it" : "them"}.
              </p>
            ) : null}
            {publishing.step === "confirm" && publishing.error ? <p className="error">{publishing.error}</p> : null}
            <div className="dialog__actions">
              {!previewOpen ? (
                <button type="button" className="btn-text dialog__aside" disabled={publishing.step === "working"} onClick={openPreview}>
                  <IconEye size={16} />
                  See a preview first
                </button>
              ) : null}
              <button type="button" className="btn btn--ghost" disabled={publishing.step === "working"} onClick={() => setPublishing({ step: "closed" })}>
                Cancel
              </button>
              <button type="button" className="btn btn--primary" disabled={publishing.step === "working"} onClick={() => void publish()}>
                {publishing.step === "working" ? "Publishing…" : publishing.step === "confirm" && publishing.error ? "Try again" : "Publish"}
              </button>
            </div>
          </>
        ) : null}
        {publishing.step === "done" ? (
          <>
            <p>
              {publishing.result === "ok"
                ? "The page will update in about two minutes. If it looks the same, refresh it a little later."
                : publishing.result === "failed"
                  ? "Your changes are saved, but the website couldn't be updated just now. Please press Publish again in a few minutes."
                  : "Saved on this computer only, because GitHub isn't connected here."}
            </p>
            <div className="dialog__actions">
              {publishing.result !== "failed" ? (
                <a className="btn btn--ghost" href={siteLink(page.path)} target="_blank" rel="noopener noreferrer">
                  Open the page
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
        title={
          confirm === "leave"
            ? "Files are still uploading"
            : confirm === "discard"
              ? live
                ? "Discard unpublished changes?"
                : "Discard all changes?"
              : "Restore the original page?"
        }
        onClose={() => {
          if (busy) return;
          setConfirm(null);
          setConfirmError("");
        }}
      >
        <p>
          {confirm === "leave"
            ? "If you leave now, the files that haven't finished uploading will be lost. Everything else is saved."
            : confirm === "discard"
              ? live
                ? "The page goes back to what's on the website now. Changes you haven't published will be lost."
                : "The page goes back to the original. Everything you changed or added here will be lost."
              : live
                ? "All your text changes and added elements will be removed, and the website will show the original page again."
                : "All your text changes and added elements will be removed."}
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
            {confirm === "leave" ? "Stay" : "Cancel"}
          </button>
          {confirm === "leave" ? (
            <button type="button" className="btn btn--danger" onClick={() => void leave()}>
              Leave anyway
            </button>
          ) : (
            <button type="button" className="btn btn--danger" disabled={busy} onClick={() => void runConfirm()}>
              {busy ? "One moment…" : confirm === "discard" ? "Discard" : "Restore original"}
            </button>
          )}
        </div>
      </Dialog>

      {toasts.node}
    </EditorContext.Provider>
  );
}

export function StatusTag({ status }: { status: PageStatus }) {
  if (status === "changed") return <span className="tag tag--changed">Changes not published</span>;
  if (status === "published") return <span className="tag tag--live">Published</span>;
  return <span className="tag">Original</span>;
}

function BlocksZone({ className, children }: { className: string; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: "zone" });
  return (
    <div ref={setNodeRef} className={className}>
      {children}
    </div>
  );
}

function SortableBlock({
  block,
  index,
  count,
  highlight,
  slot,
  onMove,
  onRemove,
}: {
  block: EditBlock;
  index: number;
  count: number;
  highlight: boolean;
  slot: ReactNode;
  onMove: (id: string, step: number) => void;
  onRemove: (id: string) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={`blk${isDragging ? " is-dragging" : ""}${highlight ? " is-drop-target" : ""}`}
    >
      {slot}
      <BlockCard
        block={block}
        index={index}
        count={count}
        handle={{ ref: setActivatorNodeRef, props: { ...attributes, ...listeners } }}
        onMove={onMove}
        onRemove={onRemove}
      />
      {highlight ? <p className="blk__drop">Drop to add to these photos</p> : null}
    </div>
  );
}

function Chooser({ onChoose, onClose, autoFocus = false }: { onChoose: (type: BlockType) => void; onClose?: () => void; autoFocus?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!autoFocus || !ref.current) return;
    ref.current.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
    ref.current.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, [autoFocus]);
  return (
    <div
      ref={ref}
      className="chooser"
      role="group"
      aria-label="Choose what to add"
      onKeyDown={(event) => {
        if (event.key === "Escape" && onClose) {
          event.stopPropagation();
          onClose();
        }
      }}
    >
      {BLOCK_ORDER.map((type) => (
        <button key={type} type="button" className="chooser__btn" onClick={() => onChoose(type)}>
          <BlockIcon type={type} size={20} />
          <span>{BLOCK_LABELS[type]}</span>
        </button>
      ))}
      {onClose ? (
        <button type="button" className="icon-btn chooser__close" aria-label="Close" onClick={onClose}>
          <IconClose size={18} />
        </button>
      ) : null}
    </div>
  );
}

function Slot({
  index,
  active,
  open,
  onOpen,
  onClose,
  onChoose,
}: {
  index: number;
  active: boolean;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onChoose: (type: BlockType) => void;
}) {
  const { setNodeRef } = useDroppable({ id: `slot:${index}` });
  return (
    <div ref={setNodeRef} className={`slot${active ? " is-active" : ""}${open ? " is-open" : ""}`} data-slot={index}>
      <div className="slot__gap" aria-hidden={!active}>
        {active ? "Drop to add here" : null}
      </div>
      {open ? (
        <Chooser onChoose={onChoose} onClose={onClose} autoFocus />
      ) : (
        <button type="button" className="slot__plus" aria-label={`Add something at position ${index + 1}`} title="Add here" onClick={onOpen}>
          <IconPlus size={16} />
        </button>
      )}
    </div>
  );
}

function EmptyZone({ active, wide, onChoose }: { active: boolean; wide: boolean; onChoose: (type: BlockType) => void }) {
  const { setNodeRef } = useDroppable({ id: "slot:0" });
  return (
    <div ref={setNodeRef} data-slot={0} className={`empty-zone${active ? " is-active" : ""}`}>
      <p className="empty-zone__title">{active ? "Drop to add it here" : "Nothing added yet"}</p>
      <p className="empty-zone__text">
        The page looks exactly as it does now.{" "}
        {wide
          ? "Pick something below, drag it in from the panel on the right, or drop photos and files from your computer."
          : "Pick something below to add photos, a video, a document and more."}
      </p>
      <Chooser onChoose={onChoose} />
    </div>
  );
}

function PaletteTile({ type, onAdd }: { type: BlockType; onAdd: (type: BlockType) => void }) {
  const { listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}` });
  const pointer = { ...(listeners ?? {}) };
  delete pointer.onKeyDown;
  return (
    <button ref={setNodeRef} type="button" className={`tile${isDragging ? " is-dragging" : ""}`} {...pointer} onClick={() => onAdd(type)}>
      <BlockIcon type={type} size={22} />
      <span>{BLOCK_LABELS[type]}</span>
    </button>
  );
}

function Palette({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <aside className="palette" aria-label="Add to the page">
      <div className="palette__inner">
        <p className="palette__title">Add to the page</p>
        <div className="palette__grid">
          {BLOCK_ORDER.map((type) => (
            <PaletteTile key={type} type={type} onAdd={onAdd} />
          ))}
        </div>
        <p className="palette__hint">Drag one onto the page to place it, or click to add it at the end.</p>
        <p className="palette__hint">Photos and files can also be dropped straight onto the page from your computer.</p>
      </div>
    </aside>
  );
}

function AddBar({ onAdd }: { onAdd: (type: BlockType) => void }) {
  return (
    <nav className="addbar" aria-label="Add to the page">
      {BLOCK_ORDER.map((type) => (
        <button key={type} type="button" className="addbar__btn" onClick={() => onAdd(type)}>
          <BlockIcon type={type} size={21} />
          <span>{BLOCK_LABELS[type]}</span>
        </button>
      ))}
    </nav>
  );
}
