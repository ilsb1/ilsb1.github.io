import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { DOMParser } from "linkedom";
import { createStore } from "../server/store.js";
import { TITLE_MAX, previewArticle, readArticle, uniqueSlug } from "./posts.js";
import { sanitizeHtml } from "./sanitize.js";
import { plainField } from "./text.js";

globalThis.DOMParser = DOMParser;

const FIRST = "aaaaaaaa-bbbb-4ccc-8ddd-000000000001";
const SECOND = "aaaaaaaa-bbbb-4ccc-8ddd-000000000002";
const at = (ms) => new Date(ms).toISOString();

const messy = {
  title: "  Tom &amp; Jerry <b>go</b>\u0007 to   town  ",
  subtitle: "A <i>day</i> out &lt;3",
  html: [
    "<p>Hello <strong>world</strong> &amp; <em>friends</em></p>",
    "<p></p>",
    "<script>alert(1)</script>",
    '<p><a href="javascript:alert(1)">bad</a> and <a href="https://example.com/a?b=1&c=2">good</a></p>',
    "<h2>Part two</h2>",
    "<ul><li>one</li><li></li><li><u>three</u></li></ul>",
    '<div>loose <span style="color:red;font-size:2em">text</span> here</div>',
    "<img src=x onerror=alert(1)>",
    "<blockquote>a quote<br>over two lines</blockquote>",
    "<hr>",
    "<p>&nbsp;the end&nbsp;</p>",
  ].join(""),
};

test("a post preview is exactly what the blog shows once it's published", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "ils-posts-"));
  try {
    const store = createStore({ root, env: {} });
    const t0 = Date.parse("2026-10-01T09:00:00Z");

    await store.publish(SECOND, { title: "Tom and Jerry go to town", subtitle: "", html: "<p>Taken first.</p>" }, t0);
    await store.save(FIRST, messy, t0 + 1000);

    const posts = await store.list();
    const draft = posts.find((post) => post.id === FIRST);
    const futureSlug = uniqueSlug(plainField(draft.title, TITLE_MAX), posts, FIRST);

    const t1 = t0 + 60_000;
    const { post } = await store.publish(FIRST, messy, t1);
    assert.equal(post.slug, futureSlug);
    assert.equal(post.slug, "tom-and-jerry-go-to-town-2");

    const read = async () => readArticle(post.slug, JSON.parse(await readFile(path.join(root, "public", "blogs", `${post.slug}.json`), "utf8")));
    const published = await read();
    assert.deepEqual(previewArticle(futureSlug, messy, null, at(t1)), published);
    assert.equal(published.html.includes("script"), false);
    assert.equal(published.html.includes("javascript:"), false);
    assert.equal(sanitizeHtml(published.html), published.html);

    const edited = { ...messy, title: "Tom & Jerry go to town", html: `${messy.html}<p>One more line.</p>` };
    const t2 = t1 + 86_400_000;
    const preview = previewArticle(post.slug, edited, post.live.publishedAt, at(t2));
    await store.publish(FIRST, edited, t2);
    const republished = await read();
    assert.deepEqual(preview, republished);
    assert.equal(republished.publishedAt, at(t1));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a post preview ignores what the blog wouldn't show", () => {
  const now = at(Date.parse("2026-10-07T12:00:00Z"));
  const preview = previewArticle("a-post", { title: 42, html: "<p>Hi</p>", extra: "<script>" }, "not a date", now);
  assert.deepEqual(preview, { slug: "a-post", title: "42", subtitle: "", html: "<p>Hi</p>", words: 1, publishedAt: now, updatedAt: now });
});
