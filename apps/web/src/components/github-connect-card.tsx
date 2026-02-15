"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useAction } from "convex/react";
import { GitBranch, ShieldCheck, Timer, Wifi, AlertTriangle, Link as LinkIcon } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { api } from "@convex/_generated/api";

function formatDate(timestamp: number | null) {
  if (!timestamp) return "-";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(timestamp));
}

export default function GitHubConnectCard() {
  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();
  const connection = useQuery(api.github.getConnectionV2, isSignedIn ? {} : "skip");
  const completeGithubAppSetup = useAction(api.github.completeGithubAppSetup);
  const disconnect = useAction(api.github.disconnect);
  const recomputeFromScratch = useAction(api.github.recomputeFromScratch);

  const [status, setStatus] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [setupProcessed, setSetupProcessed] = useState(false);

  const isConnected = Boolean(connection?.connected);
  const isGithubApp = connection?.authMode === "github_app";

  useEffect(() => {
    if (!isSignedIn || setupProcessed) return;

    const setup = searchParams.get("github_setup");
    if (setup !== "ok") return;

    const installationId = Number(searchParams.get("installation_id"));
    const accountLogin = searchParams.get("installation_account_login") ?? "unknown";
    const accountType = searchParams.get("installation_account_type") === "Organization" ? "Organization" : "User";
    const repoSelectionMode = searchParams.get("repo_selection_mode") === "all" ? "all" : "selected";

    if (!Number.isFinite(installationId) || installationId <= 0) {
      setStatus("GitHub setup callback was incomplete. Please connect again.");
      setSetupProcessed(true);
      return;
    }

    const run = async () => {
      setWorking(true);
      setStatus(null);
      try {
        await completeGithubAppSetup({
          installationId,
          installationAccountLogin: accountLogin,
          installationAccountType: accountType,
          repoSelectionMode,
        });
        setStatus(`Connected GitHub App for ${accountLogin}. Initial sync started.`);
      } catch (error) {
        console.error(error);
        setStatus("Could not finalize GitHub setup. Please try connecting again.");
      } finally {
        setWorking(false);
        setSetupProcessed(true);
        const next = new URL(window.location.href);
        [
          "github_setup",
          "installation_id",
          "installation_account_login",
          "installation_account_type",
          "repo_selection_mode",
        ].forEach((key) => next.searchParams.delete(key));
        window.history.replaceState({}, "", next.toString());
      }
    };

    void run();
  }, [completeGithubAppSetup, isSignedIn, searchParams, setupProcessed]);

  const handleDisconnect = async () => {
    setWorking(true);
    setStatus(null);
    try {
      await disconnect({});
      setStatus("GitHub disconnected. All synced stats were removed.");
    } finally {
      setWorking(false);
    }
  };

  const handleRecompute = async () => {
    const confirmed = window.confirm(
      "This will delete all synced GitHub stats and resync everything from scratch. Continue?",
    );
    if (!confirmed) return;

    setWorking(true);
    setStatus(null);
    try {
      await recomputeFromScratch({});
      setStatus("Recompute started. We deleted existing stats and kicked off a full resync.");
    } finally {
      setWorking(false);
    }
  };

  const statusLabel = useMemo(() => {
    const syncStatus = connection?.syncStatus;
    if (!syncStatus) return "Idle";
    if (syncStatus === "syncing") return "Syncing";
    if (syncStatus === "error") return "Sync error";
    return "Idle";
  }, [connection?.syncStatus]);
  const isFetching = connection?.syncStatus === "syncing";
  const activeBackfillLookbackDays = connection?.activeBackfillLookbackDays ?? null;
  const syncProgressMessage = activeBackfillLookbackDays
    ? `Backfilling (${activeBackfillLookbackDays}d window).`
    : connection?.hasPendingSync
      ? "Finalizing streak and syncing recent changes."
      : "Sync complete.";

  return (
    <div className="panel flex h-full flex-col rounded-3xl px-6 py-6" id="github-connect">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(81,214,255,0.3)] bg-[rgba(81,214,255,0.12)] text-[var(--accent-2)]">
          <GitBranch className="h-4 w-4" />
        </span>
        <div>
          <p className="headline text-xs text-[var(--muted)]">GitHub</p>
          <p className="text-lg font-semibold">App-based sync</p>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
        {!isConnected && <p>Connect with GitHub App. No personal token required.</p>}
        {isConnected && <p>Sync runs automatically from GitHub webhooks and background reconciliation.</p>}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-1">
            <ShieldCheck className="h-3 w-3 text-[var(--accent)]" />
            Repo-scoped permissions
          </span>
          <span className="flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-1">
            <Timer className="h-3 w-3 text-[var(--accent-2)]" />
            Near realtime updates
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3">
        <a
          href="/api/github/connect"
          className="rounded-full border border-[rgba(81,214,255,0.5)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-2)]"
        >
          {isConnected ? "Reconnect GitHub" : "Connect GitHub"}
        </a>
        <a
          href="https://github.com/settings/installations"
          target="_blank"
          rel="noreferrer"
          className="rounded-full border border-[rgba(255,255,255,0.2)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)]"
        >
          <LinkIcon className="mr-2 inline h-3 w-3" />
          Manage permissions
        </a>
        {isConnected && (
          <button
            onClick={handleRecompute}
            disabled={working}
            className="rounded-full border border-[rgba(81,214,255,0.45)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-2)] disabled:opacity-50"
          >
            Recompute stats
          </button>
        )}
        {isConnected && (
          <button
            onClick={handleDisconnect}
            disabled={working}
            className="rounded-full border border-[rgba(255,255,255,0.15)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)] disabled:opacity-50"
          >
            Disconnect
          </button>
        )}
      </div>

      <div className="mt-4 flex h-full flex-col rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-4 text-sm">
        <p className="headline text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">Connection status</p>
        <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
          <div className="grid min-w-0 items-center gap-3 [grid-template-columns:128px_minmax(0,1fr)]">
            <span>Status</span>
            <span className="truncate text-[var(--text)]">
              {isConnected
                ? `${connection?.installationAccountLogin ?? connection?.login ?? "GitHub"} connected`
                : "Not connected"}
            </span>
          </div>
          <div className="grid min-w-0 items-center gap-3 [grid-template-columns:128px_minmax(0,1fr)]">
            <span>Auth mode</span>
            <span className="text-[var(--text)]">{isGithubApp ? "GitHub App" : connection?.authMode ?? "-"}</span>
          </div>
          <div className="grid min-w-0 items-center gap-3 [grid-template-columns:128px_minmax(0,1fr)]">
            <span>Repo scope</span>
            <span className="text-[var(--text)]">
              {connection?.repoSelectionMode === "all" ? "All repos" : connection?.repoSelectionMode === "selected" ? "Selected repos" : "-"}
            </span>
          </div>
          <div className="grid min-w-0 items-center gap-3 [grid-template-columns:128px_minmax(0,1fr)]">
            <span>Sync state</span>
            <span className="text-[var(--text)]">
              {connection?.syncStatus === "error" ? (
                <span className="inline-flex items-center gap-1 text-red-300">
                  <AlertTriangle className="h-3 w-3" />
                  {statusLabel}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1">
                  <Wifi className="h-3 w-3 text-[var(--accent)]" />
                  {statusLabel}
                </span>
              )}
            </span>
          </div>
          {isFetching && (
            <div className="rounded-lg border border-[rgba(81,214,255,0.35)] bg-[rgba(81,214,255,0.1)] px-3 py-2 text-[11px] text-[var(--text)]">
              {syncProgressMessage}
            </div>
          )}
          <div className="grid min-w-0 items-center gap-3 [grid-template-columns:128px_minmax(0,1fr)]">
            <span>Last sync</span>
            <span className="text-[var(--text)] tabular-nums">{connection?.lastSync ?? "-"}</span>
          </div>
          <div className="grid min-w-0 items-center gap-3 [grid-template-columns:128px_minmax(0,1fr)]">
            <span>Last webhook</span>
            <span className="text-[var(--text)] tabular-nums">{formatDate(connection?.lastWebhookAt ?? null)}</span>
          </div>
          <div className="grid min-w-0 items-center gap-3 [grid-template-columns:128px_minmax(0,1fr)]">
            <span>Synced range</span>
            <span className="text-[var(--text)]">
              {connection?.syncedFromAt || connection?.syncedToAt
                ? `${formatDate(connection?.syncedFromAt ?? null)} to ${formatDate(connection?.syncedToAt ?? null)}`
                : "-"}
            </span>
          </div>
          {connection?.syncStatus === "error" && connection?.lastErrorMessage && (
            <div className="rounded-lg border border-[rgba(255,80,80,0.35)] bg-[rgba(255,80,80,0.08)] px-3 py-2 text-[11px] text-red-200">
              {connection.lastErrorMessage}
            </div>
          )}
        </div>
      </div>

      {status && <p className="mt-3 text-xs text-[var(--muted)]">{status}</p>}
      {!isSignedIn && <p className="mt-3 text-xs text-[var(--muted)]">Sign in to connect GitHub.</p>}
    </div>
  );
}
