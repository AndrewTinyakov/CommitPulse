export function toDateKey(timestamp: number, timeZone = "UTC") {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return formatter.format(new Date(timestamp));
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
