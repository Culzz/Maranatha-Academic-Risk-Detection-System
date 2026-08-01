/**
 * EfficacyReportPage — Intervention efficacy reporting
 * Shows how effective interventions have been: improved, unchanged, worsened.
 * API: GET /admin/intervention-efficacy
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BarChart2, TrendingUp, TrendingDown, CheckCircle,
  AlertCircle, Minus, Activity, RefreshCw,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";
import { useApi } from "../../hooks/useApi";

/* ── animation variants ─────────────────────────────────── */
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

/* ── stat card ──────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, iconColor, iconBg }) {
  return (
    <motion.div variants={fadeUp}
      className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-start gap-4">
      <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
        <p className="font-serif text-3xl font-bold text-slate-900 leading-none">{value ?? "—"}</p>
      </div>
    </motion.div>
  );
}

/* ── efficacy label helper ──────────────────────────────── */
function getEfficacyMeta(rate) {
  if (rate == null) return { label: "No Data", color: "text-slate-400", bg: "bg-slate-50", border: "border-slate-200" };
  if (rate >= 70) return { label: "Good", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" };
  if (rate >= 50) return { label: "Needs Improvement", color: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200" };
  return { label: "Concerning", color: "text-red-700", bg: "bg-red-50", border: "border-red-200" };
}

/* ══════════════════════════════════════════════════════════ */
export default function EfficacyReportPage() {
  const { token } = useAuth();
  const { data, loading, error, refetch: fetchData } = useApi(
    () => adminApi.getInterventionEfficacy(token),
    [token],
  );

  /* derived values (safe even when data is null) */
  const total    = data?.total_completed ?? 0;
  const improved = data?.improved ?? 0;
  const unchanged = data?.unchanged ?? 0;
  const worsened = data?.worsened ?? 0;
  const rate     = data?.efficacy_rate;

  const pctImproved  = total > 0 ? Math.round((improved / total) * 100) : 0;
  const pctUnchanged = total > 0 ? Math.round((unchanged / total) * 100) : 0;
  const pctWorsened  = total > 0 ? Math.round((worsened / total) * 100) : 0;

  const efficacyMeta = getEfficacyMeta(rate);

  return (
    <div className="max-w-5xl mx-auto space-y-8">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
            Intervention Efficacy
          </h1>
          <p className="text-lg text-slate-500">
            Measure how effectively interventions improve student outcomes
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={fetchData}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all">
          <RefreshCw size={13} /> Refresh
        </motion.button>
      </div>

      {/* ── Error ────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading state ────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : !data ? (
        /* ── Empty state ─────────────────────────────────── */
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <BarChart2 size={32} className="mb-3 opacity-30" />
          <p className="text-sm">No intervention efficacy data available</p>
          <p className="text-xs mt-1">Efficacy data will appear once interventions have been completed</p>
        </div>
      ) : (
        <>
          {/* ── Overall Stats Cards ──────────────────────── */}
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <StatCard
              icon={BarChart2} label="Total Completed" value={total}
              iconColor="text-primary" iconBg="bg-primary/10"
            />
            <StatCard
              icon={TrendingUp} label="Improved" value={improved}
              iconColor="text-emerald-600" iconBg="bg-emerald-50"
            />
            <StatCard
              icon={Minus} label="Unchanged" value={unchanged}
              iconColor="text-amber-600" iconBg="bg-amber-50"
            />
            <StatCard
              icon={TrendingDown} label="Worsened" value={worsened}
              iconColor="text-red-600" iconBg="bg-red-50"
            />
            <StatCard
              icon={CheckCircle} label="Efficacy Rate" value={rate != null ? `${rate}%` : "—"}
              iconColor="text-primary" iconBg="bg-primary/10"
            />
          </motion.div>

          {/* ── Visual Breakdown — Stacked Bar ───────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="font-serif text-xl font-bold text-slate-900 mb-5">Outcome Breakdown</h2>

            {total > 0 ? (
              <>
                {/* stacked horizontal bar */}
                <div className="flex h-6 rounded-full overflow-hidden gap-px">
                  {pctImproved > 0 && (
                    <motion.div
                      className="bg-emerald-500 rounded-l-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${pctImproved}%` }}
                      transition={{ duration: 0.6, ease: "easeOut" }}
                    />
                  )}
                  {pctUnchanged > 0 && (
                    <motion.div
                      className="bg-amber-400"
                      initial={{ width: 0 }}
                      animate={{ width: `${pctUnchanged}%` }}
                      transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
                    />
                  )}
                  {pctWorsened > 0 && (
                    <motion.div
                      className="bg-red-500 rounded-r-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${pctWorsened}%` }}
                      transition={{ duration: 0.6, ease: "easeOut", delay: 0.2 }}
                    />
                  )}
                </div>

                {/* legend */}
                <div className="flex items-center gap-6 mt-4 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    <span className="text-sm text-slate-600">
                      Improved <span className="font-semibold text-slate-900">{improved}</span>
                      <span className="text-slate-400 ml-1">({pctImproved}%)</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-amber-400" />
                    <span className="text-sm text-slate-600">
                      Unchanged <span className="font-semibold text-slate-900">{unchanged}</span>
                      <span className="text-slate-400 ml-1">({pctUnchanged}%)</span>
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    <span className="text-sm text-slate-600">
                      Worsened <span className="font-semibold text-slate-900">{worsened}</span>
                      <span className="text-slate-400 ml-1">({pctWorsened}%)</span>
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="h-6 bg-slate-100 rounded-full" />
            )}
          </motion.div>

          {/* ── Efficacy Rate Highlight ──────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
            className={`${efficacyMeta.bg} border ${efficacyMeta.border} rounded-xl p-8 text-center`}>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              Overall Efficacy Rate
            </p>
            <p className={`font-serif text-6xl font-bold leading-none mb-3 ${efficacyMeta.color}`}>
              {rate != null ? `${rate}%` : "—"}
            </p>
            <span className={`inline-flex items-center gap-1.5 text-sm font-semibold ${efficacyMeta.color}`}>
              {rate != null && rate >= 70 && <CheckCircle size={15} />}
              {rate != null && rate >= 50 && rate < 70 && <AlertCircle size={15} />}
              {rate != null && rate < 50 && <TrendingDown size={15} />}
              {efficacyMeta.label}
            </span>
            <p className="text-sm text-slate-500 mt-4 max-w-md mx-auto">
              {rate == null
                ? "Not enough data to calculate an efficacy rate."
                : rate >= 70
                  ? "Interventions are having a strong positive impact on student outcomes. Continue current strategies."
                  : rate >= 50
                    ? "Some interventions are working but there is room for improvement. Consider reviewing intervention methods."
                    : "Interventions are not achieving desired outcomes. A thorough review of intervention strategies is recommended."}
            </p>
          </motion.div>
        </>
      )}
    </div>
  );
}
