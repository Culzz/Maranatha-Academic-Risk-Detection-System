/**
 * Badge — Refined risk and status pills.
 *
 * Usage:
 *   <Badge variant="risk" level="High" />
 *   <Badge variant="risk" level="Medium" dot={false} />
 *   <Badge variant="status" label="Submitted" color="green" />
 *   <Badge variant="pill" label="Week 8" />
 */
import { riskColors } from "../../utils/helpers";

export default function Badge({
  variant   = "pill",
  level,
  label,
  color,
  dot       = true,
  size      = "sm",
  gold      = false,
}) {
  const sz = size === "xs"
    ? "text-[10px] px-2 py-0.5 gap-1"
    : "text-[11px] px-2.5 py-[3px] gap-1.5";

  // ── Section pill — capsule label above sections ──────────────
  if (variant === "section-pill") {
    return (
      <span className={`section-pill ${gold ? "section-pill--gold" : ""}`}>
        {label}
      </span>
    );
  }

  // ── Risk badge ───────────────────────────────────────────────
  if (variant === "risk") {
    const c = riskColors(level);
    const dotCls = [
      "w-1.5 h-1.5 rounded-full flex-shrink-0",
      c.dot,
      level === "High" ? "animate-pulse" : "",
    ].join(" ");

    return (
      <span className={`inline-flex items-center font-semibold rounded-full border ${sz} ${c.text} ${c.bg} ${c.border}`}>
        {dot && <span className={dotCls} />}
        {level}
      </span>
    );
  }

  // ── Status / pill badge ─────────────────────────────────────
  const colorMap = {
    green:  "text-risk-low    bg-emerald-50  border-emerald-200",
    red:    "text-risk-high   bg-red-50      border-red-200",
    amber:  "text-amber-600   bg-amber-50    border-amber-200",
    blue:   "text-blue-600    bg-blue-50     border-blue-200",
    slate:  "text-slate-500   bg-slate-50    border-slate-200",
    gold:   "text-accent      bg-amber-50    border-amber-200",
    navy:   "text-white       bg-primary     border-primary",
    purple: "text-purple-600  bg-purple-50   border-purple-200",
  };

  return (
    <span className={`inline-flex items-center font-semibold rounded-full border ${sz} ${colorMap[color] || colorMap.slate}`}>
      {dot && color && (
        <span className="w-1.5 h-1.5 rounded-full bg-current flex-shrink-0 opacity-60" />
      )}
      {label}
    </span>
  );
}
