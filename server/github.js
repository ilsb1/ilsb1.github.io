const REPO_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const BRANCH_RE = /^(?!\/)(?!.*\.\.)[A-Za-z0-9._/-]+$/;

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

async function github(fetchImpl, config, path, { method = "GET", body } = {}) {
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

export async function commitToGithub({ env, fetchImpl = fetch, message, files = [], deletions = [] }) {
  const config = githubConfig(env);
  if (!config) return "skipped";

  const [owner, repo] = config.repo.split("/");
  const base = `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  const refData = await github(fetchImpl, config, `${base}/git/ref/heads/${config.branch}`);
  const parentSha = refData.object.sha;
  const parent = await github(fetchImpl, config, `${base}/git/commits/${parentSha}`);
  const tree = [];

  for (const file of files) {
    const blob = await github(fetchImpl, config, `${base}/git/blobs`, {
      method: "POST",
      body: { content: file.content, encoding: "utf-8" },
    });
    tree.push({ path: file.path, mode: "100644", type: "blob", sha: blob.sha });
  }
  for (const path of deletions) {
    tree.push({ path, mode: "100644", type: "blob", sha: null });
  }

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
  return "ok";
}
