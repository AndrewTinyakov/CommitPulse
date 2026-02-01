'use node';

import { Telegraf } from "telegraf";
import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./auth";

const DEFAULT_REMINDER_GAP_MS = 6 * 60 * 60 * 1000;
const RECENT_COMMIT_GRACE_MS = 90 * 60 * 1000;

function hourInTimeZone(timestamp: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  });
  return Number(formatter.format(new Date(timestamp)));
}

function isQuietHour(hour: number, start?: number | null, end?: number | null) {
  if (start == null || end == null || start === end) return false;
  if (start < end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

export const connect = action({
  args: {
    botToken: v.string(),
    chatId: v.string(),
  },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);

    const existing = await ctx.runQuery(internal.telegram.getConnectionInternal, {
      userId,
    });
    const goals = await ctx.runQuery(internal.telegram.getGoalsForUser, {
      userId,
    });
    const quietHoursStart = existing?.quietHoursStart ?? 22;
    const quietHoursEnd = existing?.quietHoursEnd ?? 7;
    const timezone = existing?.timezone ?? goals?.timezone ?? "UTC";

    const bot = new Telegraf(args.botToken);
    await bot.telegram.getMe();
    await bot.telegram.sendMessage(
      args.chatId,
      "CommitPulse connected. You will get smart nudges when it makes sense.",
    );

    await ctx.runMutation(internal.telegram.upsertConnection, {
      userId,
      botToken: args.botToken,
      chatId: args.chatId,
      quietHoursStart,
      quietHoursEnd,
      timezone,
    });

    return { ok: true };
  },
});

export const sendTestMessage = action({
  args: {},
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx) => {
    const userId = await requireUserId(ctx);
    const connection = await ctx.runQuery(internal.telegram.getConnectionInternal, {
      userId,
    });
    if (!connection) {
      throw new ConvexError({
        code: "NO_TELEGRAM_CONNECTION",
        message: "No Telegram connection",
      });
    }

    const bot = new Telegraf(connection.botToken);
    await bot.telegram.sendMessage(connection.chatId, "CommitPulse test message ✅");
    return { ok: true };
  },
});

export const sendSmartReminders = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), notified: v.number() }),
  handler: async (ctx) => {
    const connections = await ctx.runQuery(internal.telegram.listConnections, {});
    let notified = 0;
    for (const connection of connections) {
      const reminderContext = await ctx.runQuery(internal.telegram.getReminderContext, {
        userId: connection.userId,
      });

      if (!reminderContext) continue;

      const {
        stats,
        goals,
        lastNotifiedAt,
        timeZone,
        quietHoursStart,
        quietHoursEnd,
        botToken,
        chatId,
        lastCommitAt,
      } = reminderContext;

      const now = Date.now();
      if (!botToken || !chatId) continue;
      const hour = hourInTimeZone(now, timeZone);
      const isQuiet = isQuietHour(hour, quietHoursStart, quietHoursEnd);
      if (isQuiet) continue;

      if (lastCommitAt && now - lastCommitAt < RECENT_COMMIT_GRACE_MS) {
        continue;
      }

      if (lastNotifiedAt && now - lastNotifiedAt < DEFAULT_REMINDER_GAP_MS) {
        continue;
      }

      const commitGoal = goals?.commitsPerDay ?? 1;
      const locGoal = goals?.locPerDay ?? 50;
      const pushByHour = goals?.pushByHour ?? 18;

      if (hour < pushByHour) {
        continue;
      }

      const commitCount = stats?.commitCount ?? 0;
      const locChanged = stats?.locChanged ?? 0;

      if (commitGoal <= 0 && locGoal <= 0) {
        continue;
      }

      const needsCommit = commitGoal > 0 && commitCount < commitGoal;
      const needsLoc = locGoal > 0 && locChanged < locGoal;

      if (!needsCommit && !needsLoc) {
        continue;
      }

      const remainingCommits = Math.max(commitGoal - commitCount, 0);
      const remainingLoc = Math.max(locGoal - locChanged, 0);

      const message =
        `CommitPulse nudge ⚡\n` +
        `Today: ${commitCount} commits, ${locChanged} LOC.\n` +
        `Goal: ${commitGoal} commits / ${locGoal} LOC.\n` +
        `Remaining: ${remainingCommits} commits, ${remainingLoc} LOC.`;

      const bot = new Telegraf(botToken);
      await bot.telegram.sendMessage(chatId, message);
      await ctx.runMutation(internal.telegram.markNotified, {
        userId: connection.userId,
        timestamp: now,
      });
      notified += 1;
    }
    return { ok: true, notified };
  },
});
