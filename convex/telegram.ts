import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { getUserId, requireUserId } from "./auth";
import { clamp, toDateKey } from "./lib";

const goalsValidator = v.object({
  commitsPerDay: v.number(),
  locPerDay: v.number(),
  pushByHour: v.number(),
  timezone: v.string(),
});

export const disconnect = mutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connection = await ctx.db
      .query("telegramConnections")
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
      enabled: v.boolean(),
      telegramUserId: v.string(),
      chatId: v.string(),
      telegramUsername: v.union(v.string(), v.null()),
      timezone: v.union(v.string(), v.null()),
      quietHoursStart: v.union(v.number(), v.null()),
      quietHoursEnd: v.union(v.number(), v.null()),
      lastNotifiedAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const userId = await getUserId(ctx);
    if (!userId) return null;
    const connection = await ctx.db
      .query("telegramConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!connection) {
      return null;
    }
    const telegramUserId = connection.telegramUserId ?? connection.chatId;
    return {
      connected: true,
      enabled: connection.enabled,
      telegramUserId,
      chatId: connection.chatId,
      telegramUsername: connection.telegramUsername ?? null,
      timezone: connection.timezone ?? null,
      quietHoursStart: connection.quietHoursStart ?? null,
      quietHoursEnd: connection.quietHoursEnd ?? null,
      lastNotifiedAt: connection.lastNotifiedAt ?? null,
    };
  },
});

export const updateSettings = mutation({
  args: {
    enabled: v.boolean(),
    quietHoursStart: v.number(),
    quietHoursEnd: v.number(),
    timezone: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const connection = await ctx.db
      .query("telegramConnections")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!connection) {
      throw new ConvexError({
        code: "NO_TELEGRAM_CONNECTION",
        message: "No Telegram connection",
      });
    }
    await ctx.db.patch(connection._id, {
      enabled: args.enabled,
      quietHoursStart: clamp(Math.round(args.quietHoursStart), 0, 23),
      quietHoursEnd: clamp(Math.round(args.quietHoursEnd), 0, 23),
      timezone: args.timezone,
    });
    return null;
  },
});

const upsertConnection = internalMutation({
  args: {
    userId: v.string(),
    telegramUserId: v.string(),
    chatId: v.string(),
    telegramUsername: v.union(v.string(), v.null()),
    telegramFirstName: v.union(v.string(), v.null()),
    telegramLastName: v.union(v.string(), v.null()),
    quietHoursStart: v.union(v.number(), v.null()),
    quietHoursEnd: v.union(v.number(), v.null()),
    timezone: v.union(v.string(), v.null()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("telegramConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const payload = {
      userId: args.userId,
      telegramUserId: args.telegramUserId,
      chatId: args.chatId,
      telegramUsername: args.telegramUsername ?? undefined,
      telegramFirstName: args.telegramFirstName ?? undefined,
      telegramLastName: args.telegramLastName ?? undefined,
      quietHoursStart: args.quietHoursStart ?? existing?.quietHoursStart ?? 22,
      quietHoursEnd: args.quietHoursEnd ?? existing?.quietHoursEnd ?? 7,
      timezone: args.timezone ?? existing?.timezone ?? "UTC",
      enabled: true,
      connectedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("telegramConnections", payload);
    }
    return null;
  },
});

const listConnections = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      userId: v.string(),
      telegramUserId: v.string(),
      chatId: v.string(),
      telegramUsername: v.union(v.string(), v.null()),
      telegramFirstName: v.union(v.string(), v.null()),
      telegramLastName: v.union(v.string(), v.null()),
      quietHoursStart: v.union(v.number(), v.null()),
      quietHoursEnd: v.union(v.number(), v.null()),
      timezone: v.union(v.string(), v.null()),
      lastNotifiedAt: v.union(v.number(), v.null()),
      enabled: v.boolean(),
    }),
  ),
  handler: async (ctx) => {
    const connections = await ctx.db.query("telegramConnections").collect();
    return connections.map((connection) => ({
      userId: connection.userId,
      telegramUserId: connection.telegramUserId ?? connection.chatId,
      chatId: connection.chatId,
      telegramUsername: connection.telegramUsername ?? null,
      telegramFirstName: connection.telegramFirstName ?? null,
      telegramLastName: connection.telegramLastName ?? null,
      quietHoursStart: connection.quietHoursStart ?? null,
      quietHoursEnd: connection.quietHoursEnd ?? null,
      timezone: connection.timezone ?? null,
      lastNotifiedAt: connection.lastNotifiedAt ?? null,
      enabled: connection.enabled,
    }));
  },
});

