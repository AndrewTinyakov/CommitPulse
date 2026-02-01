"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BellRing, ChevronDown, Moon } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";

const defaultSettings = {
  enabled: true,
  quietHoursStart: 22,
  quietHoursEnd: 7,
  timezone: "UTC",
};

export default function TelegramSettingsCard() {
  const { isSignedIn } = useAuth();
  const connection = useQuery(api.telegram.getConnection, isSignedIn ? {} : "skip");
  const goals = useQuery(api.dashboard.getGoals, isSignedIn ? {} : "skip");
  const updateSettings = useMutation(api.telegram.updateSettings);
  const [form, setForm] = useState(defaultSettings);
  const [saving, setSaving] = useState(false);

  const timeZones = useMemo(() => {
    if (typeof Intl !== "undefined" && "supportedValuesOf" in Intl) {
      return (Intl as typeof Intl & { supportedValuesOf: (key: string) => string[] }).supportedValuesOf(
        "timeZone",
      );
    }
    return ["UTC"];
  }, []);

  useEffect(() => {
    if (connection) {
      setForm({
        enabled: connection.enabled ?? true,
        quietHoursStart: connection.quietHoursStart ?? defaultSettings.quietHoursStart,
        quietHoursEnd: connection.quietHoursEnd ?? defaultSettings.quietHoursEnd,
        timezone: connection.timezone ?? goals?.timezone ?? defaultSettings.timezone,
      });
      return;
    }
    if (goals) {
      setForm((prev) => ({ ...prev, timezone: goals.timezone }));
      return;
    }
    if (typeof Intl !== "undefined") {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setForm((prev) => ({ ...prev, timezone: tz ?? "UTC" }));
    }
  }, [connection, goals]);

  const canEdit = Boolean(isSignedIn && connection?.connected);

  const handleSave = async () => {
    if (!canEdit) return;
    setSaving(true);
    try {
      await updateSettings({
        enabled: form.enabled,
        quietHoursStart: Number(form.quietHoursStart),
        quietHoursEnd: Number(form.quietHoursEnd),
        timezone: form.timezone,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel rounded-3xl px-6 py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(81,214,255,0.3)] bg-[rgba(81,214,255,0.12)] text-[var(--accent-2)]">
          <BellRing className="h-4 w-4" />
        </span>
        <div>
          <p className="headline text-xs text-[var(--muted)]">Notifications</p>
          <p className="text-lg font-semibold">Telegram controls</p>
        </div>
      </div>

      <div className="mt-4 space-y-3 text-sm text-[var(--muted)]">
        <p>Pause reminders, adjust quiet hours, and keep notifications aligned with your routine.</p>
      </div>

      <div className="mt-4 space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Enable reminders</p>
            <p className="text-xs text-[var(--muted)]">Disable without disconnecting the bot.</p>
          </div>
          <label className={`relative inline-flex items-center ${canEdit ? "" : "opacity-50"}`}>
            <input
              type="checkbox"
              className="peer sr-only"
              checked={form.enabled}
              onChange={(event) => setForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              disabled={!canEdit}
            />
            <div className="relative h-6 w-11 rounded-full border border-[rgba(255,255,255,0.2)] bg-[rgba(0,0,0,0.4)] transition peer-checked:bg-[rgba(183,255,72,0.25)]">
              <div className="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-[var(--muted)] transition peer-checked:translate-x-5 peer-checked:bg-[var(--accent)]" />
            </div>
          </label>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-4">
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              <Moon className="h-3 w-3 text-[var(--accent-2)]" />
              Quiet start
            </span>
            <input
              type="number"
              min={0}
              max={23}
              value={form.quietHoursStart}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, quietHoursStart: Number(event.target.value) }))
              }
              className="mt-2 h-10 w-full rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.35)] px-3 py-2 text-sm text-[var(--text)]"
              disabled={!canEdit}
            />
          </label>
          <label className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-4">
            <span className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]">
              <Moon className="h-3 w-3 text-[var(--accent-2)]" />
              Quiet end
            </span>
            <input
              type="number"
              min={0}
              max={23}
              value={form.quietHoursEnd}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, quietHoursEnd: Number(event.target.value) }))
              }
              className="mt-2 h-10 w-full rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.35)] px-3 py-2 text-sm text-[var(--text)]"
              disabled={!canEdit}
            />
          </label>
        </div>

        <label className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] p-4">
          <span className="text-[0.65rem] uppercase tracking-[0.24em] text-[var(--muted)]">Timezone</span>
          <div className="relative mt-2">
            <select
              value={form.timezone}
              onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
              className="h-11 w-full appearance-none rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.35)] px-4 pr-10 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus:border-[rgba(81,214,255,0.5)] focus:ring-2 focus:ring-[rgba(81,214,255,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!canEdit}
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>
                  {zone}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
          </div>
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={!canEdit || saving}
        className="mt-4 rounded-full border border-[rgba(81,214,255,0.5)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-2)] disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save settings"}
      </button>
      {!connection?.connected && (
        <p className="mt-3 text-xs text-[var(--muted)]">Connect Telegram to edit notification settings.</p>
      )}
      {connection?.connected && !isSignedIn && (
        <p className="mt-3 text-xs text-[var(--muted)]">Sign in to edit notification settings.</p>
      )}
    </div>
  );
}
