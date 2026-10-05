/** Internal unit ids in display order. Unit 1 uses id 0 so the QR codes printed in the book keep working. */
export const UNIT_IDS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12];

export function displayUnitNumber(unitId) {
  const index = UNIT_IDS.indexOf(Number(unitId));
  return index === -1 ? Number(unitId) : index + 1;
}

const text = (key, label, options = {}) => ({ key, type: "text", label, max: 240, ...options });
const multiline = (key, label, options = {}) => ({ key, type: "multiline", label, max: 4000, ...options });
const rich = (key, label, options = {}) => ({ key, type: "rich", label, ...options });
const url = (key, label, options = {}) => ({ key, type: "url", label, ...options });
const image = (key, label, options = {}) => ({ key, type: "image", label, ...options });
const lines = (key, label, options = {}) => ({ key, type: "lines", label, max: 240, maxItems: 12, ...options });

/** Emptying a required field brings back the original rather than leaving a blank heading. */
const REQUIRED = { required: true };

const MAIN_PAGES = [
  {
    id: "home",
    group: "main",
    label: "Home page",
    path: "/",
    blocksHint: "Shown under the welcome text.",
    fields: [text("heading", "Heading", REQUIRED), rich("intro", "Welcome text")],
  },
  {
    id: "about-book",
    group: "main",
    label: "About the Book",
    path: "/about/book",
    blocksHint: "Shown under the main text, before the signature.",
    fields: [
      text("title", "Page title", REQUIRED),
      text("subtitle", "Line under the page title"),
      text("bookTitle", "Book title under the covers", REQUIRED),
      rich("body", "Main text", REQUIRED),
      text("signatureName", "Signature: name", { section: "Signature" }),
      multiline("signatureRole", "Signature: position", { help: "Each line shows on its own line." }),
    ],
  },
  {
    id: "about-author",
    group: "main",
    label: "About the Author",
    path: "/about/author",
    blocksHint: "Shown under the biography.",
    fields: [
      text("title", "Page title", REQUIRED),
      text("subtitle", "Line under the page title"),
      text("name", "Name", { section: "Top of the card", required: true }),
      text("affiliation", "Position and university"),
      image("photo", "Photo"),
      url("scholarUrl", "Google Scholar link", { help: "Leave empty to hide the button." }),
      url("linkedinUrl", "LinkedIn link", { help: "Leave empty to hide the button." }),
      rich("bio", "Biography", { section: "Biography", required: true }),
    ],
  },
  {
    id: "copyright",
    group: "main",
    label: "Copyright",
    path: "/copyright",
    blocksHint: "Shown under the book details.",
    fields: [
      text("title", "Page title", REQUIRED),
      text("subtitle", "Line under the page title"),
      text("heroTitle", "Book title", REQUIRED),
      text("heroSubtitle", "Line under the book title"),
      text("enHeading", "Heading", { section: "Notice in English" }),
      text("enStrong", "Bold line"),
      multiline("enBody", "Notice text"),
      text("azHeading", "Heading", { section: "Notice in Azerbaijani" }),
      text("azStrong", "Bold line"),
      multiline("azBody", "Notice text"),
      text("imprintAuthor", "Author line", { section: "Book details" }),
      text("imprintTitle", "Title line"),
      text("imprintEdition", "Edition line"),
      text("isbn", "ISBN", { help: "Leave as “Forthcoming” until the number is issued." }),
      text("copyrightLine", "Copyright line"),
    ],
  },
  {
    id: "recordings",
    group: "lists",
    label: "Recordings page",
    path: "/listenings",
    blocksHint: "Shown under the list of units.",
    fields: [
      text("title", "Page title", REQUIRED),
      rich("intro", "Text above the units", { help: "Optional. Leave empty to show nothing." }),
      text("downloadNote", "Note under the download button"),
    ],
  },
  {
    id: "scripts",
    group: "lists",
    label: "Scripts page",
    path: "/listening-scripts",
    blocksHint: "Shown under the list of units.",
    fields: [
      text("title", "Page title", REQUIRED),
      text("subtitle", "Line under the page title"),
      rich("intro", "Text above the units", { help: "Optional. Leave empty to show nothing." }),
    ],
  },
];

const UNIT_PAGES = UNIT_IDS.map((unit) => ({
  id: `unit-${unit}`,
  group: "units",
  unit,
  label: `Unit ${displayUnitNumber(unit)}`,
  path: `/unit/${unit}`,
  blocksHint: "Shown under the recordings.",
  fields: [
    text("title", "Heading", REQUIRED),
    text("subtitle", "Topic", { help: "Optional. A short line under the heading." }),
    rich("description", "Description", { help: "Optional. Shown above the recordings." }),
    lines("tracks", "Recording titles"),
  ],
}));

const SCRIPT_PAGES = UNIT_IDS.map((unit) => ({
  id: `script-${unit}`,
  group: "scripts",
  unit,
  label: `Unit ${displayUnitNumber(unit)} script`,
  path: `/scripts/unit/${unit}`,
  blocksHint: "Shown under the script.",
  fields: [text("title", "Heading", REQUIRED), text("subtitle", "Script title", REQUIRED)],
}));

export const PAGES = [...MAIN_PAGES, ...UNIT_PAGES, ...SCRIPT_PAGES];

export const PAGE_GROUPS = [
  { id: "main", label: "Main pages" },
  { id: "units", label: "Listening units" },
  { id: "scripts", label: "Listening scripts" },
  { id: "lists", label: "Lists of units" },
];

const BY_ID = new Map(PAGES.map((page) => [page.id, page]));

export function pageById(id) {
  return typeof id === "string" ? BY_ID.get(id) ?? null : null;
}

export function isPageId(id) {
  return BY_ID.has(id);
}
