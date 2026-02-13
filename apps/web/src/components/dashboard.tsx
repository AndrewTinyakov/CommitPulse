"use client";

import { SignedIn, SignedOut, SignInButton, UserButton, useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  Activity,
  Bell,
  CircleDashed,
  CloudLightning,
  Cpu,
  GitCommit,
  HelpCircle,
  Layers,
  Lock,
  PlugZap,
  Radar,
  Rocket,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Target,
  Timer,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "@convex/_generated/api";
import GoalsCard from "./goals-card";
import GitHubConnectCard from "./github-connect-card";
import TelegramConnectCard from "./telegram-connect-card";
import TelegramSettingsCard from "./telegram-settings-card";

type Overview = {
  todayCommits: number;
  todayLoc: number;
  streakDays: number;
  avgCommitSize: number;
  weeklyCommits: number;
  activeRepos: number;
  lastSync: string | null;
};

type Goals = {
  commitsPerDay: number;
  locPerDay: number;
  pushByHour: number;
  timezone: string;
};

type ActivityItem = {
  message: string;
  repo: string;
  size: number;
  committedAt: number;
};

type GitHubStatus = {
  connected: boolean;
  login?: string | null;
  lastSync?: string | null;
};

type TelegramStatus = {
  connected: boolean;
  enabled?: boolean | null;
  telegramUserId?: string | null;
  telegramUsername?: string | null;
  chatId?: string | null;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  timezone?: string | null;
  lastNotifiedAt?: number | null;
};

const fallbackOverview: Overview = {
  todayCommits: 0,
  todayLoc: 0,
  streakDays: 0,
  avgCommitSize: 0,
  weeklyCommits: 0,
  activeRepos: 0,
  lastSync: null,
};

const fallbackGoals: Goals = {
  commitsPerDay: 3,
  locPerDay: 120,
  pushByHour: 18,
  timezone: "UTC",
};

export default function Dashboard() {
  return <RemoteDashboard />;
}

function RemoteDashboard() {
  const { isSignedIn, isLoaded } = useAuth();
  const signedIn = Boolean(isSignedIn);
  const overview = useQuery(api.dashboard.getOverview, signedIn ? {} : "skip");
  const goals = useQuery(api.dashboard.getGoals, signedIn ? {} : "skip");
  const activity = useQuery(
    api.dashboard.getActivity,
    signedIn ? { limit: 6 } : "skip",
  );
  const github = useQuery(api.github.getConnection, signedIn ? {} : "skip");
  const telegram = useQuery(api.telegram.getConnection, signedIn ? {} : "skip");

  return (
    <DashboardShell
      authLoaded={isLoaded}
      signedIn={signedIn}
      overview={overview ?? fallbackOverview}
      goals={goals ?? fallbackGoals}
      activity={activity ?? []}
      github={github ?? { connected: false }}
      telegram={telegram ?? { connected: false, enabled: false }}
    />
  );
}

function DashboardShell({
  authLoaded,
  signedIn,
  overview,
  goals,
  activity,
  github,
  telegram,
}: {
  authLoaded: boolean;
  signedIn: boolean;
  overview: Overview;
  goals: Goals;
  activity: ActivityItem[];
  github: GitHubStatus;
  telegram: TelegramStatus;
}) {
  const commitProgress = goals.commitsPerDay
    ? Math.min(overview.todayCommits / goals.commitsPerDay, 1)
    : 0;
  const locProgress = goals.locPerDay ? Math.min(overview.todayLoc / goals.locPerDay, 1) : 0;
  const paceScore = Math.max(commitProgress, locProgress);
  const paceLabel = paceScore >= 1 ? "On target" : paceScore >= 0.6 ? "Catching up" : "Behind";
  const signedInReady = authLoaded && signedIn;

  const mounted = useMounted();
  const lastReminder =
    mounted && telegram.lastNotifiedAt
      ? `${formatDistanceToNowStrict(telegram.lastNotifiedAt)} ago`
      : "—";

  const sizeBuckets = useMemo(() => {
    const buckets = { small: 0, medium: 0, large: 0 };
    activity.forEach((item) => {
      if (item.size < 60) buckets.small += 1;
      else if (item.size < 180) buckets.medium += 1;
      else buckets.large += 1;
    });
    return buckets;
  }, [activity]);

  const totalBucket = sizeBuckets.small + sizeBuckets.medium + sizeBuckets.large || 1;

  const hasGithub = authLoaded && Boolean(github.connected);
  const telegramConnected = authLoaded && Boolean(telegram.connected);
  const telegramEnabled = authLoaded && Boolean(telegram.enabled);
  const telegramStatus = telegramConnected ? (telegramEnabled ? "Active" : "Paused") : "Offline";
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

  return (
    <div className="page">
      <div className="relative mx-auto flex max-w-7xl flex-col gap-10 px-6 py-10">
        <header className="panel panel-strong relative overflow-hidden rounded-[32px] px-8 py-8">
          <div className="absolute right-8 top-8 hidden h-28 w-28 rounded-full border border-[rgba(81,214,255,0.2)] bg-[rgba(81,214,255,0.08)] blur-xl lg:block" />
          <div className="flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex flex-col gap-5">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(183,255,72,0.3)] bg-[rgba(183,255,72,0.12)] text-[var(--accent)]">
                  <Radar className="h-5 w-5" />
                </span>
                <div>
                  <p className="headline text-xs text-[var(--muted)]">CommitPulse</p>
                  <p className="text-xs text-[var(--muted)]">Daily commit intelligence</p>
                </div>
              </div>
              <h1 className="headline text-3xl leading-tight md:text-4xl lg:text-5xl">
                Command your push rhythm, not just your commit count.
              </h1>
              <p className="max-w-2xl text-sm text-[var(--muted)] md:text-base">
                Track every repo, surface commit size patterns, and let smart reminders wait
                for the right moment to nudge you.
              </p>
              <div className="flex flex-wrap gap-3">
                <span className="chip chip-accent">Realtime sync</span>
                <span className="chip chip-cool">Reasonable nudges</span>
                <span className="chip">Size analytics</span>
              </div>
            </div>
            <div className="flex w-full flex-col gap-4 lg:w-[280px] lg:items-stretch">
              {!authLoaded ? (
                <AuthPendingCard />
              ) : (
                <>
                  <SignedOut>
                    <SignInButton>
                      <button className="glow inline-flex w-full items-center justify-center rounded-full bg-[var(--accent)] px-6 py-3 text-sm font-semibold text-black">
                        Sign in to connect
                      </button>
                    </SignInButton>
                  </SignedOut>
                  <SignedIn>
                    <div className="flex w-full items-center justify-between gap-3 rounded-full border border-[rgba(255,255,255,0.1)] px-4 py-2 text-sm text-[var(--muted)]">
                      <span className="hidden sm:block">Synced</span>
                      <UserButton
                        appearance={{
                          elements: {
                            userButtonAvatarBox: "h-8 w-8",
                          },
                        }}
                      />
                    </div>
                  </SignedIn>
                  {hasGithub ? (
                    <div className="grid gap-3 text-xs text-[var(--muted)]">
                      <p className="headline text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
                        Connection overview
                      </p>
                      <ConnectionSnapshot
                        icon={<PlugZap className="h-3.5 w-3.5 text-[var(--accent-2)]" />}
                        label="GitHub account"
                        value={github.login ? `Connected as ${github.login}` : "Connected"}
                      />
                      <ConnectionSnapshot
                        icon={<Bell className="h-3.5 w-3.5 text-[var(--accent)]" />}
                        label="Reminders"
                        value={telegramStatus === "Active" ? "Reminders active" : `Reminders ${telegramStatus.toLowerCase()}`}
                        valueClassName={
                          telegramStatus === "Active"
                            ? "text-[var(--accent)]"
                            : "text-[var(--text)]"
                        }
                      />
                      <ConnectionSnapshot
                        icon={<Timer className="h-3.5 w-3.5 text-[var(--accent-2)]" />}
                        label="Last sync"
                        value={github.lastSync ? `Last sync ${github.lastSync}` : "Last sync pending"}
                        valueClassName="text-[var(--text)] tabular-nums"
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        <button
                          onClick={() => setConnectionsOpen(true)}
                          className="rounded-full border border-[rgba(81,214,255,0.4)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-2)]"
                        >
                          Manage connections
                        </button>
                        <button
                          onClick={() => setSettingsOpen(true)}
                          className="rounded-full border border-[rgba(183,255,72,0.5)] px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent)]"
                        >
                          Preferences
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="panel w-full rounded-2xl border border-[rgba(183,255,72,0.35)] px-5 py-4 text-sm text-[var(--muted)]">
                      <p className="headline text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
                        Getting started
                      </p>
                      <p className="mt-2 text-sm text-[var(--text)]">
                        {signedInReady
                          ? "Connect GitHub to unlock stats and alerts."
                          : "Sign in, then connect GitHub to unlock stats and alerts."}
                      </p>
                      <p className="mt-2 text-xs text-[var(--muted)]">
                        {signedInReady
                          ? "We'll start syncing commits within a few minutes."
                          : "We'll ask for a token after you sign in."}
                      </p>
                      <a
                        href="#github-connect"
                        className="mt-3 inline-flex rounded-full border border-[rgba(183,255,72,0.5)] px-4 py-2 text-xs uppercase tracking-[0.2em] text-[var(--accent)]"
                      >
                        Connect GitHub
                      </a>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </header>

        {!authLoaded ? (
          <section id="loading" className="space-y-4">
            <SectionHeader
              label="Loading"
              title="Preparing dashboard"
              description="Checking your session and recent syncs."
            />
            <div className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
              <div className="panel rounded-3xl p-6">
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 w-40 rounded-full bg-[rgba(255,255,255,0.08)]" />
                  <div className="h-3 w-64 rounded-full bg-[rgba(255,255,255,0.06)]" />
                  <div className="mt-6 grid gap-3 md:grid-cols-2">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-16 rounded-2xl bg-[rgba(255,255,255,0.04)]"
                      />
                    ))}
                  </div>
                </div>
              </div>
              <div className="panel rounded-3xl p-6">
                <div className="space-y-3 animate-pulse">
                  <div className="h-4 w-32 rounded-full bg-[rgba(255,255,255,0.08)]" />
                  <div className="h-3 w-52 rounded-full bg-[rgba(255,255,255,0.06)]" />
                  <div className="mt-6 space-y-3">
                    {Array.from({ length: 4 }).map((_, index) => (
                      <div
                        key={index}
                        className="h-9 rounded-2xl bg-[rgba(255,255,255,0.04)]"
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : hasGithub ? (
          <section id="stats" className="space-y-4">
            <SectionHeader
              label="Stats"
              title="Commit intelligence"
              description="Live snapshots of commit volume, size, and velocity."
            />
            <div className="grid gap-6 lg:grid-cols-[1.6fr,1fr]">
              <div className="flex flex-col gap-6">
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <MetricCard
                    icon={<GitCommit className="h-4 w-4" />}
                    label="Today"
                    value={`${overview.todayCommits} commits`}
                    sub={`${overview.todayLoc} LOC`}
                  />
                  <MetricCard
                    icon={<Sparkles className="h-4 w-4" />}
                    label="Streak"
                    value={`${overview.streakDays} days`}
                    sub="No breaks"
                  />
                  <MetricCard
                    icon={<Layers className="h-4 w-4" />}
                    label="Average size"
                    value={`${overview.avgCommitSize} LOC`}
                    sub="Per commit"
                  />
                  <MetricCard
                    icon={<Activity className="h-4 w-4" />}
                    label="Weekly"
                    value={`${overview.weeklyCommits} commits`}
                    sub={`${overview.activeRepos} repos touched`}
                  />
                </div>

                <div className="panel metric-card rounded-3xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="headline text-xs text-[var(--muted)]">Goal progress</p>
                      <p className="text-lg font-semibold">Daily targets pacing</p>
                    </div>
                    <span className="chip">Push by {goals.pushByHour}:00</span>
                  </div>
                  <div className="mt-6 grid gap-4">
                    <ProgressRow
                      label="Commits"
                      value={overview.todayCommits}
                      goal={goals.commitsPerDay}
                      progress={commitProgress}
                    />
                    <ProgressRow
                      label="Lines changed"
                      value={overview.todayLoc}
                      goal={goals.locPerDay}
                      progress={locProgress}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-col gap-6">
                <div className="panel rounded-3xl p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="headline text-xs text-[var(--muted)]">Commit sizing</p>
                      <p className="text-lg font-semibold">Distribution snapshot</p>
                    </div>
                    <span className="chip">Last sync</span>
                  </div>
                  <div className="mt-6 space-y-3">
                    <SizeRow
                      label="Small (0-60 LOC)"
                      count={sizeBuckets.small}
                      total={totalBucket}
                    />
                    <SizeRow
                      label="Medium (60-180 LOC)"
                      count={sizeBuckets.medium}
                      total={totalBucket}
                    />
                    <SizeRow
                      label="Large (180+ LOC)"
                      count={sizeBuckets.large}
                      total={totalBucket}
                    />
                  </div>
                </div>

                <div className="panel rounded-3xl p-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(81,214,255,0.3)] bg-[rgba(81,214,255,0.12)] text-[var(--accent-2)]">
                        <Cpu className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="headline text-xs text-[var(--muted)]">System status</p>
                        <p className="text-lg font-semibold">Automation health</p>
                      </div>
                    </div>
                    <ReminderTooltip />
                  </div>
                  <div className="mt-5 space-y-3 text-sm text-[var(--muted)]">
                    <StatusRow
                      icon={<CloudLightning className="h-4 w-4 text-[var(--accent)]" />}
                      label="Sync cadence"
                      value="Every 30 minutes"
                    />
                    <StatusRow
                      icon={<Target className="h-4 w-4 text-[var(--accent)]" />}
                      label="Daily pace"
                      value={paceLabel}
                    />
                    <StatusRow
                      icon={<ShieldCheck className="h-4 w-4 text-[var(--accent-2)]" />}
                      label="Reminders"
                      value={telegramEnabled ? "Adaptive" : telegramConnected ? "Paused" : "Disabled"}
                    />
                    <StatusRow
                      icon={<CircleDashed className="h-4 w-4 text-[var(--accent)]" />}
                      label="Last reminder"
                      value={
                        telegramConnected
                          ? telegramEnabled
                            ? lastReminder
                            : "Paused"
                          : "—"
                      }
                    />
                    <StatusRow
                      icon={<Rocket className="h-4 w-4 text-[var(--accent-2)]" />}
                      label="Quiet hours"
                      value={
                        telegramConnected
                          ? `${telegram.quietHoursStart ?? "?"}:00 - ${telegram.quietHoursEnd ?? "?"}:00`
                          : "—"
                      }
                    />
                  </div>
                </div>
              </div>
            </div>
          </section>
        ) : (
          <>
            <section id="connections" className="space-y-4">
              <SectionHeader
                label="Connections"
                title="Connect your stack"
                description="Start with GitHub. Stats and reminders unlock after the first repo sync."
              />
              <div className="grid gap-6">
                <div id="github-connect" className="scroll-mt-32">
                  <GitHubConnectCard />
                </div>
                {hasGithub && (
                  <div id="telegram-connect" className="scroll-mt-32">
                    <TelegramConnectCard />
                  </div>
                )}
              </div>
            </section>
            <section id="stats" className="space-y-4">
              <SectionHeader
                label="Stats"
                title="Commit intelligence"
                description="Live snapshots of commit volume, size, and velocity."
              />
              <LockedPanel />
            </section>
          </>
        )}

        {hasGithub && (
          <>
            <Modal
              open={connectionsOpen}
              onClose={() => setConnectionsOpen(false)}
              title="Connections"
              description="Update tokens, sync status, or disconnect a service."
            >
              <div className="grid gap-6 lg:grid-cols-2 lg:items-stretch">
                <GitHubConnectCard />
                <TelegramConnectCard />
              </div>
            </Modal>
            <Modal
              open={settingsOpen}
              onClose={() => setSettingsOpen(false)}
              title="Preferences"
              description="Tune goals and notification behavior without cluttering the dashboard."
            >
              <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
                <GoalsCard />
                {telegramConnected ? (
                  <TelegramSettingsCard />
                ) : (
                  <div className="panel rounded-3xl px-6 py-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.35)] text-[var(--muted)]">
                        <SlidersHorizontal className="h-4 w-4" />
                      </span>
                      <div>
                        <p className="headline text-xs text-[var(--muted)]">Notifications</p>
                        <p className="text-lg font-semibold">Connect Telegram first</p>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-[var(--muted)]">
                      Telegram controls appear here after the bot is connected.
                    </p>
                    <button
                      onClick={() => {
                        setSettingsOpen(false);
                        setConnectionsOpen(true);
                      }}
                      className="mt-4 rounded-full border border-[rgba(81,214,255,0.4)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent-2)]"
                    >
                      Open connections
                    </button>
                  </div>
                )}
              </div>
            </Modal>
          </>
        )}
      </div>
    </div>
  );
}

function SectionHeader({
  label,
  title,
  description,
}: {
  label: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3 text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
        <span className="h-px w-10 bg-[rgba(255,255,255,0.12)]" />
        <span>{label}</span>
      </div>
      <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-2xl font-semibold">{title}</p>
          <p className="text-sm text-[var(--muted)]">{description}</p>
        </div>
        <div className="flex items-center gap-2 pt-1 text-xs uppercase tracking-[0.2em] text-[var(--muted)] md:pt-2">
          <span className="h-2 w-2 rounded-full bg-[var(--accent-2)]" />
          Live sync
        </div>
      </div>
    </div>
  );
}

function LockedPanel() {
  return (
    <div className="panel relative overflow-hidden rounded-3xl px-8 py-7">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(81,214,255,0.12),transparent_55%)]" />
      <div className="relative flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[rgba(81,214,255,0.3)] bg-[rgba(81,214,255,0.12)] text-[var(--accent-2)]">
            <Lock className="h-4 w-4" />
          </span>
          <div className="space-y-2">
            <p className="text-lg font-semibold text-[var(--text)]">
              Connect GitHub to unlock stats.
            </p>
            <p className="text-sm text-[var(--muted)]">
              Once a repo is linked, CommitPulse will start tracking daily velocity and sizes.
            </p>
          </div>
        </div>
        <a
          href="#github-connect"
          className="inline-flex items-center justify-center rounded-full border border-[rgba(183,255,72,0.5)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--accent)]"
        >
          Connect GitHub
        </a>
      </div>
    </div>
  );
}

function AuthPendingCard() {
  return (
    <div className="panel w-full rounded-2xl border border-[rgba(255,255,255,0.12)] px-5 py-4 text-sm">
      <div className="flex items-center justify-between">
        <p className="headline text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
          Checking session
        </p>
        <span className="h-2 w-2 rounded-full bg-[var(--accent-2)] animate-pulse" />
      </div>
      <p className="mt-2 text-sm text-[var(--text)]">Syncing your workspace state...</p>
      <div className="mt-3 space-y-2">
        <div className="h-2 w-full rounded-full bg-[rgba(255,255,255,0.08)]" />
        <div className="h-2 w-4/5 rounded-full bg-[rgba(255,255,255,0.06)]" />
      </div>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  sub,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="panel metric-card rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.03)] text-[var(--accent)]">
          {icon}
        </span>
        <span className="text-xs text-[var(--muted)]">{label}</span>
      </div>
      <p className="mt-4 text-2xl font-semibold">{value}</p>
      <p className="text-xs text-[var(--muted)]">{sub}</p>
    </div>
  );
}

function ConnectionSnapshot({
  icon,
  label,
  value,
  valueClassName = "text-[var(--text)]",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  valueClassName?: string;
}) {
  return (
    <div className="rounded-2xl border border-[rgba(255,255,255,0.08)] bg-[rgba(0,0,0,0.3)] px-4 py-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
        {icon}
        <span>{label}</span>
      </div>
      <p className={`mt-1 truncate text-sm ${valueClassName}`} title={value}>
        {value}
      </p>
    </div>
  );
}

function ProgressRow({
  label,
  value,
  goal,
  progress,
}: {
  label: string;
  value: number;
  goal: number;
  progress: number;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-[var(--muted)] tabular-nums">
          {value} / {goal}
        </span>
      </div>
      <div className="h-2 w-full rounded-full bg-[rgba(255,255,255,0.08)]">
        <div
          className="h-2 rounded-full bg-[var(--accent)]"
          style={{ width: `${Math.min(progress * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

function SizeRow({ label, count, total }: { label: string; count: number; total: number }) {
  const percent = Math.round((count / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-[var(--muted)] tabular-nums">{percent}%</span>
      </div>
      <div className="mt-2 h-2 rounded-full bg-[rgba(255,255,255,0.08)]">
        <div
          className="h-2 rounded-full bg-[var(--accent-2)]"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

function StatusRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="grid w-full items-center gap-4 [grid-template-columns:140px_minmax(0,1fr)] sm:[grid-template-columns:160px_minmax(0,1fr)]">
      <div className="flex min-w-0 items-center gap-2 text-[var(--muted)]">
        {icon}
        <span className="truncate">{label}</span>
      </div>
      <span className="truncate text-[var(--text)] tabular-nums" title={value}>
        {value}
      </span>
    </div>
  );
}

function useMounted() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}

function ReminderTooltip() {
  return (
    <div className="group relative">
      <button
        type="button"
        className="flex h-9 w-9 items-center justify-center rounded-full border border-[rgba(255,255,255,0.12)] text-[var(--muted)] transition hover:text-[var(--text)]"
        aria-label="Reminder logic"
      >
        <HelpCircle className="h-4 w-4" />
      </button>
      <div className="pointer-events-none absolute right-0 top-11 w-64 rounded-2xl border border-[rgba(255,255,255,0.12)] bg-[rgba(8,11,18,0.95)] p-4 text-xs text-[var(--muted)] opacity-0 shadow-[0_30px_80px_rgba(3,5,10,0.55)] transition group-hover:opacity-100 group-focus-within:opacity-100">
        <p className="text-sm font-semibold text-[var(--text)]">Reminder logic</p>
        <div className="mt-2 space-y-1">
          <p>Past your push hour</p>
          <p>Below daily goals</p>
          <p>No ping in 6 hours</p>
          <p>No recent commits in 90 min</p>
        </div>
      </div>
    </div>
  );
}

function Modal({
  open,
  onClose,
  title,
  description,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6">
      <div
        className="absolute inset-0 bg-[rgba(3,5,10,0.72)] backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="panel panel-strong relative w-full max-w-5xl overflow-hidden rounded-[32px] border border-[rgba(255,255,255,0.1)] px-6 py-6 shadow-[0_40px_120px_rgba(3,5,10,0.7)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="headline text-xs text-[var(--muted)]">Control room</p>
            <p className="text-2xl font-semibold">{title}</p>
            {description && <p className="text-sm text-[var(--muted)]">{description}</p>}
          </div>
          <button
            onClick={onClose}
            className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,255,255,0.12)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[var(--text)]"
          >
            <X className="h-3 w-3" />
            Close
          </button>
        </div>
        <div className="mt-6 max-h-[70vh] overflow-y-auto pr-1">{children}</div>
      </div>
    </div>
  );
}
