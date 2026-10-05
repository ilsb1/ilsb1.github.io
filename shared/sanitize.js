const ALLOWED = new Set([
  "P",
  "BR",
  "STRONG",
  "EM",
  "U",
  "UL",
  "OL",
  "LI",
  "A",
  "SPAN",
  "H2",
  "H3",
  "BLOCKQUOTE",
  "HR",
]);

const DROP = new Set([
  "SCRIPT",
  "STYLE",
  "NOSCRIPT",
  "IFRAME",
  "OBJECT",
  "EMBED",
  "LINK",
  "META",
  "BASE",
  "HEAD",
  "TITLE",
  "FORM",
  "INPUT",
  "BUTTON",
  "TEXTAREA",
  "SELECT",
  "OPTION",
  "SVG",
  "MATH",
  "TEMPLATE",
  "IMG",
  "PICTURE",
  "VIDEO",
  "AUDIO",
  "SOURCE",
  "TRACK",
  "CANVAS",
  "FRAME",
  "FRAMESET",
  "APPLET",
  "MAP",
  "AREA",
]);

const BLOCK_SELECTOR =
  "p,div,ul,ol,li,h1,h2,h3,h4,h5,h6,blockquote,hr,table,tr,td,th,section,article,header,footer,main,aside,nav,figure,pre,address,dl,dt,dd";
const BLOCK_TAGS = new Set(["P", "UL", "OL", "LI", "H2", "H3", "BLOCKQUOTE", "HR"]);
const INLINE_WRAPPERS = new Set(["STRONG", "EM", "U", "SPAN", "A"]);
const SIZE_CLASSES = ["size-small", "size-large", "size-xl"];
const FONT_SIZES = {
  1: "size-small",
  2: "size-small",
  4: "size-large",
  5: "size-large",
  6: "size-xl",
  7: "size-xl",
};

function canonicalTag(tagName) {
  switch (tagName) {
    case "B":
      return "STRONG";
    case "I":
      return "EM";
    case "FONT":
      return "SPAN";
    case "DIV":
    case "TR":
    case "PRE":
    case "DT":
    case "DD":
    case "ADDRESS":
    case "FIGCAPTION":
      return "P";
    case "H1":
      return "H2";
    case "H4":
    case "H5":
    case "H6":
      return "H3";
    default:
      return tagName;
  }
}

function compactHref(value) {
  let out = "";
  for (const char of String(value)) {
    const code = char.charCodeAt(0);
    if (code <= 32 || code === 127) continue;
    out += char;
  }
  return out;
}

