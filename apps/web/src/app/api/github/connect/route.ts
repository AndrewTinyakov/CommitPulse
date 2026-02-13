import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { createSignedState, githubAppInstallUrl } from "@/lib/github-app";

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.redirect(new URL("/sign-in", request.url));
  }

  const state = createSignedState(userId);
  return NextResponse.redirect(githubAppInstallUrl(state));
}
