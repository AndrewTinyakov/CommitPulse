import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  githubConnections: defineTable({
    userId: v.string(),
    accessToken: v.string(),
    githubLogin: v.optional(v.string()),
    scopes: v.optional(v.array(v.string())),
    connectedAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
    historySyncedAt: v.optional(v.number()),
    streakDays: v.optional(v.number()),
    streakUpdatedAt: v.optional(v.number()),
  }).index("by_user", ["userId"]),
  telegramConnections: defineTable({
    userId: v.string(),
    telegramUserId: v.optional(v.string()),
    chatId: v.string(),
    telegramUsername: v.optional(v.string()),
    telegramFirstName: v.optional(v.string()),
    telegramLastName: v.optional(v.string()),
    enabled: v.boolean(),
    timezone: v.optional(v.string()),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
    lastNotifiedAt: v.optional(v.number()),
    connectedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_telegram_user", ["telegramUserId"]),
  telegramLogins: defineTable({
    token: v.string(),
    purpose: v.string(),
    status: v.string(),
    requestedUserId: v.optional(v.string()),
    telegramUserId: v.optional(v.string()),
    chatId: v.optional(v.string()),
    telegramUsername: v.optional(v.string()),
    telegramFirstName: v.optional(v.string()),
    telegramLastName: v.optional(v.string()),
    errorCode: v.optional(v.string()),
    errorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
    expiresAt: v.number(),
    confirmedAt: v.optional(v.number()),
    consumedAt: v.optional(v.number()),
  })
    .index("by_token", ["token"])
    .index("by_requesting_user", ["requestedUserId"]),
  goals: defineTable({
    userId: v.string(),
    commitsPerDay: v.number(),
    locPerDay: v.number(),
    pushByHour: v.number(),
    timezone: v.string(),
    updatedAt: v.number(),
  }).index("by_user", ["userId"]),
  commitEvents: defineTable({
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
    size: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_user_sha", ["userId", "sha"])
    .index("by_user_date", ["userId", "committedAt"]),
  dailyStats: defineTable({
    userId: v.string(),
    date: v.string(),
    commitCount: v.number(),
    locChanged: v.number(),
    avgCommitSize: v.number(),
    reposTouched: v.array(v.string()),
    updatedAt: v.number(),
  }).index("by_user_date", ["userId", "date"]),
});