export function safeHref(value) {
  const raw = String(value ?? "").trim();
  if (!raw || raw.length > 2000) return null;
  const decoded = compactHref(
    raw.replace(/&colon;/gi, ":").replace(/&#0*58;|&#x0*3a;/gi, ":"),
  );
  if (/^(javascript|data|vbscript|file):/i.test(decoded)) return null;
  if (decoded.startsWith("/")) {
    return /^\/(?![/\\])[^\s<>"'\\]*$/.test(decoded) ? decoded : null;
  }

  let href = decoded;
  if (/^mailto:/i.test(href)) {
    const match = href.match(/^mailto:([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})$/i);
    return match ? `mailto:${match[1]}` : null;
  }
  if (!/^https?:\/\//i.test(href)) {
    if (/^[a-z0-9.-]+\.[a-z]{2,}(?:[/?#][^\s]*)?$/i.test(href)) href = `https://${href}`;
    else return null;
  }
  try {
    const url = new URL(href);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (url.username || url.password) return null;
    if (/[<>"']/.test(url.href)) return null;
    return url.href;
  } catch {
    return null;
  }
}

const NO_MARKS = { bold: false, notBold: false, italic: false, underline: false };

function styleMarks(node) {
  const style = String(node.getAttribute("style") || "").toLowerCase();
  if (!style) return NO_MARKS;
  const weight = style.match(/font-weight\s*:\s*([a-z0-9]+)/);
  const value = weight ? weight[1] : "";
  const numeric = Number(value);
  return {
    bold: value === "bold" || value === "bolder" || numeric >= 600,
    notBold: value === "normal" || value === "lighter" || (numeric > 0 && numeric < 600),
    italic: /font-style\s*:\s*italic/.test(style),
    underline: /text-decoration[^;]*underline/.test(style),
  };
}

function sizeClass(node) {
  if (String(node.tagName).toUpperCase() === "FONT") {
    return FONT_SIZES[String(node.getAttribute("size") || "").trim()] || "";
  }
  const classes = String(node.getAttribute("class") || "").split(/\s+/);
  return SIZE_CLASSES.find((name) => classes.includes(name)) || "";
}

function wrap(content, tag, doc) {
  const el = doc.createElement(tag);
  el.appendChild(content);
  return el;
}

function withMarks(content, marks, doc) {
  let out = content;
  if (marks.underline) out = wrap(out, "u", doc);
  if (marks.italic) out = wrap(out, "em", doc);
  if (marks.bold) out = wrap(out, "strong", doc);
  return out;
}

function cleanChildren(node, parent, doc) {
  for (const child of [...node.childNodes]) {
    const cleaned = cleanNode(child, doc);
    if (cleaned) parent.appendChild(cleaned);
  }
}

function unwrapped(node, doc) {
  const fragment = doc.createDocumentFragment();
  cleanChildren(node, fragment, doc);
  return fragment;
}

function cleanNode(node, doc) {
  if (node.nodeType === 3) return doc.createTextNode((node.textContent || "").replace(/\u00a0/g, " "));
  if (node.nodeType === 11) return unwrapped(node, doc);
  if (node.nodeType !== 1) return null;

  const original = String(node.tagName).toUpperCase();
  if (DROP.has(original)) return null;

  const tag = canonicalTag(original);
  const marks = styleMarks(node);
  const blocky = Boolean(node.querySelector(BLOCK_SELECTOR));

  if ((tag === "P" || INLINE_WRAPPERS.has(tag)) && blocky) return unwrapped(node, doc);
  if (tag === "STRONG" && marks.notBold) {
    return withMarks(unwrapped(node, doc), { ...marks, bold: false }, doc);
  }
  if (!ALLOWED.has(tag)) {
    return blocky ? unwrapped(node, doc) : withMarks(unwrapped(node, doc), marks, doc);
  }
  if (tag === "BR") return doc.createElement("br");
  if (tag === "HR") return doc.createElement("hr");

  if (tag === "A") {
    const href = safeHref(node.getAttribute("href") || "");
    const content = withMarks(unwrapped(node, doc), marks, doc);
    if (!href) return content;
    const link = doc.createElement("a");
    link.setAttribute("href", href);
    if (!href.startsWith("/")) {
      link.setAttribute("rel", "noopener noreferrer");
      link.setAttribute("target", "_blank");
    }
    link.appendChild(content);
    return link;
  }

  if (tag === "SPAN") {
    const content = withMarks(unwrapped(node, doc), marks, doc);
    const size = sizeClass(node);
    if (!size) return content;
    const span = doc.createElement("span");
    span.setAttribute("class", size);
    span.appendChild(content);
    return span;
  }

  const el = doc.createElement(tag.toLowerCase());
  cleanChildren(node, el, doc);
  return el;
}

function isBlockNode(node) {
  return Boolean(node && node.nodeType === 1 && BLOCK_TAGS.has(String(node.tagName).toUpperCase()));
}

function isBlankText(node) {
  return node.nodeType === 3 && !(node.textContent || "").trim();
}

function isEmptyBlock(node) {
  if (!isBlockNode(node)) return false;
  const tag = String(node.tagName).toUpperCase();
  if (tag === "HR") return false;
  if (node.querySelector("hr")) return false;
  return !(node.textContent || "").replace(/\u00a0/g, " ").trim();
}

function removeNode(node) {
  node.parentNode?.removeChild(node);
}

function tidy(root) {
  for (const el of [...root.querySelectorAll("strong,em,u,span,a")]) {
    if ((el.textContent || "") || el.querySelector("br")) continue;
    const parent = el.parentNode;
    if (!parent) continue;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    removeNode(el);
  }

  for (const container of [root, ...root.querySelectorAll("ul,ol,blockquote")]) {
    for (const child of [...container.childNodes]) {
      if (!isBlankText(child)) continue;
      const prev = child.previousSibling;
      const next = child.nextSibling;
      if (!prev || !next || isBlockNode(prev) || isBlockNode(next)) removeNode(child);
    }
    for (const child of [...container.childNodes]) {
      if (child.nodeType !== 1 || String(child.tagName).toUpperCase() !== "BR") continue;
      const prev = child.previousSibling;
      const next = child.nextSibling;
      if (!prev || !next || isBlockNode(prev) || isBlockNode(next)) removeNode(child);
    }
  }

  for (const block of [...root.querySelectorAll("p,h2,h3,blockquote,li")]) {
    if (root.contains(block) && isEmptyBlock(block)) removeNode(block);
  }
  for (const list of [...root.querySelectorAll("ul,ol")]) {
    if (!list.querySelector("li")) removeNode(list);
  }

  while (root.firstChild && (isBlankText(root.firstChild) || isEmptyBlock(root.firstChild))) {
    removeNode(root.firstChild);
  }
  while (root.lastChild && (isBlankText(root.lastChild) || isEmptyBlock(root.lastChild))) {
    removeNode(root.lastChild);
  }
}

export function sanitizeHtml(dirty) {
  try {
    const Parser = globalThis.DOMParser;
    if (typeof Parser !== "function") return "";
    const raw = String(dirty ?? "").replaceAll("\u0000", "").slice(0, 200_000);
    const doc = new Parser().parseFromString(
      `<!doctype html><html><body>${raw}</body></html>`,
      "text/html",
    );
    const body = doc.body;
    if (!body) return "";
    const out = doc.createElement("div");
    cleanChildren(body, out, doc);
    tidy(out);
    return out.innerHTML.trim();
  } catch {
    return "";
  }
}
