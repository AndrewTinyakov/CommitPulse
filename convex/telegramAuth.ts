import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";

const purposeValidator = v.union(v.literal("signin"), v.literal("connect"));
const statusValidator = v.union(
  v.literal("pending"),
  v.literal("started"),
  v.literal("confirmed"),
  v.literal("consumed"),
  v.literal("rejected"),
  v.literal("expired"),
);

type LoginPurpose = "signin" | "connect";
type LoginStatus = "pending" | "started" | "confirmed" | "consumed" | "rejected" | "expired";
type SessionMutationResult = { ok: boolean; status: LoginStatus; errorCode: string | null };

function isExpired(expiresAt: number, now: number) {
  return expiresAt <= now;
}

export const getLoginSession = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      status: statusValidator,
      purpose: purposeValidator,
      expiresAt: v.number(),
      confirmedAt: v.union(v.number(), v.null()),
      errorCode: v.union(v.string(), v.null()),
      errorMessage: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("telegramLogins")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) return null;
    const expired = isExpired(session.expiresAt, Date.now());
    return {
      status: (expired ? "expired" : session.status) as LoginStatus,
      purpose: session.purpose as LoginPurpose,
      expiresAt: session.expiresAt,
      confirmedAt: session.confirmedAt ?? null,
      errorCode: session.errorCode ?? null,
      errorMessage: session.errorMessage ?? null,
    };
  },
});

export const createLoginSession = mutation({
  args: {
    token: v.string(),
    purpose: purposeValidator,
    requestingUserId: v.union(v.string(), v.null()),
    expiresAt: v.number(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    if (args.purpose === "connect" && !args.requestingUserId) {
      return { ok: false };
    }
    const existing = await ctx.db
      .query("telegramLogins")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    await ctx.db.insert("telegramLogins", {
      token: args.token,
      purpose: args.purpose,
      status: "pending",
      requestedUserId: args.requestingUserId ?? undefined,
      createdAt: now,
      updatedAt: now,
      expiresAt: args.expiresAt,
    });
    return { ok: true };
  },
});

export const startLoginSession = mutation({
  args: {
    token: v.string(),
    telegramUserId: v.string(),
    chatId: v.string(),
    telegramUsername: v.union(v.string(), v.null()),
    telegramFirstName: v.union(v.string(), v.null()),
    telegramLastName: v.union(v.string(), v.null()),
  },
  returns: v.object({
    ok: v.boolean(),
    status: statusValidator,
    errorCode: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("telegramLogins")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) {
      return { ok: false, status: "rejected", errorCode: "NOT_FOUND" } as SessionMutationResult;
    }
    const now = Date.now();
    if (isExpired(session.expiresAt, now)) {
      await ctx.db.patch(session._id, {
        status: "expired",
        updatedAt: now,
      });
      return { ok: false, status: "expired", errorCode: "EXPIRED" } as SessionMutationResult;
    }
    if (session.telegramUserId && session.telegramUserId !== args.telegramUserId) {
      await ctx.db.patch(session._id, {
        status: "rejected",
        errorCode: "TOKEN_IN_USE",
        errorMessage: "Token already used by another Telegram account",
        updatedAt: now,
      });
      return { ok: false, status: "rejected", errorCode: "TOKEN_IN_USE" } as SessionMutationResult;
    }

    const nextStatus: LoginStatus =
      session.status === "pending" ? "started" : (session.status as LoginStatus);
    await ctx.db.patch(session._id, {
      status: nextStatus,
      telegramUserId: args.telegramUserId,
      chatId: args.chatId,
      telegramUsername: args.telegramUsername ?? undefined,
      telegramFirstName: args.telegramFirstName ?? undefined,
      telegramLastName: args.telegramLastName ?? undefined,
      updatedAt: now,
    });

    return { ok: true, status: nextStatus, errorCode: null } as SessionMutationResult;
  },
});

export const confirmLoginSession = mutation({
  args: {
    token: v.string(),
    telegramUserId: v.string(),
    chatId: v.string(),
    telegramUsername: v.union(v.string(), v.null()),
    telegramFirstName: v.union(v.string(), v.null()),
    telegramLastName: v.union(v.string(), v.null()),
  },
  returns: v.object({
    ok: v.boolean(),
    status: statusValidator,
    errorCode: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("telegramLogins")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) {
      return { ok: false, status: "rejected", errorCode: "NOT_FOUND" } as SessionMutationResult;
    }
    const now = Date.now();
    if (isExpired(session.expiresAt, now)) {
      await ctx.db.patch(session._id, {
        status: "expired",
        updatedAt: now,
      });
      return { ok: false, status: "expired", errorCode: "EXPIRED" } as SessionMutationResult;
    }
    if (session.telegramUserId && session.telegramUserId !== args.telegramUserId) {
      await ctx.db.patch(session._id, {
        status: "rejected",
        errorCode: "TELEGRAM_MISMATCH",
        errorMessage: "Telegram account mismatch",
        updatedAt: now,
      });
      return { ok: false, status: "rejected", errorCode: "TELEGRAM_MISMATCH" } as SessionMutationResult;
    }
    if (session.status === "consumed") {
      return { ok: false, status: "consumed", errorCode: "CONSUMED" } as SessionMutationResult;
    }

    let nextStatus: LoginStatus = "confirmed";
    let errorCode: string | null = null;

    if (session.purpose === "connect" && session.requestedUserId) {
      const existing = await ctx.runQuery(internal.telegram.getConnectionByTelegramUserId, {
        telegramUserId: args.telegramUserId,
      });
      if (existing && existing.userId !== session.requestedUserId) {
        nextStatus = "rejected";
        errorCode = "ALREADY_LINKED";
      } else {
        await ctx.runMutation(internal.telegram.upsertConnection, {
          userId: session.requestedUserId,
          telegramUserId: args.telegramUserId,
          chatId: args.chatId,
          telegramUsername: args.telegramUsername,
          telegramFirstName: args.telegramFirstName,
          telegramLastName: args.telegramLastName,
          quietHoursStart: null,
          quietHoursEnd: null,
          timezone: null,
        });
      }
    }

    await ctx.db.patch(session._id, {
      status: nextStatus,
      errorCode: errorCode ?? undefined,
      errorMessage: errorCode ? "Telegram account already linked" : undefined,
      telegramUserId: args.telegramUserId,
      chatId: args.chatId,
      telegramUsername: args.telegramUsername ?? undefined,
      telegramFirstName: args.telegramFirstName ?? undefined,
      telegramLastName: args.telegramLastName ?? undefined,
      confirmedAt: nextStatus === "confirmed" ? now : session.confirmedAt,
      updatedAt: now,
    });

    return {
      ok: nextStatus === "confirmed",
      status: nextStatus,
      errorCode,
    } as SessionMutationResult;
  },
});

export const getSessionForCompletion = query({
  args: { token: v.string() },
  returns: v.union(
    v.object({
      token: v.string(),
      purpose: purposeValidator,
      telegramUserId: v.string(),
      chatId: v.string(),
      telegramUsername: v.union(v.string(), v.null()),
      telegramFirstName: v.union(v.string(), v.null()),
      telegramLastName: v.union(v.string(), v.null()),
      requestedUserId: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("telegramLogins")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) return null;
    if (session.status !== "confirmed") return null;
    if (isExpired(session.expiresAt, Date.now())) return null;
    if (!session.telegramUserId || !session.chatId) return null;
    return {
      token: session.token,
      purpose: session.purpose as LoginPurpose,
      telegramUserId: session.telegramUserId,
      chatId: session.chatId,
      telegramUsername: session.telegramUsername ?? null,
      telegramFirstName: session.telegramFirstName ?? null,
      telegramLastName: session.telegramLastName ?? null,
      requestedUserId: session.requestedUserId ?? null,
    };
  },
});

export const consumeLoginSession = internalMutation({
  args: { token: v.string(), userId: v.string() },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("telegramLogins")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session || session.status !== "confirmed") return { ok: false };
    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "consumed",
      consumedAt: now,
      requestedUserId: session.requestedUserId ?? args.userId,
      updatedAt: now,
    });
    return { ok: true };
  },
});

