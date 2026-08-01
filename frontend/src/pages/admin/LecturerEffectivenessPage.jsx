/**
 * LecturerEffectivenessPage -- Lecturer effectiveness analytics (Idea 14)
 * Shows how each lecturer's students fare in risk improvement over the semester.
 * API: GET /analytics/lecturer-effectiveness
 */
import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, TrendingUp, TrendingDown, ArrowRight,
  RefreshCw, AlertCircle, Users, Activity,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";
import { useApi } from "../../hooks/useApi";

/* -- animation variants --------------------------------------------------- */
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

/* -- summary stat card ---------------------------------------------------- */
function StatCard({ icon: Icon, label, value, iconColor, iconBg }) {
  return (
    <motion.div variants={fadeUp}
      className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm flex items-start gap-4">
      <div className={`w-10 h-10 ${iconBg} rounded-xl flex items-center justify-center flex-shrink-0`}>
        <Icon size={18} className={iconColor} />
      </div>
      <div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
        <p className="font-serif text-3xl font-bold text-slate-900 leading-none">{value ?? "--"}</p>
      </div>
    </motion.div>
  );
}

/* ========================================================================= */
export default function LecturerEffectivenessPage() {
  const { token } = useAuth();
  const { data, loading, error, refetch: fetchData } = useApi(
    () => adminApi.getLecturerEffectiveness(token),
    [token],
  );

  const lecturers = useMemo(() => {
    const raw = data?.lecturers ?? [];
    return [...raw].sort((a, b) => (b.risk_improvement_pct ?? 0) - (a.risk_improvement_pct ?? 0));
  }, [data]);

  /* derived summary values */
  const summary = useMemo(() => {
    if (lecturers.length === 0) return { total: 0, bestImprovement: 0, avgIntervention: 0 };
    const total = lecturers.length;
    const bestImprovement = Math.max(...lecturers.map(l => l.risk_improvement_pct ?? 0));
    const avgIntervention = lecturers.reduce((s, l) => s + (l.intervention_response_rate ?? 0), 0) / total;
    return {
      total,
      bestImprovement: bestImprovement.toFixed(1),
      avgIntervention: avgIntervention.toFixed(1),
    };
  }, [lecturers]);

  return (
    <div className="max-w-6xl mx-auto space-y-8">

      {/* -- Header -------------------------------------------------------- */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
              <GraduationCap size={18} className="text-slate-400" />
            </div>
            <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">
              Lecturer Effectiveness
            </h1>
          </div>
          <p className="text-lg text-slate-500">
            Analyse how each lecturer's students improve or decline in risk level across the semester
          </p>
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
      ) : lecturers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <GraduationCap size={32} className="mb-3 opacity-30" />
          <p className="text-sm">No lecturer effectiveness data available</p>
          <p className="text-xs mt-1">Data will appear once risk predictions span the semester</p>
        </div>
      ) : (
        <>
          {/* == Summary Cards ============================================= */}
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              icon={Users} label="Total Lecturers" value={summary.total}
              iconColor="text-primary" iconBg="bg-primary/10"
            />
            <StatCard
              icon={TrendingUp} label="Best Improvement" value={`${summary.bestImprovement}%`}
              iconColor="text-emerald-600" iconBg="bg-emerald-50"
            />
            <StatCard
              icon={Activity} label="Avg Intervention Rate" value={`${summary.avgIntervention}%`}
              iconColor="text-blue-600" iconBg="bg-blue-50"
            />
          </motion.div>

          {/* == Lecturer Table ============================================ */}
          <motion.div variants={stagger} initial="hidden" animate="show"
            className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ds-table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Lecturer</th>
                    <th className="text-left">Course</th>
                    <th className="text-center">Students</th>
                    <th className="text-center">Risk Change</th>
                    <th className="text-center">Improvement</th>
                    <th className="text-center hidden sm:table-cell">Intervention Rate</th>
                    <th className="text-center hidden md:table-cell">Quiz Avg</th>
                  </tr>
                </thead>
                <tbody>
                  {lecturers.map((l, idx) => {
                    const improving = (l.risk_improvement_pct ?? 0) > 0;
                    const worsening = (l.risk_improvement_pct ?? 0) < 0;

                    return (
                      <motion.tr key={`${l.lecturer_name}-${l.course_code}-${idx}`} variants={item}>
                        {/* name */}
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-accent font-bold text-[10px] flex-shrink-0">
                              {(l.lecturer_name || "")
                                .split(" ")
                                .map(n => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 text-sm truncate">{l.lecturer_name}</p>
                              <p className="text-xs text-slate-400">{l.department}</p>
                            </div>
                          </div>
                        </td>

                        {/* course */}
                        <td>
                          <p className="font-semibold text-slate-900 text-sm">{l.course_code}</p>
                          <p className="text-xs text-slate-400 truncate max-w-[160px]">{l.course_title}</p>
                        </td>

                        {/* students */}
                        <td className="text-center text-slate-600 font-semibold">{l.total_students ?? 0}</td>

                        {/* risk change: early -> late */}
                        <td className="text-center">
                          <div className="inline-flex items-center gap-1.5 text-sm">
                            <span className={`font-bold ${(l.early_high_risk_pct ?? 0) > 30 ? "text-red-600" : "text-amber-600"}`}>
                              {l.early_high_risk_pct ?? 0}%
                            </span>
                            <ArrowRight size={12} className="text-slate-300" />
                            <span className={`font-bold ${(l.late_high_risk_pct ?? 0) > 30 ? "text-red-600" : (l.late_high_risk_pct ?? 0) > 15 ? "text-amber-600" : "text-emerald-600"}`}>
                              {l.late_high_risk_pct ?? 0}%
                            </span>
                          </div>
                        </td>

                        {/* improvement % */}
                        <td className="text-center">
                          <span className={`inline-flex items-center gap-1 text-sm font-bold ${
                            improving ? "text-emerald-600" : worsening ? "text-red-600" : "text-slate-400"
                          }`}>
                            {improving && <TrendingUp size={13} />}
                            {worsening && <TrendingDown size={13} />}
                            {l.risk_improvement_pct != null ? `${l.risk_improvement_pct}%` : "--"}
                          </span>
                        </td>

                        {/* intervention rate */}
                        <td className="text-center hidden sm:table-cell">
                          <span className={`text-sm font-semibold ${
                            (l.intervention_response_rate ?? 0) >= 70 ? "text-emerald-600"
                            : (l.intervention_response_rate ?? 0) >= 40 ? "text-amber-600"
                            : "text-slate-400"
                          }`}>
                            {l.intervention_response_rate != null ? `${l.intervention_response_rate}%` : "--"}
                          </span>
                        </td>

                        {/* quiz avg */}
                        <td className="text-center hidden md:table-cell">
                          <span className="text-sm font-semibold text-slate-600">
                            {l.quiz_average != null ? `${l.quiz_average}%` : "--"}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* -- Sensitive-data note ---------------------------------------- */}
          <p className="text-xs text-slate-400 text-center">
            This report contains sensitive performance data. Please treat it confidentially and share only with authorised personnel.
          </p>
        </>
      )}
    </div>
  );
}
