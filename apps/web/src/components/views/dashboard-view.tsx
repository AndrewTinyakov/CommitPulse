import { useMemo } from "react";
import { formatDistanceToNowStrict } from "date-fns";
import {
  GitCommit,
  Sparkles,
  Layers,
  Activity,
  Target,
  CloudLightning,
  ShieldCheck,
  CircleDashed,
  Rocket,
  HelpCircle,
  PlugZap,
} from "lucide-react";
import { Card, CardHeader } from "../ui/card";
import { SkeletonDashboard, SkeletonMetricCard } from "../ui/skeleton";
import type { ViewId } from "../sidebar";

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
  syncStatus?: "idle" | "syncing" | "error" | null;
};

type TelegramStatus = {
  connected: boolean;
  enabled?: boolean | null;
  quietHoursStart?: number | null;
  quietHoursEnd?: number | null;
  lastNotifiedAt?: number | null;
};

export default function DashboardView({
  loading,
  hasGithub,
  overview,
  goals,
  activity,
  github,
  telegram,
  onNavigate,
}: {
  loading: boolean;
  hasGithub: boolean;
  overview: Overview;
  goals: Goals;
  activity: ActivityItem[];
  github: GitHubStatus;
  telegram: TelegramStatus;
  onNavigate: (view: ViewId) => void;
}) {
  if (loading) return <SkeletonDashboard />;

  if (!hasGithub) {
    return (
      <div className="fade-up">
        <div className="empty-state">
          <div className="empty-icon">
            <PlugZap className="h-5 w-5" />
          </div>
          <p className="empty-title">Connect GitHub to get started</p>
          <p className="empty-desc">
            Link your GitHub account to start tracking commits, streaks, and daily velocity.
          </p>
          <button className="btn btn-primary" onClick={() => onNavigate("connections")}>
            Go to Connections
          </button>
        </div>
      </div>
    );
  }

  const commitProgress = goals.commitsPerDay
    ? Math.min(overview.todayCommits / goals.commitsPerDay, 1)
    : 0;
  const locProgress = goals.locPerDay
    ? Math.min(overview.todayLoc / goals.locPerDay, 1)
    : 0;

  return (
    <div className="space-y-6">
      <StatsGrid overview={overview} />
      <div className="grid gap-6 lg:grid-cols-2">
        <GoalProgress
          overview={overview}
          goals={goals}
          commitProgress={commitProgress}
          locProgress={locProgress}
        />
        <CommitSizing activity={activity} />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SystemStatus github={github} telegram={telegram} goals={goals} />
        <ActivityFeed activity={activity} />
      </div>
    </div>
  );
}

function StatsGrid({ overview }: { overview: Overview }) {
  const metrics = [
    { icon: GitCommit, label: "Today", value: overview.todayCommits, sub: `${overview.todayLoc} LOC` },
    { icon: Sparkles, label: "Streak", value: `${overview.streakDays}d`, sub: overview.streakDays > 0 ? "Keep it up" : "Start today" },
    { icon: Layers, label: "Avg size", value: overview.avgCommitSize, sub: "LOC / commit" },
    { icon: Activity, label: "This week", value: overview.weeklyCommits, sub: `${overview.activeRepos} repos` },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {metrics.map((m, i) => (
        <div key={m.label} className={`metric-card fade-up stagger-${i + 1}`}>
          <div className="flex items-center justify-between">
            <span className="metric-label">{m.label}</span>
            <m.icon className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
          </div>
          <p className="metric-value">{m.value}</p>
          <p className="metric-sub">{m.sub}</p>
        </div>
      ))}
    </div>
  );
}

function GoalProgress({
  overview,
  goals,
  commitProgress,
  locProgress,
}: {
  overview: Overview;
  goals: Goals;
  commitProgress: number;
  locProgress: number;
}) {
  return (
    <Card className="fade-up stagger-3">
      <CardHeader
        icon={<Target className="h-4 w-4" />}
        iconColor="green"
        title="Daily goals"
        subtitle={`Push by ${goals.pushByHour}:00`}
      />
      <div className="space-y-5">
        <ProgressRow
          label="Commits"
          current={overview.todayCommits}
          goal={goals.commitsPerDay}
          progress={commitProgress}
        />
        <ProgressRow
          label="Lines changed"
          current={overview.todayLoc}
          goal={goals.locPerDay}
          progress={locProgress}
          variant="cyan"
        />
      </div>
    </Card>
  );
}

