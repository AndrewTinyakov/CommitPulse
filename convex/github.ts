import { ConvexError, v } from "convex/values";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import { formatLastSync, maskToken, toDateKey, uniquePush } from "./lib";
import { getUserId, requireUserId } from "./auth";

const GITHUB_API = "https://api.github.com";
const GITHUB_GRAPHQL_API = "https://api.github.com/graphql";
const HISTORY_BACKFILL_DAYS = 90;
const HISTORY_BACKFILL_WINDOW_MS = HISTORY_BACKFILL_DAYS * 24 * 60 * 60 * 1000;
const SYNC_SAFETY_WINDOW_MS = 6 * 60 * 60 * 1000;
const DEFAULT_REPO_PAGE_LIMIT = 3;
const DEFAULT_REPO_LIMIT = 50;
const DEFAULT_COMMIT_PAGE_LIMIT = 2;
const HISTORY_REPO_PAGE_LIMIT = 4;
const HISTORY_REPO_LIMIT = 120;
const HISTORY_COMMIT_PAGE_LIMIT = 4;
const STREAK_REFRESH_WINDOW_MS = 6 * 60 * 60 * 1000;
const STREAK_LOOKBACK_DAYS = 1200;
const STREAK_WINDOW_DAYS = 370;

async function githubRequest<T>(token: string, url: string, timeoutMs = 12000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "commit-tracker",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new ConvexError({
        code: "GITHUB_TIMEOUT",
        message: "GitHub request timed out",
      });
    }
    throw new ConvexError({
      code: "GITHUB_REQUEST_FAILED",
      message: "GitHub request failed",
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const text = await response.text();
    const message =
      response.status === 401
        ? "GitHub token is invalid or expired"
        : `GitHub API error (${response.status})`;
    console.warn("GitHub API error", response.status, text);
    throw new ConvexError({
      code: "GITHUB_API_ERROR",
      message,
    });
  }
  return (await response.json()) as T;
}

async function githubGraphqlRequest<T>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  timeoutMs = 12000,
) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response: Response;
  try {
    response = await fetch(GITHUB_GRAPHQL_API, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "commit-tracker",
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      body: JSON.stringify({ query, variables }),
    });
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new ConvexError({
        code: "GITHUB_TIMEOUT",
        message: "GitHub request timed out",
      });
    }
    throw new ConvexError({
      code: "GITHUB_REQUEST_FAILED",
      message: "GitHub request failed",
    });
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) {
    const text = await response.text();
    const message =
      response.status === 401
        ? "GitHub token is invalid or expired"
        : `GitHub API error (${response.status})`;
    console.warn("GitHub GraphQL error", response.status, text);
    throw new ConvexError({
      code: "GITHUB_API_ERROR",
      message,
    });
  }
  const payload = (await response.json()) as { data?: T; errors?: { message: string }[] };
  if (payload.errors?.length) {
    console.warn("GitHub GraphQL error payload", payload.errors);
    throw new ConvexError({
      code: "GITHUB_API_ERROR",
      message: payload.errors[0]?.message ?? "GitHub GraphQL error",
    });
  }
  return payload.data as T;
}

async function fetchPaged<T>(token: string, url: string, limit = 5) {
  const results: T[] = [];
  for (let page = 1; page <= limit; page += 1) {
    const pageUrl = url.includes("?") ? `${url}&per_page=100&page=${page}` : `${url}?per_page=100&page=${page}`;
    const data = await githubRequest<T[]>(token, pageUrl);
    if (data.length === 0) {
      break;
    }
    results.push(...data);
    if (data.length < 100) {
      break;
    }
  }
  return results;
}

type ContributionDay = { date: string; contributionCount: number };

async function fetchContributionDays(token: string, from: Date, to: Date) {
  const query = `
    query($from: DateTime!, $to: DateTime!) {
      viewer {
        contributionsCollection(from: $from, to: $to) {
          contributionCalendar {
            weeks {
              contributionDays {
                date
                contributionCount
              }
            }
          }
        }
      }
    }
  `;
  const data = await githubGraphqlRequest<{
    viewer: {
      contributionsCollection: {
        contributionCalendar: { weeks: { contributionDays: ContributionDay[] }[] };
      } | null;
    } | null;
  }>(token, query, { from: from.toISOString(), to: to.toISOString() });

  const weeks = data.viewer?.contributionsCollection?.contributionCalendar?.weeks ?? [];
  return weeks.flatMap((week) => week.contributionDays);
}

