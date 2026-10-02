import assert from "node:assert/strict";
import test from "node:test";
import { DOMParser } from "linkedom";
import { safeHref, sanitizeHtml } from "./sanitize.js";

globalThis.DOMParser = DOMParser;

test("keeps basic writing marks and drops scripts", () => {
  const clean = sanitizeHtml("<p>Hi <strong>there</strong></p><script>alert(1)</script>");
  assert.equal(clean, "<p>Hi <strong>there</strong></p>");
});

test("drops event handlers and javascript links", () => {
  assert.equal(sanitizeHtml('<p onclick="alert(1)">Hi</p>'), "<p>Hi</p>");
  assert.equal(
    sanitizeHtml('<a href="javascript:alert(1)" onclick="alert(1)">hi</a>'),
    "hi",
  );
  assert.equal(sanitizeHtml('<img src="x" onerror="alert(1)">'), "");
  assert.equal(sanitizeHtml("<svg><script>alert(1)</script></svg>"), "");
});

test("keeps safe links and size classes only", () => {
  const linked = sanitizeHtml('<a href="https://example.com/path">Example</a>');
  assert.match(linked, /href="https:\/\/example.com\/path"/);
  assert.match(linked, /rel="noopener noreferrer"/);
  assert.doesNotMatch(linked, /onclick|javascript/);

  const sized = sanitizeHtml('<span class="size-large evil" style="color:red">Big</span>');
  assert.match(sized, /class="size-large"/);
  assert.doesNotMatch(sized, /evil|style|color/);
});

test("turns pasted divs into paragraphs and headings into section headings", () => {
  assert.equal(sanitizeHtml("<div>Hello</div>"), "<p>Hello</p>");
  assert.equal(sanitizeHtml("<h1>Section</h1>"), "<h2>Section</h2>");
  assert.equal(sanitizeHtml("<h4>Smaller</h4>"), "<h3>Smaller</h3>");
  assert.equal(sanitizeHtml("<div><p>One</p><p>Two</p></div>"), "<p>One</p><p>Two</p>");
});

test("keeps dividers and the editor's text sizes", () => {
  assert.equal(sanitizeHtml("<p>A</p><hr><p>B</p>"), "<p>A</p><hr><p>B</p>");
  assert.equal(sanitizeHtml('<p><font size="5">Big</font></p>'), '<p><span class="size-large">Big</span></p>');
  assert.equal(sanitizeHtml('<p><font size="6">Huge</font></p>'), '<p><span class="size-xl">Huge</span></p>');
  assert.equal(sanitizeHtml('<p><font size="3" color="red">Plain</font></p>'), "<p>Plain</p>");
});

test("keeps bold and italics pasted from Google Docs and Word", () => {
  const docs =
    '<b style="font-weight:normal;" id="docs-internal-guid-1"><p dir="ltr"><span style="font-weight:700">Bold</span> and <span style="font-style:italic">slanted</span></p></b>';
  assert.equal(sanitizeHtml(docs), "<p><strong>Bold</strong> and <em>slanted</em></p>");
  const word = '<p class="MsoNormal"><b><span lang="EN-US" style="font-size:12pt">Hi</span></b><o:p></o:p></p>';
  assert.equal(sanitizeHtml(word), "<p><strong>Hi</strong></p>");
});

test("trims empty lines at the start and end", () => {
  assert.equal(sanitizeHtml("<p><br></p><p>Hi</p><p><br></p><p></p>"), "<p>Hi</p>");
});

test("drops blank lines between paragraphs and empty quotes or list items", () => {
  assert.equal(sanitizeHtml("<p>One</p><p><br></p><p>&nbsp;</p><p>Two</p>"), "<p>One</p><p>Two</p>");
  assert.equal(sanitizeHtml("<blockquote><br></blockquote><ul><li><br></li></ul><p>Hi</p>"), "<p>Hi</p>");
  assert.equal(sanitizeHtml("<ul><li>A</li><li><br></li></ul>"), "<ul><li>A</li></ul>");
  assert.equal(sanitizeHtml("<b><p>One</p><br><p>Two</p></b>"), "<p>One</p><p>Two</p>");
});

test("turns non-breaking spaces from the editor into ordinary spaces", () => {
  const html = sanitizeHtml('<p>Link at&nbsp;<a href="https://example.com/">here</a>&nbsp;now</p>');
  assert.match(html, /^<p>Link at <a [^>]+>here<\/a> now<\/p>$/);
});

test("rejects unsafe addresses", () => {
  assert.equal(safeHref("javascript:alert(1)"), null);
  assert.equal(safeHref("data:text/html,hi"), null);
  assert.equal(safeHref("https://user:pass@example.com"), null);
  assert.equal(safeHref("example.com"), "https://example.com/");
  assert.equal(safeHref("https://example.com/a"), "https://example.com/a");
});
