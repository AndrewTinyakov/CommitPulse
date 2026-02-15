import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  githubConnections: defineTable({
    userId: v.string(),
    authMode: v.optional(v.literal("github_app")),
    githubLogin: v.optional(v.string()),
    installationId: v.optional(v.number()),
    installationAccountLogin: v.optional(v.string()),
    installationAccountType: v.optional(v.union(v.literal("User"), v.literal("Organization"))),
    repoSelectionMode: v.optional(v.union(v.literal("selected"), v.literal("all"))),
    connectedAt: v.number(),
    lastSyncedAt: v.optional(v.number()),
    historySyncedAt: v.optional(v.number()),
    syncedFromAt: v.optional(v.number()),
    syncedToAt: v.optional(v.number()),
    syncStatus: v.optional(v.union(v.literal("idle"), v.literal("syncing"), v.literal("error"))),
    lastWebhookAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    lastErrorMessage: v.optional(v.string()),
    streakDays: v.optional(v.number()),
    streakUpdatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_installation", ["installationId"]),
  githubSyncJobs: defineTable({
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
    status: v.union(
      v.literal("pending"),
      v.literal("processing"),
      v.literal("completed"),
      v.literal("failed"),
    ),
    attempt: v.number(),
    runAfter: v.number(),
    createdAt: v.number(),
    updatedAt: v.number(),
    errorMessage: v.optional(v.string()),
  })
    .index("by_status_runAfter", ["status", "runAfter"])
    .index("by_installation_status", ["installationId", "status"])
    .index("by_delivery", ["deliveryId"]),
  githubWebhookDeliveries: defineTable({
    deliveryId: v.string(),
    event: v.string(),
    installationId: v.optional(v.number()),
    receivedAt: v.number(),
  }).index("by_delivery", ["deliveryId"]),
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
