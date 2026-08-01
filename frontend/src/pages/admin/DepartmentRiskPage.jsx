/**
 * DepartmentRiskPage — Risk breakdown by department
 * Real API: GET /admin/department-risk
 */
import { useState } from "react";
import { motion } from "framer-motion";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import { AlertTriangle, RefreshCw, AlertCircle, TrendingUp } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import { useApi } from "../../hooks/useApi";
import { RISK_COLORS } from "../../utils/helpers";

const c  = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const it = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3 text-sm">
      <p className="font-semibold text-slate-900 mb-2">{label}</p>
      {payload.map(p => (
        <p key={p.name} style={{ color: p.fill }} className="font-medium">
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export default function DepartmentRiskPage() {
  const { token }              = useAuth();
  const { data: rawData, loading, error, refetch: fetchData } = useApi(
    () => api.get("/admin/department-risk", { token }),
    [token],
  );
  const [sortBy,  setSortBy]   = useState("high_risk_percentage"); // sort key

  const data = rawData || [];
  const sorted = [...data].sort((a, b) => b[sortBy] - a[sortBy]);

  const chartData = sorted.map(d => ({
    name: d.department.replace("Faculty of ", "").replace("Department of ", ""),
    High: d.high_risk_count,
    Medium: d.medium_risk_count,
    Low: d.low_risk_count,
    fullName: d.department,
  }));

  const worstDept = sorted[0];

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Department Risk</h1>
          <p className="text-lg text-slate-500">Risk distribution across all departments for the active session</p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={fetchData}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all">
          <RefreshCw size={13} /> Refresh
        </motion.button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : data.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <TrendingUp size={32} className="mb-3 opacity-30" />
          <p className="text-sm">No department risk data available for this session</p>
        </div>
      ) : (
        <>
          {/* Alert card — highest risk dept */}
          {worstDept && worstDept.high_risk_percentage > 0 && (
            <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
              className="flex items-start gap-4 bg-red-50 border border-red-200 rounded-xl p-5">
              <div className="w-10 h-10 bg-red-100 border border-red-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle size={18} className="text-red-600" />
              </div>
              <div>
                <p className="font-semibold text-red-800 mb-1">
                  {worstDept.department} — highest risk department
                </p>
                <p className="text-red-700 text-sm">
                  {worstDept.high_risk_count} students ({worstDept.high_risk_percentage}%) are at High risk.
                  Consider scheduling a departmental intervention or additional academic support sessions.
                </p>
              </div>
            </motion.div>
          )}

          {/* Bar chart */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
            <h2 className="font-serif text-xl font-bold text-slate-900 mb-5">Risk by Department</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData} barGap={3} barCategoryGap={20}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#94a3b8" }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} />
                <Legend formatter={v => <span className="text-xs text-slate-500">{v} Risk</span>} />
                <Bar dataKey="High"   fill={RISK_COLORS.high.text}   radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Medium" fill={RISK_COLORS.medium.text} radius={[6, 6, 0, 0]} maxBarSize={28} />
                <Bar dataKey="Low"    fill={RISK_COLORS.low.text}    radius={[6, 6, 0, 0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </motion.div>

          {/* Sort control + Table */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <h2 className="font-serif text-xl font-bold text-slate-900">Detailed Breakdown</h2>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Sort by:</span>
              {[
                { key: "high_risk_percentage", label: "High Risk %" },
                { key: "high_risk_count",      label: "High Count"  },
                { key: "total_students",        label: "Students"    },
              ].map(({ key, label }) => (
                <button key={key} onClick={() => setSortBy(key)}
                  className={[
                    "text-xs font-semibold px-3 h-8 rounded-xl border transition-all",
                    sortBy === key ? "bg-primary text-white border-primary" : "bg-white text-slate-500 border-slate-200 hover:border-slate-300",
                  ].join(" ")}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          <motion.div variants={c} initial="hidden" animate="show"
            className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ds-table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Department</th>
                    <th className="text-center">Students</th>
                    <th className="text-center">High Risk</th>
                    <th className="text-center hidden sm:table-cell">Medium Risk</th>
                    <th className="text-center hidden sm:table-cell">Low Risk</th>
                    <th className="text-center">High Risk %</th>
                    <th className="text-left hidden md:table-cell">Distribution</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((d, i) => {
                    const total = d.high_risk_count + d.medium_risk_count + d.low_risk_count;
                    const highPct   = total > 0 ? Math.round(d.high_risk_count / total * 100) : 0;
                    const medPct    = total > 0 ? Math.round(d.medium_risk_count / total * 100) : 0;
                    const lowPct    = total > 0 ? Math.round(d.low_risk_count / total * 100) : 0;
                    return (
                      <motion.tr key={d.department} variants={it}>
                        <td className="font-semibold text-slate-900">{d.department}</td>
                        <td className="text-center text-slate-600">{d.total_students}</td>
                        <td className="text-center">
                          <span className={`font-bold ${d.high_risk_count > 0 ? "text-risk-high" : "text-slate-300"}`}>
                            {d.high_risk_count}
                          </span>
                        </td>
                        <td className="text-center text-amber-600 font-semibold hidden sm:table-cell">{d.medium_risk_count}</td>
                        <td className="text-center text-emerald-600 font-semibold hidden sm:table-cell">{d.low_risk_count}</td>
                        <td className="text-center">
                          <span className={`text-sm font-bold ${
                            d.high_risk_percentage > 50 ? "text-risk-high"
                            : d.high_risk_percentage > 25 ? "text-amber-600"
                            : "text-emerald-600"
                          }`}>
                            {d.high_risk_percentage}%
                          </span>
                        </td>
                        <td className="hidden md:table-cell">
                          {total > 0 ? (
                            <div className="flex h-2 rounded-full overflow-hidden gap-px w-32">
                              <div className="bg-risk-high rounded-l-full" style={{ width: `${highPct}%` }} />
                              <div className="bg-amber-400" style={{ width: `${medPct}%` }} />
                              <div className="bg-emerald-400 rounded-r-full" style={{ width: `${lowPct}%` }} />
                            </div>
                          ) : (
                            <div className="h-2 w-32 bg-slate-100 rounded-full" />
                          )}
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>
        </>
      )}
    </div>
  );
}
