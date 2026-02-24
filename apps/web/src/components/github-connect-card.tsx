"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import {
  GitBranch,
  ShieldCheck,
  Timer,
  Wifi,
  AlertTriangle,
  ExternalLink,
  Copy,
  ChevronDown,
  RefreshCw,
  Globe,
  Unplug,
} from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { useSearchParams } from "next/navigation";
import { api } from "@convex/_generated/api";
import { Card, CardHeader } from "./ui/card";

function formatDate(timestamp: number | null) {
  if (!timestamp) return "--";
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
  const goals = useQuery(api.dashboard.getGoals, isSignedIn ? {} : "skip");
  const streakDebug = useQuery(api.dashboard.getStreakDebug as any, isSignedIn ? {} : "skip") as any;
  const saveGoals = useMutation(api.goals.setGoals);
  const completeGithubAppSetup = useAction(api.github.completeGithubAppSetup);
  const disconnect = useAction(api.github.disconnect);
  const recomputeFromScratch = useAction(api.github.recomputeFromScratch);

  const [status, setStatus] = useState<string | null>(null);
  const [working, setWorking] = useState(false);
  const [setupProcessed, setSetupProcessed] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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
        ["github_setup", "installation_id", "installation_account_login", "installation_account_type", "repo_selection_mode"]
          .forEach((key) => next.searchParams.delete(key));
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
      setStatus("Recompute started. Deleted existing stats and kicked off a full resync.");
    } finally {
      setWorking(false);
    }
  };

  const handleCopyStreakDebug = async () => {
    const debugDump = typeof streakDebug?.debugDump === "string" ? streakDebug.debugDump : null;
    if (!debugDump) {
      setStatus(streakDebug === undefined
        ? "Preparing streak debug dump. Try again in a couple of seconds."
        : "No streak debug dump available yet.");
      return;
    }
    try {
      await navigator.clipboard.writeText(debugDump);
      setStatus("Streak debug dump copied. Paste it in chat.");
    } catch {
      console.log(debugDump);
      setStatus("Clipboard copy failed. Debug dump was printed to browser console.");
    }
  };

  const handleUseBrowserTimezone = async () => {
    if (typeof Intl === "undefined") {
      setStatus("Could not detect browser timezone.");
      return;
    }
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    setWorking(true);
    setStatus(null);
    try {
      await saveGoals({
        commitsPerDay: goals?.commitsPerDay ?? 3,
        locPerDay: goals?.locPerDay ?? 120,
        pushByHour: goals?.pushByHour ?? 18,
        timezone,
      });
      setStatus(`Timezone set to ${timezone}. Streak recomputed using this timezone.`);
    } finally {
      setWorking(false);
    }
  };

  const syncLabel = useMemo(() => {
    if (!connection?.syncStatus) return "Idle";
    if (connection.syncStatus === "syncing") return "Syncing";
    if (connection.syncStatus === "error") return "Error";
    return "Idle";
  }, [connection?.syncStatus]);

  const isSyncing = connection?.syncStatus === "syncing";
  const activeBackfillLookbackDays = connection?.activeBackfillLookbackDays ?? null;
  const syncProgressMessage = activeBackfillLookbackDays
    ? `Backfilling (${activeBackfillLookbackDays}d window).`
    : connection?.hasPendingSync
      ? "Finalizing streak and syncing recent changes."
      : "Sync complete.";

  const accountName = connection?.installationAccountLogin ?? connection?.login ?? null;
  const syncDotClass = connection?.syncStatus === "error" ? "error"
    : connection?.syncStatus === "syncing" ? "syncing"
    : isConnected ? "online" : "offline";

  return (
    <Card>
      <CardHeader
        icon={<GitBranch className="h-4 w-4" />}
        iconColor="cyan"
        title="GitHub"
        subtitle={isConnected
          ? `Connected${accountName ? ` as ${accountName}` : ""}`
          : "Not connected"}
        badge={
          <span className={`badge ${isConnected ? "green" : ""}`}>
            <span className={`status-dot ${syncDotClass}`} />
            {isConnected ? syncLabel : "Offline"}
          </span>
        }
      />

      <p className="text-sm text-[var(--text-secondary)] mb-4">
        {isConnected
          ? "Sync runs automatically via webhooks and background reconciliation."
          : "Connect with GitHub App. No personal token required."}
      </p>

      <div className="flex items-center gap-2 mb-4 text-xs text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1">
          <ShieldCheck className="h-3 w-3 text-[var(--accent)]" />
          Repo-scoped
        </span>
        <span className="text-[var(--border-focus)]">&middot;</span>
        <span className="flex items-center gap-1">
          <Timer className="h-3 w-3 text-[var(--accent-2)]" />
          Near realtime
        </span>
      </div>

      {isSyncing && (
        <div className="info-alert cyan mb-4">
          {syncProgressMessage}
        </div>
      )}

      {connection?.syncStatus === "error" && connection?.lastErrorMessage && (
        <div className="info-alert red mb-4">
          {connection.lastErrorMessage}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <a href="/api/github/connect" className="btn btn-cyan btn-sm">
          {isConnected ? "Reconnect" : "Connect GitHub"}
        </a>
        <a
          href="https://github.com/settings/installations"
          target="_blank"
          rel="noreferrer"
          className="btn btn-sm"
        >
          <ExternalLink className="h-3 w-3" />
          Permissions
        </a>
        {isConnected && (
          <>
            <button onClick={handleRecompute} disabled={working} className="btn btn-sm">
              <RefreshCw className="h-3 w-3" />
              Recompute
            </button>
            <button onClick={handleUseBrowserTimezone} disabled={working} className="btn btn-sm">
              <Globe className="h-3 w-3" />
              Browser TZ
            </button>
            <button onClick={handleCopyStreakDebug} disabled={working || streakDebug === undefined} className="btn btn-sm">
              <Copy className="h-3 w-3" />
              Debug
            </button>
            <button onClick={handleDisconnect} disabled={working} className="btn btn-danger btn-sm">
              <Unplug className="h-3 w-3" />
              Disconnect
            </button>
          </>
        )}
      </div>

      {isConnected && (
        <div className="details-accordion">
          <button
            className="details-trigger"
            onClick={() => setDetailsOpen(!detailsOpen)}
            aria-expanded={detailsOpen}
          >
            <ChevronDown className="h-3 w-3 chevron" />
            Technical details
          </button>
          <div className={`details-content ${detailsOpen ? "open" : ""}`}>
            <div className="mt-3 space-y-0.5">
              <DetailRow label="Auth mode" value={isGithubApp ? "GitHub App" : connection?.authMode ?? "--"} />
              <DetailRow
                label="Repo scope"
                value={connection?.repoSelectionMode === "all" ? "All repos"
                  : connection?.repoSelectionMode === "selected" ? "Selected repos"
                  : "--"}
              />
              <DetailRow label="Sync state" value={syncLabel} icon={
                connection?.syncStatus === "error"
                  ? <AlertTriangle className="h-3 w-3 text-[var(--danger)]" />
                  : <Wifi className="h-3 w-3 text-[var(--accent)]" />
              } />
              <DetailRow label="Last sync" value={connection?.lastSync ?? "--"} />
              <DetailRow label="Last webhook" value={formatDate(connection?.lastWebhookAt ?? null)} />
              <DetailRow
                label="Synced range"
                value={
                  connection?.syncedFromAt || connection?.syncedToAt
                    ? `${formatDate(connection?.syncedFromAt ?? null)} - ${formatDate(connection?.syncedToAt ?? null)}`
                    : "--"
                }
              />
            </div>
          </div>
        </div>
      )}

      {status && <p className="text-xs text-[var(--text-secondary)] mt-3">{status}</p>}
      {!isSignedIn && <p className="text-xs text-[var(--text-tertiary)] mt-3">Sign in to connect GitHub.</p>}
    </Card>
  );
}

function DetailRow({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="data-row">
      <span className="data-label">{label}</span>
      <span className="data-value flex items-center gap-1.5">
        {icon}
        {value}
      </span>
    </div>
  );
}
