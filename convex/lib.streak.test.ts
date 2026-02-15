import test from "node:test";
import assert from "node:assert/strict";
import {
  computeCurrentStreakFromCommitEvents,
  toDateKey,
  touchesLookbackBoundary,
} from "./lib.ts";

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayAnchor(dayOffset = 0) {
  const now = Date.now();
  const todayUtc = new Date(
    Date.UTC(
      new Date(now).getUTCFullYear(),
      new Date(now).getUTCMonth(),
      new Date(now).getUTCDate(),
      12,
      0,
      0,
      0,
    ),
  ).getTime();
  return todayUtc - dayOffset * DAY_MS;
}

test("computes 34-day consecutive streak ending today", () => {
  const commits = Array.from({ length: 34 }, (_, index) => utcDayAnchor(index));
  const snapshot = computeCurrentStreakFromCommitEvents(commits, "UTC", utcDayAnchor(0));
  assert.equal(snapshot.streakDays, 34);
});

test("uses yesterday as anchor when today has no commits", () => {
  const commits = Array.from({ length: 12 }, (_, index) => utcDayAnchor(index + 1));
  const snapshot = computeCurrentStreakFromCommitEvents(commits, "UTC", utcDayAnchor(0));
  assert.equal(snapshot.streakDays, 12);
});

test("returns zero streak when no today/yesterday commits exist", () => {
  const commits = [utcDayAnchor(3), utcDayAnchor(4), utcDayAnchor(5)];
  const snapshot = computeCurrentStreakFromCommitEvents(commits, "UTC", utcDayAnchor(0));
  assert.equal(snapshot.streakDays, 0);
});

test("deduplicates multiple commits on the same day", () => {
  const today = utcDayAnchor(0);
  const yesterday = utcDayAnchor(1);
  const commits = [today, today + 60_000, yesterday, yesterday + 120_000];
  const snapshot = computeCurrentStreakFromCommitEvents(commits, "UTC", today);
  assert.equal(snapshot.streakDays, 2);
});

test("handles timezone boundaries around midnight", () => {
  const tz = "America/Los_Angeles";
  const anchor = Date.parse("2026-02-15T12:00:00.000Z");
  const sameLocalDayEarly = Date.parse("2026-02-15T07:30:00.000Z");
  const sameLocalDayLate = Date.parse("2026-02-15T22:30:00.000Z");
  const previousLocalDay = Date.parse("2026-02-14T08:30:00.000Z");
  const snapshot = computeCurrentStreakFromCommitEvents(
    [sameLocalDayEarly, sameLocalDayLate, previousLocalDay],
    tz,
    anchor,
  );
  assert.equal(snapshot.streakDays, 2);
});

test("detects boundary touch for long streak lookback extension", () => {
  const anchor = utcDayAnchor(0);
  const commits = Array.from({ length: 140 }, (_, index) => anchor - index * DAY_MS);
  const snapshot = computeCurrentStreakFromCommitEvents(commits, "UTC", anchor);
  const lookbackStartDateKey = toDateKey(anchor - 90 * DAY_MS, "UTC");
  assert.equal(touchesLookbackBoundary(snapshot.streakStartDateKey, lookbackStartDateKey), true);
});

