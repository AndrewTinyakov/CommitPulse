"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { Bell, MessageCircle, Send } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";

export default function TelegramConnectCard() {
  const { isSignedIn } = useAuth();
  const connection = useQuery(api.telegram.getConnection, isSignedIn ? {} : "skip");
  const connect = useAction(api.telegramNode.connect);
  const testMessage = useAction(api.telegramNode.sendTestMessage);
  const disconnect = useMutation(api.telegram.disconnect);
  const [form, setForm] = useState({
    botToken: "",
    chatId: "",
  });
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState(false);

  const isConnected = Boolean(connection?.connected);
  const botTokenMasked = connection?.botTokenMasked ?? null;
  const showTokenEditor = !isConnected || editing;

  useEffect(() => {
    if (connection) {
      setForm((prev) => ({
        ...prev,
        chatId: connection.chatId ?? prev.chatId,
      }));
    }
  }, [connection]);

  const handleConnect = async () => {
    if (!isSignedIn || !form.botToken.trim() || !form.chatId.trim()) return;
    setLoading(true);
    setStatus(null);
    try {
      await connect({
        botToken: form.botToken,
        chatId: form.chatId,
      });
      setStatus("Telegram connected and test message sent.");
      setForm((prev) => ({ ...prev, botToken: "" }));
      setEditing(false);
    } catch (error) {
      setStatus("Connection failed. Make sure the bot is started and chat ID is correct.");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!isSignedIn) return;
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
      setForm({ botToken: "", chatId: "" });
      setEditing(false);
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
            Add your bot token and chat ID. Start the bot with{" "}
            <span className="text-[var(--accent)]">/start</span> to allow messages.
          </p>
        )}
        {isConnected && <p>Telegram is connected. Update the bot token if it changes.</p>}
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full border border-[rgba(255,255,255,0.08)] px-2 py-1">
            <MessageCircle className="h-3 w-3 text-[var(--accent)]" />
            Bot DM only
          </span>
        </div>
      </div>

      {showTokenEditor && (
        <div className="mt-4 space-y-3">
          <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.28)] p-4 text-xs text-[var(--muted)]">
            <p className="text-sm font-semibold text-[var(--text)]">Get your Telegram credentials</p>
            <div className="mt-2 space-y-1">
              <p>1. Create a bot with @BotFather and copy the bot token.</p>
              <p>2. Open your bot and send /start so it can message you.</p>
              <p>3. Message @userinfobot to grab your chat ID.</p>
            </div>
          </div>
          <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-4">
            <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              {isConnected ? "New bot token" : "Bot token"}
            </label>
            <input
              type="password"
              value={form.botToken}
              onChange={(event) => setForm((prev) => ({ ...prev, botToken: event.target.value }))}
              className="mt-2 h-10 w-full rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.35)] px-3 py-2 text-sm text-[var(--text)]"
              placeholder="123:ABC..."
              disabled={!isSignedIn}
            />
          </div>
          <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-4">
            <label className="text-xs uppercase tracking-[0.2em] text-[var(--muted)]">Chat ID</label>
            <input
              type="text"
              value={form.chatId}
              onChange={(event) => setForm((prev) => ({ ...prev, chatId: event.target.value }))}
              className="mt-2 h-10 w-full rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.35)] px-3 py-2 text-sm text-[var(--text)]"
              placeholder="e.g. 123456789"
              disabled={!isSignedIn}
            />
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleConnect}
              disabled={!isSignedIn || loading || !form.botToken.trim() || !form.chatId.trim()}
              className="rounded-full border border-[rgba(183,255,72,0.5)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)] disabled:opacity-50"
            >
              {loading ? "Saving..." : isConnected ? "Update + test" : "Save + test"}
            </button>
            {isConnected && (
              <button
                onClick={() => {
                  setEditing(false);
                  setForm((prev) => ({ ...prev, botToken: "" }));
                  setStatus(null);
                }}
                disabled={loading}
                className="rounded-full border border-[rgba(255,255,255,0.15)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)] disabled:opacity-50"
              >
                Cancel
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
              <span className="text-[var(--text)]">
                {connection?.connected ? "Connected" : "Not connected"}
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
            <div className="grid min-w-0 items-center gap-3 [grid-template-columns:96px_minmax(0,1fr)]">
              <span>Bot token</span>
              <span className="truncate font-mono text-[var(--text)]" title={botTokenMasked ?? ""}>
                {botTokenMasked ?? "-"}
              </span>
            </div>
          </div>
          <div className="mt-auto flex flex-wrap gap-3 pt-4">
            {isConnected && !showTokenEditor && (
              <button
                onClick={() => setEditing(true)}
                disabled={loading}
                className="rounded-full border border-[rgba(81,214,255,0.4)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-2)] disabled:opacity-50"
              >
                Edit connection
              </button>
            )}
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
