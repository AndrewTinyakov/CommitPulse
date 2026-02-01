"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Target } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";

const defaultGoals = {
  commitsPerDay: 3,
  locPerDay: 120,
  pushByHour: 18,
  timezone: "UTC",
};

export default function GoalsCard() {
  const { isSignedIn } = useAuth();
  const stored = useQuery(api.dashboard.getGoals, isSignedIn ? {} : "skip");
  const saveGoals = useMutation(api.goals.setGoals);
  const [form, setForm] = useState(defaultGoals);
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
    if (stored) {
      setForm({
        commitsPerDay: stored.commitsPerDay,
        locPerDay: stored.locPerDay,
        pushByHour: stored.pushByHour,
        timezone: stored.timezone,
      });
      return;
    }
    if (typeof Intl !== "undefined") {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      setForm((prev) => ({ ...prev, timezone: tz ?? "UTC" }));
    }
  }, [stored]);

  const onSave = async () => {
    if (!isSignedIn) return;
    setSaving(true);
    try {
      await saveGoals({
        commitsPerDay: Number(form.commitsPerDay),
        locPerDay: Number(form.locPerDay),
        pushByHour: Number(form.pushByHour),
        timezone: form.timezone,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="panel rounded-3xl px-6 py-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(183,255,72,0.3)] bg-[rgba(183,255,72,0.12)] text-[var(--accent)]">
          <Target className="h-4 w-4" />
        </span>
        <div>
          <p className="headline text-xs text-[var(--muted)]">Goals</p>
          <p className="text-lg font-semibold">Daily targets</p>
        </div>
      </div>

      <div className="space-y-4">
        {[
          {
            label: "Commits per day",
            key: "commitsPerDay",
            value: form.commitsPerDay,
          },
          {
            label: "Lines of change",
            key: "locPerDay",
            value: form.locPerDay,
          },
          {
            label: "Push by (hour)",
            key: "pushByHour",
            value: form.pushByHour,
          },
        ].map((field) => (
          <label
            key={field.key}
            className="flex flex-col gap-2 text-xs uppercase tracking-[0.2em] text-[var(--muted)]"
          >
            {field.label}
            <input
              type="number"
              min={0}
              max={field.key === "pushByHour" ? 23 : 5000}
              value={field.value}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  [field.key]: Number(event.target.value),
                }))
              }
              className="h-10 rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.35)] px-3 py-2 text-sm text-[var(--text)]"
              disabled={!isSignedIn}
            />
          </label>
        ))}
        <label className="flex flex-col gap-2 text-[0.65rem] uppercase tracking-[0.24em] text-[var(--muted)]">
          Timezone
          <div className="relative">
            <select
              value={form.timezone}
              onChange={(event) => setForm((prev) => ({ ...prev, timezone: event.target.value }))}
              className="h-11 w-full appearance-none rounded-2xl border border-[rgba(255,255,255,0.1)] bg-[rgba(0,0,0,0.35)] px-4 pr-10 text-sm text-[var(--text)] shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] outline-none transition focus:border-[rgba(183,255,72,0.55)] focus:ring-2 focus:ring-[rgba(183,255,72,0.25)] disabled:cursor-not-allowed disabled:opacity-60"
              disabled={!isSignedIn}
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
        onClick={onSave}
        disabled={!isSignedIn || saving}
        className="mt-4 rounded-full border border-[rgba(183,255,72,0.5)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)] disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save goals"}
      </button>
      {!isSignedIn && (
        <p className="text-xs text-[var(--muted)]">Sign in to edit goals.</p>
      )}
    </div>
  );
}
