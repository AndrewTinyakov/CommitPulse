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

const DAY_MS = 24 * 60 * 60 * 1000;
export const INITIAL_BACKFILL_DAYS = 90;
export const BACKFILL_STEP_DAYS = 90;
export const MAX_BACKFILL_DAYS = 1825;

export function dateKeyToDayStamp(dateKey: string) {
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

function dayStampToDateKey(dayStamp: number) {
  return new Date(dayStamp).toISOString().slice(0, 10);
}

export type CurrentStreakComputation = {
  anchorDateKey: string;
  streakDays: number;
  streakStartDateKey: string | null;
  firstGapDateKey: string | null;
  newestDateKey: string | null;
  oldestDateKey: string | null;
};

export function computeCurrentStreakFromDateKeys(
  dateKeys: string[],
  anchorDateKey: string,
): CurrentStreakComputation {
  const uniqueStamps = Array.from(
    new Set(
      dateKeys
        .map((dateKey) => dateKeyToDayStamp(dateKey))
        .filter((stamp): stamp is number => stamp !== null),
    ),
  ).sort((a, b) => b - a);

  const anchorStamp = dateKeyToDayStamp(anchorDateKey);
  const newestDateKey = uniqueStamps.length > 0 ? dayStampToDateKey(uniqueStamps[0]) : null;
  const oldestDateKey =
    uniqueStamps.length > 0 ? dayStampToDateKey(uniqueStamps[uniqueStamps.length - 1]) : null;
  if (uniqueStamps.length === 0 || anchorStamp === null) {
    return {
      anchorDateKey,
      streakDays: 0,
      streakStartDateKey: null,
      firstGapDateKey: anchorDateKey,
      newestDateKey,
      oldestDateKey,
    };
  }

  const stamps = new Set(uniqueStamps);
  const startStamp = stamps.has(anchorStamp)
    ? anchorStamp
    : stamps.has(anchorStamp - DAY_MS)
      ? anchorStamp - DAY_MS
      : null;
  if (startStamp === null) {
    return {
      anchorDateKey,
      streakDays: 0,
      streakStartDateKey: null,
      firstGapDateKey: anchorDateKey,
      newestDateKey,
      oldestDateKey,
    };
  }

  let streakDays = 0;
  let cursorStamp = startStamp;
  while (stamps.has(cursorStamp)) {
    streakDays += 1;
    cursorStamp -= DAY_MS;
  }

  const streakStartStamp = startStamp - (streakDays - 1) * DAY_MS;
  return {
    anchorDateKey,
    streakDays,
    streakStartDateKey: dayStampToDateKey(streakStartStamp),
    firstGapDateKey: dayStampToDateKey(cursorStamp),
    newestDateKey,
    oldestDateKey,
  };
}

export function computeCurrentStreakFromCommitEvents(
  committedAt: number[],
  timeZone: string,
  anchorTimestamp = Date.now(),
): CurrentStreakComputation {
  const dateKeys = committedAt.map((timestamp) => toDateKey(timestamp, timeZone));
  const anchorDateKey = toDateKey(anchorTimestamp, timeZone);
  return computeCurrentStreakFromDateKeys(dateKeys, anchorDateKey);
}

export function touchesLookbackBoundary(
  streakStartDateKey: string | null,
  lookbackStartDateKey: string,
) {
  if (!streakStartDateKey) return false;
  const streakStartStamp = dateKeyToDayStamp(streakStartDateKey);
  const lookbackStartStamp = dateKeyToDayStamp(lookbackStartDateKey);
  if (streakStartStamp === null || lookbackStartStamp === null) return false;
  return streakStartStamp <= lookbackStartStamp;
}

export function computeStreakFromDateKeys(dateKeys: string[], anchorDateKey?: string) {
  const anchor = anchorDateKey ?? toDateKey(Date.now(), "UTC");
  return computeCurrentStreakFromDateKeys(dateKeys, anchor).streakDays;
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
