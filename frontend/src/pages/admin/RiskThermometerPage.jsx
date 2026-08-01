/**
 * RiskThermometerPage — Institutional academic health monitor (Idea 12).
 * Displays overall health score, risk distribution, department rankings,
 * course health, and critical alerts.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Thermometer, AlertTriangle, Building2, BookOpen,
  Activity, Loader2, TrendingUp, TrendingDown,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { adminApi } from "../../services/api";
import { RISK_HEX } from "../../utils/helpers";

const c = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const it = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

function healthColor(score) {
  if (score >= 75) return { text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200", bar: "#10b981", label: "Healthy" };
  if (score >= 50) return { text: "text-amber-700", bg: "bg-amber-50", border: "border-amber-200", bar: "#f59e0b", label: "Stable" };
  return { text: "text-red-700", bg: "bg-red-50", border: "border-red-200", bar: "#e11d48", label: "Needs Attention" };
}

export default function RiskThermometerPage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const unsub = on("risk_changed", () => setRefreshTick(t => t + 1));
    return () => unsub();
  }, [on]);

  useEffect(() => {
    adminApi.getRiskThermometer(token)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [token, refreshTick]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-slate-400" size={28} /></div>;
  }
  if (!data || data.message) {
    return <p className="text-slate-500 text-center py-16">{data?.message || "Unable to load institutional health data."}</p>;
  }

  const hc = healthColor(data.overall_health);
  const dist = data.risk_distribution || {};
  const totalRisk = (dist.High || 0) + (dist.Medium || 0) + (dist.Low || 0);

  return (
    <motion.div variants={c} initial="hidden" animate="show" className="space-y-8">

      {/* Header */}
      <motion.div variants={it}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
            <Thermometer size={18} className="text-slate-400" />
          </div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">Academic Health Monitor</h1>
        </div>
        <p className="text-lg text-slate-600">Real-time institutional risk overview across all departments</p>
      </motion.div>

      {/* Overall health gauge + risk distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Health gauge */}
        <motion.div variants={it} className="lg:col-span-1 border border-slate-200 rounded-xl bg-white shadow-sm p-6 flex flex-col items-center justify-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-4">Overall Health</p>
          <div className={`relative w-32 h-32 rounded-full flex items-center justify-center border-4 ${hc.border} ${hc.bg}`}>
            <div className="text-center">
              <p className={`font-serif text-4xl font-bold ${hc.text}`}>{data.overall_health}</p>
              <p className="text-xs text-slate-500">/100</p>
            </div>
          </div>
          <span className={`mt-4 text-sm font-semibold px-3 py-1 rounded-full ${hc.bg} ${hc.text} border ${hc.border}`}>
            {hc.label}
          </span>
          <p className="text-xs text-slate-400 mt-3">{data.total_students} active students</p>
        </motion.div>

        {/* Risk distribution bars */}
        <motion.div variants={it} className="lg:col-span-1 border border-slate-200 rounded-xl bg-white shadow-sm p-6">
          <h3 className="text-sm font-semibold text-slate-700 mb-5">Risk Distribution</h3>
          <div className="space-y-4">
            {[
              { label: "High Risk", count: dist.High || 0, color: RISK_HEX.High },
              { label: "Medium Risk", count: dist.Medium || 0, color: RISK_HEX.Medium },
              { label: "Low Risk", count: dist.Low || 0, color: RISK_HEX.Low },
            ].map(({ label, count, color }) => {
              const pct = totalRisk > 0 ? Math.round(count / totalRisk * 100) : 0;
              return (
                <div key={label}>
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="text-slate-600">{label}</span>
                    <span className="font-bold text-slate-900">{count} <span className="text-slate-400 font-normal text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.6 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: color, minWidth: count > 0 ? 6 : 0 }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Critical alerts */}
        <motion.div variants={it} className="lg:col-span-1 border border-slate-200 rounded-xl bg-white shadow-sm p-6">
          <div className="flex items-center gap-2 mb-5">
            <AlertTriangle size={15} className="text-red-500" />
            <h3 className="text-sm font-semibold text-slate-700">Critical Alerts</h3>
          </div>
          {data.alerts?.length > 0 ? (
            <div className="space-y-3">
              {data.alerts.map((a, i) => (
                <div
                  key={i}
                  className={[
                    "flex items-start gap-3 px-3 py-2.5 rounded-lg border text-xs",
                    a.severity === "high" ? "bg-red-50 border-red-200 text-red-700" : "bg-amber-50 border-amber-200 text-amber-700",
                  ].join(" ")}
                >
                  <span className="mt-0.5 flex-shrink-0">{a.severity === "high" ? "🔴" : "🟡"}</span>
                  <span className="font-medium leading-snug">{a.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400 text-center py-6">No critical alerts</p>
          )}
        </motion.div>
      </div>

      {/* Department rankings */}
      {data.departments?.length > 0 && (
        <motion.div variants={it} className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <Building2 size={15} className="text-slate-400" />
              <h3 className="font-serif text-lg font-bold text-slate-900">Departments Ranked by Health</h3>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {data.departments.map((d, i) => {
              const dc = healthColor(d.health_score);
              return (
                <div key={d.department} className="flex items-center gap-4 px-6 py-4">
                  <span className="text-sm font-bold text-slate-400 w-8">{i + 1}.</span>
                  <span className="flex-1 text-sm font-semibold text-slate-900">{d.department}</span>
                  <div className="w-32 h-2 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${d.health_score}%` }}
                      transition={{ duration: 0.5, delay: i * 0.08 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: dc.bar }}
                    />
                  </div>
                  <span className={`text-sm font-bold w-14 text-right ${dc.text}`}>{d.health_score}/100</span>
                  <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${dc.bg} ${dc.text} border ${dc.border}`}>
                    {d.health_score >= 75 ? "✓" : d.health_score >= 50 ? "●" : "!"}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}

      {/* Course health table */}
      {data.courses?.length > 0 && (
        <motion.div variants={it} className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <BookOpen size={15} className="text-slate-400" />
              <h3 className="font-serif text-lg font-bold text-slate-900">Course Health</h3>
            </div>
            <p className="text-sm text-slate-500 mt-1">Top 20 courses ranked by health score</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/60">
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase text-slate-500">Course</th>
                  <th className="text-left px-5 py-3 text-xs font-semibold uppercase text-slate-500 hidden md:table-cell">Department</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold uppercase text-slate-500">High Risk</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold uppercase text-slate-500">Total Scored</th>
                  <th className="text-center px-5 py-3 text-xs font-semibold uppercase text-slate-500">Health</th>
                </tr>
              </thead>
              <tbody>
                {data.courses.map(c => {
                  const cc = healthColor(c.health_score);
                  return (
                    <tr key={c.course_id} className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="font-semibold text-slate-900">{c.course_code}</p>
                        <p className="text-xs text-slate-500 truncate max-w-[200px]">{c.course_title}</p>
                      </td>
                      <td className="px-5 py-3 text-slate-500 hidden md:table-cell">{c.department || "—"}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={c.high_risk_count > 0 ? "font-bold text-red-600" : "text-slate-400"}>{c.high_risk_count}</span>
                      </td>
                      <td className="px-5 py-3 text-center text-slate-600">{c.total_scored}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-block px-2.5 py-1 rounded-lg text-xs font-bold ${cc.bg} ${cc.text} border ${cc.border}`}>
                          {c.health_score}/100
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
