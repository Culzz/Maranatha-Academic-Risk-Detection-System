/**
 * AnonymousInsightsPage — Aggregated anonymous peer insights (Idea 19).
 * Shows students anonymised data about how their cohort peers are doing,
 * what helped others recover, and encouraging context around their situation.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Users, Heart, TrendingUp, Clock, Loader2,
  Lightbulb, ShieldCheck, Hash, ArrowUp, ArrowDown, Minus,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import Badge from "../../components/ui/Badge";
import { insightsApi, riskApi } from "../../services/api";

/* ── animation variants ─────────────────────────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

/* ── stat card icons ────────────────────────────────────── */
const STAT_ICONS = [Users, Heart, TrendingUp, Clock];

export default function AnonymousInsightsPage() {
  const { token } = useAuth();
  const [data, setData]       = useState(null);
  const [myMetrics, setMyMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState("");

  useEffect(() => {
    if (!token) return;
    insightsApi.getAnonymousInsights(token)
      .then(setData)
      .catch((e) => setError(e.message || "Unable to load peer insights."))
      .finally(() => setLoading(false));
    // Fetch student's own risk data for cohort comparison
    riskApi.getMyRisk(token)
      .then(d => {
        if (Array.isArray(d) && d.length > 0) {
          setMyMetrics(d[0]?.feature_snapshot || null);
        }
      })
      .catch(() => {});
  }, [token]);

  /* ── loading state ─────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  /* ── error state ───────────────────────────────────────── */
  if (error || !data) {
    return (
      <div className="text-center py-16 border border-slate-200 rounded-xl bg-white">
        <Users size={32} className="text-slate-300 mx-auto mb-3" />
        <p className="text-slate-500 font-medium">
          {error || "Unable to load peer insights."}
        </p>
        <p className="text-sm text-slate-400 mt-1">
          Please try again later.
        </p>
      </div>
    );
  }

  /* ── derived stat cards ────────────────────────────────── */
  const stats = [
    {
      label: "Peers in Your Cohort",
      value: data.peer_count ?? 0,
    },
    {
      label: "Felt This Way",
      value: data.overwhelmed_pct ?? 0,
      suffix: "%",
    },
    {
      label: "Recovered",
      value: data.recovery_rate ?? 0,
      suffix: "%",
    },
    {
      label: "Avg Recovery Time",
      value: data.avg_recovery_weeks ?? 0,
      suffix: "wks",
    },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* ── Header ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-center flex-shrink-0">
            <Users size={22} className="text-blue-600" />
          </div>
          <div>
            <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">
              You're Not Alone
            </h1>
            <p className="text-lg text-slate-600 mt-1">
              Anonymised insights from students in a similar situation
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed mt-2 ml-[60px]">
          These insights are drawn from {data.department} students at level {data.level} during
          week {data.current_week}. Everything here is fully anonymised — no individual student
          can ever be identified.
        </p>
      </motion.div>

      {/* ── Encouragement Card ──────────────────────────── */}
      {data.encouragement && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="bg-blue-50 border border-blue-200 rounded-xl p-6"
        >
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-100 border border-blue-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <Heart size={18} className="text-blue-600" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-blue-900 mb-1">A Word of Encouragement</h3>
              <p className="text-sm text-blue-800 leading-relaxed">
                {data.encouragement}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Stats Grid ──────────────────────────────────── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-4 gap-4"
      >
        {stats.map((s, i) => {
          const Icon = STAT_ICONS[i];
          return (
            <motion.div
              key={s.label}
              variants={item}
              whileHover={{ y: -2 }}
              className="border border-slate-200 rounded-xl bg-white shadow-sm p-5 text-center hover:shadow-md transition-all duration-200"
            >
              <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center mx-auto mb-3">
                <Icon size={18} className="text-slate-500" />
              </div>
              <p className="text-2xl font-bold text-slate-900 tabular-nums">
                {s.value}{s.suffix === "%" && <span className="text-sm font-semibold text-slate-400 ml-0.5">%</span>}
                {s.suffix === "wks" && <span className="text-sm font-semibold text-slate-400 ml-1">wks</span>}
              </p>
              <p className="text-xs text-slate-500 mt-1 font-medium">
                {s.label}
              </p>
            </motion.div>
          );
        })}
      </motion.div>

      {/* ── Current Risk Context ─────────────────────────── */}
      {data.current_risk && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="border border-slate-200 rounded-xl bg-white shadow-sm p-6"
        >
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
              <ShieldCheck size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-serif text-lg font-bold text-slate-900">Your Current Context</h2>
              <p className="text-xs text-slate-500">
                Week {data.current_week} · {data.department} · Level {data.level}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="risk" level={data.current_risk} />
            <span className="text-sm text-slate-600">
              current risk level
            </span>
          </div>
        </motion.div>
      )}

      {/* ── Helpful Actions ──────────────────────────────── */}
      {data.helpful_actions && data.helpful_actions.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <Lightbulb size={16} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold text-slate-900">
                What Helped Others Most
              </h2>
              <p className="text-sm text-slate-500">
                Actions that similar students found most effective for recovery
              </p>
            </div>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-3"
          >
            {data.helpful_actions.map((ha, i) => (
              <motion.div
                key={ha.action}
                variants={item}
                whileHover={{ y: -1 }}
                className="flex items-center gap-4 p-5 border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200"
              >
                <div className="w-9 h-9 bg-emerald-50 border border-emerald-200 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-emerald-700">{i + 1}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-900">{ha.action}</p>
                </div>
                <div className="flex items-center gap-1.5 text-xs text-slate-400 flex-shrink-0">
                  <Hash size={12} />
                  <span className="font-semibold tabular-nums">{ha.count}</span>
                  <span>students</span>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      {/* ── Where You Stand (Cohort Positioning) ─────────── */}
      {myMetrics && data && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-50 border border-indigo-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <TrendingUp size={16} className="text-indigo-600" />
              </div>
              <div>
                <h2 className="font-serif text-lg font-bold text-slate-900">Where You Stand</h2>
                <p className="text-xs text-slate-500">Your metrics vs. cohort averages (anonymised)</p>
              </div>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {[
              { key: "attendance_rate", label: "Attendance", cohort: data.cohort_avg_attendance, fmt: v => `${Math.round((v || 0) * 100)}%` },
              { key: "quiz_avg", label: "Quiz Average", cohort: data.cohort_avg_quiz, fmt: v => `${Math.round((v || 0) * 100)}%` },
              { key: "assignment_rate", label: "Assignment Rate", cohort: data.cohort_avg_assignment, fmt: v => `${Math.round((v || 0) * 100)}%` },
              { key: "mood_score", label: "Mood Score", cohort: data.cohort_avg_mood, fmt: v => `${Math.round((v || 0) * 100)}%` },
            ].filter(m => myMetrics[m.key] != null || m.cohort != null).map(m => {
              const mine = myMetrics[m.key] || 0;
              const cohort = m.cohort || 0;
              const diff = mine - cohort;
              const above = diff > 0.02;
              const below = diff < -0.02;
              const Icon = above ? ArrowUp : below ? ArrowDown : Minus;
              const color = above ? "text-emerald-600" : below ? "text-red-600" : "text-slate-500";
              const bg = above ? "bg-emerald-50" : below ? "bg-red-50" : "bg-slate-50";
              return (
                <div key={m.key} className="flex items-center justify-between px-6 py-3.5">
                  <span className="text-sm font-medium text-slate-700">{m.label}</span>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-bold text-slate-900">{m.fmt(mine)}</p>
                      <p className="text-[10px] text-slate-400">You</p>
                    </div>
                    <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center`}>
                      <Icon size={14} className={color} />
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold text-slate-500">{m.fmt(cohort)}</p>
                      <p className="text-[10px] text-slate-400">Cohort</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* ── Privacy Note ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-slate-50 border border-slate-200 rounded-xl p-4"
      >
        <div className="flex items-start gap-3">
          <ShieldCheck size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            All data is anonymised and aggregated. No individual student can be identified.
            These insights are generated from cohort-level statistics to help you understand
            that academic challenges are shared experiences, not personal failures.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
