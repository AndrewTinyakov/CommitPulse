import { SkeletonCard } from "../ui/skeleton";
import GitHubConnectCard from "../github-connect-card";
import TelegramConnectCard from "../telegram-connect-card";

export default function ConnectionsView({ loading }: { loading: boolean }) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="section-header">
          <h2 className="section-title">Connections</h2>
          <p className="section-desc">Manage your GitHub and Telegram integrations.</p>
        </div>
        <div className="grid gap-6 lg:grid-cols-2">
          <SkeletonCard lines={5} />
          <SkeletonCard lines={4} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 fade-up">
      <div className="section-header">
        <h2 className="section-title">Connections</h2>
        <p className="section-desc">Manage your GitHub and Telegram integrations.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <GitHubConnectCard />
        <TelegramConnectCard />
      </div>
    </div>
  );
}
