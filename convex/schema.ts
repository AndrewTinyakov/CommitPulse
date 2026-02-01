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
    botToken: v.string(),
    chatId: v.string(),
    enabled: v.boolean(),
    timezone: v.optional(v.string()),
    quietHoursStart: v.optional(v.number()),
    quietHoursEnd: v.optional(v.number()),
    lastNotifiedAt: v.optional(v.number()),
    connectedAt: v.number(),
  }).index("by_user", ["userId"]),
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
