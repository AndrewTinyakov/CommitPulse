import type { ActionCtx, MutationCtx, QueryCtx } from "./_generated/server";
import { ConvexError } from "convex/values";

type AuthCtx = QueryCtx | MutationCtx | ActionCtx;

export async function requireUserId(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new ConvexError({
      code: "UNAUTHENTICATED",
      message: "Authentication required",
    });
  }
  return identity.subject;
}

export async function getUserId(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  return identity?.subject ?? null;
}
