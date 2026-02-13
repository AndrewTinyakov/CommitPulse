import { auth } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { fetchInstallation, verifySignedState } from "@/lib/github-app";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const installationIdRaw = searchParams.get("installation_id");
  const state = searchParams.get("state");

  if (!installationIdRaw || !state) {
    return NextResponse.redirect(new URL("/?github_setup=error&reason=missing_params", origin));
  }

  const installationId = Number(installationIdRaw);
  if (!Number.isFinite(installationId) || installationId <= 0) {
    return NextResponse.redirect(new URL("/?github_setup=error&reason=invalid_installation", origin));
  }

  try {
    const { userId } = await auth();
    const payload = verifySignedState(state);
    if (!userId || userId !== payload.userId) {
      return NextResponse.redirect(new URL("/sign-in", origin));
    }
    const installation = await fetchInstallation(installationId);

    const redirect = new URL("/", origin);
    redirect.searchParams.set("github_setup", "ok");
    redirect.searchParams.set("installation_id", String(installation.id));
    redirect.searchParams.set("installation_account_login", installation.account?.login ?? "unknown");
    redirect.searchParams.set("installation_account_type", installation.account?.type ?? "User");
    redirect.searchParams.set("repo_selection_mode", installation.repository_selection ?? "selected");

    return NextResponse.redirect(redirect);
  } catch (error) {
    console.error("GitHub setup error", error);
    return NextResponse.redirect(new URL("/?github_setup=error&reason=verification_failed", origin));
  }
}
