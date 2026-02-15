import { ConvexError, v } from "convex/values";
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";
import { internal } from "./_generated/api";
import {
  INITIAL_BACKFILL_DAYS,
  computeCurrentStreakFromCommitEvents,
  formatLastSync,
  touchesLookbackBoundary,
  toDateKey,
  uniquePush,
} from "./lib";
import { getUserId, requireUserId } from "./auth";

const MAX_JOB_ATTEMPTS = 6;

export const completeGithubAppSetup = action({
  args: {
    installationId: v.number(),
    installationAccountLogin: v.string(),
    installationAccountType: v.union(v.literal("User"), v.literal("Organization")),
    repoSelectionMode: v.optional(v.union(v.literal("selected"), v.literal("all"))),
  },
  returns: v.object({ connected: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    await ctx.runMutation(internal.github.upsertAppConnection, {
      userId,
      installationId: args.installationId,
      installationAccountLogin: args.installationAccountLogin,
      installationAccountType: args.installationAccountType,
      repoSelectionMode: args.repoSelectionMode ?? "selected",
    });

    await ctx.runMutation(internal.github.enqueueSyncJob, {
      userId,
      installationId: args.installationId,
      reason: "initial_backfill",
      lookbackDays: INITIAL_BACKFILL_DAYS,
      runAfter: Date.now(),
      status: "pending",
      attempt: 0,
    });
    await ctx.runMutation(internal.github.setSyncStatus, {
      userId,
      status: "syncing",
    });
    await ctx.runAction((internal as any).githubNode.runSyncWorker, {});

    return { connected: true };
  },
});

export const disconnect = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connection = await ctx.runQuery(internal.github.getConnectionByUser, { userId });
    if (!connection) {
      return null;
    }

    await ctx.runMutation(internal.github.clearGithubData, {
      userId,
      installationId: connection.installationId ?? undefined,
      clearConnection: true,
    });

    return null;
  },
});

export const recomputeFromScratch = action({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connection = await ctx.runQuery(internal.github.getConnectionByUser, { userId });
    if (!connection || !connection.installationId) {
      throw new ConvexError({
        code: "GITHUB_NOT_CONNECTED",
        message: "Connect GitHub App before recomputing stats",
      });
    }

    await ctx.runMutation(internal.github.clearGithubData, {
      userId,
      installationId: connection.installationId,
      clearConnection: false,
    });
    await ctx.runMutation(internal.github.resetConnectionForResync, { userId });
    await ctx.runMutation(internal.github.enqueueSyncJob, {
      userId,
      installationId: connection.installationId,
      reason: "initial_backfill",
      lookbackDays: INITIAL_BACKFILL_DAYS,
      runAfter: Date.now(),
      status: "pending",
      attempt: 0,
    });
    await ctx.runMutation(internal.github.setSyncStatus, {
      userId,
      status: "syncing",
    });
    await ctx.runAction((internal as any).githubNode.runSyncWorker, {});

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
      };
    }
    return {
      login: connection.githubLogin ?? connection.installationAccountLogin ?? "unknown",
      lastSync: formatLastSync(connection.lastSyncedAt),
      connected: true,
      lastSyncedAt: connection.lastSyncedAt ?? null,
    };
  },
});

