import { v } from "convex/values";
import { query } from "./_generated/server";
import { getUserId } from "./auth";
import {
  computeCurrentStreakFromCommitEvents,
  formatLastSync,
  toDateKey,
  touchesLookbackBoundary,
} from "./lib";

const goalsValidator = v.object({
  commitsPerDay: v.number(),
  locPerDay: v.number(),
  pushByHour: v.number(),
  timezone: v.string(),
  updatedAt: v.number(),
});

async function computeStreakSnapshotFromCommitEvents(
  ctx: any,
  userId: string,
  anchorTimestamp: number,
  lookbackDays?: number,
) {
  const goals = await ctx.db
    .query("goals")
    .withIndex("by_user", (q: any) => q.eq("userId", userId))
    .first();
  const timezone = goals?.timezone ?? "UTC";

  const committedAt: number[] = [];
  let cursor: string | null = null;
  const batchSize = 256;
  const maxPages = 160;
  for (let page = 0; page < maxPages; page += 1) {
    const result: any = await ctx.db
      .query("commitEvents")
      .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
      .order("desc")
      .paginate({ numItems: batchSize, cursor });
    for (const commit of result.page) {
      committedAt.push(commit.committedAt);
    }
    if (result.isDone) break;
    cursor = result.continueCursor;
    if (!cursor) break;
  }

  const snapshot = computeCurrentStreakFromCommitEvents(committedAt, timezone, anchorTimestamp);
  const lookbackStartDateKey =
    lookbackDays !== undefined
      ? toDateKey(anchorTimestamp - lookbackDays * 24 * 60 * 60 * 1000, timezone)
      : null;

  return {
    timezone,
    ...snapshot,
    lookbackStartDateKey,
    touchesLookbackBoundary:
      lookbackStartDateKey === null
        ? false
        : touchesLookbackBoundary(snapshot.streakStartDateKey, lookbackStartDateKey),
    commitEventsScanned: committedAt.length,
  };
}

export const getConnections = query({
  args: {},
  returns: v.object({
    githubConnected: v.boolean(),
    telegramConnected: v.boolean(),
  }),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return { githubConnected: false, telegramConnected: false };
    }
    const github = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const telegram = await ctx.db
      .query("telegramConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    return {
      githubConnected: Boolean(github),
      telegramConnected: Boolean(telegram),
    };
  },
});

export const getGoals = query({
  args: {},
  returns: v.union(goalsValidator, v.null()),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return null;
    }
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!goals) return null;
    return {
      commitsPerDay: goals.commitsPerDay,
      locPerDay: goals.locPerDay,
      pushByHour: goals.pushByHour,
      timezone: goals.timezone,
      updatedAt: goals.updatedAt,
    };
  },
});

