import { v } from "convex/values";
import { query } from "./_generated/server";
import { getUserId } from "./auth";
import {
  computeCurrentStreakFromCommitEvents,
  computeCurrentStreakFromDateKeys,
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

const DAY_MS = 24 * 60 * 60 * 1000;
const STREAK_DEBUG_MAX_EVENTS = 8192;
const STREAK_DEBUG_RECENT_COMMITS = 120;
const STREAK_DEBUG_DAY_WINDOW = 45;

function incrementDateCount(map: Map<string, number>, dateKey: string) {
  map.set(dateKey, (map.get(dateKey) ?? 0) + 1);
}

function buildDayWindow(
  countsByDate: Map<string, number>,
  anchorTimestamp: number,
  timeZone: string,
  days: number,
) {
  return Array.from({ length: days }, (_, offset) => {
    const dateKey = toDateKey(anchorTimestamp - offset * DAY_MS, timeZone);
    return {
      dateKey,
      commitCount: countsByDate.get(dateKey) ?? 0,
      hasCommit: (countsByDate.get(dateKey) ?? 0) > 0,
    };
  });
}

async function loadCommitEventsForDebug(ctx: any, userId: string, maxEvents: number) {
  const commits: any[] = [];
  let cursor: string | null = null;
  let reachedEnd = false;
  const batchSize = 256;
  const maxPages = 240;

  for (let page = 0; page < maxPages; page += 1) {
    const result: any = await ctx.db
      .query("commitEvents")
      .withIndex("by_user_date", (q: any) => q.eq("userId", userId))
      .order("desc")
      .paginate({ numItems: batchSize, cursor });
    commits.push(...result.page);

    if (result.isDone) {
      reachedEnd = true;
      break;
    }
    if (commits.length >= maxEvents) {
      break;
    }
    cursor = result.continueCursor;
    if (!cursor) {
      reachedEnd = true;
      break;
    }
  }

  return {
    commits: commits.slice(0, maxEvents),
    truncated: commits.length >= maxEvents && !reachedEnd,
  };
}

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
    const streakDays = connection?.streakDays ?? streakSnapshot.streakDays;

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
  returns: v.union(v.any(), v.null()),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;

    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!connection?.installationId) return null;

    const installationId = connection.installationId;
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    const timezone = goals?.timezone ?? "UTC";
    const now = Date.now();

    const pendingJobs = await ctx.db
      .query("githubSyncJobs")
      .withIndex("by_installation_status", (q) =>
        q.eq("installationId", installationId).eq("status", "pending"),
      )
      .take(100);
    const processingJobs = await ctx.db
      .query("githubSyncJobs")
      .withIndex("by_installation_status", (q) =>
        q.eq("installationId", installationId).eq("status", "processing"),
      )
      .take(100);
    const failedJobs = await ctx.db
      .query("githubSyncJobs")
      .withIndex("by_installation_status", (q) =>
        q.eq("installationId", installationId).eq("status", "failed"),
      )
      .take(30);
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

    const { commits, truncated } = await loadCommitEventsForDebug(
      ctx,
      userId,
      STREAK_DEBUG_MAX_EVENTS,
    );
    const committedAt = commits.map((commit) => commit.committedAt);
    const snapshot = computeCurrentStreakFromCommitEvents(committedAt, timezone, now);
    const utcSnapshot = computeCurrentStreakFromCommitEvents(committedAt, "UTC", now);
    const lookbackStartDateKey =
      currentBackfillLookbackDays !== null
        ? toDateKey(now - currentBackfillLookbackDays * DAY_MS, timezone)
        : null;

    const countsByConfiguredTimezone = new Map<string, number>();
    const countsByUtc = new Map<string, number>();
    for (const commit of commits) {
      incrementDateCount(countsByConfiguredTimezone, toDateKey(commit.committedAt, timezone));
      incrementDateCount(countsByUtc, toDateKey(commit.committedAt, "UTC"));
    }

    const anchorDateKey = snapshot.anchorDateKey;
    const yesterdayDateKey = toDateKey(now - DAY_MS, timezone);
    const hasAnchorDayCommit = (countsByConfiguredTimezone.get(anchorDateKey) ?? 0) > 0;
    const hasYesterdayCommit = (countsByConfiguredTimezone.get(yesterdayDateKey) ?? 0) > 0;
    const startDateKeyByRule = hasAnchorDayCommit
      ? anchorDateKey
      : hasYesterdayCommit
        ? yesterdayDateKey
        : null;
    const streakRuleReason = !startDateKeyByRule
      ? `No commit on anchor (${anchorDateKey}) or yesterday (${yesterdayDateKey}); streak is forced to 0.`
      : snapshot.streakDays <= 1
        ? `Start date ${startDateKeyByRule} qualifies, but previous day is missing (${snapshot.firstGapDateKey ?? "unknown"}), so streak is ${snapshot.streakDays}.`
        : `Start date ${startDateKeyByRule} qualifies and consecutive days continue through ${snapshot.streakStartDateKey}; streak is ${snapshot.streakDays}.`;

    const configuredDayWindow = buildDayWindow(
      countsByConfiguredTimezone,
      now,
      timezone,
      STREAK_DEBUG_DAY_WINDOW,
    );
    const utcDayWindow = buildDayWindow(countsByUtc, now, "UTC", STREAK_DEBUG_DAY_WINDOW);

    const recentDailyStats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user_date", (q) => q.eq("userId", userId))
      .order("desc")
      .take(STREAK_DEBUG_DAY_WINDOW * 2);
    const dailyStatsDateKeys = recentDailyStats
      .filter((stat) => stat.commitCount > 0)
      .map((stat) => stat.date);
    const dailyStatsSnapshot = computeCurrentStreakFromDateKeys(dailyStatsDateKeys, anchorDateKey);

    const recentCommitSamples = commits.slice(0, STREAK_DEBUG_RECENT_COMMITS).map((commit) => {
      const sanitizedMessage = String(commit.message ?? "").replace(/\s+/g, " ").slice(0, 160);
      return {
        sha: commit.sha,
        repo: commit.repo,
        committedAt: commit.committedAt,
        committedAtIso: new Date(commit.committedAt).toISOString(),
        configuredDateKey: toDateKey(commit.committedAt, timezone),
        utcDateKey: toDateKey(commit.committedAt, "UTC"),
        additions: commit.additions,
        deletions: commit.deletions,
        filesChanged: commit.filesChanged,
        size: commit.size,
        message: sanitizedMessage,
      };
    });
    const timezoneShiftSamples = recentCommitSamples
      .filter((commit) => commit.configuredDateKey !== commit.utcDateKey)
      .slice(0, 25);

    const serializeJob = (job: any) => ({
      id: String(job._id),
      reason: job.reason,
      status: job.status,
      lookbackDays: job.lookbackDays ?? null,
      attempt: job.attempt,
      runAfter: job.runAfter,
      runAfterIso: new Date(job.runAfter).toISOString(),
      updatedAt: job.updatedAt,
      updatedAtIso: new Date(job.updatedAt).toISOString(),
      errorMessage: job.errorMessage ?? null,
      repoFullName: job.repoFullName ?? null,
    });

    const payload = {
      debugVersion: "streak-debug-v2",
      generatedAtIso: new Date(now).toISOString(),
      nowTimestamp: now,
      userId,
      goals: {
        timezone: goals?.timezone ?? null,
        commitsPerDay: goals?.commitsPerDay ?? null,
        locPerDay: goals?.locPerDay ?? null,
        pushByHour: goals?.pushByHour ?? null,
        updatedAt: goals?.updatedAt ?? null,
      },
      streakRule: {
        definition:
          "streak starts from anchor day if it has commits, else yesterday if it has commits; then counts consecutive commit days backwards until first missing day",
        anchorDateKey,
        yesterdayDateKey,
        hasAnchorDayCommit,
        hasYesterdayCommit,
        startDateKeyByRule,
        streakRuleReason,
      },
      streakFromCommitEventsConfiguredTimezone: snapshot,
      streakFromCommitEventsUtc: utcSnapshot,
      streakFromDailyStatsDateKeys: dailyStatsSnapshot,
      lookback: {
        currentBackfillLookbackDays,
        lookbackStartDateKey,
        touchesLookbackBoundary:
          lookbackStartDateKey === null
            ? false
            : touchesLookbackBoundary(snapshot.streakStartDateKey, lookbackStartDateKey),
      },
      commitEvents: {
        scannedCount: commits.length,
        truncated,
        newestCommittedAt: commits[0]?.committedAt ?? null,
        newestCommittedAtIso: commits[0]?.committedAt
          ? new Date(commits[0].committedAt).toISOString()
          : null,
        oldestCommittedAt: commits[commits.length - 1]?.committedAt ?? null,
        oldestCommittedAtIso: commits[commits.length - 1]?.committedAt
          ? new Date(commits[commits.length - 1].committedAt).toISOString()
          : null,
        uniqueDaysConfiguredTimezone: countsByConfiguredTimezone.size,
        uniqueDaysUtc: countsByUtc.size,
        configuredDayWindow,
        utcDayWindow,
        recentCommitSamples,
        timezoneShiftSamples,
      },
      dailyStats: {
        scannedCount: recentDailyStats.length,
        recent: recentDailyStats.map((stat) => ({
          date: stat.date,
          commitCount: stat.commitCount,
          locChanged: stat.locChanged,
          avgCommitSize: stat.avgCommitSize,
          reposTouched: stat.reposTouched,
          updatedAt: stat.updatedAt,
          updatedAtIso: new Date(stat.updatedAt).toISOString(),
        })),
      },
      connection: {
        installationId,
        githubLogin: connection.githubLogin ?? null,
        installationAccountLogin: connection.installationAccountLogin ?? null,
        installationAccountType: connection.installationAccountType ?? null,
        repoSelectionMode: connection.repoSelectionMode ?? null,
        syncStatus: connection.syncStatus ?? null,
        lastSyncedAt: connection.lastSyncedAt ?? null,
        lastSyncedAtIso: connection.lastSyncedAt
          ? new Date(connection.lastSyncedAt).toISOString()
          : null,
        syncedFromAt: connection.syncedFromAt ?? null,
        syncedFromAtIso: connection.syncedFromAt
          ? new Date(connection.syncedFromAt).toISOString()
          : null,
        syncedToAt: connection.syncedToAt ?? null,
        syncedToAtIso: connection.syncedToAt
          ? new Date(connection.syncedToAt).toISOString()
          : null,
        historySyncedAt: connection.historySyncedAt ?? null,
        historySyncedAtIso: connection.historySyncedAt
          ? new Date(connection.historySyncedAt).toISOString()
          : null,
        lastWebhookAt: connection.lastWebhookAt ?? null,
        lastWebhookAtIso: connection.lastWebhookAt
          ? new Date(connection.lastWebhookAt).toISOString()
          : null,
        lastErrorCode: connection.lastErrorCode ?? null,
        lastErrorMessage: connection.lastErrorMessage ?? null,
        streakDaysStored: connection.streakDays ?? null,
        streakUpdatedAt: connection.streakUpdatedAt ?? null,
        streakUpdatedAtIso: connection.streakUpdatedAt
          ? new Date(connection.streakUpdatedAt).toISOString()
          : null,
      },
      syncJobs: {
        pendingCount: pendingJobs.length,
        processingCount: processingJobs.length,
        failedCount: failedJobs.length,
        pendingSample: pendingJobs.slice(0, 30).map(serializeJob),
        processingSample: processingJobs.slice(0, 30).map(serializeJob),
        failedSample: failedJobs.slice(0, 20).map(serializeJob),
      },
    };
    const debugDump = [
      "=== STREAK DEBUG DUMP START ===",
      "Paste the full content into chat.",
      JSON.stringify(payload, null, 2),
      "=== STREAK DEBUG DUMP END ===",
    ].join("\n");

    return {
      timezone,
      anchorDateKey: snapshot.anchorDateKey,
      streakDays: snapshot.streakDays,
      streakStartDateKey: snapshot.streakStartDateKey,
      firstGapDateKey: snapshot.firstGapDateKey,
      newestDateKey: snapshot.newestDateKey,
      oldestDateKey: snapshot.oldestDateKey,
      lookbackStartDateKey,
      touchesLookbackBoundary:
        lookbackStartDateKey === null
          ? false
          : touchesLookbackBoundary(snapshot.streakStartDateKey, lookbackStartDateKey),
      currentBackfillLookbackDays,
      pendingBackfillLookbackDays,
      processingBackfillLookbackDays,
      hasPendingSync: pendingJobs.length > 0 || processingJobs.length > 0,
      commitEventsScanned: commits.length,
      debugVersion: "streak-debug-v2",
      debugDump,
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
