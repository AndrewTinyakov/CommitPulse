import { NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convex/_generated/api";

const LOGIN_TTL_MS = 10 * 60 * 1000;

function getConvexClient() {
  const url = process.env.CONVEX_URL ?? process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) {
    throw new Error("Missing CONVEX_URL");
  }
  return new ConvexHttpClient(url);
}

function getBotUsername() {
  const username = process.env.TELEGRAM_BOT_USERNAME;
  if (!username) {
    throw new Error("Missing TELEGRAM_BOT_USERNAME");
  }
  return username.startsWith("@") ? username.slice(1) : username;
}

export async function POST() {
  const { userId } = await auth();
  const purpose = userId ? "connect" : "signin";
  const token = randomBytes(32).toString("base64url");
  const expiresAt = Date.now() + LOGIN_TTL_MS;

  const convex = getConvexClient();
  const result = await convex.mutation(api.telegramAuth.createLoginSession, {
    token,
    purpose,
    requestingUserId: userId ?? null,
    expiresAt,
  });
  if (!result.ok) {
    return NextResponse.json({ error: "Unable to create login session" }, { status: 400 });
  }

  const botUsername = getBotUsername();
  const url = `https://t.me/${botUsername}?start=${token}`;

  return NextResponse.json({ token, url, expiresAt });
}
