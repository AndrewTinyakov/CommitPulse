"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";

const STATUS_MESSAGES: Record<string, string> = {
  pending: "Waiting for Telegram...",
  started: "Tap confirm inside Telegram.",
  confirmed: "Finishing sign in...",
};

type StartResponse = {
  token: string;
  url: string;
  expiresAt: number;
};

export default function TelegramSignIn() {
  const router = useRouter();
  const { isLoaded, signIn, setActive } = useSignIn();
  const [pending, setPending] = useState<StartResponse | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const session = useQuery(
    api.telegramAuth.getLoginSession,
    pending?.token ? { token: pending.token } : "skip",
  );

  useEffect(() => {
    if (!session || working) return;
    if (session.status === "confirmed") {
      void complete();
      return;
    }
    if (session.status === "rejected") {
      setError(session.errorMessage ?? "Telegram login failed.");
      setPending(null);
      return;
    }
    if (session.status === "expired") {
      setError("Login session expired. Try again.");
      setPending(null);
    }
  }, [session, working]);

  const start = async () => {
    if (!isLoaded) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/start", { method: "POST" });
      if (!response.ok) {
        setError("Could not start Telegram login.");
        return;
      }
      const data = (await response.json()) as StartResponse;
      setPending(data);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (err) {
      setError("Could not start Telegram login.");
    } finally {
      setWorking(false);
    }
  };

  const complete = async () => {
    if (!pending?.token || !isLoaded || !signIn) return;
    setWorking(true);
    setError(null);
    try {
      const response = await fetch("/api/telegram/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: pending.token }),
      });
      if (!response.ok) {
        setError("Could not complete Telegram login.");
        setPending(null);
        return;
      }
      const data = (await response.json()) as { ticket?: string };
      if (!data.ticket) {
        setError("Missing Clerk ticket.");
        setPending(null);
        return;
      }

      const signInAttempt = await signIn.create({
        strategy: "ticket",
        ticket: data.ticket,
      });

      if (signInAttempt.status !== "complete") {
        setError("Telegram login requires additional steps.");
        setPending(null);
        return;
      }

      await setActive({ session: signInAttempt.createdSessionId });
      router.replace("/");
    } catch (err) {
      setError("Could not complete Telegram login.");
      setPending(null);
    } finally {
      setWorking(false);
    }
  };

  const statusMessage = session ? STATUS_MESSAGES[session.status] : null;

  return (
    <div className="rounded-3xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-6 text-sm text-[var(--muted)]">
      <div className="flex items-center justify-between">
        <div>
          <p className="headline text-xs text-[var(--muted)]">Telegram</p>
          <p className="text-lg font-semibold text-[var(--text)]">Continue with Telegram</p>
        </div>
        <button
          onClick={start}
          disabled={!isLoaded || working || Boolean(pending)}
          className="rounded-full border border-[rgba(183,255,72,0.5)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)] disabled:opacity-50"
        >
          {working ? "Starting..." : "Use Telegram"}
        </button>
      </div>

      <div className="mt-3 space-y-2 text-xs text-[var(--muted)]">
        <p>We will open the bot and ask you to confirm the login.</p>
        {pending && <p>Waiting for confirmation in Telegram.</p>}
        {statusMessage && <p>{statusMessage}</p>}
        {error && <p className="text-[var(--accent-2)]">{error}</p>}
      </div>
    </div>
  );
}
