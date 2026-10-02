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
import { safeHref, sanitizeHtml } from "../../shared/sanitize.js";
import {
  BLOCK_STYLES,
  SIZES,
  applyBlockStyle,
  applySize,
  blockStyleAt,
  caretRect,
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
import {
  IconBullets,
  IconChevronDown,
  IconClearFormat,
  IconDivider,
  IconExternal,
  IconLink,
  IconNumbers,
  IconQuote,
  IconRedo,
  IconUndo,
} from "./icons";
import { MOD } from "./format";

type Props = {
  initialHtml: string;
  onChange: (html: string) => void;
  header: ReactNode;
  onHint: (message: string) => void;
  onSaveShortcut: () => void;
};

export type DeskEditorHandle = {
  focus: () => void;
  openLink: () => void;
};

type Marks = {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  block: BlockStyle;
  size: SizeName;
  list: ListKind;
};

type Spot = { x: number; y: number; below: boolean };

type LinkDraft = Spot & {
  text: string;
  href: string;
  editing: boolean;
  selected: string;
};

const EMPTY_MARKS: Marks = {
  bold: false,
  italic: false,
  underline: false,
  block: "normal",
  size: "normal",
  list: null,
};

const TOP_CLEARANCE = 132;

function sameMarks(a: Marks, b: Marks) {
  return (
    a.bold === b.bold &&
    a.italic === b.italic &&
    a.underline === b.underline &&
    a.block === b.block &&
    a.size === b.size &&
    a.list === b.list
  );
}

function spotFor(rect: DOMRect, height: number): Spot {
  const center = rect.left + rect.width / 2;
  const x = Math.min(Math.max(center, 180), window.innerWidth - 180);
  const above = rect.top - height - 10;
  if (above < TOP_CLEARANCE) return { x, y: rect.bottom + 10, below: true };
  return { x, y: above, below: false };
}

const DeskEditor = forwardRef<DeskEditorHandle, Props>(function DeskEditor(
  { initialHtml, onChange, header, onHint, onSaveShortcut },
  ref,
) {
  const editorRef = useRef<HTMLDivElement>(null);
  const pageRef = useRef<HTMLDivElement>(null);
  const lastRange = useRef<Range | null>(null);
  const pointerDown = useRef(false);
  const dragInside = useRef(false);
  const frame = useRef(0);
  const startingHtml = useRef(initialHtml);
  const [empty, setEmpty] = useState(true);
  const [marks, setMarks] = useState<Marks>(EMPTY_MARKS);
  const [bubble, setBubble] = useState<Spot | null>(null);
  const [linkView, setLinkView] = useState<(Spot & { href: string }) | null>(null);
  const [linkDraft, setLinkDraft] = useState<LinkDraft | null>(null);
  const [linkError, setLinkError] = useState("");
  const [menu, setMenu] = useState<"style" | "size" | null>(null);
  const linkDraftRef = useRef(linkDraft);
  linkDraftRef.current = linkDraft;

  const emit = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    setEmpty(isVisuallyEmpty(editor));
    onChange(editor.innerHTML);
  }, [onChange]);

  const refresh = useCallback(() => {
    const editor = editorRef.current;
    if (!editor) return;
    const range = rangeIn(editor);
    if (!range) {
      setBubble(null);
      setLinkView(null);
      return;
    }
    lastRange.current = range.cloneRange();
    const node = range.startContainer;
    const inQuote = Boolean(closestIn(node, "blockquote", editor));
    const next: Marks = {
      bold: document.queryCommandState("bold"),
      italic: inQuote ? Boolean(closestIn(node, "i, em", editor)) : document.queryCommandState("italic"),
      underline: document.queryCommandState("underline") && !closestIn(node, "a", editor),
      block: blockStyleAt(node, editor),
      size: sizeAt(node, editor),
      list: listAt(node, editor),
    };
    setMarks((current) => (sameMarks(current, next) ? current : next));

    if (linkDraftRef.current) {
      setBubble(null);
      setLinkView(null);
      return;
    }

    if (!range.collapsed && !pointerDown.current && range.toString().trim()) {
      const rect = range.getBoundingClientRect();
      setBubble(rect.width || rect.height ? spotFor(rect, 44) : null);
    } else {
      setBubble(null);
    }

    const link = range.collapsed ? closestIn(node, "a", editor) : null;
    if (link) {
      const rect = link.getBoundingClientRect();
      setLinkView({
        x: Math.min(Math.max(rect.left + rect.width / 2, 180), window.innerWidth - 180),
        y: rect.bottom + 8,
        below: true,
        href: link.getAttribute("href") || "",
      });
    } else {
      setLinkView(null);
    }
  }, []);

  const scheduleRefresh = useCallback(() => {
    cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(refresh);
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
    const onUp = () => {
      if (!pointerDown.current) return;
      pointerDown.current = false;
      scheduleRefresh();
    };
    const onMove = () => {
      if (bubble || linkView) scheduleRefresh();
    };
    document.addEventListener("selectionchange", scheduleRefresh);
    document.addEventListener("mouseup", onUp);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("selectionchange", scheduleRefresh);
      document.removeEventListener("mouseup", onUp);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
      cancelAnimationFrame(frame.current);
    };
  }, [scheduleRefresh, bubble, linkView]);

  useEffect(() => {
    if (!menu) return;
    const close = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (target?.closest(".tb-menu, .tb-select")) return;
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

  function restoreSelection() {
    const editor = editorRef.current;
    if (!editor) return false;
    const active = document.activeElement === editor && rangeIn(editor);
    if (active) return true;
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

  function needsWords(action: () => void, hint: string) {
    restoreSelection();
    const editor = editorRef.current;
    const range = editor ? rangeIn(editor) : null;
    if (!range || range.collapsed || !range.toString().trim()) {
      onHint(hint);
      return;
    }
    action();
    finish();
  }

  function openLink() {
    const editor = editorRef.current;
    if (!editor) return;
    restoreSelection();
    let range = rangeIn(editor);
    if (!range) return;
    const link = closestIn(range.startContainer, "a", editor);
    if (link) {
      const whole = document.createRange();
      whole.selectNodeContents(link);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(whole);
      range = whole;
    }
    lastRange.current = range.cloneRange();
    const rect = caretRect(range, editor);
    const spot = rect ? spotFor(rect, 210) : { x: window.innerWidth / 2, y: 200, below: true };
    const selected = range.toString();
    setLinkError("");
    setBubble(null);
    setLinkView(null);
    setLinkDraft({
      ...spot,
      below: true,
      y: rect ? Math.min(rect.bottom + 10, window.innerHeight - 240) : spot.y,
      text: link ? link.textContent || "" : selected,
      href: link ? link.getAttribute("href") || "" : "",
      editing: Boolean(link),
      selected,
    });
  }

  function closeLink(refocus = true) {
    setLinkDraft(null);
    setLinkError("");
    if (refocus) restoreSelection();
  }

  function saveLink() {
    const draft = linkDraftRef.current;
    const editor = editorRef.current;
    if (!draft || !editor) return;
    const href = safeHref(draft.href);
    if (!href) {
      setLinkError("That doesn't look like a web address. Try something like example.com");
      return;
    }
    restoreSelection();
    const label = draft.text.replace(/\s+/g, " ").trim();
    const selected = draft.selected.replace(/\s+/g, " ").trim();
    if (selected && (!label || label === selected)) {
      document.execCommand("createLink", false, href);
    } else {
      const text = label || prettyUrl(href);
      document.execCommand("insertHTML", false, `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`);
    }
    window.getSelection()?.collapseToEnd();
    setLinkDraft(null);
    setLinkError("");
    finish();
  }

  function removeLink() {
    const editor = editorRef.current;
    if (!editor) return;
    restoreSelection();
    const range = rangeIn(editor);
    const link = range ? closestIn(range.startContainer, "a", editor) : null;
    if (link) {
      const whole = document.createRange();
      whole.selectNodeContents(link);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(whole);
    }
    document.execCommand("unlink");
    window.getSelection()?.collapseToEnd();
    setLinkDraft(null);
    finish();
  }

  function insertDivider() {
    run(() => {
      document.execCommand("insertHorizontalRule");
      const editor = editorRef.current;
      const range = editor ? rangeIn(editor) : null;
      const hr = range ? (range.startContainer.childNodes[range.startOffset - 1] as Element | undefined) : null;
      const rule = hr?.tagName === "HR" ? hr : editor?.querySelector("hr:last-of-type");
      if (rule && !rule.nextElementSibling) {
        const p = document.createElement("p");
        p.appendChild(document.createElement("br"));
        rule.after(p);
        const caret = document.createRange();
        caret.setStart(p, 0);
        caret.collapse(true);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(caret);
      }
    });
  }

  function clearFormatting() {
    const editor = editorRef.current;
    if (!editor) return;
    run(() => {
      document.execCommand("removeFormat");
      document.execCommand("unlink");
      const range = rangeIn(editor);
      if (range && blockStyleAt(range.startContainer, editor) !== "normal") applyBlockStyle(editor, "normal");
    });
  }

  function autoformat(): boolean {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || !selection.isCollapsed || selection.rangeCount === 0) return false;
    const range = selection.getRangeAt(0);
    if (!editor.contains(range.startContainer)) return false;
    if (closestIn(range.startContainer, "li, h2, h3, blockquote", editor)) return false;
    const block = closestIn(range.startContainer, "p", editor);
    if (!block) return false;
    const before = document.createRange();
    before.setStart(block, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const typed = before.toString();
    let kind: "bullets" | "numbers" | "quote" | null = null;
    if (typed === "-" || typed === "*" || typed === "•") kind = "bullets";
    else if (typed === "1." || typed === "1)") kind = "numbers";
    else if (typed === ">") kind = "quote";
    if (!kind) return false;
    selection.removeAllRanges();
    selection.addRange(before);
    document.execCommand("delete");
    if (kind === "bullets") document.execCommand("insertUnorderedList");
    else if (kind === "numbers") document.execCommand("insertOrderedList");
    else document.execCommand("formatBlock", false, "blockquote");
    return true;
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const editor = editorRef.current;
    if (!editor) return;
    const mod = event.metaKey || event.ctrlKey;
    const key = event.key.toLowerCase();

    if (mod && key === "k") {
      event.preventDefault();
      openLink();
      return;
    }
    if (mod && key === "s") {
      event.preventDefault();
      onSaveShortcut();
      return;
    }
    if (event.key === "Escape") {
      setBubble(null);
      setLinkView(null);
      return;
    }
    if (event.key === " " && !mod && autoformat()) {
      event.preventDefault();
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
      return;
    }
    if (event.key === "Enter" && !event.shiftKey) {
      const range = rangeIn(editor);
      if (!range || !range.collapsed) return;
      const quote = closestIn(range.startContainer, "blockquote", editor);
      if (!quote) return;
      const line = closestIn(range.startContainer, "p", editor) ?? quote;
      const rest = document.createRange();
      rest.setStart(range.endContainer, range.endOffset);
      rest.setEnd(line, line.childNodes.length);
      const lineEmpty = !(line.textContent || "").replace(/\u200b/g, "").trim();
      const atEnd = !rest.toString().replace(/\u200b/g, "").trim();
      if (lineEmpty || atEnd) {
        event.preventDefault();
        if (!lineEmpty) document.execCommand("insertParagraph");
        applyBlockStyle(editor, "normal");
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
    const asUrl = !html && text && !/\s/.test(text.trim()) ? safeHref(text.trim()) : null;
    if (asUrl && /^(https?:\/\/|www\.)/i.test(text.trim())) {
      if (range && !range.collapsed && range.toString().trim()) {
        document.execCommand("createLink", false, asUrl);
        window.getSelection()?.collapseToEnd();
      } else {
        document.execCommand("insertHTML", false, `<a href="${escapeHtml(asUrl)}">${escapeHtml(prettyUrl(asUrl))}</a>`);
      }
      finish();
      return;
    }
    const clean = html ? sanitizeHtml(html) : plainToHtml(text);
    if (clean) {
      const single = !html && !/\n/.test(text.trim());
      if (single) document.execCommand("insertText", false, text);
      else document.execCommand("insertHTML", false, clean);
    }
    finish();
  }

  function onDrop(event: React.DragEvent<HTMLDivElement>) {
    if (dragInside.current) return;
    event.preventDefault();
    if (event.dataTransfer.files.length > 0) {
      onHint("Pictures and files can't be added yet. Only text can go in the page.");
      return;
    }
    const html = event.dataTransfer.getData("text/html");
    const text = event.dataTransfer.getData("text/plain");
    const clean = html ? sanitizeHtml(html) : plainToHtml(text);
    if (!clean) return;
    const caret = document.caretRangeFromPoint?.(event.clientX, event.clientY);
    if (caret) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(caret);
    }
    document.execCommand("insertHTML", false, clean);
    finish();
  }

  useImperativeHandle(ref, () => ({
    focus: () => restoreSelection(),
    openLink,
  }));

  const styleLabel = BLOCK_STYLES.find((item) => item.id === marks.block)?.label ?? "Normal text";
  const sizeLabel = SIZES.find((item) => item.id === marks.size)?.label ?? "Normal";

  return (
    <div className="ed">
      <div className="ed-toolbar-wrap">
        <div className="ed-toolbar" role="toolbar" aria-label="Formatting">
          <div className="tb-group">
            <div className="tb-select">
              <button
                type="button"
                className={`tb-btn tb-btn--select tb-btn--style${menu === "style" ? " is-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={menu === "style"}
                data-tip="Text style"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setMenu(menu === "style" ? null : "style")}
              >
                <span>{styleLabel}</span>
                <IconChevronDown size={15} />
              </button>
              {menu === "style" ? (
                <div className="tb-menu" role="menu">
                  {BLOCK_STYLES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={marks.block === item.id}
                      className={`tb-menu__item tb-menu__item--${item.id}${marks.block === item.id ? " is-current" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setMenu(null);
                        const editor = editorRef.current;
                        if (editor) run(() => applyBlockStyle(editor, item.id));
                      }}
                    >
                      <span className="tb-menu__label">{item.label}</span>
                      <span className="tb-menu__hint">{item.hint}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <span className="tb-sep" aria-hidden="true" />

          <div className="tb-group">
            <ToolButton label="Bold" shortcut={`${MOD}B`} active={marks.bold} onClick={() => run(() => document.execCommand("bold"))}>
              <span className="tb-glyph tb-glyph--bold">B</span>
            </ToolButton>
            <ToolButton
              label="Italic"
              shortcut={`${MOD}I`}
              active={marks.italic}
              onClick={() => run(() => document.execCommand("italic"))}
            >
              <span className="tb-glyph tb-glyph--italic">I</span>
            </ToolButton>
            <ToolButton
              label="Underline"
              shortcut={`${MOD}U`}
              active={marks.underline}
              onClick={() => run(() => document.execCommand("underline"))}
            >
              <span className="tb-glyph tb-glyph--underline">U</span>
            </ToolButton>
          </div>

          <span className="tb-sep" aria-hidden="true" />

          <div className="tb-group">
            <div className="tb-select">
              <button
                type="button"
                className={`tb-btn tb-btn--select tb-btn--size${menu === "size" ? " is-open" : ""}`}
                aria-haspopup="menu"
                aria-expanded={menu === "size"}
                data-tip="Text size"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setMenu(menu === "size" ? null : "size")}
              >
                <span className="tb-size-mark" aria-hidden="true">
                  <span>A</span>
                  <span>A</span>
                </span>
                <span>{sizeLabel}</span>
                <IconChevronDown size={15} />
              </button>
              {menu === "size" ? (
                <div className="tb-menu tb-menu--sizes" role="menu">
                  {SIZES.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={marks.size === item.id}
                      className={`tb-menu__item tb-menu__item--size-${item.id}${marks.size === item.id ? " is-current" : ""}`}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => {
                        setMenu(null);
                        needsWords(() => applySize(item.id), "Select the words you want to resize, then pick a size.");
                      }}
                    >
                      <span className="tb-menu__label">{item.label}</span>
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <span className="tb-sep" aria-hidden="true" />

          <div className="tb-group">
            <ToolButton
              label="Bulleted list"
              shortcut="type - then a space"
              active={marks.list === "bullets"}
              onClick={() => run(() => document.execCommand("insertUnorderedList"))}
            >
              <IconBullets />
            </ToolButton>
            <ToolButton
              label="Numbered list"
              shortcut="type 1. then a space"
              active={marks.list === "numbers"}
              onClick={() => run(() => document.execCommand("insertOrderedList"))}
            >
              <IconNumbers />
            </ToolButton>
            <ToolButton
              label="Quote"
              active={marks.block === "quote"}
              onClick={() => {
                const editor = editorRef.current;
                if (editor) run(() => applyBlockStyle(editor, marks.block === "quote" ? "normal" : "quote"));
              }}
            >
              <IconQuote />
            </ToolButton>
            <ToolButton label="Divider line" onClick={insertDivider}>
              <IconDivider />
            </ToolButton>
          </div>

          <span className="tb-sep" aria-hidden="true" />

          <div className="tb-group">
            <ToolButton label="Link" shortcut={`${MOD}K`} active={Boolean(linkDraft)} onClick={openLink} wide>
              <IconLink />
              <span className="tb-text">Link</span>
            </ToolButton>
            <ToolButton label="Remove formatting" onClick={clearFormatting}>
              <IconClearFormat />
            </ToolButton>
          </div>

          <span className="tb-spacer" />

          <div className="tb-group">
            <ToolButton label="Undo" shortcut={`${MOD}Z`} onClick={() => run(() => document.execCommand("undo"))}>
              <IconUndo />
            </ToolButton>
            <ToolButton label="Redo" shortcut={`${MOD}⇧Z`} onClick={() => run(() => document.execCommand("redo"))}>
              <IconRedo />
            </ToolButton>
          </div>
        </div>
      </div>

      <div className="ed-canvas">
        <div
          className="ed-page"
          ref={pageRef}
          onMouseDown={(event) => {
            const editor = editorRef.current;
            if (!editor || event.target !== pageRef.current) return;
            const bottom = editor.getBoundingClientRect().bottom;
            if (event.clientY < bottom) return;
            event.preventDefault();
            placeCaretAtEnd(editor);
            scheduleRefresh();
          }}
        >
          {header}
          <div
            ref={editorRef}
            className={`prose ed-body${empty ? " is-empty" : ""}`}
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="Your writing"
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
            onMouseDown={() => {
              pointerDown.current = true;
              setBubble(null);
            }}
            onPaste={onPaste}
            onDragStart={() => {
              dragInside.current = true;
            }}
            onDragEnd={() => {
              dragInside.current = false;
            }}
            onDrop={(event) => {
              onDrop(event);
              dragInside.current = false;
            }}
          />
        </div>
      </div>

      {bubble ? (
        <div
          className={`ed-bubble${bubble.below ? " is-below" : ""}`}
          style={{ left: bubble.x, top: bubble.y }}
          role="toolbar"
          aria-label="Quick formatting"
        >
          <BubbleButton label="Bold" active={marks.bold} onClick={() => run(() => document.execCommand("bold"))}>
            <span className="tb-glyph tb-glyph--bold">B</span>
          </BubbleButton>
          <BubbleButton label="Italic" active={marks.italic} onClick={() => run(() => document.execCommand("italic"))}>
            <span className="tb-glyph tb-glyph--italic">I</span>
          </BubbleButton>
          <BubbleButton
            label="Underline"
            active={marks.underline}
            onClick={() => run(() => document.execCommand("underline"))}
          >
            <span className="tb-glyph tb-glyph--underline">U</span>
          </BubbleButton>
          <span className="ed-bubble__sep" aria-hidden="true" />
          <BubbleButton label="Add a link" onClick={openLink} wide>
            <IconLink size={16} />
            <span>Link</span>
          </BubbleButton>
        </div>
      ) : null}

      {linkView && !linkDraft ? (
        <div className="ed-linkview" style={{ left: linkView.x, top: linkView.y }} role="dialog" aria-label="Link">
          <a className="ed-linkview__url" href={linkView.href} target="_blank" rel="noopener noreferrer">
            <IconExternal size={14} />
            <span>{prettyUrl(linkView.href)}</span>
          </a>
          <span className="ed-linkview__sep" aria-hidden="true" />
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={openLink}>
            Change
          </button>
          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={removeLink}>
            Remove
          </button>
        </div>
      ) : null}

      {linkDraft ? (
        <form
          className="ed-linkbox"
          style={{ left: linkDraft.x, top: linkDraft.y }}
          onSubmit={(event) => {
            event.preventDefault();
            saveLink();
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeLink();
            }
          }}
        >
          <p className="ed-linkbox__title">{linkDraft.editing ? "Change this link" : "Add a link"}</p>
          <label className="ed-field">
            <span>Text to show</span>
            <input
              value={linkDraft.text}
              autoFocus={!linkDraft.text}
              placeholder="The words readers will click"
              onChange={(event) => setLinkDraft({ ...linkDraft, text: event.target.value })}
            />
          </label>
          <label className="ed-field">
            <span>Web address</span>
            <input
              value={linkDraft.href}
              autoFocus={Boolean(linkDraft.text)}
              placeholder="Paste it here, e.g. example.com"
              inputMode="url"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => {
                setLinkDraft({ ...linkDraft, href: event.target.value });
                setLinkError("");
              }}
            />
          </label>
          {linkError ? (
            <p className="ed-linkbox__error" role="alert">
              {linkError}
            </p>
          ) : null}
          <div className="ed-linkbox__actions">
            {linkDraft.editing ? (
              <button type="button" className="btn btn--text btn--danger-text" onClick={removeLink}>
                Remove link
              </button>
            ) : (
              <span />
            )}
            <div className="ed-linkbox__main">
              <button type="button" className="btn btn--ghost" onClick={() => closeLink()}>
                Cancel
              </button>
              <button type="submit" className="btn btn--primary" disabled={!linkDraft.href.trim()}>
                {linkDraft.editing ? "Save" : "Add link"}
              </button>
            </div>
          </div>
        </form>
      ) : null}
    </div>
  );
});

export default DeskEditor;

function ToolButton({
  label,
  shortcut,
  active = false,
  wide = false,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
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
      data-tip={shortcut ? `${label} · ${shortcut}` : label}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function BubbleButton({
  label,
  active = false,
  wide = false,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  wide?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={`ed-bubble__btn${active ? " is-active" : ""}${wide ? " is-wide" : ""}`}
      aria-label={label}
      aria-pressed={active}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
