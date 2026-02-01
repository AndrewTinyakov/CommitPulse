import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { requireUserId } from "./auth";
import { clamp } from "./lib";

export const setGoals = mutation({
  args: {
    commitsPerDay: v.number(),
    locPerDay: v.number(),
    pushByHour: v.number(),
    timezone: v.string(),
  },
  returns: v.object({
    commitsPerDay: v.number(),
    locPerDay: v.number(),
    pushByHour: v.number(),
    timezone: v.string(),
    updatedAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await requireUserId(ctx);
    const existing = await ctx.db
      .query("goals")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();

    const payload = {
      userId,
      commitsPerDay: clamp(Math.round(args.commitsPerDay), 0, 100),
      locPerDay: clamp(Math.round(args.locPerDay), 0, 5000),
      pushByHour: clamp(Math.round(args.pushByHour), 0, 23),
      timezone: args.timezone,
      updatedAt: Date.now(),
    };
    const response = {
      commitsPerDay: payload.commitsPerDay,
      locPerDay: payload.locPerDay,
      pushByHour: payload.pushByHour,
      timezone: payload.timezone,
      updatedAt: payload.updatedAt,
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
    } else {
      await ctx.db.insert("goals", payload);
    }
    return response;
  },
});