export const getConnectionV2 = query({
  args: {},
  returns: v.union(
    v.object({
      connected: v.boolean(),
      authMode: v.union(v.literal("github_app"), v.null()),
      login: v.union(v.string(), v.null()),
      installationId: v.union(v.number(), v.null()),
      installationAccountLogin: v.union(v.string(), v.null()),
      installationAccountType: v.union(v.literal("User"), v.literal("Organization"), v.null()),
      repoSelectionMode: v.union(v.literal("selected"), v.literal("all"), v.null()),
      syncStatus: v.union(v.literal("idle"), v.literal("syncing"), v.literal("error"), v.null()),
      lastSync: v.union(v.string(), v.null()),
      lastSyncedAt: v.union(v.number(), v.null()),
      syncedFromAt: v.union(v.number(), v.null()),
      syncedToAt: v.union(v.number(), v.null()),
      lastWebhookAt: v.union(v.number(), v.null()),
      lastErrorCode: v.union(v.string(), v.null()),
      lastErrorMessage: v.union(v.string(), v.null()),
      hasPendingSync: v.boolean(),
      activeBackfillLookbackDays: v.union(v.number(), v.null()),
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

    if (!connection) {
      return {
        connected: false,
        authMode: null,
        login: null,
        installationId: null,
        installationAccountLogin: null,
        installationAccountType: null,
        repoSelectionMode: null,
        syncStatus: null,
        lastSync: null,
        lastSyncedAt: null,
        syncedFromAt: null,
        syncedToAt: null,
        lastWebhookAt: null,
        lastErrorCode: null,
        lastErrorMessage: null,
        hasPendingSync: false,
        activeBackfillLookbackDays: null,
      };
    }

    const pendingJobs = connection.installationId
      ? await ctx.db
          .query("githubSyncJobs")
          .withIndex("by_installation_status", (q) =>
            q.eq("installationId", connection.installationId!).eq("status", "pending"),
          )
          .take(50)
      : [];
    const processingJobs = connection.installationId
      ? await ctx.db
          .query("githubSyncJobs")
          .withIndex("by_installation_status", (q) =>
            q.eq("installationId", connection.installationId!).eq("status", "processing"),
          )
          .take(50)
      : [];
    const hasPendingSync = pendingJobs.length > 0 || processingJobs.length > 0;
    const backfillLookbacks = [...pendingJobs, ...processingJobs]
      .filter((job) => job.reason === "initial_backfill")
      .map((job) => job.lookbackDays)
      .filter((value): value is number => typeof value === "number");
    const activeBackfillLookbackDays = backfillLookbacks.length
      ? Math.max(...backfillLookbacks)
      : null;

    return {
      connected: true,
      authMode: "github_app" as const,
      login: connection.githubLogin ?? connection.installationAccountLogin ?? null,
      installationId: connection.installationId ?? null,
      installationAccountLogin: connection.installationAccountLogin ?? null,
      installationAccountType: connection.installationAccountType ?? null,
      repoSelectionMode: connection.repoSelectionMode ?? null,
      syncStatus: connection.syncStatus ?? "idle",
      lastSync: formatLastSync(connection.lastSyncedAt),
      lastSyncedAt: connection.lastSyncedAt ?? null,
      syncedFromAt: connection.syncedFromAt ?? null,
      syncedToAt: connection.syncedToAt ?? null,
      lastWebhookAt: connection.lastWebhookAt ?? null,
      lastErrorCode: connection.lastErrorCode ?? null,
      lastErrorMessage: connection.lastErrorMessage ?? null,
      hasPendingSync,
      activeBackfillLookbackDays,
    };
  },
});

export const ingestWebhookEvent = mutation({
  args: {
    secret: v.string(),
    deliveryId: v.string(),
    event: v.string(),
    installationId: v.optional(v.number()),
    repoFullName: v.optional(v.string()),
    setupAction: v.optional(v.string()),
    senderLogin: v.optional(v.string()),
  },
  returns: v.object({ accepted: v.boolean(), duplicate: v.boolean() }),
  handler: async (ctx, args) => {
    const expected = process.env.GITHUB_APP_WEBHOOK_SECRET;
    if (!expected || args.secret !== expected) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Webhook forward secret mismatch",
      });
    }

    const duplicate = await ctx.db
      .query("githubWebhookDeliveries")
      .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
      .first();
    if (duplicate) {
      return { accepted: true, duplicate: true };
    }

    const now = Date.now();
    await ctx.db.insert("githubWebhookDeliveries", {
      deliveryId: args.deliveryId,
      event: args.event,
      installationId: args.installationId,
      receivedAt: now,
    });

    if (!args.installationId) {
      return { accepted: true, duplicate: false };
    }

    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_installation", (q) => q.eq("installationId", args.installationId))
      .first();

    if (!connection) {
      return { accepted: true, duplicate: false };
    }

    const inferredGithubLogin =
      connection.githubLogin ?? (args.event === "installation" ? args.senderLogin : undefined);
    await ctx.db.patch(connection._id, {
      lastWebhookAt: now,
      githubLogin: inferredGithubLogin,
    });

    if (args.event === "installation" && args.setupAction === "deleted") {
      const batchSize = 128;

      while (true) {
        const rows = await ctx.db
          .query("commitEvents")
          .withIndex("by_user", (q) => q.eq("userId", connection.userId))
          .take(batchSize);
        if (rows.length === 0) break;
        for (const row of rows) {
          await ctx.db.delete(row._id);
        }
      }

      while (true) {
        const rows = await ctx.db
          .query("dailyStats")
          .withIndex("by_user_date", (q) => q.eq("userId", connection.userId))
          .take(batchSize);
        if (rows.length === 0) break;
        for (const row of rows) {
          await ctx.db.delete(row._id);
        }
      }

      const statuses = ["pending", "processing", "completed", "failed"] as const;
      for (const status of statuses) {
        while (true) {
          const rows = await ctx.db
            .query("githubSyncJobs")
            .withIndex("by_installation_status", (q) =>
              q.eq("installationId", args.installationId!).eq("status", status),
            )
            .take(batchSize);
          if (rows.length === 0) break;
          for (const row of rows) {
            await ctx.db.delete(row._id);
          }
        }
      }

      await ctx.db.delete(connection._id);
      return { accepted: true, duplicate: false };
    }

    if (args.event === "push") {
      await ctx.db.insert("githubSyncJobs", {
        userId: connection.userId,
        installationId: args.installationId,
        repoFullName: args.repoFullName,
        reason: "push",
        deliveryId: args.deliveryId,
        status: "pending",
        attempt: 0,
        runAfter: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(connection._id, { syncStatus: "syncing" });
      return { accepted: true, duplicate: false };
    }

    if (args.event === "installation_repositories") {
      await ctx.db.insert("githubSyncJobs", {
        userId: connection.userId,
        installationId: args.installationId,
        reason: "installation_repositories",
        deliveryId: args.deliveryId,
        status: "pending",
        attempt: 0,
        runAfter: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(connection._id, { syncStatus: "syncing" });
      return { accepted: true, duplicate: false };
    }

    if (args.event === "installation") {
      await ctx.db.insert("githubSyncJobs", {
        userId: connection.userId,
        installationId: args.installationId,
        reason: "reconcile",
        deliveryId: args.deliveryId,
        status: "pending",
        attempt: 0,
        runAfter: now,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.patch(connection._id, { syncStatus: "syncing" });
    }

    return { accepted: true, duplicate: false };
  },
});

export const triggerSyncWorker = action({
  args: { secret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const expected = process.env.GITHUB_APP_WEBHOOK_SECRET;
    if (!expected || args.secret !== expected) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "Worker trigger secret mismatch",
      });
    }
    await ctx.runAction((internal as any).githubNode.runSyncWorker, {});
    return null;
  },
});

const upsertAppConnection = internalMutation({
  args: {
    userId: v.string(),
    installationId: v.number(),
    installationAccountLogin: v.string(),
    installationAccountType: v.union(v.literal("User"), v.literal("Organization")),
    repoSelectionMode: v.union(v.literal("selected"), v.literal("all")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const payload = {
      userId: args.userId,
      authMode: "github_app" as const,
      installationId: args.installationId,
      installationAccountLogin: args.installationAccountLogin,
      installationAccountType: args.installationAccountType,
      repoSelectionMode: args.repoSelectionMode,
      githubLogin:
        args.installationAccountType === "User"
          ? args.installationAccountLogin
          : existing?.githubLogin,
      syncStatus: "idle" as const,
      connectedAt: Date.now(),
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("githubConnections", payload);
    }

    return null;
  },
});

const getConnectionByUser = internalQuery({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      installationId: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!connection) return null;
    return { installationId: connection.installationId ?? null };
  },
});

const computeCurrentStreakSnapshot = internalQuery({
  args: {
    userId: v.string(),
    anchorTimestamp: v.optional(v.number()),
    lookbackDays: v.optional(v.number()),
  },
  returns: v.object({
    timezone: v.string(),
    anchorDateKey: v.string(),
    streakDays: v.number(),
    streakStartDateKey: v.union(v.string(), v.null()),
    firstGapDateKey: v.union(v.string(), v.null()),
    newestDateKey: v.union(v.string(), v.null()),
    oldestDateKey: v.union(v.string(), v.null()),
    touchesLookbackBoundary: v.boolean(),
    lookbackStartDateKey: v.union(v.string(), v.null()),
    commitEventsScanned: v.number(),
  }),
  handler: async (ctx, args) => {
    const anchorTimestamp = args.anchorTimestamp ?? Date.now();
    const timezone = "UTC";

    const committedAt: number[] = [];
    let cursor: string | null = null;
    const batchSize = 256;
    const maxPages = 160;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await ctx.db
        .query("commitEvents")
        .withIndex("by_user_date", (q) => q.eq("userId", args.userId))
        .order("desc")
        .paginate({ numItems: batchSize, cursor });
      for (const commit of result.page) {
        committedAt.push(commit.committedAt);
      }
      if (result.isDone) break;
      cursor = result.continueCursor;
      if (!cursor) break;
    }

    const computation = computeCurrentStreakFromCommitEvents(
      committedAt,
      timezone,
      anchorTimestamp,
    );
    const lookbackStartDateKey =
      args.lookbackDays !== undefined
        ? toDateKey(anchorTimestamp - args.lookbackDays * 24 * 60 * 60 * 1000, timezone)
        : null;

    return {
      timezone,
      anchorDateKey: computation.anchorDateKey,
      streakDays: computation.streakDays,
      streakStartDateKey: computation.streakStartDateKey,
      firstGapDateKey: computation.firstGapDateKey,
      newestDateKey: computation.newestDateKey,
      oldestDateKey: computation.oldestDateKey,
      touchesLookbackBoundary:
        lookbackStartDateKey === null
          ? false
          : touchesLookbackBoundary(computation.streakStartDateKey, lookbackStartDateKey),
      lookbackStartDateKey,
      commitEventsScanned: committedAt.length,
    };
  },
});