const getConnectionInternal = internalQuery({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      userId: v.string(),
      telegramUserId: v.string(),
      chatId: v.string(),
      telegramUsername: v.union(v.string(), v.null()),
      telegramFirstName: v.union(v.string(), v.null()),
      telegramLastName: v.union(v.string(), v.null()),
      enabled: v.boolean(),
      quietHoursStart: v.union(v.number(), v.null()),
      quietHoursEnd: v.union(v.number(), v.null()),
      timezone: v.union(v.string(), v.null()),
      lastNotifiedAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("telegramConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!connection) return null;
    const telegramUserId = connection.telegramUserId ?? connection.chatId;
    return {
      userId: connection.userId,
      telegramUserId,
      chatId: connection.chatId,
      telegramUsername: connection.telegramUsername ?? null,
      telegramFirstName: connection.telegramFirstName ?? null,
      telegramLastName: connection.telegramLastName ?? null,
      enabled: connection.enabled,
      quietHoursStart: connection.quietHoursStart ?? null,
      quietHoursEnd: connection.quietHoursEnd ?? null,
      timezone: connection.timezone ?? null,
      lastNotifiedAt: connection.lastNotifiedAt ?? null,
    };
  },
});

const getConnectionByTelegramUserId = internalQuery({
  args: { telegramUserId: v.string() },
  returns: v.union(
    v.object({
      userId: v.string(),
      telegramUserId: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("telegramConnections")
      .withIndex("by_telegram_user", (q) => q.eq("telegramUserId", args.telegramUserId))
      .first();
    if (!connection) return null;
    return {
      userId: connection.userId,
      telegramUserId: connection.telegramUserId ?? connection.chatId,
    };
  },
});

const getGoalsForUser = internalQuery({
  args: { userId: v.string() },
  returns: v.union(goalsValidator, v.null()),
  handler: async (ctx, args) => {
    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!goals) return null;
    return {
      commitsPerDay: goals.commitsPerDay,
      locPerDay: goals.locPerDay,
      pushByHour: goals.pushByHour,
      timezone: goals.timezone,
    };
  },
});

const markNotified = internalMutation({
  args: { userId: v.string(), timestamp: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("telegramConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (connection) {
      await ctx.db.patch(connection._id, { lastNotifiedAt: args.timestamp });
    }
    return null;
  },
});

const getReminderContext = internalQuery({
  args: { userId: v.string() },
  returns: v.union(
    v.object({
      chatId: v.string(),
      quietHoursStart: v.union(v.number(), v.null()),
      quietHoursEnd: v.union(v.number(), v.null()),
      lastNotifiedAt: v.union(v.number(), v.null()),
      timeZone: v.string(),
      stats: v.union(
        v.object({
          commitCount: v.number(),
          locChanged: v.number(),
        }),
        v.null(),
      ),
      goals: v.union(goalsValidator, v.null()),
      lastCommitAt: v.union(v.number(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("telegramConnections")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();
    if (!connection || !connection.enabled) return null;

    const goals = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .first();

    const timeZone = goals?.timezone ?? connection.timezone ?? "UTC";
    const todayKey = toDateKey(Date.now(), timeZone);

    const stats = await ctx.db
      .query("dailyStats")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId).eq("date", todayKey))
      .first();

    const lastCommit = await ctx.db
      .query("commitEvents")
      .withIndex("by_user_date", (q) => q.eq("userId", args.userId))
      .order("desc")
      .first();

    return {
      chatId: connection.chatId,
      quietHoursStart: connection.quietHoursStart ?? null,
      quietHoursEnd: connection.quietHoursEnd ?? null,
      lastNotifiedAt: connection.lastNotifiedAt ?? null,
      timeZone,
      stats: stats
        ? {
            commitCount: stats.commitCount,
            locChanged: stats.locChanged,
          }
        : null,
      goals: goals
        ? {
            commitsPerDay: goals.commitsPerDay,
            locPerDay: goals.locPerDay,
            pushByHour: goals.pushByHour,
            timezone: goals.timezone,
          }
        : null,
      lastCommitAt: lastCommit?.committedAt ?? null,
    };
  },
});

export {
  getConnectionInternal,
  getConnectionByTelegramUserId,
  getGoalsForUser,
  getReminderContext,
  listConnections,
  markNotified,
  upsertConnection,
};
