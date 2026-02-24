"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ChevronDown, Target } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { Card, CardHeader } from "./ui/card";

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
      return (Intl as typeof Intl & { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("timeZone");
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

  const fields = [
    { label: "Commits per day", key: "commitsPerDay" as const, value: form.commitsPerDay, max: 5000 },
    { label: "Lines of change", key: "locPerDay" as const, value: form.locPerDay, max: 5000 },
    { label: "Push by (hour)", key: "pushByHour" as const, value: form.pushByHour, max: 23 },
  ];

  return (
    <Card>
      <CardHeader
        icon={<Target className="h-4 w-4" />}
        iconColor="green"
        title="Daily targets"
        subtitle="Set your commit goals"
      />

      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="input-label">{field.label}</label>
            <input
              type="number"
              min={0}
              max={field.max}
              value={field.value}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, [field.key]: Number(e.target.value) }))
              }
              className="input"
              disabled={!isSignedIn}
            />
          </div>
        ))}

        <div>
          <label className="input-label">Timezone</label>
          <div className="select-wrap">
            <select
              value={form.timezone}
              onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
              disabled={!isSignedIn}
            >
              {timeZones.map((zone) => (
                <option key={zone} value={zone}>{zone}</option>
              ))}
            </select>
            <ChevronDown className="select-chevron h-4 w-4" />
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          onClick={onSave}
          disabled={!isSignedIn || saving}
          className="btn btn-accent btn-sm"
        >
          {saving ? "Saving..." : "Save goals"}
        </button>
        {!isSignedIn && (
          <span className="text-xs text-[var(--text-tertiary)]">Sign in to edit goals.</span>
        )}
      </div>
    </Card>
  );
}
