/**
 * SemesterWeekTracker — visual semester progress strip
 * Shows current teaching week with phase markers and progress fill.
 * Used on Student, Lecturer, and Admin overview dashboards.
 */
import { useEffect, useState } from "react";
import { BookOpen, Clock, CheckCircle, Calendar } from "lucide-react";
import { sessionsApi } from "../../services/api";
import { useAuth } from "../../context/AuthContext";

/* Phase bands — fractions of total_weeks */
const PHASES = [
  { id: "early",    label: "Early Term",  end: 0.30, color: "bg-emerald-400" },
  { id: "mid",      label: "Mid Term",    end: 0.55, color: "bg-accent"      },
  { id: "preexam",  label: "Pre-Exam",    end: 0.80, color: "bg-amber-400"   },
  { id: "exam",     label: "Exams",       end: 1.00, color: "bg-red-400"     },
];

function getPhase(week, total) {
  const frac = week / total;
  return PHASES.find(p => frac <= p.end) || PHASES[PHASES.length - 1];
}

export default function SemesterWeekTracker({ weekInfo: propInfo, loading: propLoading } = {}) {
  const { token } = useAuth();
  const [fetchedInfo, setFetchedInfo] = useState(null);
  const [fetchedLoading, setFetchedLoading] = useState(propInfo === undefined);

  useEffect(() => {
    if (propInfo !== undefined || !token) return;
    sessionsApi.getCurrentWeekInfo(token)
      .then(d => { setFetchedInfo(d); })
      .catch(() => {})
      .finally(() => setFetchedLoading(false));
  }, [token, propInfo]);

  const info    = propInfo !== undefined ? propInfo : fetchedInfo;
  const loading = propInfo !== undefined ? (propLoading ?? false) : fetchedLoading;

  if (loading) {
    return (
      <div className="h-16 bg-white border border-slate-100 rounded-2xl animate-pulse" />
    );
  }

  if (!info || !info.session_label) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm px-1">
        <Calendar size={14} /> No active session
      </div>
    );
  }

  const { week, total_weeks, phase, session_label, semester } = info;
  const semLabel = semester === 2 ? "Semester 2" : "Semester 1";

  /* ── Ended state ─────────────────────────────────────────────── */
  if (phase === "ended") {
    return (
      <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl px-4 py-3">
        <CheckCircle size={15} className="text-slate-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-slate-500 leading-none">{session_label} · {semLabel}</p>
          <p className="text-sm font-semibold text-slate-600 mt-0.5">Session Ended — {total_weeks} weeks completed</p>
        </div>
      </div>
    );
  }

  /* ── Not started ─────────────────────────────────────────────── */
  if (phase === "not_started") {
    return (
      <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-4 py-3">
        <Clock size={15} className="text-blue-400 shrink-0" />
        <div className="min-w-0">
          <p className="text-xs text-blue-500 leading-none">{session_label} · {semLabel}</p>
          <p className="text-sm font-semibold text-blue-700 mt-0.5">Semester not yet started</p>
        </div>
      </div>
    );
  }

  /* ── Active ─────────────────────────────────────────────── */
  const pct          = Math.min(100, Math.round((week / total_weeks) * 100));
  const currentPhase = getPhase(week, total_weeks);

  /* Build tick list (every 4 weeks + key milestones) */
  const tickWeeks = new Set([1]);
  PHASES.forEach(p => tickWeeks.add(Math.round(p.end * total_weeks)));
  for (let w = 4; w < total_weeks; w += 4) tickWeeks.add(w);
  tickWeeks.add(Math.round(total_weeks * 0.5));  // midpoint
  const ticks = [...tickWeeks].sort((a, b) => a - b);

  return (
    <div className="bg-white border border-slate-200 rounded-2xl px-4 pt-3 pb-4 space-y-2 shadow-sm">
      {/* Top row: title + week badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={13} className="text-accent" />
          <span className="text-xs font-semibold text-slate-600">{session_label} · {semLabel}</span>
        </div>
        <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full text-white ${currentPhase.color}`}>
          {currentPhase.label} · Week {week}/{total_weeks}
        </span>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
        {/* Phase colour fill bands */}
        {PHASES.map(p => {
          const bandStart = (p.id === "early" ? 0 : PHASES[PHASES.indexOf(p) - 1].end) * 100;
          const bandEnd   = p.end * 100;
          const filled    = Math.max(0, Math.min(pct, bandEnd) - bandStart);
          if (filled <= 0) return null;
          return (
            <div
              key={p.id}
              className={`absolute top-0 h-full ${p.color} opacity-80`}
              style={{ left: `${bandStart}%`, width: `${filled}%` }}
            />
          );
        })}
        {/* Current-week pulse dot */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-primary border-2 border-white shadow-md transition-all duration-700"
          style={{ left: `calc(${pct}% - 8px)` }}
        />
      </div>

      {/* Tick labels */}
      <div className="relative h-4">
        {ticks.map(w => {
          const pos = (w / total_weeks) * 100;
          const isCurrent = w === week;
          return (
            <span
              key={w}
              className={`absolute -translate-x-1/2 text-[10px] transition-all ${
                isCurrent
                  ? "text-primary font-bold"
                  : w < week
                    ? "text-slate-400"
                    : "text-slate-300"
              }`}
              style={{ left: `${pos}%` }}
            >
              W{w}
            </span>
          );
        })}
      </div>
    </div>
  );
}
