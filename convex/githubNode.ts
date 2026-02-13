"use node";

import { ConvexError } from "convex/values";
import { createSign } from "crypto";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const GITHUB_API = "https://api.github.com";
const SYNC_SAFETY_WINDOW_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REPO_LIMIT = 120;
const DEFAULT_COMMIT_PAGE_LIMIT = 3;
const BASE_BACKFILL_DAYS = 365;
const WORKER_BATCH_SIZE = 8;
const WORKER_CONCURRENCY = 3;

type SyncJob = {
  id: Id<"githubSyncJobs">;
  userId: string;
  installationId: number;
  repoFullName: string | null;
  reason: "initial_backfill" | "push" | "installation_repositories" | "reconcile";
  attempt: number;
};

type InstallationRepo = {
  id: number;
  full_name: string;
  archived: boolean;
  disabled: boolean;
};

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new ConvexError({
      code: "MISSING_ENV",
      message: `Missing required env: ${name}`,
    });
  }
  return value;
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function getGithubAppJwt() {
  const appId = getRequiredEnv("GITHUB_APP_ID");
  const privateKeyRaw = getRequiredEnv("GITHUB_APP_PRIVATE_KEY");
  const privateKey = privateKeyRaw.includes("\\n") ? privateKeyRaw.replace(/\\n/g, "\n") : privateKeyRaw;
  const nowSec = Math.floor(Date.now() / 1000);

  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iat: nowSec - 60,
    exp: nowSec + 9 * 60,
    iss: appId,
  };

  const encodedHeader = base64Url(JSON.stringify(header));
  const encodedPayload = base64Url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signer = createSign("RSA-SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign(privateKey);

  return `${signingInput}.${base64Url(signature)}`;
}

async function githubRequest<T>(token: string, url: string, init: RequestInit = {}, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "commit-tracker",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!response.ok) {
    const text = await response.text();
    throw new ConvexError({
      code: "GITHUB_API_ERROR",
      message: `GitHub API error (${response.status})`,
      details: text,
    });
  }

  return (await response.json()) as T;
}

async function getInstallationToken(installationId: number) {
  const appJwt = getGithubAppJwt();
  const data = await githubRequest<{ token: string }>(
    appJwt,
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    { method: "POST" },
  );
  return data.token;
}

async function fetchInstallationRepos(token: string, limit = DEFAULT_REPO_LIMIT) {
  const repos: InstallationRepo[] = [];
  for (let page = 1; page <= 5; page += 1) {
    const data = await githubRequest<{
      repositories: InstallationRepo[];
    }>(token, `${GITHUB_API}/installation/repositories?per_page=100&page=${page}`);

    if (!data.repositories.length) break;
    repos.push(...data.repositories);
    if (data.repositories.length < 100 || repos.length >= limit) break;
  }
  return repos.slice(0, limit);
}

async function fetchCommits(token: string, repoFullName: string, sinceIso: string, commitPageLimit: number) {
  const commits: { sha: string }[] = [];
  for (let page = 1; page <= commitPageLimit; page += 1) {
    const url = `${GITHUB_API}/repos/${repoFullName}/commits?since=${encodeURIComponent(sinceIso)}&per_page=100&page=${page}`;
    const batch = await githubRequest<{ sha: string }[]>(token, url);
    if (!batch.length) break;
    commits.push(...batch);
    if (batch.length < 100) break;
  }
  return commits;
}

async function processJob(ctx: any, job: SyncJob) {
  const connection = await ctx.runQuery(internal.github.getConnectionByInstallation, {
    installationId: job.installationId,
  });
  if (!connection) {
    await ctx.runMutation(internal.github.completeSyncJob, { jobId: job.id });
    return;
  }

  await ctx.runMutation(internal.github.setSyncStatus, {
    userId: connection.userId,
    status: "syncing",
  });

  const installationToken = await getInstallationToken(job.installationId);

  const backfillDays = Math.max(BASE_BACKFILL_DAYS, connection.streakDays ?? 0);
  const now = Date.now();
  const shouldBackfill = !connection.historySyncedAt || job.reason === "initial_backfill";
  const sinceTimestamp = shouldBackfill
    ? now - backfillDays * 24 * 60 * 60 * 1000
    : Math.max(0, (connection.lastSyncedAt ?? now) - SYNC_SAFETY_WINDOW_MS);
  const sinceIso = new Date(sinceTimestamp).toISOString();

  const allRepos = await fetchInstallationRepos(installationToken);
  const repos = job.repoFullName
    ? allRepos.filter((repo) => repo.full_name === job.repoFullName)
    : allRepos;

  let earliest: number | null = connection.syncedFromAt ?? null;
  let latest: number | null = connection.syncedToAt ?? null;

  for (const repo of repos) {
    if (repo.archived || repo.disabled) continue;
    const commits = await fetchCommits(installationToken, repo.full_name, sinceIso, DEFAULT_COMMIT_PAGE_LIMIT);

    for (const commit of commits) {
      const detail = await githubRequest<{
        sha: string;
        html_url: string;
        commit: { message: string; committer: { date: string } };
        stats: { additions: number; deletions: number; total: number };
        files: { filename: string }[];
      }>(installationToken, `${GITHUB_API}/repos/${repo.full_name}/commits/${commit.sha}`);

      const committedAt = new Date(detail.commit.committer.date).getTime();
      earliest = earliest === null ? committedAt : Math.min(earliest, committedAt);
      latest = latest === null ? committedAt : Math.max(latest, committedAt);

      await ctx.runMutation(internal.github.saveCommit, {
        userId: connection.userId,
        repo: repo.full_name,
        repoId: repo.id,
        sha: detail.sha,
        message: detail.commit.message ?? "",
        url: detail.html_url,
        additions: detail.stats?.additions ?? 0,
        deletions: detail.stats?.deletions ?? 0,
        filesChanged: detail.files?.length ?? 0,
        committedAt,
      });
    }
  }

  await ctx.runMutation(internal.github.markSynced, {
    userId: connection.userId,
    timestamp: now,
    historySyncedAt: shouldBackfill ? now : undefined,
    syncedFromAt: earliest ?? undefined,
    syncedToAt: latest ?? undefined,
  });

  await ctx.runMutation(internal.github.completeSyncJob, { jobId: job.id });
}

async function processJobWithRetry(ctx: any, job: SyncJob) {
  try {
    await processJob(ctx, job);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown sync error";

    await ctx.runMutation(internal.github.setSyncStatus, {
      userId: job.userId,
      status: "error",
      errorCode: "SYNC_JOB_FAILED",
      errorMessage: message,
    });

    await ctx.runMutation(internal.github.failSyncJob, {
      jobId: job.id,
      attempt: job.attempt + 1,
      errorMessage: message,
    });
  }
}

async function runBatches<T>(items: T[], batchSize: number, fn: (item: T) => Promise<void>) {
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    await Promise.all(batch.map((item) => fn(item)));
  }
}

export const runSyncWorker = internalAction({
  args: {},
  returns: null,
  handler: async (ctx) => {
    const claimed = (await ctx.runMutation(internal.github.claimSyncJobs, {
      limit: WORKER_BATCH_SIZE,
      now: Date.now(),
    })) as SyncJob[];

    if (!claimed.length) return null;

    await runBatches(claimed, WORKER_CONCURRENCY, async (job) => {
      await processJobWithRetry(ctx, job);
    });

    return null;
  },
});
