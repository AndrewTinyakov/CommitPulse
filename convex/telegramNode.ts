'use node';

import { ConvexError, v } from "convex/values";
import { action, internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { requireUserId } from "./auth";

const RECENT_COMMIT_GRACE_MS = 90 * 60 * 1000;
const TELEGRAM_API_BASE = "https://api.telegram.org";
const ZERO_PUSH_EXTRA_HOURS = new Set([19, 20]);
const ZERO_PUSH_CRITICAL_HOURS = new Set([22, 23]);

function getBotToken() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    throw new ConvexError({
      code: "MISSING_TELEGRAM_TOKEN",
      message: "Missing TELEGRAM_BOT_TOKEN",
    });
  }
  return token;
}

async function sendTelegramMessage(token: string, chatId: string, text: string) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
    }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new ConvexError({
      code: "TELEGRAM_SEND_FAILED",
      message: `Telegram send failed (${response.status}): ${body}`,
    });
  }
}

function hourInTimeZone(timestamp: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hour12: false,
  });
  return Number(formatter.format(new Date(timestamp)));
}

function dateKeyInTimeZone(timestamp: number, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(timestamp));
}

function isQuietHour(hour: number, start?: number | null, end?: number | null) {
  if (start == null || end == null || start === end) return false;
  if (start < end) {
    return hour >= start && hour < end;
  }
  return hour >= start || hour < end;
}

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

    const token = getBotToken();
    await sendTelegramMessage(token, connection.chatId, "CommitPulse test message ✅");
    return { ok: true };
  },
});

export const sendSmartReminders = internalAction({
  args: {},
  returns: v.object({ ok: v.boolean(), notified: v.number() }),
  handler: async (ctx) => {
    const connections = await ctx.runQuery(internal.telegram.listConnections, {});
    const token = getBotToken();
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
        chatId,
        lastCommitAt,
      } = reminderContext;

      const now = Date.now();
      if (!chatId) continue;
      const hour = hourInTimeZone(now, timeZone);
      const isQuiet = isQuietHour(hour, quietHoursStart, quietHoursEnd);
      if (isQuiet) continue;

      if (lastCommitAt && now - lastCommitAt < RECENT_COMMIT_GRACE_MS) {
        continue;
      }

      const commitGoal = goals?.commitsPerDay ?? 1;
      const locGoal = goals?.locPerDay ?? 50;
      const pushByHour = goals?.pushByHour ?? 18;

      const commitCount = stats?.commitCount ?? 0;
      const locChanged = stats?.locChanged ?? 0;

      const needsCommit = commitGoal > 0 && commitCount < commitGoal;
      const needsLoc = locGoal > 0 && locChanged < locGoal;
      const missedGoals = (commitGoal > 0 || locGoal > 0) && (needsCommit || needsLoc);
      const noPushesToday = commitCount === 0;

      const shouldSendNormalReminder = hour === pushByHour && missedGoals;
      const shouldSendZeroPushFollowUp = noPushesToday && ZERO_PUSH_EXTRA_HOURS.has(hour);
      const shouldSendCriticalZeroPush = noPushesToday && ZERO_PUSH_CRITICAL_HOURS.has(hour);

      if (
        !shouldSendNormalReminder &&
        !shouldSendZeroPushFollowUp &&
        !shouldSendCriticalZeroPush
      ) {
        continue;
      }

      if (lastNotifiedAt) {
        const lastNotifiedHour = hourInTimeZone(lastNotifiedAt, timeZone);
        const sameDay =
          dateKeyInTimeZone(lastNotifiedAt, timeZone) === dateKeyInTimeZone(now, timeZone);
        if (sameDay && lastNotifiedHour === hour) {
          continue;
        }
      }

      if (!shouldSendZeroPushFollowUp && !shouldSendCriticalZeroPush && !missedGoals) {
        continue;
      }

      const remainingCommits = Math.max(commitGoal - commitCount, 0);
      const remainingLoc = Math.max(locGoal - locChanged, 0);

      const message = shouldSendCriticalZeroPush
        ? `CRITICAL 🔴🔴\nNo pushes today yet.\nIt is already ${hour}:00.\nPush a commit now to keep your streak alive.`
        : shouldSendZeroPushFollowUp
          ? `CommitPulse alert 🚨\nNo pushes today yet.\nTime: ${hour}:00.\nMake your first push now.`
          : `CommitPulse nudge ⚡\n` +
            `Today: ${commitCount} commits, ${locChanged} LOC.\n` +
            `Goal: ${commitGoal} commits / ${locGoal} LOC.\n` +
            `Remaining: ${remainingCommits} commits, ${remainingLoc} LOC.`;

      await sendTelegramMessage(token, chatId, message);
      await ctx.runMutation(internal.telegram.markNotified, {
        userId: connection.userId,
        timestamp: now,
      });
      notified += 1;
    }
    return { ok: true, notified };
  },
});
