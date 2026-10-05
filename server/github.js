const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_RE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+$/;

export function githubConfigured(env) {
  return Boolean(env.GITHUB_TOKEN && env.GITHUB_REPO);
}

function githubConfig(env) {
  const token = env.GITHUB_TOKEN || "";
  const repo = env.GITHUB_REPO || "";
  const branch = env.GITHUB_BRANCH || "main";
  if (!token || !repo) return null;
  if (!REPO_RE.test(repo) || !BRANCH_RE.test(branch)) {
    const error = new Error("bad_github_config");
    error.status = 500;
    error.code = "github_config";
    throw error;
  }
  return { token, repo, branch };
}

/** Where freshly committed files can be read before the public site has rebuilt. */
export function githubRawBase(env) {
  const repo = env.GITHUB_REPO || "";
  const branch = env.GITHUB_BRANCH || "main";
  if (!REPO_RE.test(repo) || !BRANCH_RE.test(branch)) return "";
  return `https://raw.githubusercontent.com/${repo}/${branch}/public`;
}

async function github(fetchImpl, config, path, { method = "GET", body, allow404 = false } = {}) {
  const response = await fetchImpl(`https://api.github.com${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${config.token}`,
      "User-Agent": "ils-writing-desk",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (allow404 && response.status === 404) return null;
  const text = await response.text();
  let data = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const error = new Error("github_failed");
    error.status = 502;
    error.code = "github_failed";
    error.githubStatus = response.status;
    throw error;
  }
  return data;
}

async function commitOnce(fetchImpl, config, { message, files, deletions }) {
  const [owner, repo] = config.repo.split("/");
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const refData = await github(fetchImpl, config, `${base}/git/ref/heads/${config.branch}`);
  const parentSha = refData.object.sha;
  const parent = await github(fetchImpl, config, `${base}/git/commits/${parentSha}`);
  const tree = [];

  for (const file of files) {
    const blob = await github(fetchImpl, config, `${base}/git/blobs`, {
      method: "POST",
      body: { content: file.content, encoding: file.encoding === "base64" ? "base64" : "utf-8" },
    });
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const path of deletions) {
    const encoded = path.split("/").map(encodeURIComponent).join("/");
    const existing = await github(fetchImpl, config, `${base}/contents/${encoded}?ref=${encodeURIComponent(parentSha)}`, {
      allow404: true,
    });
    if (existing) tree.push({ path, mode: "100644", type: "blob", sha: null });
  }
  if (!tree.length) return;

  const nextTree = await github(fetchImpl, config, `${base}/git/trees`, {
    method: "POST",
    body: { base_tree: parent.tree.sha, tree },
  });
  const commit = await github(fetchImpl, config, `${base}/git/commits`, {
    method: "POST",
    body: { message, tree: nextTree.sha, parents: [parentSha] },
  });
  await github(fetchImpl, config, `${base}/git/refs/heads/${config.branch}`, {
    method: "PATCH",
    body: { sha: commit.sha },
  });
}

function retryable(error) {
  const status = error?.githubStatus;
  return status === 409 || status === 422 || (typeof status === "number" && status >= 500) || !status;
}

/**
 * Commits on top of the latest main. If someone else moved main in the meantime
 * (or GitHub hiccups), the whole commit is rebuilt on the new tip and tried again.
 */
export async function commitToGithub({
  env,
  fetchImpl = fetch,
  message,
  files = [],
  deletions = [],
  attempts = 3,
  wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
}) {
  const config = githubConfig(env);
  if (!config) return "skipped";
  for (let attempt = 1; ; attempt += 1) {
    try {
      await commitOnce(fetchImpl, config, { message, files, deletions });
      return "ok";
    } catch (error) {
      if (attempt >= attempts || !retryable(error)) throw error;
      await wait(250 * attempt + Math.floor(Math.random() * 250));
    }
  }
}
