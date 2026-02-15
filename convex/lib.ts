export function toDateKey(timestamp: number, timeZone = "UTC") {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date(timestamp));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  if (!year || !month || !day) {
    return new Date(timestamp).toISOString().slice(0, 10);
  }
  return `${year}-${month}-${day}`;
}

function dayStampFromDateKey(dateKey: string) {
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (iso) {
    const [, year, month, day] = iso;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const us = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateKey);
  if (us) {
    const [, month, day, year] = us;
    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = Date.parse(dateKey);
  if (Number.isFinite(parsed)) {
    const date = new Date(parsed);
    return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  }

  return null;
}

export function computeStreakFromDateKeys(dateKeys: string[]) {
  const dayMs = 24 * 60 * 60 * 1000;
  const uniqueStamps = Array.from(
    new Set(
      dateKeys
        .map((dateKey) => dayStampFromDateKey(dateKey))
        .filter((stamp): stamp is number => stamp !== null),
    ),
  ).sort((a, b) => b - a);

  if (uniqueStamps.length === 0) return 0;

  let streak = 1;
  for (let index = 1; index < uniqueStamps.length; index += 1) {
    const diffDays = Math.round((uniqueStamps[index - 1] - uniqueStamps[index]) / dayMs);
    if (diffDays !== 1) break;
    streak += 1;
  }

  return streak;
}

export function formatLastSync(timestamp?: number | null) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function uniquePush(list: string[], value: string) {
  return list.includes(value) ? list : [...list, value];
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function maskToken(
  token: string,
  visiblePrefix = 4,
  visibleSuffix = 4,
  maskLength = 8,
) {
  const trimmed = token.trim();
  if (!trimmed) return null;
  if (trimmed.length <= visiblePrefix + visibleSuffix + 2) {
    return trimmed;
  }
  const prefix = trimmed.slice(0, visiblePrefix);
  const suffix = trimmed.slice(-visibleSuffix);
  return `${prefix}${"*".repeat(maskLength)}${suffix}`;
}
