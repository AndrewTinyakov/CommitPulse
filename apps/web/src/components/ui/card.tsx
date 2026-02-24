import type { ReactNode } from "react";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardHeader({
  icon,
  iconColor = "muted",
  title,
  subtitle,
  badge,
  actions,
}: {
  icon: ReactNode;
  iconColor?: "green" | "cyan" | "muted";
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="card-header">
      <div className="card-header-left">
        <span className={`card-icon ${iconColor}`}>{icon}</span>
        <div>
          <p className="card-title">{title}</p>
          {subtitle && <p className="card-subtitle">{subtitle}</p>}
        </div>
        {badge}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}
