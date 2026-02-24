"use client";

import { useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import AppShell from "./app-shell";
import type { ViewId } from "./sidebar";
import DashboardView from "./views/dashboard-view";
import ConnectionsView from "./views/connections-view";
import SettingsView from "./views/settings-view";
import LandingPage from "./landing-page";

const fallbackOverview = {
  todayCommits: 0,
  todayLoc: 0,
  streakDays: 0,
  avgCommitSize: 0,
  weeklyCommits: 0,
  activeRepos: 0,
  lastSync: null,
};

const fallbackGoals = {
  commitsPerDay: 3,
  locPerDay: 120,
  pushByHour: 18,
  timezone: "UTC",
};

export default function Dashboard() {
  const { isSignedIn, isLoaded } = useAuth();
  const signedIn = Boolean(isSignedIn);

  const overview = useQuery(api.dashboard.getOverview, signedIn ? {} : "skip");
  const goals = useQuery(api.dashboard.getGoals, signedIn ? {} : "skip");
  const activity = useQuery(api.dashboard.getActivity, signedIn ? { limit: 6 } : "skip");
  const github = useQuery(api.github.getConnectionV2, signedIn ? {} : "skip");
  const telegram = useQuery(api.telegram.getConnection, signedIn ? {} : "skip");

  const [activeView, setActiveView] = useState<ViewId>("dashboard");

  if (isLoaded && !signedIn) {
    return <LandingPage />;
  }

  const hasGithub = isLoaded && Boolean(github?.connected);
  const telegramConnected = isLoaded && Boolean(telegram?.connected);
  const dataLoading = !isLoaded || (signedIn && overview === undefined);

  return (
    <AppShell activeView={activeView} onNavigate={setActiveView} authLoaded={isLoaded ?? false}>
      {activeView === "dashboard" && (
        <DashboardView
          loading={dataLoading}
          hasGithub={hasGithub}
          overview={overview ?? fallbackOverview}
          goals={goals ?? fallbackGoals}
          activity={activity ?? []}
          github={github ?? { connected: false }}
          telegram={telegram ?? { connected: false }}
          onNavigate={setActiveView}
        />
      )}
      {activeView === "connections" && <ConnectionsView loading={dataLoading} />}
      {activeView === "settings" && (
        <SettingsView loading={dataLoading} telegramConnected={telegramConnected} />
      )}
    </AppShell>
  );
}
