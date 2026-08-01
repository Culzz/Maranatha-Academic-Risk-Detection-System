/**
 * SemesterPatternsPage -- Semester pattern memory (Idea 17)
 * Visualises weekly risk patterns, mood trends, attendance, and dangerous weeks.
 * API: GET /analytics/semester-patterns
 */
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, AlertTriangle, RefreshCw, AlertCircle,
  TrendingUp, Frown, Meh, Smile, Lightbulb,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";
import { useApi } from "../../hooks/useApi";

/* -- animation variants --------------------------------------------------- */
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

/* -- dangerous-week card -------------------------------------------------- */
function DangerWeekCard({ week }) {
  const isHigh = (week.severity || "").toLowerCase() === "high";
  const bgCls = isHigh ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200";
  const iconCls = isHigh ? "text-red-600" : "text-amber-600";
  const titleCls = isHigh ? "text-red-800" : "text-amber-800";
  const descCls = isHigh ? "text-red-700" : "text-amber-700";

  return (
    <motion.div variants={fadeUp}
      className={`flex items-start gap-4 border rounded-xl p-5 ${bgCls}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isHigh ? "bg-red-100 border border-red-200" : "bg-amber-100 border border-amber-200"
      }`}>
        <AlertTriangle size={18} className={iconCls} />
      </div>
      <div>
        <p className={`font-semibold mb-1 ${titleCls}`}>
          Week {week.week ?? "?"}{week.label ? ` -- ${week.label}` : ""}
        </p>
        <p className={`text-sm leading-relaxed ${descCls}`}>
          {week.reason || week.description || "Historically elevated risk levels observed during this week."}
        </p>
        {week.severity && (
          <span className={`inline-block mt-2 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${
            isHigh ? "bg-red-100 text-red-700 border-red-200" : "bg-amber-100 text-amber-700 border-amber-200"
          }`}>
            {week.severity} severity
          </span>
        )}
      </div>
    </motion.div>
  );
}

