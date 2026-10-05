import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { flushSync } from "react-dom";
import { safeHref, sanitizeHtml } from "../../shared/sanitize.js";
import Dialog from "./Dialog";
import {
  BLOCK_STYLES,
  SIZES,
  applyBlockStyle,
  applySize,
  blockStyleAt,
  closestIn,
  ensureParagraph,
  escapeHtml,
  isVisuallyEmpty,
  listAt,
  normalizeEditor,
  placeCaretAtEnd,
  plainToHtml,
  prepareForEditing,
  prettyUrl,
  rangeIn,
  sizeAt,
  type BlockStyle,
  type ListKind,
  type SizeName,
} from "./editorDom";
import { IconBullets, IconLink, IconNumbers } from "./icons";

type Marks = { bold: boolean; italic: boolean; link: boolean; block: BlockStyle; size: SizeName; list: ListKind };

type LinkDraft = { text: string; href: string; editing: boolean; selected: string };

const NO_MARKS: Marks = { bold: false, italic: false, link: false, block: "normal", size: "normal", list: null };

function sameMarks(a: Marks, b: Marks) {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.link === b.link &&
    a.block === b.block &&
    a.size === b.size &&
    a.list === b.list
  );
}

export type RichText = ReturnType<typeof useRichText>;

/** The shared heart of every text box: formatting, links, and pasting from Word or Google Docs. */
export function useRichText({ initialHtml, onChange }: { initialHtml: string; onChange: (html: string) => void }) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  const startingHtml = useRef(initialHtml);
  const refreshTimer = useRef(0);
  const changeRef = useRef(onChange);
  const [empty, setEmpty] = useState(true);
  const [focused, setFocused] = useState(false);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [link, setLink] = useState<LinkDraft | null>(null);
  const [linkError, setLinkError] = useState("");

  useLayoutEffect(() => {
    changeRef.current = onChange;
  }, [onChange]);

  const emit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setEmpty(isVisuallyEmpty(editor));
    changeRef.current(editor.innerHTML);
  }, []);

  const refresh = useCallback(() => {
    const editor = editorRef.current;
    const range = editor ? rangeIn(editor) : null;
    if (!editor || !range) return;
    lastRange.current = range.cloneRange();
    const node = range.startContainer;
    const next: Marks = {
      bold: document.queryCommandState("bold"),
      italic: document.queryCommandState("italic"),
      link: Boolean(closestIn(node, "a", editor)),
      block: blockStyleAt(node, editor),
      size: sizeAt(node, editor),
      list: listAt(node, editor),
    };
    setMarks((current) => (sameMarks(current, next) ? current : next));
  }, []);

  const scheduleRefresh = useCallback(() => {
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(refresh, 0);
  }, [refresh]);

  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.innerHTML = sanitizeHtml(startingHtml.current) || "";
    prepareForEditing(editor);
    setEmpty(isVisuallyEmpty(editor));
    try {
      document.execCommand("defaultParagraphSeparator", false, "p");
      document.execCommand("styleWithCSS", false, "false");
    } catch {
      /* not supported */
    }
  }, []);

  useEffect(() => {
    document.addEventListener("selectionchange", scheduleRefresh);
    return () => {
      document.removeEventListener("selectionchange", scheduleRefresh);
      window.clearTimeout(refreshTimer.current);
    };
  }, [scheduleRefresh]);

  function restoreSelection() {
    const editor = editorRef.current;
    if (!editor) return false;
    if (document.activeElement === editor && rangeIn(editor)) return true;
    editor.focus({ preventScroll: true });
    const saved = lastRange.current;
    if (saved && editor.contains(saved.commonAncestorContainer)) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(saved);
    } else {
      placeCaretAtEnd(editor);
    }
    return true;
  }

  function finish() {
    const editor = editorRef.current;
    if (!editor) return;
    normalizeEditor(editor);
    emit();
    scheduleRefresh();
  }

  function run(action: () => void) {
    if (!restoreSelection()) return;
    action();
    finish();
  }

  function openLink() {
    const editor = editorRef.current;
    if (!editor) return;
    restoreSelection();
    let range = rangeIn(editor);
    if (!range) return;
    const existing = closestIn(range.startContainer, "a", editor);
    if (existing) {
      const whole = document.createRange();
      whole.selectNodeContents(existing);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(whole);
      range = whole;
    }
    lastRange.current = range.cloneRange();
    const selected = range.toString();
    setLinkError("");
    setLink({
      text: existing ? existing.textContent || "" : selected,
      href: existing ? existing.getAttribute("href") || "" : "",
      editing: Boolean(existing),
      selected,
    });
  }

  function saveLink() {
    if (!link) return;
    const href = safeHref(link.href);
    if (!href) {
      setLinkError("That doesn't look like a web address. Try something like example.com");
      return;
    }
    flushSync(() => setLink(null));
    restoreSelection();
    const label = link.text.replace(/\s+/g, " ").trim();
    const selected = link.selected.replace(/\s+/g, " ").trim();
    if (selected && (!label || label === selected)) {
      document.execCommand("createLink", false, href);
    } else {
      const text = label || prettyUrl(href);
      document.execCommand("insertHTML", false, `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`);
    }
    window.getSelection()?.collapseToEnd();
    finish();
  }

  function removeLink() {
    flushSync(() => setLink(null));
    restoreSelection();
    document.execCommand("unlink");
    window.getSelection()?.collapseToEnd();
    finish();
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const editor = editorRef.current;
    if (!editor) return;
    const mod = event.metaKey || event.ctrlKey;
    if (mod && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openLink();
      return;
    }
    if (mod && !event.shiftKey && (event.key.toLowerCase() === "b" || event.key.toLowerCase() === "i")) {
      event.preventDefault();
      document.execCommand(event.key.toLowerCase() === "b" ? "bold" : "italic");
      finish();
      return;
    }
    if (event.key === "Tab") {
      const range = rangeIn(editor);
      if (range && closestIn(range.startContainer, "li", editor)) {
        event.preventDefault();
        document.execCommand(event.shiftKey ? "outdent" : "indent");
        finish();
      }
    }
  }

  function onPaste(event: ClipboardEvent<HTMLDivElement>) {
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    event.preventDefault();
    if (!html && !text) {
      const files = Array.from(event.clipboardData.files);
      if (files.length) window.dispatchEvent(new CustomEvent<File[]>("desk:files", { detail: files }));
      return;
    }
    const editor = editorRef.current;
    if (!editor) return;
    const range = rangeIn(editor);
    const trimmed = text.trim();
    const asUrl = !html && trimmed && !/\s/.test(trimmed) && /^(https?:\/\/|www\.)/i.test(trimmed) ? safeHref(trimmed) : null;
    if (asUrl) {
      if (range && !range.collapsed && range.toString().trim()) {
        document.execCommand("createLink", false, asUrl);
        window.getSelection()?.collapseToEnd();
      } else {
        document.execCommand("insertHTML", false, `<a href="${escapeHtml(asUrl)}">${escapeHtml(prettyUrl(asUrl))}</a>`);
      }
    } else if (!html && !/\n/.test(trimmed)) {
      document.execCommand("insertText", false, text);
    } else {
      const clean = html ? sanitizeHtml(html) : plainToHtml(text);
      if (clean) document.execCommand("insertHTML", false, clean);
    }
    finish();
  }

  function onInput() {
    const editor = editorRef.current;
    if (!editor) return;
    if (ensureParagraph(editor)) {
      const caret = document.createRange();
      caret.setStart(editor.firstChild as Node, 0);
      caret.collapse(true);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(caret);
    }
    normalizeEditor(editor);
    emit();
  }

  const linkDialog: ReactNode = (
    <Dialog open={link !== null} title={link?.editing ? "Change link" : "Add a link"} onClose={() => setLink(null)}>
      {link ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            saveLink();
          }}
        >
          <label className="field">
            <span>Text to show</span>
            <input
              value={link.text}
              placeholder="The words readers will click"
              data-autofocus={link.text ? undefined : ""}
              onChange={(event) => setLink({ ...link, text: event.target.value })}
            />
          </label>
          <label className="field">
            <span>Web address</span>
            <input
              value={link.href}
              placeholder="e.g. example.com"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              data-autofocus={link.text ? "" : undefined}
              onChange={(event) => {
                setLink({ ...link, href: event.target.value });
                setLinkError("");
              }}
            />
          </label>
          {linkError ? (
            <p className="error" role="alert">
              {linkError}
            </p>
          ) : null}
          <div className="dialog__actions">
            {link.editing ? (
              <button type="button" className="text-btn text-btn--danger dialog__aside" onClick={removeLink}>
                Remove link
              </button>
            ) : null}
            <button type="button" className="btn btn--ghost" onClick={() => setLink(null)}>
              Cancel
            </button>
            <button type="submit" className="btn btn--primary" disabled={!link.href.trim()}>
              {link.editing ? "Save" : "Add link"}
            </button>
          </div>
        </form>
      ) : null}
    </Dialog>
  );

  return {
    editorRef,
    empty,
    focused,
    marks,
    linkDialog,
    focus: () => restoreSelection(),
    setBlockStyle: (style: BlockStyle) => {
      const editor = editorRef.current;
      if (editor) run(() => applyBlockStyle(editor, style));
    },
    bold: () => run(() => document.execCommand("bold")),
    italic: () => run(() => document.execCommand("italic")),
    setSize: (size: SizeName) => run(() => applySize(size)),
    bullets: () => run(() => document.execCommand("insertUnorderedList")),
    numbers: () => run(() => document.execCommand("insertOrderedList")),
    openLink,
    editableProps: {
      ref: editorRef,
      contentEditable: true,
      suppressContentEditableWarning: true,
      role: "textbox",
      "aria-multiline": true,
      spellCheck: true,
      onInput,
      onKeyDown,
      onPaste,
      onFocus: () => setFocused(true),
      onBlur: () => setFocused(false),
      onDrop: (event: React.DragEvent) => event.preventDefault(),
    } as const,
  };
}