const clearGithubData = internalMutation({
  args: {
    userId: v.string(),
    installationId: v.optional(v.number()),
    clearConnection: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const batchSize = 128;

    while (true) {
      const rows = await ctx.db
        .query("commitEvents")
        .withIndex("by_user", (q) => q.eq("userId", args.userId))
        .take(batchSize);
      if (rows.length === 0) break;
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }

    while (true) {
      const rows = await ctx.db
        .query("dailyStats")
        .withIndex("by_user_date", (q) => q.eq("userId", args.userId))
        .take(batchSize);
      if (rows.length === 0) break;
      for (const row of rows) {
        await ctx.db.delete(row._id);
      }
    }

    if (args.installationId !== undefined) {
      const statuses = ["pending", "processing", "completed", "failed"] as const;
      for (const status of statuses) {
        while (true) {
          const rows = await ctx.db
            .query("githubSyncJobs")
            .withIndex("by_installation_status", (q) =>
              q.eq("installationId", args.installationId!).eq("status", status),
            )
            .take(batchSize);
          if (rows.length === 0) break;
          for (const row of rows) {
            await ctx.db.delete(row._id);
          }
        }
      }
    }

    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (connection && args.clearConnection) {
      await ctx.db.delete(connection._id);
    }

    return null;
  },
});

