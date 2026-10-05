import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { normalizePage } from "../shared/content.js";
import { PAGES, isPageId } from "../shared/pages.js";
import { commitToGithub, githubConfigured } from "./github.js";

const MAX_VERSION_CHARS = 300_000;

function failure(status, code) {
  const error = new Error(code);
  error.status = status;
  error.code = code;
  return error;
}

function pagesFile(root) {
  return path.join(root, "server", "data", "pages.json");
}

async function writeJson(file, data) {
  await mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await rename(tmp, file);
}

async function readRecords(root) {
  try {
    const data = JSON.parse(await readFile(pagesFile(root), "utf8"));
    return data && typeof data.pages === "object" && data.pages ? data.pages : {};
  } catch {
    return {};
  }
}

/** Keeps page drafts in server/data/pages.json, for the desk running on this computer. */
export function createFilePages(root) {
  return {
    async all() {
      return Object.values(await readRecords(root));
    },
    async get(id) {
      return (await readRecords(root))[id] ?? null;
    },
    async put(record) {
      const records = await readRecords(root);
      records[record.id] = record;
      await writeJson(pagesFile(root), { pages: records });
    },
    async remove(id) {
      const records = await readRecords(root);
      delete records[id];
      await writeJson(pagesFile(root), { pages: records });
    },
  };
}

function isEmpty(content) {
  return !content || (!Object.keys(content.fields).length && !content.blocks.length);
}

function same(a, b) {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function statusOf(record) {
  if (!record) return "original";
  if (record.live) return same(record.draft, record.live) ? "published" : "changed";
  return isEmpty(record.draft) ? "original" : "changed";
}

function summary(id, record) {
  return {
    id,
    status: statusOf(record),
    updatedAt: record?.updatedAt ?? null,
    publishedAt: record?.publishedAt ?? null,
  };
}

function toClient(id, record) {
  return {
    ...summary(id, record),
    draft: record?.draft ?? record?.live ?? { fields: {}, blocks: [] },
    live: record?.live ?? null,
  };
}

function cleanContent(id, body) {
  if (!body || typeof body !== "object") throw failure(400, "bad_body");
  const content = normalizePage(id, body);
  if (!content) throw failure(400, "bad_body");
  if (JSON.stringify(content).length > MAX_VERSION_CHARS) throw failure(413, "too_large");
  return content;
}

function contentPath(id) {
  return `content/pages/${id}.json`;
}

/**
 * `hosted` means nothing is written to disk and publishing needs GitHub,
 * because the commit is what rebuilds the public site.
 */
export function createPageStore({ root, env, fetchImpl, db = createFilePages(root), hosted = false, label = (id) => id }) {
  let chain = Promise.resolve();
  const lock = (fn) => {
    const run = chain.then(fn, fn);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  };

  function requireId(id) {
    if (!isPageId(id)) throw failure(404, "not_found");
  }

  function requireGithub() {
    if (hosted && !githubConfigured(env)) throw failure(503, "publish_not_configured");
  }

  async function commit(message, { file = null, deletion = null }) {
    if (!hosted) {
      const local = path.join(root, file?.path ?? deletion);
      if (file) {
        await mkdir(path.dirname(local), { recursive: true });
        await writeFile(local, file.content, "utf8");
      } else {
        await rm(local, { force: true });
      }
    }
    try {
      return await commitToGithub({
        env,
        fetchImpl,
        message,
        files: file ? [file] : [],
        deletions: deletion ? [deletion] : [],
      });
    } catch (error) {
      console.error("GitHub commit failed", error.githubStatus || error.code || "error");
      throw failure(502, "publish_failed");
    }
  }

  async function list() {
    const records = new Map((await db.all()).map((record) => [record.id, record]));
    return PAGES.map((page) => summary(page.id, records.get(page.id)));
  }

  async function get(id) {
    requireId(id);
    return toClient(id, await db.get(id));
  }

  async function save(id, body, now) {
    requireId(id);
    const draft = cleanContent(id, body);
    const existing = await db.get(id);
    const record = {
      id,
      draft,
      live: existing?.live ?? null,
      updatedAt: new Date(now).toISOString(),
      publishedAt: existing?.publishedAt ?? null,
    };
    await db.put(record);
    return toClient(id, record);
  }

  async function publish(id, body, now) {
    requireId(id);
    requireGithub();
    const content = cleanContent(id, body);
    const existing = await db.get(id);
    const timestamp = new Date(now).toISOString();
    await db.put({
      id,
      draft: content,
      live: existing?.live ?? null,
      updatedAt: timestamp,
      publishedAt: existing?.publishedAt ?? null,
    });
    const file = {
      path: contentPath(id),
      content: `${JSON.stringify({ page: id, publishedAt: timestamp, ...content }, null, 2)}\n`,
    };
    const github = await commit(`Update “${label(id)}” page`, { file });
    const record = { id, draft: content, live: content, updatedAt: timestamp, publishedAt: timestamp };
    await db.put(record);
    return { page: toClient(id, record), github };
  }

  async function discard(id) {
    requireId(id);
    const existing = await db.get(id);
    if (!existing?.live) {
      if (existing) await db.remove(id);
      return toClient(id, null);
    }
    const record = { ...existing, draft: existing.live };
    await db.put(record);
    return toClient(id, record);
  }

  async function reset(id) {
    requireId(id);
    const existing = await db.get(id);
    let github = "skipped";
    if (existing?.live) {
      requireGithub();
      github = await commit(`Restore the original “${label(id)}” page`, { deletion: contentPath(id) });
    }
    if (existing) await db.remove(id);
    return { page: toClient(id, null), github };
  }

  return {
    list: () => lock(list),
    get: (id) => lock(() => get(id)),
    save: (id, body, now) => lock(() => save(id, body, now)),
    publish: (id, body, now) => lock(() => publish(id, body, now)),
    discard: (id) => lock(() => discard(id)),
    reset: (id) => lock(() => reset(id)),
  };
}
