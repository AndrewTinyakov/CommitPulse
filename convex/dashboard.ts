import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { getUserId } from "./auth";
import { computeStreakFromDateKeys, formatLastSync, toDateKey } from "./lib";

const goalsValidator = v.object({
  commitsPerDay: v.number(),
  locPerDay: v.number(),
  pushByHour: v.number(),
  timezone: v.string(),
  updatedAt: v.number(),
});

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
    const streakDays = await computeStreakDays(ctx, userId);

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

async function computeStreakDays(ctx: QueryCtx, userId: string) {
  const batchSize = 60;
  let cursorDate: string | null = null;
  const dateKeys: string[] = [];

  while (true) {
    const batch = await ctx.db
      .query("dailyStats")
      .withIndex("by_user_date", (q) =>
        cursorDate ? q.eq("userId", userId).lt("date", cursorDate) : q.eq("userId", userId),
      )
      .order("desc")
      .take(batchSize);

    if (batch.length === 0) {
      break;
    }

    for (const stat of batch) {
      if (stat.commitCount > 0) {
        dateKeys.push(stat.date);
      }
    }

    if (batch.length < batchSize) {
      break;
    }
    cursorDate = batch[batch.length - 1].date;
  }

  return computeStreakFromDateKeys(dateKeys);
}

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