export const findLinkedUserByTelegramUserId = query({
  args: { telegramUserId: v.string() },
  returns: v.union(v.object({ userId: v.string() }), v.null()),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("telegramConnections")
      .withIndex("by_telegram_user", (q) => q.eq("telegramUserId", args.telegramUserId))
      .first();
    if (!connection) return null;
    return { userId: connection.userId };
  },
});

export const completeSignInLink = mutation({
  args: { token: v.string(), userId: v.string() },
  returns: v.object({
    ok: v.boolean(),
    errorCode: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("telegramLogins")
      .withIndex("by_token", (q) => q.eq("token", args.token))
      .first();
    if (!session) return { ok: false, errorCode: "NOT_FOUND" };
    if (session.status !== "confirmed") return { ok: false, errorCode: "NOT_CONFIRMED" };
    if (session.purpose !== "signin") return { ok: false, errorCode: "INVALID_PURPOSE" };
    if (isExpired(session.expiresAt, Date.now())) return { ok: false, errorCode: "EXPIRED" };
    if (!session.telegramUserId || !session.chatId) return { ok: false, errorCode: "MISSING_TELEGRAM" };

    const existing = await ctx.runQuery(internal.telegram.getConnectionByTelegramUserId, {
      telegramUserId: session.telegramUserId,
    });
    if (existing && existing.userId !== args.userId) {
      return { ok: false, errorCode: "ALREADY_LINKED" };
    }

    await ctx.runMutation(internal.telegram.upsertConnection, {
      userId: args.userId,
      telegramUserId: session.telegramUserId,
      chatId: session.chatId,
      telegramUsername: session.telegramUsername ?? null,
      telegramFirstName: session.telegramFirstName ?? null,
      telegramLastName: session.telegramLastName ?? null,
      quietHoursStart: null,
      quietHoursEnd: null,
      timezone: null,
    });

    const now = Date.now();
    await ctx.db.patch(session._id, {
      status: "consumed",
      consumedAt: now,
      requestedUserId: args.userId,
      updatedAt: now,
    });
    return { ok: true, errorCode: null };
  },
});