async function computeContributionStreak(token: string) {
  const dayMs = 24 * 60 * 60 * 1000;
  const toDayStamp = (dateKey: string) => new Date(`${dateKey}T00:00:00Z`).getTime();

  let streakDays = 0;
  let lastDate: string | null = null;
  let skipDate: string | null = null;
  let cursor = new Date();
  let remainingDays = STREAK_LOOKBACK_DAYS;

  while (remainingDays > 0) {
    const windowDays = Math.min(STREAK_WINDOW_DAYS, remainingDays);
    const from = new Date(cursor.getTime() - (windowDays - 1) * dayMs);
    const days = await fetchContributionDays(token, from, cursor);
    if (days.length === 0) {
      break;
    }
    const sorted = [...days].sort((a, b) => (a.date < b.date ? 1 : -1));
    if (!skipDate) {
      const latest = sorted[0];
      if (latest && latest.contributionCount === 0) {
        skipDate = latest.date;
      }
    }

    for (const day of sorted) {
      if (lastDate && day.date > lastDate) {
        continue;
      }
      if (skipDate && day.date === skipDate && day.contributionCount === 0) {
        lastDate = day.date;
        skipDate = null;
        continue;
      }
      if (day.contributionCount === 0) {
        return streakDays;
      }
      if (!lastDate) {
        streakDays = 1;
        lastDate = day.date;
        continue;
      }
      if (day.date === lastDate) {
        continue;
      }
      const diffDays = Math.round((toDayStamp(lastDate) - toDayStamp(day.date)) / dayMs);
      if (diffDays !== 1) {
        return streakDays;
      }
      streakDays = streakDays === 0 ? 1 : streakDays + 1;
      lastDate = day.date;
    }

    const oldest = sorted[sorted.length - 1];
    if (!oldest) {
      break;
    }
    cursor = new Date(toDayStamp(oldest.date) - dayMs);
    remainingDays -= windowDays;
  }

  return streakDays;
}

export const connectWithToken = action({
  args: { token: v.string() },
  returns: v.object({ login: v.string() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const user = await githubRequest<{ login: string }>(args.token, `${GITHUB_API}/user`);

    await ctx.runMutation(internal.github.upsertConnection, {
      userId,
      token: args.token,
      login: user.login,
    });

    return { login: user.login };
  },
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (connection) {
      await ctx.db.delete(connection._id);
    }
    return null;
  },
});

export const getConnection = query({
  args: {},
  returns: v.union(
    v.object({
      connected: v.boolean(),
      login: v.union(v.string(), v.null()),
      lastSync: v.union(v.string(), v.null()),
      lastSyncedAt: v.union(v.number(), v.null()),
      tokenMasked: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return null;
    }
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!connection) {
      return {
        connected: false,
        login: null,
        lastSync: null,
        lastSyncedAt: null,
        tokenMasked: null,
      } as const;
    }
    return {
      login: connection.githubLogin ?? "unknown",
      lastSync: formatLastSync(connection.lastSyncedAt),
      connected: true,
      lastSyncedAt: connection.lastSyncedAt ?? null,
      tokenMasked: maskToken(connection.accessToken),
    };
  },
});

export const syncNow = action({
  args: {},
  returns: v.object({ commits: v.number(), repos: v.number() }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connection = await ctx.runQuery(internal.github.getConnectionInternal, {
      userId,
    });
    if (!connection || !connection.connected || !connection.token) {
      throw new ConvexError({
        code: "NO_GITHUB_CONNECTION",
        message: "No GitHub connection",
      });
    }
    return await syncUser(
      ctx,
      {
        userId,
        token: connection.token,
        login: connection.login,
        lastSyncedAt: connection.lastSyncedAt,
        historySyncedAt: connection.historySyncedAt,
        streakUpdatedAt: connection.streakUpdatedAt,
      },
      { forceStreakRefresh: true },
    );
  },
});