function ProgressRow({
  label,
  current,
  goal,
  progress,
  variant = "default",
}: {
  label: string;
  current: number;
  goal: number;
  progress: number;
  variant?: "default" | "cyan";
}) {
  const pct = Math.round(progress * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-2">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-mono text-xs text-[var(--text-tertiary)] tabular-nums">
          {current} / {goal}
        </span>
      </div>
      <div className="progress-track">
        <div
          className={`progress-fill ${variant === "cyan" ? "cyan" : ""}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
      <p className="text-right text-[0.65rem] text-[var(--text-tertiary)] mt-1 tabular-nums">{pct}%</p>
    </div>
  );
}

function CommitSizing({ activity }: { activity: ActivityItem[] }) {
  const buckets = useMemo(() => {
    const b = { small: 0, medium: 0, large: 0 };
    activity.forEach((item) => {
      if (item.size < 60) b.small += 1;
      else if (item.size < 180) b.medium += 1;
      else b.large += 1;
    });
    return b;
  }, [activity]);

  const total = buckets.small + buckets.medium + buckets.large || 1;

  return (
    <Card className="fade-up stagger-4">
      <CardHeader
        icon={<Layers className="h-4 w-4" />}
        iconColor="cyan"
        title="Commit sizing"
        subtitle="Recent distribution"
      />
      <div className="space-y-4">
        <SizeRow label="Small" detail="< 60 LOC" count={buckets.small} total={total} />
        <SizeRow label="Medium" detail="60-180 LOC" count={buckets.medium} total={total} />
        <SizeRow label="Large" detail="180+ LOC" count={buckets.large} total={total} />
      </div>
    </Card>
  );
}

function SizeRow({
  label,
  detail,
  count,
  total,
}: {
  label: string;
  detail: string;
  count: number;
  total: number;
}) {
  const pct = Math.round((count / total) * 100);
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="text-[var(--text-secondary)]">
          {label} <span className="text-[var(--text-tertiary)] text-xs">({detail})</span>
        </span>
        <span className="font-mono text-xs text-[var(--text-tertiary)] tabular-nums">
          {count} &middot; {pct}%
        </span>
      </div>
      <div className="progress-track">
        <div className="progress-fill cyan" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function SystemStatus({
  github,
  telegram,
  goals,
}: {
  github: GitHubStatus;
  telegram: TelegramStatus;
  goals: Goals;
}) {
  const telegramConnected = Boolean(telegram.connected);
  const telegramEnabled = Boolean(telegram.enabled);
  const lastReminder = telegram.lastNotifiedAt
    ? `${formatDistanceToNowStrict(telegram.lastNotifiedAt)} ago`
    : "--";

  const paceScore = Math.max(0, 0);

  const rows = [
    {
      icon: CloudLightning,
      label: "Sync",
      value: github.syncStatus === "syncing" ? "Syncing..." : github.syncStatus === "error" ? "Error" : "Live",
      dot: github.syncStatus === "syncing" ? "syncing" : github.syncStatus === "error" ? "error" : "online",
    },
    {
      icon: ShieldCheck,
      label: "Reminders",
      value: telegramEnabled ? "Active" : telegramConnected ? "Paused" : "Off",
      dot: telegramEnabled ? "online" : "offline",
    },
    {
      icon: CircleDashed,
      label: "Last reminder",
      value: telegramConnected ? (telegramEnabled ? lastReminder : "Paused") : "--",
    },
    {
      icon: Rocket,
      label: "Quiet hours",
      value: telegramConnected
        ? `${telegram.quietHoursStart ?? "?"}:00 - ${telegram.quietHoursEnd ?? "?"}:00`
        : "--",
    },
  ];

  return (
    <Card className="fade-up stagger-5">
      <div className="card-header">
        <div className="card-header-left">
          <span className="card-icon cyan">
            <Activity className="h-4 w-4" />
          </span>
          <div>
            <p className="card-title">System status</p>
            <p className="card-subtitle">Automation health</p>
          </div>
        </div>
        <ReminderTooltip />
      </div>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.label} className="data-row">
            <div className="flex items-center gap-2 data-label">
              <row.icon className="h-3.5 w-3.5" />
              <span>{row.label}</span>
            </div>
            <div className="flex items-center gap-2">
              {row.dot && <span className={`status-dot ${row.dot}`} />}
              <span className="data-value">{row.value}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function ActivityFeed({ activity }: { activity: ActivityItem[] }) {
  if (activity.length === 0) {
    return (
      <Card className="fade-up stagger-6">
        <CardHeader
          icon={<GitCommit className="h-4 w-4" />}
          iconColor="muted"
          title="Recent activity"
          subtitle="Latest commits"
        />
        <p className="text-sm text-[var(--text-tertiary)] py-6 text-center">No commits yet today.</p>
      </Card>
    );
  }

  return (
    <Card className="fade-up stagger-6">
      <CardHeader
        icon={<GitCommit className="h-4 w-4" />}
        iconColor="muted"
        title="Recent activity"
        subtitle="Latest commits"
      />
      <div className="space-y-0.5">
        {activity.map((item, i) => {
          const repoShort = item.repo.includes("/")
            ? item.repo.split("/").pop()
            : item.repo;
          const timeAgo = formatDistanceToNowStrict(item.committedAt, { addSuffix: true });
          const sizeColor =
            item.size < 60
              ? "text-[var(--accent)]"
              : item.size < 180
                ? "text-[var(--accent-2)]"
                : "text-[var(--danger)]";

          return (
            <div key={`${item.committedAt}-${i}`} className="data-row">
              <div className="flex flex-col min-w-0 flex-1 mr-3">
                <span className="text-sm text-[var(--text-primary)] truncate">
                  {item.message.split("\n")[0]}
                </span>
                <span className="text-xs text-[var(--text-tertiary)]">
                  {repoShort} &middot; {timeAgo}
                </span>
              </div>
              <span className={`text-xs font-mono tabular-nums ${sizeColor}`}>
                {item.size} LOC
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function ReminderTooltip() {
  return (
    <div className="tooltip-wrap">
      <button
        type="button"
        className="btn btn-icon"
        aria-label="Reminder logic"
      >
        <HelpCircle className="h-3.5 w-3.5 text-[var(--text-tertiary)]" />
      </button>
      <div className="tooltip-content">
        <p className="text-sm font-medium text-[var(--text-primary)] mb-2">Reminder triggers</p>
        <ul className="space-y-1 text-xs text-[var(--text-secondary)]">
          <li>Past your push hour</li>
          <li>Below daily goals</li>
          <li>No ping in 6 hours</li>
          <li>No commits in 90 min</li>
        </ul>
      </div>
    </div>
  );
}
