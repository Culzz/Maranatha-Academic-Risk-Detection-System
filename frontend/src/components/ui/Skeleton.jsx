/**
 * Skeleton loading components for consistent shimmer-while-loading UX.
 * Used as replacements for spinner-only loading states.
 */

export function Skeleton({ className = "", style }) {
  return (
    <div
      className={`animate-pulse rounded bg-slate-200 ${className}`}
      style={style}
    />
  );
}

export function SkeletonText({ lines = 3, className = "" }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className="h-4"
          style={{ width: i === lines - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function SkeletonCard({ className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 p-5 ${className}`}>
      <Skeleton className="mb-3 h-5 w-1/3" />
      <SkeletonText lines={3} />
    </div>
  );
}

export function SkeletonChart({ className = "", height = "h-48" }) {
  return (
    <div className={`rounded-xl border border-slate-200 p-5 ${className}`}>
      <Skeleton className="mb-4 h-5 w-1/4" />
      <div className="flex items-end gap-2" style={{ height: "inherit" }}>
        {[40, 65, 50, 80, 55, 70, 45].map((h, i) => (
          <Skeleton key={i} className="flex-1 rounded-t" style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  );
}

export function SkeletonTable({ rows = 5, cols = 4, className = "" }) {
  return (
    <div className={`rounded-xl border border-slate-200 overflow-hidden ${className}`}>
      {/* Header */}
      <div className="flex gap-4 border-b border-slate-200 bg-slate-50 px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-4 flex-1" />
        ))}
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex gap-4 border-b border-slate-100 px-4 py-3 last:border-0">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className="h-4 flex-1" />
          ))}
        </div>
      ))}
    </div>
  );
}

export function SkeletonDashboard() {
  return (
    <div className="space-y-6 p-1">
      {/* Top cards row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      {/* Chart */}
      <SkeletonChart />
      {/* List */}
      <SkeletonTable rows={4} cols={3} />
    </div>
  );
}
