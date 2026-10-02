export type BlockStyle = "normal" | "heading" | "subheading";
export type SizeName = "small" | "normal" | "large";
export type ListKind = "bullets" | "numbers" | null;

export const BLOCK_STYLES: { id: BlockStyle; label: string }[] = [
  { id: "normal", label: "Normal text" },
  { id: "heading", label: "Heading" },
  { id: "subheading", label: "Subheading" },
];

export const SIZES: { id: SizeName; label: string }[] = [
  { id: "small", label: "Small" },
  { id: "normal", label: "Normal" },
  { id: "large", label: "Large" },
];

const SIZE_TO_FONT: Record<SizeName, string> = { small: "2", normal: "3", large: "5" };
const FONT_TO_SIZE: Record<string, SizeName> = {
  "1": "small",
  "2": "small",
  "3": "normal",
  "4": "large",
  "5": "large",
  "6": "large",
  "7": "large",
};
const CLASS_TO_FONT: Record<string, string> = { "size-small": "2", "size-large": "5", "size-xl": "6" };

export function elementOf(node: Node | null): Element | null {
  if (!node) return null;
  return node.nodeType === Node.ELEMENT_NODE ? (node as Element) : node.parentElement;
}

export function rangeIn(editor: HTMLElement): Range | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  return editor.contains(range.commonAncestorContainer) ? range : null;
}

export function closestIn(node: Node | null, selector: string, editor: HTMLElement): HTMLElement | null {
  const found = elementOf(node)?.closest(selector) as HTMLElement | null | undefined;
  return found && found !== editor && editor.contains(found) ? found : null;
}

export function blockStyleAt(node: Node | null, editor: HTMLElement): BlockStyle {
  if (closestIn(node, "h2", editor)) return "heading";
  if (closestIn(node, "h3", editor)) return "subheading";
  return "normal";
}

export function sizeAt(node: Node | null, editor: HTMLElement): SizeName {
  const el = closestIn(node, "font[size], span.size-small, span.size-large, span.size-xl", editor);
  if (!el) return "normal";
  if (el.tagName === "FONT") return FONT_TO_SIZE[el.getAttribute("size") || "3"] || "normal";
  if (el.classList.contains("size-small")) return "small";
  return "large";
}

export function listAt(node: Node | null, editor: HTMLElement): ListKind {
  const item = closestIn(node, "li", editor);
  if (!item) return null;
  return item.parentElement?.tagName === "OL" ? "numbers" : "bullets";
}

export function prepareForEditing(editor: HTMLElement) {
  editor.querySelectorAll("span.size-small, span.size-large, span.size-xl").forEach((span) => {
    const cls = Object.keys(CLASS_TO_FONT).find((name) => span.classList.contains(name));
    if (!cls) return;
    const font = document.createElement("font");
    font.setAttribute("size", CLASS_TO_FONT[cls]);
    while (span.firstChild) font.appendChild(span.firstChild);
    span.replaceWith(font);
  });
  ensureParagraph(editor);
}

export function ensureParagraph(editor: HTMLElement) {
  const html = editor.innerHTML.trim();
  if (html === "" || html === "<br>") {
    editor.innerHTML = "<p><br></p>";
    return true;
  }
  return false;
}

const BLOCK_TAGS = new Set(["P", "DIV", "UL", "OL", "BLOCKQUOTE", "H2", "H3", "HR"]);

function isBlock(node: Node) {
  return node.nodeType === Node.ELEMENT_NODE && BLOCK_TAGS.has((node as Element).tagName);
}

function isBlankText(node: Node) {
  return node.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim();
}

function renameElement(el: Element, tag: string) {
  const next = document.createElement(tag);
  while (el.firstChild) next.appendChild(el.firstChild);
  el.replaceWith(next);
  return next;
}

function repairStructure(editor: HTMLElement) {
  const selection = window.getSelection();
  const saved =
    selection && selection.rangeCount > 0 && selection.anchorNode && editor.contains(selection.anchorNode)
      ? {
          anchor: selection.anchorNode,
          anchorOffset: selection.anchorOffset,
          focus: selection.focusNode as Node,
          focusOffset: selection.focusOffset,
        }
      : null;
  let changed = false;

  editor.querySelectorAll("p, h2, h3").forEach((host) => {
    if (!host.isConnected || !Array.from(host.childNodes).some(isBlock)) return;
    const parent = host.parentNode as Node;
    let run: HTMLElement | null = null;
    for (const child of Array.from(host.childNodes)) {
      if (isBlock(child)) {
        run = null;
        parent.insertBefore(child, host);
      } else if (!run && isBlankText(child)) {
        child.remove();
      } else {
        if (!run) {
          run = document.createElement(host.tagName.toLowerCase());
          parent.insertBefore(run, host);
        }
        run.appendChild(child);
      }
    }
    host.remove();
    changed = true;
  });

  let run: HTMLElement | null = null;
  for (const child of Array.from(editor.childNodes)) {
    if (isBlock(child)) {
      run = null;
      if ((child as Element).tagName === "DIV") {
        renameElement(child as Element, "p");
        changed = true;
      }
      continue;
    }
    if (!run && isBlankText(child)) continue;
    if (!run) {
      run = document.createElement("p");
      editor.insertBefore(run, child);
    }
    run.appendChild(child);
    changed = true;
  }

  if (changed && saved && selection && saved.anchor.isConnected && saved.focus.isConnected) {
    try {
      selection.setBaseAndExtent(saved.anchor, saved.anchorOffset, saved.focus, saved.focusOffset);
    } catch {
      /* the old position no longer exists */
    }
  }
}

export function normalizeEditor(editor: HTMLElement) {
  repairStructure(editor);
  editor.querySelectorAll("[style]").forEach((el) => el.removeAttribute("style"));
  editor.querySelectorAll("font[color], font[face]").forEach((el) => {
    el.removeAttribute("color");
    el.removeAttribute("face");
  });
}

export function isVisuallyEmpty(editor: HTMLElement) {
  if (editor.querySelector("hr, li")) return false;
  return (editor.textContent || "").replace(/[\u200b\u00a0]/g, " ").trim().length === 0;
}

export function placeCaretAtEnd(editor: HTMLElement) {
  editor.focus({ preventScroll: true });
  const range = document.createRange();
  const last = editor.lastElementChild;
  if (last && last.tagName !== "HR") {
    range.selectNodeContents(last);
  } else {
    range.selectNodeContents(editor);
  }
  range.collapse(false);
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
}

export function applySize(size: SizeName) {
  document.execCommand("styleWithCSS", false, "false");
  document.execCommand("fontSize", false, SIZE_TO_FONT[size]);
}

export function applyBlockStyle(editor: HTMLElement, style: BlockStyle) {
  const range = rangeIn(editor);
  const current = range ? blockStyleAt(range.startContainer, editor) : "normal";
  if (current === style) return;
  const tag = style === "heading" ? "h2" : style === "subheading" ? "h3" : "p";
  document.execCommand("formatBlock", false, tag);
}

export function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function plainToHtml(text: string) {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function prettyUrl(href: string) {
  return href.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
}