export function Toolbar({ rich, sizes = false, className = "" }: { rich: RichText; sizes?: boolean; className?: string }) {
  const { marks } = rich;
  return (
    <div className={`toolbar ${className}`.trim()} role="toolbar" aria-label="Formatting">
      <select
        className="tb-select"
        aria-label="Text style"
        value={marks.block}
        onChange={(event) => rich.setBlockStyle(event.target.value as BlockStyle)}
      >
        {BLOCK_STYLES.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
      <span className="tb-sep" aria-hidden="true" />
      <ToolButton label="Bold" shortcut="B" active={marks.bold} onClick={rich.bold}>
        <b>B</b>
      </ToolButton>
      <ToolButton label="Italic" shortcut="I" active={marks.italic} onClick={rich.italic}>
        <i>I</i>
      </ToolButton>
      {sizes ? (
        <select
          className="tb-select tb-select--size"
          aria-label="Text size"
          value={marks.size}
          onChange={(event) => rich.setSize(event.target.value as SizeName)}
        >
          {SIZES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      ) : null}
      <span className="tb-sep" aria-hidden="true" />
      <ToolButton label="Bulleted list" active={marks.list === "bullets"} onClick={rich.bullets}>
        <IconBullets />
      </ToolButton>
      <ToolButton label="Numbered list" active={marks.list === "numbers"} onClick={rich.numbers}>
        <IconNumbers />
      </ToolButton>
      <span className="tb-sep" aria-hidden="true" />
      <ToolButton label="Link" shortcut="K" active={marks.link} onClick={rich.openLink} wide>
        <IconLink />
        <span>Link</span>
      </ToolButton>
    </div>
  );
}

const IS_MAC = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

function ToolButton({
  label,
  shortcut,
  active,
  wide = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active: boolean;
  wide?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  const title = shortcut ? `${label} (${IS_MAC ? "⌘" : "Ctrl+"}${shortcut})` : label;
  return (
    <button
      type="button"
      className={`tb-btn${active ? " is-active" : ""}${wide ? " tb-btn--wide" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
