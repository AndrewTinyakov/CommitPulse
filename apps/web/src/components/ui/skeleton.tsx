export function SkeletonLine({ className = "", width = "100%" }: { className?: string; width?: string }) {
  return <div className={`skeleton skeleton-line ${className}`} style={{ width }} />;
}

export function SkeletonCircle({ size = 36 }: { size?: number }) {
  return <div className="skeleton skeleton-circle" style={{ width: size, height: size }} />;
}

export function SkeletonMetricCard() {
  return (
    <div className="metric-card">
      <SkeletonLine width="60%" className="sm" />
      <SkeletonLine width="50%" className="lg" />
      <SkeletonLine width="70%" className="sm" />
    </div>
  );
}

export function SkeletonCard({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <SkeletonCircle size={36} />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="40%" />
          <SkeletonLine width="60%" className="sm" />
        </div>
      </div>
      <div className="space-y-3">
        {Array.from({ length: lines }).map((_, i) => (
          <SkeletonLine key={i} width={`${70 + Math.random() * 30}%`} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonMetricCard key={i} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <SkeletonCard lines={4} />
        <SkeletonCard lines={3} />
      </div>
      <SkeletonCard lines={5} />
    </div>
  );
}
