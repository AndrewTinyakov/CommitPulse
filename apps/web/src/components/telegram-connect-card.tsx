"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bell, ExternalLink, MessageCircle, Send, Unplug } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { Card, CardHeader } from "./ui/card";

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
  const isEnabled = Boolean(connection?.enabled);

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
    } catch {
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
    } catch {
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

  const statusBadge = isConnected
    ? isEnabled ? "green" : "amber"
    : "";
  const statusText = isConnected
    ? isEnabled ? "Active" : "Paused"
    : "Offline";
  const statusDotClass = isConnected
    ? isEnabled ? "online" : "offline"
    : "offline";

  return (
    <Card>
      <CardHeader
        icon={<Bell className="h-4 w-4" />}
        iconColor="green"
        title="Telegram"
        subtitle={isConnected
          ? `Connected${connection?.telegramUsername ? ` as @${connection.telegramUsername}` : ""}`
          : "Not connected"}
        badge={
          <span className={`badge ${statusBadge}`}>
            <span className={`status-dot ${statusDotClass}`} />
            {statusText}
          </span>
        }
      />

      <p className="text-sm text-[var(--text-secondary)] mb-4">
        {isConnected
          ? "Smart reminders are delivered via Telegram bot DM."
          : "Connect the shared bot to receive smart commit reminders."}
      </p>

      <div className="flex items-center gap-2 mb-4 text-xs text-[var(--text-tertiary)]">
        <span className="flex items-center gap-1">
          <MessageCircle className="h-3 w-3 text-[var(--accent)]" />
          Bot DM only
        </span>
      </div>

      {!isConnected && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-inset)] p-4 text-xs text-[var(--text-secondary)] mb-4">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">How to connect</p>
          <ol className="space-y-1 list-decimal list-inside">
            <li>Tap &ldquo;Connect Telegram&rdquo; below.</li>
            <li>Press Start in the bot, then confirm the login.</li>
            <li>Return here -- status updates automatically.</li>
          </ol>
        </div>
      )}

      {pending && (
        <div className="info-alert cyan mb-4">
          Waiting for confirmation in Telegram...
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        {!isConnected && (
          <>
            <button
              onClick={handleStart}
              disabled={!isSignedIn || loading || Boolean(pending)}
              className="btn btn-accent btn-sm"
            >
              {loading ? "Opening..." : "Connect Telegram"}
            </button>
            {pending?.url && (
              <button
                onClick={() => window.open(pending.url, "_blank", "noopener,noreferrer")}
                className="btn btn-sm"
              >
                <ExternalLink className="h-3 w-3" />
                Open bot
              </button>
            )}
          </>
        )}
        {isConnected && (
          <>
            <button
              onClick={handleTest}
              disabled={!isSignedIn || loading}
              className="btn btn-cyan btn-sm"
            >
              <Send className="h-3 w-3" />
              {loading ? "Sending..." : "Send test"}
            </button>
            <button
              onClick={handleDisconnect}
              disabled={loading}
              className="btn btn-danger btn-sm"
            >
              <Unplug className="h-3 w-3" />
              Disconnect
            </button>
          </>
        )}
      </div>

      {status && <p className="text-xs text-[var(--text-secondary)] mt-3">{status}</p>}
      {!isSignedIn && <p className="text-xs text-[var(--text-tertiary)] mt-3">Sign in to connect Telegram.</p>}
    </Card>
  );
}
