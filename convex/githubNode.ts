"use node";

import { ConvexError, v } from "convex/values";
import { createSign } from "crypto";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import {
  BACKFILL_STEP_DAYS,
  INITIAL_BACKFILL_DAYS,
  MAX_BACKFILL_DAYS,
} from "./lib";

const GITHUB_API = "https://api.github.com";
const SYNC_SAFETY_WINDOW_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REPO_LIMIT = 120;
const DEFAULT_COMMIT_PAGE_LIMIT = 8;
const WORKER_BATCH_SIZE = 8;
const WORKER_CONCURRENCY = 3;

type SyncJob = {
  id: Id<"githubSyncJobs">;
  userId: string;
  installationId: number;
  repoFullName: string | null;
  lookbackDays: number | null;
  reason: "initial_backfill" | "push" | "installation_repositories" | "reconcile";
  attempt: number;
};

type InstallationRepo = {
  id: number;
  full_name: string;
  archived: boolean;
  disabled: boolean;
  fork: boolean;
  default_branch?: string | null;
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

async function fetchCommits(
  token: string,
  repoFullName: string,
  sinceIso: string,
  commitPageLimit: number,
  branch: string,
  authorLogin?: string | null,
) {
  const commits: { sha: string }[] = [];
  for (let page = 1; page <= commitPageLimit; page += 1) {
    const authorPart = authorLogin ? `&author=${encodeURIComponent(authorLogin)}` : "";
    const branchPart = `&sha=${encodeURIComponent(branch)}`;
    const url = `${GITHUB_API}/repos/${repoFullName}/commits?since=${encodeURIComponent(sinceIso)}${branchPart}${authorPart}&per_page=100&page=${page}`;
    let batch: { sha: string }[];
    try {
      batch = await githubRequest<{ sha: string }[]>(token, url);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("(404)") || message.includes("(409)") || message.includes("(422)")) {
        return commits;
      }
      throw error;
    }
    if (!batch.length) break;
    commits.push(...batch);
    if (batch.length < 100) break;
  }
  return commits;
}

function getContributionBranches(defaultBranch?: string | null) {
  const branches = new Set<string>();
  if (defaultBranch && defaultBranch.trim().length > 0) {
    branches.add(defaultBranch.trim());
  }
  branches.add("gh-pages");
  return Array.from(branches);
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

  const requestedLookbackDays =
    job.reason === "initial_backfill"
      ? Math.max(
          INITIAL_BACKFILL_DAYS,
          Math.min(MAX_BACKFILL_DAYS, job.lookbackDays ?? INITIAL_BACKFILL_DAYS),
        )
      : null;
  const now = Date.now();
  const shouldBackfill = job.reason === "initial_backfill";
  const sinceTimestamp = shouldBackfill
    ? now - (requestedLookbackDays ?? INITIAL_BACKFILL_DAYS) * 24 * 60 * 60 * 1000
    : Math.max(0, (connection.lastSyncedAt ?? now) - SYNC_SAFETY_WINDOW_MS);
  const sinceIso = new Date(sinceTimestamp).toISOString();

  const allRepos = await fetchInstallationRepos(installationToken);
  const repos = job.repoFullName
    ? allRepos.filter((repo) => repo.full_name === job.repoFullName)
    : allRepos;

  let earliest: number | null = connection.syncedFromAt ?? null;
  let latest: number | null = connection.syncedToAt ?? null;

  for (const repo of repos) {
    if (repo.archived || repo.disabled || repo.fork) continue;
    const branchCandidates = getContributionBranches(repo.default_branch);
    const commitShas = new Set<string>();
    for (const branch of branchCandidates) {
      const commits = await fetchCommits(
        installationToken,
        repo.full_name,
        sinceIso,
        DEFAULT_COMMIT_PAGE_LIMIT,
        branch,
        connection.githubLogin,
      );
      for (const commit of commits) {
        commitShas.add(commit.sha);
      }
    }

    for (const sha of commitShas) {
      const detail = await githubRequest<{
        sha: string;
        html_url: string;
        commit: {
          message: string;
          author?: { date?: string | null } | null;
          committer?: { date?: string | null } | null;
        };
        stats: { additions: number; deletions: number; total: number };
        files: { filename: string }[];
      }>(installationToken, `${GITHUB_API}/repos/${repo.full_name}/commits/${sha}`);

      // GitHub profile contributions are keyed to the commit author timestamp.
      const authoredDate = detail.commit.author?.date ?? detail.commit.committer?.date;
      const committedAt = authoredDate ? new Date(authoredDate).getTime() : Number.NaN;
      if (!Number.isFinite(committedAt)) {
        continue;
      }
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

  const streakSnapshot = await ctx.runQuery(internal.github.computeCurrentStreakSnapshot, {
    userId: connection.userId,
    anchorTimestamp: now,
    lookbackDays: requestedLookbackDays ?? undefined,
  });
  const shouldExtendBackfill =
    job.reason === "initial_backfill" &&
    streakSnapshot.touchesLookbackBoundary &&
    (requestedLookbackDays ?? INITIAL_BACKFILL_DAYS) < MAX_BACKFILL_DAYS;
  const nextLookbackDays = shouldExtendBackfill
    ? Math.min(MAX_BACKFILL_DAYS, (requestedLookbackDays ?? INITIAL_BACKFILL_DAYS) + BACKFILL_STEP_DAYS)
    : null;

  if (shouldExtendBackfill && nextLookbackDays !== null) {
    await ctx.runMutation(internal.github.enqueueSyncJob, {
      userId: connection.userId,
      installationId: job.installationId,
      reason: "initial_backfill",
      lookbackDays: nextLookbackDays,
      runAfter: now,
      status: "pending",
      attempt: 0,
    });
    console.log(
      JSON.stringify({
        msg: "Extending initial backfill",
        userId: connection.userId,
        installationId: job.installationId,
        lookbackDays: requestedLookbackDays,
        streakDays: streakSnapshot.streakDays,
        touchesLookbackBoundary: streakSnapshot.touchesLookbackBoundary,
        nextLookbackDays,
      }),
    );
  } else if (job.reason === "initial_backfill") {
    console.log(
      JSON.stringify({
        msg: "Initial backfill boundary resolved",
        userId: connection.userId,
        installationId: job.installationId,
        lookbackDays: requestedLookbackDays,
        streakDays: streakSnapshot.streakDays,
        touchesLookbackBoundary: streakSnapshot.touchesLookbackBoundary,
      }),
    );
  }

  await ctx.runMutation(internal.github.markSynced, {
    userId: connection.userId,
    timestamp: now,
    historySyncedAt: shouldBackfill && !shouldExtendBackfill ? now : undefined,
    syncedFromAt: earliest ?? undefined,
    syncedToAt: latest ?? undefined,
    streakDays: streakSnapshot.streakDays,
    streakUpdatedAt: now,
    syncStatus: shouldExtendBackfill ? "syncing" : "idle",
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
  returns: v.null(),
  handler: async (ctx) => {
    const maxRounds = 6;
    for (let round = 0; round < maxRounds; round += 1) {
      const claimed = (await ctx.runMutation(internal.github.claimSyncJobs, {
        limit: WORKER_BATCH_SIZE,
        now: Date.now(),
      })) as SyncJob[];
      if (!claimed.length) break;

      await runBatches(claimed, WORKER_CONCURRENCY, async (job) => {
        await processJobWithRetry(ctx, job);
      });
    }

    return null;
  },
});
