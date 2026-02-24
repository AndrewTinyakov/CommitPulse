import { SkeletonCard } from "../ui/skeleton";
import GoalsCard from "../goals-card";
import TelegramSettingsCard from "../telegram-settings-card";

export default function SettingsView({
  loading,
  telegramConnected,
}: {
  loading: boolean;
  telegramConnected: boolean;
}) {
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="section-header">
          <h2 className="section-title">Settings</h2>
          <p className="section-desc">Configure goals and notification preferences.</p>
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
        <h2 className="section-title">Settings</h2>
        <p className="section-desc">Configure goals and notification preferences.</p>
      </div>
      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <GoalsCard />
        {telegramConnected ? (
          <TelegramSettingsCard />
        ) : (
          <div className="card">
            <div className="card-header">
              <div className="card-header-left">
                <span className="card-icon muted">
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                </span>
                <div>
                  <p className="card-title">Notification settings</p>
                  <p className="card-subtitle">Connect Telegram first</p>
                </div>
              </div>
            </div>
            <p className="text-sm text-[var(--text-secondary)]">
              Notification controls will appear here after you connect Telegram in the Connections page.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