export const syncAll = internalAction({
  args: {},
  returns: v.object({ commits: v.number() }),
  handler: async (ctx) => {
    const connections = await ctx.runQuery(internal.github.listConnections, {});
    let totalCommits = 0;
    for (const connection of connections) {
      const result = await syncUser(ctx, connection);
      totalCommits += result.commits;
    }
    return { commits: totalCommits };
  },
});

const upsertConnection = internalMutation({
  args: { userId: v.string(), token: v.string(), login: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const payload = {
      userId: args.userId,
      accessToken: args.token,
      githubLogin: args.login,
      connectedAt: Date.now(),
    };
    if (existing) {
      await ctx.db.patch(existing._id, { ...payload, lastSyncedAt: existing.lastSyncedAt });
    } else {
      await ctx.db.insert("githubConnections", payload);
    }
    return null;
  },
});

const listConnections = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      userId: v.string(),
      token: v.string(),
      login: v.string(),
      lastSyncedAt: v.union(v.number(), v.null()),
      historySyncedAt: v.union(v.number(), v.null()),
      streakDays: v.union(v.number(), v.null()),
      streakUpdatedAt: v.union(v.number(), v.null()),
    }),
  ),
  handler: async (ctx) => {
    const connections = await ctx.db.query("githubConnections").collect();
    return connections.map((connection) => ({
      userId: connection.userId,
      token: connection.accessToken,
      login: connection.githubLogin ?? "unknown",
      lastSyncedAt: connection.lastSyncedAt ?? null,
      historySyncedAt: connection.historySyncedAt ?? null,
      streakDays: connection.streakDays ?? null,
      streakUpdatedAt: connection.streakUpdatedAt ?? null,
    }));
  },
});

const getConnectionInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      connected: v.boolean(),
      login: v.string(),
      token: v.string(),
      lastSyncedAt: v.union(v.number(), v.null()),
      historySyncedAt: v.union(v.number(), v.null()),
      streakDays: v.union(v.number(), v.null()),
      streakUpdatedAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!connection) {
      return null;
    }
    return {
      login: connection.githubLogin ?? "unknown",
      connected: true,
      token: connection.accessToken,
      lastSyncedAt: connection.lastSyncedAt ?? null,
      historySyncedAt: connection.historySyncedAt ?? null,
      streakDays: connection.streakDays ?? null,
      streakUpdatedAt: connection.streakUpdatedAt ?? null,
    };
  },
});

const markSynced = internalMutation({
  args: {
    userId: v.string(),
    timestamp: v.number(),
    historySyncedAt: v.optional(v.number()),
    streakDays: v.optional(v.number()),
    streakUpdatedAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (existing) {
      const patch: {
        lastSyncedAt: number;
        historySyncedAt?: number;
        streakDays?: number;
        streakUpdatedAt?: number;
      } = {
        lastSyncedAt: args.timestamp,
      };
      if (args.historySyncedAt !== undefined) {
        patch.historySyncedAt = args.historySyncedAt;
      }
      if (args.streakDays !== undefined) {
        patch.streakDays = args.streakDays;
      }
      if (args.streakUpdatedAt !== undefined) {
        patch.streakUpdatedAt = args.streakUpdatedAt;
      }
      await ctx.db.patch(existing._id, patch);
    }
    return null;
  },
});

const saveCommit = internalMutation({
  args: {
    userId: v.string(),
    repo: v.string(),
    repoId: v.optional(v.number()),
    sha: v.string(),
    message: v.string(),
    url: v.string(),
    additions: v.number(),
    deletions: v.number(),
    filesChanged: v.number(),
    committedAt: v.number(),
  },
  returns: v.object({ inserted: v.boolean() }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("commitEvents")
      .withIndex("by_user_sha", (q) => q.eq("userId", args.userId).eq("sha", args.sha))
      .first();
    if (existing) {
      return { inserted: false };
    }
    const size = args.additions + args.deletions;
    await ctx.db.insert("commitEvents", { ...args, size });

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    const timeZone = goals?.timezone ?? "UTC";
    const dateKey = toDateKey(args.committedAt, timeZone);

    const daily = await ctx.db
      .query("dailyStats")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("date", dateKey))
      .first();

    if (!daily) {
      await ctx.db.insert("dailyStats", {
        userId: args.userId,
        date: dateKey,
        commitCount: 1,
        locChanged: size,
        avgCommitSize: size,
        reposTouched: [args.repo],
        updatedAt: Date.now(),
      });
      return { inserted: true };
    }

    const nextCommitCount = daily.commitCount + 1;
    const nextLoc = daily.locChanged + size;
    await ctx.db.patch(daily._id, {
      commitCount: nextCommitCount,
      locChanged: nextLoc,
      avgCommitSize: Math.round(nextLoc / nextCommitCount),
      reposTouched: uniquePush(daily.reposTouched, args.repo),
      updatedAt: Date.now(),
    });

    return { inserted: true };
  },
});