export const getOverview = query({
  args: {},
  returns: v.union(
    v.object({
      todayCommits: v.number(),
      todayLoc: v.number(),
      streakDays: v.number(),
      avgCommitSize: v.number(),
      weeklyCommits: v.number(),
      activeRepos: v.number(),
      lastSync: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return null;
    }
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const timeZone = goals?.timezone ?? "UTC";
    const todayKey = toDateKey(Date.now(), timeZone);

    const todayStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user_date", (q) => q.eq("userId", userId).eq("date", todayKey))
      .first();

    const recentStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(14);

    const recentWeek = recentStats.slice(0, 7);
    const weeklyCommits = recentWeek.reduce((acc, stat) => acc + stat.commitCount, 0);
    const weeklyLoc = recentWeek.reduce((acc, stat) => acc + stat.locChanged, 0);
    const avgCommitSize = weeklyCommits ? Math.round(weeklyLoc / weeklyCommits) : 0;

    const activeRepos = new Set<string>();
    for (const stat of recentStats.slice(0, 7)) {
      stat.reposTouched.forEach((repo) => activeRepos.add(repo));
    }

    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const streakSnapshot = await computeStreakSnapshotFromCommitEvents(
      ctx,
      userId,
      Date.now(),
    );
    const streakDays = streakSnapshot.streakDays;

    return {
      todayCommits: todayStats?.commitCount ?? 0,
      todayLoc: todayStats?.locChanged ?? 0,
      streakDays,
      avgCommitSize,
      weeklyCommits,
      activeRepos: activeRepos.size,
      lastSync: formatLastSync(connection?.lastSyncedAt),
    };
  },
});

export const getStatsRange = query({
  args: { days: v.number() },
  returns: v.array(
    v.object({
      date: v.string(),
      commitCount: v.number(),
      locChanged: v.number(),
      avgCommitSize: v.number(),
      reposTouched: v.array(v.string()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return [];
    }
    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.days);
    return stats.map((stat) => ({
      date: stat.date,
      commitCount: stat.commitCount,
      locChanged: stat.locChanged,
      avgCommitSize: stat.avgCommitSize,
      reposTouched: stat.reposTouched,
      updatedAt: stat.updatedAt,
    }));
  },
});

export const getStreakDebug = query({
  args: {},
  returns: v.union(
    v.object({
      timezone: v.string(),
      anchorDateKey: v.string(),
      streakDays: v.number(),
      streakStartDateKey: v.union(v.string(), v.null()),
      firstGapDateKey: v.union(v.string(), v.null()),
      newestDateKey: v.union(v.string(), v.null()),
      oldestDateKey: v.union(v.string(), v.null()),
      lookbackStartDateKey: v.union(v.string(), v.null()),
      touchesLookbackBoundary: v.boolean(),
      currentBackfillLookbackDays: v.union(v.number(), v.null()),
      pendingBackfillLookbackDays: v.array(v.number()),
      processingBackfillLookbackDays: v.array(v.number()),
      hasPendingSync: v.boolean(),
      commitEventsScanned: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!connection?.installationId) return null;

    const pendingJobs = await ctx.db
      .query("githubSyncJobs")
      .withIndex("by_installation_status", (q) =>
        q.eq("installationId", connection.installationId!).eq("status", "pending"),
      )
      .take(100);
    const processingJobs = await ctx.db
      .query("githubSyncJobs")
      .withIndex("by_installation_status", (q) =>
        q.eq("installationId", connection.installationId!).eq("status", "processing"),
      )
      .take(100);
    const pendingBackfillLookbackDays = pendingJobs
      .filter((job) => job.reason === "initial_backfill")
      .map((job) => job.lookbackDays)
      .filter((value): value is number => typeof value === "number");
    const processingBackfillLookbackDays = processingJobs
      .filter((job) => job.reason === "initial_backfill")
      .map((job) => job.lookbackDays)
      .filter((value): value is number => typeof value === "number");
    const currentBackfillLookbackDays = [...pendingBackfillLookbackDays, ...processingBackfillLookbackDays]
      .sort((a, b) => b - a)[0] ?? null;

    const snapshot = await computeStreakSnapshotFromCommitEvents(
      ctx,
      userId,
      Date.now(),
      currentBackfillLookbackDays ?? undefined,
    );

    return {
      timezone: snapshot.timezone,
      anchorDateKey: snapshot.anchorDateKey,
      streakDays: snapshot.streakDays,
      streakStartDateKey: snapshot.streakStartDateKey,
      firstGapDateKey: snapshot.firstGapDateKey,
      newestDateKey: snapshot.newestDateKey,
      oldestDateKey: snapshot.oldestDateKey,
      lookbackStartDateKey: snapshot.lookbackStartDateKey,
      touchesLookbackBoundary: snapshot.touchesLookbackBoundary,
      currentBackfillLookbackDays,
      pendingBackfillLookbackDays,
      processingBackfillLookbackDays,
      hasPendingSync: pendingJobs.length > 0 || processingJobs.length > 0,
      commitEventsScanned: snapshot.commitEventsScanned,
    };
  },
});

export const getActivity = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      message: v.string(),
      repo: v.string(),
      size: v.number(),
      committedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getUserId(ctx);
    if (!userId) {
      return [];
    }
    const limit = Math.min(args.limit ?? 6, 20);
    const commits = await ctx.db
      .query("commitEvents")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(limit);

    return commits.map((commit) => ({
      message: commit.message,
      repo: commit.repo,
      size: commit.size,
      committedAt: commit.committedAt,
    }));
  },
});