const resetConnectionForResync = internalMutation({
  args: { userId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!connection) return null;

    await ctx.db.patch(connection._id, {
      lastSyncedAt: undefined,
      historySyncedAt: undefined,
      syncedFromAt: undefined,
      syncedToAt: undefined,
      syncStatus: "idle",
      lastWebhookAt: undefined,
      lastErrorCode: undefined,
      lastErrorMessage: undefined,
      streakDays: undefined,
      streakUpdatedAt: undefined,
    });

    return null;
  },
});

const setSyncStatus = internalMutation({
  args: {
    userId: v.string(),
    status: v.union(v.literal("idle"), v.literal("syncing"), v.literal("error")),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("githubConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!existing) return null;

    await ctx.db.patch(existing._id, {
      syncStatus: args.status,
      lastErrorCode: args.errorCode,
      lastErrorMessage: args.errorMessage,
    });

    return null;
  },
});

const getConnectionByInstallation = internalQuery({
  args: { installationId: v.number() },
  returns: v.union(
    v.object({
      userId: v.string(),
      installationId: v.number(),
      githubLogin: v.union(v.string(), v.null()),
      lastSyncedAt: v.union(v.number(), v.null()),
      historySyncedAt: v.union(v.number(), v.null()),
      syncedFromAt: v.union(v.number(), v.null()),
      syncedToAt: v.union(v.number(), v.null()),
      streakDays: v.union(v.number(), v.null()),
      streakUpdatedAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("githubConnections")
      .withIndex("by_installation", (q) => q.eq("installationId", args.installationId))
      .first();
    if (!connection) return null;

    return {
      userId: connection.userId,
      installationId: args.installationId,
      githubLogin: connection.githubLogin ?? null,
      lastSyncedAt: connection.lastSyncedAt ?? null,
      historySyncedAt: connection.historySyncedAt ?? null,
      syncedFromAt: connection.syncedFromAt ?? null,
      syncedToAt: connection.syncedToAt ?? null,
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
    syncedFromAt: v.optional(v.number()),
    syncedToAt: v.optional(v.number()),
    streakDays: v.optional(v.number()),
    streakUpdatedAt: v.optional(v.number()),
    syncStatus: v.optional(v.union(v.literal("idle"), v.literal("syncing"))),
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
        syncedFromAt?: number;
        syncedToAt?: number;
        streakDays?: number;
        streakUpdatedAt?: number;
        syncStatus: "idle" | "syncing";
        lastErrorCode?: string;
        lastErrorMessage?: string;
      } = {
        lastSyncedAt: args.timestamp,
        syncStatus: args.syncStatus ?? "idle",
        lastErrorCode: undefined,
        lastErrorMessage: undefined,
      };
      if (args.historySyncedAt !== undefined) {
        patch.historySyncedAt = args.historySyncedAt;
      }
      if (args.syncedFromAt !== undefined) {
        patch.syncedFromAt = args.syncedFromAt;
      }
      if (args.syncedToAt !== undefined) {
        patch.syncedToAt = args.syncedToAt;
      }
      if (args.streakDays !== undefined) {
        patch.streakDays = args.streakDays;
      }
      if (args.streakUpdatedAt !== undefined) {
        patch.streakUpdatedAt = args.streakUpdatedAt;
      }
      if (args.streakDays === undefined) {
        const snapshot = await ctx.runQuery(internal.github.computeCurrentStreakSnapshot, {
          userId: args.userId,
          anchorTimestamp: args.timestamp,
        });
        patch.streakDays = snapshot.streakDays;
        patch.streakUpdatedAt = Date.now();
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

const enqueueSyncJob = internalMutation({
  args: {
    userId: v.string(),
    installationId: v.number(),
    repoFullName: v.optional(v.string()),
    lookbackDays: v.optional(v.number()),
    reason: v.union(
      v.literal("initial_backfill"),
      v.literal("push"),
      v.literal("installation_repositories"),
      v.literal("reconcile"),
    ),
    deliveryId: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("processing"), v.literal("completed"), v.literal("failed")),
    attempt: v.number(),
    runAfter: v.number(),
    errorMessage: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.deliveryId) {
      const duplicate = await ctx.db
        .query("githubSyncJobs")
        .withIndex("by_delivery", (q) => q.eq("deliveryId", args.deliveryId))
        .first();
      if (duplicate) return null;
    }
    if (args.reason === "initial_backfill" && args.lookbackDays !== undefined) {
      const statuses = ["pending", "processing"] as const;
      for (const status of statuses) {
        const existing = await ctx.db
          .query("githubSyncJobs")
          .withIndex("by_installation_status", (q) =>
            q.eq("installationId", args.installationId).eq("status", status),
          )
          .take(50);
        const duplicate = existing.find(
          (job) => job.reason === "initial_backfill" && job.lookbackDays === args.lookbackDays,
        );
        if (duplicate) return null;
      }
    }

    await ctx.db.insert("githubSyncJobs", {
      userId: args.userId,
      installationId: args.installationId,
      repoFullName: args.repoFullName,
      lookbackDays: args.lookbackDays,
      reason: args.reason,
      deliveryId: args.deliveryId,
      status: args.status,
      attempt: args.attempt,
      runAfter: args.runAfter,
      errorMessage: args.errorMessage,
      createdAt: now,
      updatedAt: now,
    });

    return null;
  },
});

const claimSyncJobs = internalMutation({
  args: { limit: v.number(), now: v.number() },
  returns: v.array(
    v.object({
      id: v.id("githubSyncJobs"),
      userId: v.string(),
      installationId: v.number(),
      repoFullName: v.union(v.string(), v.null()),
      lookbackDays: v.union(v.number(), v.null()),
      reason: v.union(
        v.literal("initial_backfill"),
        v.literal("push"),
        v.literal("installation_repositories"),
        v.literal("reconcile"),
      ),
      attempt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const pending = await ctx.db
      .query("githubSyncJobs")
      .withIndex("by_status_runAfter", (q) => q.eq("status", "pending").lte("runAfter", args.now))
      .take(Math.max(1, Math.min(args.limit, 20)));

    const claimed = [] as {
      id: any;
      userId: string;
      installationId: number;
      repoFullName: string | null;
      lookbackDays: number | null;
      reason: "initial_backfill" | "push" | "installation_repositories" | "reconcile";
      attempt: number;
    }[];

    for (const job of pending) {
      await ctx.db.patch(job._id, {
        status: "processing",
        updatedAt: Date.now(),
      });
      claimed.push({
        id: job._id,
        userId: job.userId,
        installationId: job.installationId,
        repoFullName: job.repoFullName ?? null,
        lookbackDays: job.lookbackDays ?? null,
        reason: job.reason,
        attempt: job.attempt,
      });
    }

    return claimed;
  },
});

const completeSyncJob = internalMutation({
  args: { jobId: v.id("githubSyncJobs") },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.jobId, {
      status: "completed",
      updatedAt: Date.now(),
      errorMessage: undefined,
    });
    return null;
  },
});

const failSyncJob = internalMutation({
  args: {
    jobId: v.id("githubSyncJobs"),
    attempt: v.number(),
    errorMessage: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.attempt >= MAX_JOB_ATTEMPTS) {
      await ctx.db.patch(args.jobId, {
        status: "failed",
        attempt: args.attempt,
        errorMessage: args.errorMessage,
        updatedAt: now,
      });
      return null;
    }

    const backoffMs = Math.min(5 * 60 * 1000, 2 ** args.attempt * 5000);
    await ctx.db.patch(args.jobId, {
      status: "pending",
      attempt: args.attempt,
      errorMessage: args.errorMessage,
      runAfter: now + backoffMs,
      updatedAt: now,
    });

    return null;
  },
});

export {
  clearGithubData,
  claimSyncJobs,
  computeCurrentStreakSnapshot,
  completeSyncJob,
  enqueueSyncJob,
  failSyncJob,
  getConnectionByUser,
  getConnectionByInstallation,
  markSynced,
  resetConnectionForResync,
  saveCommit,
  setSyncStatus,
  upsertAppConnection,
};
