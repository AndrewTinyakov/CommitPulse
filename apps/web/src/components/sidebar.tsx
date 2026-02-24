import { Activity, PlugZap, Settings, Radar } from "lucide-react";

export type ViewId = "dashboard" | "connections" | "settings";

const navItems: { id: ViewId; label: string; icon: typeof Activity }[] = [
  { id: "dashboard", label: "Dashboard", icon: Activity },
  { id: "connections", label: "Connections", icon: PlugZap },
  { id: "settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  activeView,
  onNavigate,
}: {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}) {
  return (
    <aside className="app-sidebar">
      <div className="brand">
        <span className="brand-icon">
          <Radar className="h-4 w-4" />
        </span>
        <div>
          <p className="brand-text">CommitPulse</p>
          <p className="brand-sub">Commit tracker</p>
        </div>
      </div>

      <nav className="flex flex-col gap-1">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`nav-item ${activeView === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon className="nav-icon" />
            <span className="nav-label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function MobileNav({
  activeView,
  onNavigate,
}: {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
}) {
  return (
    <div className="mobile-nav">
      <div className="mobile-nav-inner">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`mobile-nav-item ${activeView === item.id ? "active" : ""}`}
            onClick={() => onNavigate(item.id)}
          >
            <item.icon className="nav-icon" />
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}
