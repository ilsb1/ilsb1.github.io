import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
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

type Props = {
  initialHtml: string;
  onChange: (html: string) => void;
  header: ReactNode;
  footer: ReactNode;
};

export type EditorHandle = { focus: () => void };

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

const Editor = forwardRef<EditorHandle, Props>(function Editor({ initialHtml, onChange, header, footer }, ref) {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  const startingHtml = useRef(initialHtml);
  const refreshTimer = useRef(0);
  const [empty, setEmpty] = useState(true);
  const [marks, setMarks] = useState<Marks>(NO_MARKS);
  const [link, setLink] = useState<LinkDraft | null>(null);
  const [linkError, setLinkError] = useState("");

  const emit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setEmpty(isVisuallyEmpty(editor));
    onChange(editor.innerHTML);
  }, [onChange]);

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

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const editor = editorRef.current;
    if (!editor) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
      event.preventDefault();
      openLink();
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

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
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

  useImperativeHandle(ref, () => ({ focus: () => restoreSelection() }));

  return (
    <div className="editor">
      <div className="toolbar-wrap">
        <div className="toolbar" role="toolbar" aria-label="Formatting">
          <select
            className="tb-select"
            aria-label="Text style"
            value={marks.block}
            onChange={(event) => {
              const editor = editorRef.current;
              const style = event.target.value as BlockStyle;
              if (editor) run(() => applyBlockStyle(editor, style));
            }}
          >
            {BLOCK_STYLES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="tb-sep" aria-hidden="true" />
          <ToolButton label="Bold" active={marks.bold} onClick={() => run(() => document.execCommand("bold"))}>
            <b>B</b>
          </ToolButton>
          <ToolButton label="Italic" active={marks.italic} onClick={() => run(() => document.execCommand("italic"))}>
            <i>I</i>
          </ToolButton>
          <select
            className="tb-select tb-select--size"
            aria-label="Text size"
            value={marks.size}
            onChange={(event) => {
              const size = event.target.value as SizeName;
              run(() => applySize(size));
            }}
          >
            {SIZES.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
          <span className="tb-sep" aria-hidden="true" />
          <ToolButton
            label="Bulleted list"
            active={marks.list === "bullets"}
            onClick={() => run(() => document.execCommand("insertUnorderedList"))}
          >
            <IconBullets />
          </ToolButton>
          <ToolButton
            label="Numbered list"
            active={marks.list === "numbers"}
            onClick={() => run(() => document.execCommand("insertOrderedList"))}
          >
            <IconNumbers />
          </ToolButton>
          <span className="tb-sep" aria-hidden="true" />
          <ToolButton label="Link" active={marks.link} onClick={openLink} wide>
            <IconLink />
            <span>Link</span>
          </ToolButton>
        </div>
      </div>

      <div className="page">
        {header}
        <div
          ref={editorRef}
          className={`prose page__body${empty ? " is-empty" : ""}`}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Your post"
          data-placeholder="Start writing here…"
          spellCheck
          onInput={() => {
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
          }}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          onDrop={(event) => event.preventDefault()}
        />
        {footer}
      </div>

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
    </div>
  );
});

export default Editor;

function ToolButton({
  label,
  active,
  wide = false,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  wide?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`tb-btn${active ? " is-active" : ""}${wide ? " tb-btn--wide" : ""}`}
      aria-label={label}
      aria-pressed={active}
      title={label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
