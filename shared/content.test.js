import assert from "node:assert/strict";
import test from "node:test";
import { DOMParser } from "linkedom";
import {
  isMediaSrc,
  normalizeBlocks,
  normalizePage,
  parsePageFile,
  uploadKind,
  videoEmbed,
} from "./content.js";
import { PAGES, displayUnitNumber, pageById } from "./pages.js";

globalThis.DOMParser = DOMParser;

test("every page has a unique id and path, and units are numbered for display", () => {
  assert.equal(new Set(PAGES.map((page) => page.id)).size, PAGES.length);
  assert.equal(new Set(PAGES.map((page) => page.path)).size, PAGES.length);
  assert.equal(pageById("unit-12").label, "Unit 12");
  assert.equal(pageById("unit-0").label, "Unit 1");
  assert.equal(displayUnitNumber(12), 12);
  assert.equal(pageById("unit-11"), null);
  assert.equal(pageById("__proto__"), null);
});

test("accepts uploaded files only from the site's media folder or the Blob store", () => {
  assert.equal(isMediaSrc("/media/2026/10/ab12-photo.jpg"), true);
  assert.equal(isMediaSrc("https://abc123.public.blob.vercel-storage.com/media/clip.mp4"), true);
  assert.equal(isMediaSrc("/media/../secret"), false);
  assert.equal(isMediaSrc("/media/a/../../x.jpg"), false);
  assert.equal(isMediaSrc("https://evil.example/photo.jpg"), false);
  assert.equal(isMediaSrc("http://abc.public.blob.vercel-storage.com/x.jpg"), false);
  assert.equal(isMediaSrc("javascript:alert(1)"), false);
  assert.equal(isMediaSrc({ src: "/media/x.jpg" }), false);
});

test("turns YouTube, Vimeo and Google Drive links into players and leaves others as links", () => {
  const embed = "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ";
  assert.equal(videoEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ").embedUrl, embed);
  assert.equal(videoEmbed("youtu.be/dQw4w9WgXcQ?t=42").embedUrl, `${embed}?start=42`);
  assert.equal(videoEmbed("https://youtube.com/shorts/dQw4w9WgXcQ").embedUrl, embed);
  assert.equal(videoEmbed("https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share").embedUrl, embed);
  assert.equal(videoEmbed("https://vimeo.com/76979871").embedUrl, "https://player.vimeo.com/video/76979871");
  assert.equal(
    videoEmbed("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/view?usp=sharing").embedUrl,
    "https://drive.google.com/file/d/1AbCdEfGhIjKlMnOp/preview",
  );
  assert.equal(videoEmbed("https://example.com/video"), null);
  assert.equal(videoEmbed("https://www.youtube.com/watch?v=<script>"), null);
  assert.equal(videoEmbed("not a link"), null);
});

test("keeps good elements, drops broken or unknown ones, and never throws", () => {
  const blocks = normalizeBlocks([
    { id: "a1b2", type: "text", html: "<p>Hello <script>x</script></p>" },
    { id: "c3d4", type: "text", html: "<p> </p>" },
    { id: "e5f6", type: "photos", size: "huge", items: [{ src: "/media/x.jpg", width: 800, height: 600 }, { src: "bad" }] },
    { id: "g7h8", type: "video", source: "link", url: "youtube.com/watch?v=dQw4w9WgXcQ" },
    { id: "i9j0", type: "video", source: "file", src: "https://evil.example/x.mp4" },
    { id: "k1l2", type: "file", src: "/media/handout.pdf", name: "Handout.pdf", size: 1234 },
    { id: "m3n4", type: "link", url: "javascript:alert(1)" },
    { id: "o5p6", type: "html", html: "<b>no</b>" },
    null,
    "nonsense",
    { id: "a1b2", type: "audio", src: "/media/clip.mp3", title: "Clip" },
  ]);
  assert.deepEqual(
    blocks.map((block) => block.type),
    ["text", "photos", "video", "file", "audio"],
  );
  assert.equal(blocks[0].html, "<p>Hello </p>");
  assert.equal(blocks[1].size, "medium");
  assert.equal(blocks[1].items.length, 1);
  assert.equal(blocks[2].url, "https://youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(blocks[3].ext, "pdf");
  assert.notEqual(blocks[4].id, "a1b2");
  assert.equal(new Set(blocks.map((block) => block.id)).size, blocks.length);
  assert.deepEqual(normalizeBlocks("oops"), []);
});

test("keeps only the fields a page defines, in a safe shape", () => {
  const page = normalizePage("unit-3", {
    fields: {
      title: "  Unit   4 ",
      subtitle: "<b>Travel</b>",
      description: '<p onclick="x">Read <a href="/listening-scripts">this</a></p>',
      tracks: ["One", 2, "<i>Three</i>"],
      hacker: "nope",
    },
    blocks: [],
  });
  assert.deepEqual(page.fields, {
    title: "Unit 4",
    subtitle: "Travel",
    description: '<p>Read <a href="/listening-scripts">this</a></p>',
    tracks: ["One", "2", "Three"],
  });
  assert.equal(normalizePage("nope", { fields: {} }), null);

  const author = normalizePage("about-author", {
    fields: { scholarUrl: "", linkedinUrl: "javascript:alert(1)", photo: { src: "/media/me.jpg", width: 10 } },
  });
  assert.deepEqual(author.fields, { scholarUrl: "", photo: { src: "/media/me.jpg", width: 10, height: 0 } });

  const cleared = normalizePage("about-book", { fields: { title: "  ", body: "<p> </p>", subtitle: "" } });
  assert.deepEqual(cleared.fields, { subtitle: "" });
});

test("reads a damaged page file as nothing rather than failing", () => {
  assert.equal(parsePageFile("home", "{not json"), null);
  assert.equal(parsePageFile("home", "null"), null);
  assert.deepEqual(parsePageFile("home", '{"fields":{"heading":"Hi"},"blocks":"x"}'), {
    fields: { heading: "Hi" },
    blocks: [],
  });
});

test("matches uploads to the right kind by extension", () => {
  assert.equal(uploadKind("Photo.JPG"), "image");
  assert.equal(uploadKind("talk.mov"), "video");
  assert.equal(uploadKind("song.m4a"), "audio");
  assert.equal(uploadKind("Handout.docx"), "file");
  assert.equal(uploadKind("page.html"), null);
  assert.equal(uploadKind("drawing.svg"), null);
  assert.equal(uploadKind("noextension"), null);
});