async function syncUser(
  ctx: { runMutation: any; runQuery: any },
  connection: {
    userId: string;
    token: string;
    login: string;
    lastSyncedAt?: number | null;
    historySyncedAt?: number | null;
    streakUpdatedAt?: number | null;
  },
  options: { forceStreakRefresh?: boolean } = {},
) {
  const now = Date.now();
  const shouldBackfill = !connection.historySyncedAt;
  const shouldRefreshStreak =
    options.forceStreakRefresh ||
    !connection.streakUpdatedAt ||
    now - connection.streakUpdatedAt > STREAK_REFRESH_WINDOW_MS;
  const sinceTimestamp =
    connection.lastSyncedAt && !shouldBackfill
      ? connection.lastSyncedAt - SYNC_SAFETY_WINDOW_MS
      : now - HISTORY_BACKFILL_WINDOW_MS;
  const since = new Date(sinceTimestamp).toISOString();

  const repoPageLimit = shouldBackfill ? HISTORY_REPO_PAGE_LIMIT : DEFAULT_REPO_PAGE_LIMIT;
  const repoLimit = shouldBackfill ? HISTORY_REPO_LIMIT : DEFAULT_REPO_LIMIT;
  const commitPageLimit = shouldBackfill ? HISTORY_COMMIT_PAGE_LIMIT : DEFAULT_COMMIT_PAGE_LIMIT;

  const repos = await fetchPaged<{
    name: string;
    full_name: string;
    owner: { login: string };
    archived: boolean;
    disabled: boolean;
    id: number;
  }>(connection.token, `${GITHUB_API}/user/repos?sort=updated`, repoPageLimit);

  let commitsSaved = 0;
  let reposProcessed = 0;

  for (const repo of repos.slice(0, repoLimit)) {
    if (repo.archived || repo.disabled) continue;
    reposProcessed += 1;
    const commits = await fetchPaged<{ sha: string }>(
      connection.token,
      `${GITHUB_API}/repos/${repo.full_name}/commits?author=${connection.login}&since=${since}`,
      commitPageLimit,
    );

    for (const commit of commits) {
      const detail = await githubRequest<{
        sha: string;
        html_url: string;
        commit: { message: string; committer: { date: string } };
        stats: { additions: number; deletions: number; total: number };
        files: { filename: string }[];
      }>(connection.token, `${GITHUB_API}/repos/${repo.full_name}/commits/${commit.sha}`);

      const commitResult = await ctx.runMutation(internal.github.saveCommit, {
        userId: connection.userId,
        repo: repo.full_name,
        repoId: repo.id,
        sha: detail.sha,
        message: detail.commit.message ?? "",
        url: detail.html_url,
        additions: detail.stats?.additions ?? 0,
        deletions: detail.stats?.deletions ?? 0,
        filesChanged: detail.files?.length ?? 0,
        committedAt: new Date(detail.commit.committer.date).getTime(),
      });

      if (commitResult.inserted) {
        commitsSaved += 1;
      }
    }
  }

  let streakDays: number | null = null;
  if (shouldRefreshStreak) {
    try {
      streakDays = await computeContributionStreak(connection.token);
    } catch (error) {
      console.warn("Failed to refresh GitHub streak", error);
    }
  }

  await ctx.runMutation(internal.github.markSynced, {
    userId: connection.userId,
    timestamp: now,
    historySyncedAt: shouldBackfill ? now : undefined,
    streakDays: streakDays ?? undefined,
    streakUpdatedAt: streakDays !== null ? now : undefined,
  });

  return { commits: commitsSaved, repos: reposProcessed };
}

export { getConnectionInternal, listConnections, markSynced, saveCommit, upsertConnection };
