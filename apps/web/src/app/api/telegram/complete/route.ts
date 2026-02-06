import { NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

const SIGNIN_TOKEN_TTL_SECONDS = 10 * 60;

function getConvexClient() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Missing CONVEX_URL");
  }
  return new ConvexHttpClient(url);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { token?: string } | null;
  const token = body?.token?.trim();
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const convex = getConvexClient();
  const session = await convex.query(api.telegramAuth.getSessionForCompletion, { token });
  if (!session || session.purpose !== "signin") {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  let userId: string | null = null;
  const existingConnection = await convex.query(api.telegramAuth.findLinkedUserByTelegramUserId, {
    telegramUserId: session.telegramUserId,
  });
  if (existingConnection) {
    userId = existingConnection.userId;
  }

  const client = await clerkClient();
  if (!userId) {
    const externalId = `telegram:${session.telegramUserId}`;
    const existingUsers = await client.users.getUserList({ externalId: [externalId] });
    if (existingUsers.data.length > 0) {
      userId = existingUsers.data[0].id;
    } else {
      const created = await client.users.createUser({
        externalId,
        username: `tg_${session.telegramUserId}`,
        firstName: session.telegramFirstName ?? undefined,
        lastName: session.telegramLastName ?? undefined,
        privateMetadata: {
          telegramUserId: session.telegramUserId,
          telegramUsername: session.telegramUsername ?? undefined,
        },
      });
      userId = created.id;
    }
  }
  if (!userId) {
    return NextResponse.json({ error: "Unable to resolve user" }, { status: 500 });
  }

  const complete = await convex.mutation(api.telegramAuth.completeSignInLink, { token, userId });
  if (!complete.ok) {
    return NextResponse.json({ error: complete.errorCode ?? "Unable to link Telegram" }, { status: 400 });
  }

  const signInToken = await client.signInTokens.createSignInToken({
    userId,
    expiresInSeconds: SIGNIN_TOKEN_TTL_SECONDS,
  });

  return NextResponse.json({ ticket: signInToken.token });
}
