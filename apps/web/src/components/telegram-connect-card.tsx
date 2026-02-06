"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bell, ExternalLink, MessageCircle, Send } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";

type StartResponse = {
  token: string;
  url: string;
  expiresAt: number;
};

export default function TelegramConnectCard() {
  const { isSignedIn } = useAuth();
  const connection = useQuery(api.telegram.getConnection, isSignedIn ? {} : "skip");
  const disconnect = useMutation(api.telegram.disconnect);
  const testMessage = useAction(api.telegramNode.sendTestMessage);
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState<StartResponse | null>(null);

  const session = useQuery(
    api.telegramAuth.getLoginSession,
    pending?.token ? { token: pending.token } : "skip",
  );

  const isConnected = Boolean(connection?.connected);

  useEffect(() => {
    if (!session) return;
    if (session.status === "confirmed") {
      setStatus("Telegram connected. You can close Telegram.");
      setPending(null);
      return;
    }
    if (session.status === "rejected") {
      setStatus(session.errorMessage ?? "Telegram connection failed.");
      setPending(null);
      return;
    }
    if (session.status === "expired") {
      setStatus("Login session expired. Try again.");
      setPending(null);
    }
  }, [session]);

  const handleStart = async () => {
    if (!isSignedIn) return;
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/telegram/start", { method: "POST" });
      if (!response.ok) {
        setStatus("Could not start Telegram login.");
        return;
      }
      const data = (await response.json()) as StartResponse;
      setPending(data);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      setStatus("Could not start Telegram login.");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!isSignedIn || !isConnected) return;
    setLoading(true);
    setStatus(null);
    try {
      await testMessage({});
      setStatus("Test message sent.");
    } catch (error) {
      setStatus("Could not send test message.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setStatus(null);
    try {
      await disconnect({});
      setPending(null);
      setStatus("Telegram disconnected.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="panel flex h-full flex-col rounded-3xl px-6 py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(183,255,72,0.3)] bg-[rgba(183,255,72,0.12)] text-[var(--accent)]">
          <Bell className="h-4 w-4" />
        </span>
        <div>
          <p className="headline text-xs text-[var(--muted)]">Telegram</p>
          <p className="text-lg font-semibold">Smart reminders</p>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
        {!isConnected && (
          <p>
            Connect the shared bot once. We will store your Telegram chat so we can send smart nudges.
          </p>
        )}
        {isConnected && (
          <p>
            Telegram is connected{connection?.telegramUsername ? ` as @${connection.telegramUsername}` : "."}
          </p>
        )}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-1">
            <MessageCircle className="h-3 w-3 text-[var(--accent)]" />
            Bot DM only
          </span>
        </div>
      </div>

      {!isConnected && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-4 text-xs text-[var(--muted)]">
            <p className="text-sm font-semibold text-[var(--text)]">Connect in Telegram</p>
            <div className="mt-2 space-y-1">
              <p>1. Tap the button below to open the bot.</p>
              <p>2. Press Start, then confirm the login.</p>
              <p>3. Return here for status updates.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleStart}
              disabled={!isSignedIn || loading || Boolean(pending)}
              className="rounded-full border border-[rgba(183,255,72,0.5)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)] disabled:opacity-50"
            >
              {loading ? "Opening..." : "Connect Telegram"}
            </button>
            {pending?.url && (
              <button
                onClick={() => window.open(pending.url, "_blank", "noopener,noreferrer")}
                className="rounded-full border border-[rgba(255,255,255,0.15)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)]"
              >
                <ExternalLink className="mr-2 inline h-3 w-3" />
                Open bot
              </button>
            )}
          </div>
          {pending && (
            <p className="text-xs text-[var(--muted)]">Waiting for confirmation in Telegram...</p>
          )}
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
              <span className="text-[var(--text)]">
                {connection?.connected ? "Connected" : pending ? "Waiting" : "Not connected"}
              </span>
            </div>
            <div className="grid min-w-0 items-center gap-3 [grid-template-columns:96px_minmax(0,1fr)]">
              <span>Alerts</span>
              <span className="text-[var(--text)]">
                {connection?.connected ? (connection?.enabled ? "Enabled" : "Paused") : "-"}
              </span>
            </div>
            <div className="grid min-w-0 items-center gap-3 [grid-template-columns:96px_minmax(0,1fr)]">
              <span>Chat ID</span>
              <span className="truncate text-[var(--text)]">{connection?.chatId ?? "-"}</span>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-3 pt-4">
            <button
              onClick={handleTest}
              disabled={!isSignedIn || !connection?.connected || loading}
              className="rounded-full border border-[rgba(81,214,255,0.5)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-2)] disabled:opacity-50"
            >
              <Send className="mr-2 inline h-3 w-3" />
              {loading ? "Sending..." : "Send test"}
            </button>
            {connection?.connected && (
              <button
                onClick={handleDisconnect}
                disabled={loading}
                className="rounded-full border border-[rgba(255,255,255,0.15)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)]"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>

        {status && <p className="mt-3 text-xs text-[var(--muted)]">{status}</p>}
        {!isSignedIn && (
          <p className="mt-3 text-xs text-[var(--muted)]">Sign in to connect Telegram.</p>
        )}
      </div>
    </div>
  );
}
