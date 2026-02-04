"use client";

import { useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { GitBranch, ShieldCheck, Timer, Zap } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";

export default function GitHubConnectCard() {
  const { isSignedIn } = useAuth();
  const connection = useQuery(api.github.getConnection, isSignedIn ? {} : "skip");
  const connectWithToken = useAction(api.github.connectWithToken);
  const syncNow = useAction(api.github.syncNow);
  const disconnect = useMutation(api.github.disconnect);
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [editing, setEditing] = useState(false);

  const isConnected = Boolean(connection?.connected);
  const tokenMasked = connection?.tokenMasked ?? null;
  const showTokenEditor = !isConnected || editing;

  const handleConnect = async () => {
    if (!token.trim() || !isSignedIn) return;
    setConnecting(true);
    setStatus(null);
    try {
      const result = await connectWithToken({ token });
      setStatus(`Connected as ${result.login}`);
      setToken("");
      setEditing(false);
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("timed out")
          ? "GitHub API timed out. Try again."
          : "Could not validate token. Check scopes and try again.";
      setStatus(message);
    } finally {
      setConnecting(false);
    }
  };

  const handleSync = async () => {
    if (!isSignedIn || !isConnected) return;
    setSyncing(true);
    setStatus(null);
    try {
      const result = await syncNow({});
      setStatus(`Synced ${result.commits} commits across ${result.repos} repos.`);
    } catch (error) {
      const message =
        error instanceof Error && error.message.includes("timed out")
          ? "GitHub API timed out. Try again."
          : "Sync failed. Try again in a minute.";
      setStatus(message);
    } finally {
      setSyncing(false);
    }
  };

  const handleDisconnect = async () => {
    setConnecting(true);
    setStatus(null);
    try {
      await disconnect({});
      setToken("");
      setEditing(false);
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="panel flex h-full flex-col rounded-3xl px-6 py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(81,214,255,0.3)] bg-[rgba(81,214,255,0.12)] text-[var(--accent-2)]">
          <GitBranch className="h-4 w-4" />
        </span>
        <div>
          <p className="headline text-xs text-[var(--muted)]">GitHub</p>
          <p className="text-lg font-semibold">Commit sync</p>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
        {!isConnected && (
          <p>
            Add a GitHub token with{" "}
            <span className="text-[var(--accent)]">repo</span> +{" "}
            <span className="text-[var(--accent)]">read:user</span>{" "}
            to sync commits across your repos.
          </p>
        )}
        {isConnected && (
          <p>GitHub is connected. Keep your token updated if it rotates or expires.</p>
        )}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-1">
            <ShieldCheck className="h-3 w-3 text-[var(--accent)]" />
            Fine-grained PAT works
          </span>
          <span className="flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-1">
            <Timer className="h-3 w-3 text-[var(--accent-2)]" />
            Auto-sync every 30 min
          </span>
        </div>
      </div>

      {showTokenEditor && (
        <div className="mt-4 rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-4">
          <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
            {isConnected ? "New token" : "GitHub token"}
          </label>
          <input
            type="password"
            placeholder="ghp_..."
            value={token}
            onChange={(event) => setToken(event.target.value)}
            className="mt-2 h-10 w-full rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.35)] px-3 py-2 text-sm text-[var(--text)]"
            disabled={!isSignedIn}
          />
          <div className="mt-3 flex flex-wrap gap-3">
            <button
              onClick={handleConnect}
              disabled={!isSignedIn || connecting || !token.trim()}
              className="rounded-full border border-[rgba(81,214,255,0.5)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-2)] disabled:opacity-50"
            >
              {connecting ? "Saving..." : isConnected ? "Update token" : "Save token"}
            </button>
            {isConnected && (
              <button
                onClick={() => {
                  setEditing(false);
                  setToken("");
                  setStatus(null);
                }}
                disabled={connecting}
                className="rounded-full border border-[rgba(255,255,255,0.15)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)] disabled:opacity-50"
              >
                Cancel
              </button>
            )}
            {isConnected && (
              <button
                onClick={handleSync}
                disabled={!isSignedIn || !isConnected || syncing}
                className="rounded-full border border-[rgba(183,255,72,0.5)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)] disabled:opacity-50"
              >
                <Zap className="mr-2 inline h-3 w-3" />
                {syncing ? "Syncing..." : "Sync now"}
              </button>
            )}
          </div>
        </div>
      )}

      <div className="mt-4">
        <div className="flex h-full flex-col rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-4 text-sm">
          <p className="headline text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
            Connection status
          </p>
          <div className="mt-3 grid gap-2 text-xs text-[var(--muted)]">
            <div className="grid min-w-0 items-center gap-3 [grid-template-columns:96px_minmax(0,1fr)]">
              <span>Status</span>
              <span
                className="truncate text-[var(--text)]"
                title={connection?.connected ? `Connected as ${connection.login}` : "Not connected"}
              >
                {connection?.connected ? `Connected as ${connection.login}` : "Not connected"}
              </span>
            </div>
            <div className="grid min-w-0 items-center gap-3 [grid-template-columns:96px_minmax(0,1fr)]">
              <span>Last sync</span>
              <span className="text-[var(--text)] tabular-nums">{connection?.lastSync ?? "-"}</span>
            </div>
            <div className="grid min-w-0 items-center gap-3 [grid-template-columns:96px_minmax(0,1fr)]">
              <span>Token</span>
              <span className="truncate font-mono text-[var(--text)]" title={tokenMasked ?? ""}>
                {tokenMasked ?? "-"}
              </span>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-3 pt-4">
            {isConnected && !showTokenEditor && (
              <button
                onClick={() => setEditing(true)}
                disabled={connecting}
                className="rounded-full border border-[rgba(81,214,255,0.4)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-2)] disabled:opacity-50"
              >
                Replace token
              </button>
            )}
            <button
              onClick={handleSync}
              disabled={!isSignedIn || !isConnected || syncing}
              className="rounded-full border border-[rgba(183,255,72,0.5)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)] disabled:opacity-50"
            >
              <Zap className="mr-2 inline h-3 w-3" />
              {syncing ? "Syncing..." : "Sync now"}
            </button>
            {connection?.connected && (
              <button
                onClick={handleDisconnect}
                disabled={connecting}
                className="rounded-full border border-[rgba(255,255,255,0.15)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)]"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {status && <p className="mt-3 text-xs text-[var(--muted)]">{status}</p>}
        {!isSignedIn && (
          <p className="mt-3 text-xs text-[var(--muted)]">Sign in to connect GitHub.</p>
        )}
      </div>
    </div>
  );
}
