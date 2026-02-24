"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BellRing, ChevronDown, Moon } from "lucide-react";
import { useAuth } from "@clerk/nextjs";
import { api } from "@convex/_generated/api";
import { Card, CardHeader } from "./ui/card";
import { Toggle } from "./ui/toggle";

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
      return (Intl as typeof Intl & { supportedValuesOf: (key: string) => string[] }).supportedValuesOf("timeZone");
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
    <Card>
      <CardHeader
        icon={<BellRing className="h-4 w-4" />}
        iconColor="cyan"
        title="Notifications"
        subtitle="Control reminder behavior"
      />

      <div className="space-y-4">
        <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-inset)] p-4">
          <Toggle
            checked={form.enabled}
            onChange={(checked) => setForm((prev) => ({ ...prev, enabled: checked }))}
            disabled={!canEdit}
            label="Enable reminders"
            description="Disable without disconnecting the bot."
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="input-label">
              <Moon className="inline h-3 w-3 mr-1 text-[var(--accent-2)]" />
              Quiet start
            </label>
            <input
              type="number"
              min={0}
              max={23}
              value={form.quietHoursStart}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, quietHoursStart: Number(e.target.value) }))
              }
              className="input"
              disabled={!canEdit}
            />
          </div>
          <div>
            <label className="input-label">
              <Moon className="inline h-3 w-3 mr-1 text-[var(--accent-2)]" />
              Quiet end
            </label>
            <input
              type="number"
              min={0}
              max={23}
              value={form.quietHoursEnd}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, quietHoursEnd: Number(e.target.value) }))
              }
              className="input"
              disabled={!canEdit}
            />
          </div>
        </div>

        <div>
          <label className="input-label">Timezone</label>
          <div className="select-wrap">
            <select
              value={form.timezone}
              onChange={(e) => setForm((prev) => ({ ...prev, timezone: e.target.value }))}
              disabled={!canEdit}
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
          onClick={handleSave}
          disabled={!canEdit || saving}
          className="btn btn-cyan btn-sm"
        >
          {saving ? "Saving..." : "Save settings"}
        </button>
        {!connection?.connected && (
          <span className="text-xs text-[var(--text-tertiary)]">Connect Telegram to edit settings.</span>
        )}
      </div>
    </Card>
  );
}