/* -- mood bar for a single week ------------------------------------------- */
function MoodBar({ week, confident, unsure, lost }) {
  const total = (confident ?? 0) + (unsure ?? 0) + (lost ?? 0);
  const pConf = total > 0 ? Math.round((confident / total) * 100) : 0;
  const pUns  = total > 0 ? Math.round((unsure / total) * 100) : 0;
  const pLost = total > 0 ? Math.round((lost / total) * 100) : 0;

  return (
    <motion.div variants={item} className="flex items-center gap-3">
      <span className="text-xs font-semibold text-slate-500 w-16 text-right flex-shrink-0">
        Week {week}
      </span>
      <div className="flex-1 flex h-5 rounded-full overflow-hidden gap-px">
        {pConf > 0 && (
          <motion.div
            className="bg-emerald-400 first:rounded-l-full last:rounded-r-full"
            initial={{ width: 0 }} animate={{ width: `${pConf}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        )}
        {pUns > 0 && (
          <motion.div
            className="bg-amber-400 first:rounded-l-full last:rounded-r-full"
            initial={{ width: 0 }} animate={{ width: `${pUns}%` }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
          />
        )}
        {pLost > 0 && (
          <motion.div
            className="bg-red-400 first:rounded-l-full last:rounded-r-full"
            initial={{ width: 0 }} animate={{ width: `${pLost}%` }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
          />
        )}
        {total === 0 && <div className="flex-1 bg-slate-100 rounded-full" />}
      </div>
      <div className="hidden sm:flex items-center gap-3 flex-shrink-0 w-36 text-[10px] font-semibold">
        <span className="text-emerald-600">{pConf}%</span>
        <span className="text-amber-600">{pUns}%</span>
        <span className="text-red-600">{pLost}%</span>
      </div>
    </motion.div>
  );
}

/* -- attendance bar for a single week ------------------------------------- */
function AttendanceBar({ week, rate, maxRate }) {
  const pct = maxRate > 0 ? Math.round((rate / maxRate) * 100) : 0;

  return (
    <motion.div variants={item} className="flex items-center gap-3">
      <span className="text-xs font-semibold text-slate-500 w-16 text-right flex-shrink-0">
        Week {week}
      </span>
      <div className="flex-1 h-5 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${
            rate >= 80 ? "bg-emerald-400" : rate >= 60 ? "bg-amber-400" : "bg-red-400"
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        />
      </div>
      <span className="text-xs font-bold text-slate-600 w-12 text-right flex-shrink-0">
        {rate != null ? `${rate}%` : "--"}
      </span>
    </motion.div>
  );
}

/* ========================================================================= */
export default function SemesterPatternsPage() {
  const { token } = useAuth();
  const { data, loading, error, refetch: fetchData } = useApi(
    () => adminApi.getSemesterPatterns(token),
    [token],
  );

  const dangerousWeeks   = data?.dangerous_weeks   ?? [];
  const moodTrends       = data?.mood_trends        ?? [];
  const attendanceTrends = data?.attendance_trends   ?? [];
  const recommendations  = data?.recommendations    ?? [];

  const maxAttendance = useMemo(() => {
    if (attendanceTrends.length === 0) return 100;
    return Math.max(...attendanceTrends.map(a => a.rate ?? a.attendance_rate ?? 0), 100);
  }, [attendanceTrends]);

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* -- Header -------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
              <Calendar size={18} className="text-slate-400" />
            </div>
            <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">
              Semester Pattern Memory
            </h1>
          </div>
          <p className="text-lg text-slate-500">
            Historical weekly patterns across mood, attendance, and risk to anticipate trouble spots
          </p>
          {data?.active_session && (
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary bg-primary/5 border border-primary/20 px-3 py-1.5 rounded-full mt-2">
              Session: {data.active_session}
            </span>
          )}
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={fetchData}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all">
          <RefreshCw size={13} /> Refresh
        </motion.button>
      </div>

      {/* -- Error banner -------------------------------------------------- */}
      <AnimatePresence>
        {error && (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* -- Loading / Empty / Content ------------------------------------- */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <Calendar size={32} className="mb-3 opacity-30" />
          <p className="text-sm">No semester pattern data available yet</p>
          <p className="text-xs mt-1">Patterns will emerge as the semester progresses</p>
        </div>
      ) : (
        <>
          {/* == Dangerous Weeks =========================================== */}
          {dangerousWeeks.length > 0 && (
            <div className="space-y-3">
              <h2 className="font-serif text-xl font-bold text-slate-900">Dangerous Weeks</h2>
              <p className="text-sm text-slate-500 -mt-1">
                Weeks historically associated with spikes in risk or student distress
              </p>
              <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-3">
                {dangerousWeeks.map((w, i) => (
                  <DangerWeekCard key={w.week ?? i} week={w} />
                ))}
              </motion.div>
            </div>
          )}

          {/* == Mood Trends =============================================== */}
          {moodTrends.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
              className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="font-serif text-xl font-bold text-slate-900">Mood Trends</h2>
                <div className="flex items-center gap-4 text-[11px] font-semibold">
                  <span className="flex items-center gap-1.5">
                    <Smile size={13} className="text-emerald-500" /> Confident
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Meh size={13} className="text-amber-500" /> Unsure
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Frown size={13} className="text-red-500" /> Lost
                  </span>
                </div>
              </div>
              <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
                {moodTrends.map((m, i) => (
                  <MoodBar
                    key={m.week ?? i}
                    week={m.week ?? i + 1}
                    confident={m.confident ?? m.confident_pct ?? 0}
                    unsure={m.unsure ?? m.unsure_pct ?? 0}
                    lost={m.lost ?? m.lost_pct ?? 0}
                  />
                ))}
              </motion.div>
            </motion.div>
          )}

          {/* == Attendance Trends ========================================= */}
          {attendanceTrends.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
              className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <h2 className="font-serif text-xl font-bold text-slate-900 mb-5">Attendance Trends</h2>
              <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-2">
                {attendanceTrends.map((a, i) => (
                  <AttendanceBar
                    key={a.week ?? i}
                    week={a.week ?? i + 1}
                    rate={a.rate ?? a.attendance_rate ?? 0}
                    maxRate={maxAttendance}
                  />
                ))}
              </motion.div>
              {/* Legend */}
              <div className="flex items-center gap-4 mt-4 text-[11px] font-semibold text-slate-500">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-emerald-400" /> 80%+
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-amber-400" /> 60-79%
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400" /> Below 60%
                </span>
              </div>
            </motion.div>
          )}

          {/* == Recommendations =========================================== */}
          {recommendations.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center gap-3 mb-5">
                <Lightbulb size={18} className="text-amber-500" />
                <h2 className="font-serif text-xl font-bold text-slate-900">Recommendations</h2>
              </div>
              <ul className="space-y-3">
                {recommendations.map((rec, i) => {
                  const text = typeof rec === "string" ? rec : rec.text ?? rec.message ?? "";
                  return (
                    <motion.li key={i} variants={item}
                      className="flex items-start gap-3 text-sm text-slate-700 leading-relaxed">
                      <span className="w-6 h-6 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-[10px] font-bold text-primary">{i + 1}</span>
                      </span>
                      {text}
                    </motion.li>
                  );
                })}
              </ul>
            </motion.div>
          )}

          {/* -- Footer note ----------------------------------------------- */}
          <p className="text-xs text-slate-400 text-center">
            Patterns are derived from historical data across previous and current sessions.
            Use these insights to pre-emptively allocate support resources.
          </p>
        </>
      )}
    </div>
  );
}
