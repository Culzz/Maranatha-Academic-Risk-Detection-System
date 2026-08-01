/**
 * StaffWorkloadPage -- Staff workload overview for admin
 * API: GET /admin/staff-workload
 */
import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users, BookOpen, AlertTriangle, BarChart2,
  RefreshCw, AlertCircle, Bell,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";
import { useApi } from "../../hooks/useApi";

/* ── animation variants ────────────────────────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

/* ── small stat card ───────────────────────────────────── */
function SummaryCard({ icon: Icon, label, value, accent = "text-primary" }) {
  return (
    <motion.div variants={item}
      className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-primary" />
        </div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`font-serif text-3xl font-bold leading-none ${accent}`}>
        {value ?? "--"}
      </p>
    </motion.div>
  );
}

/* ── main page ─────────────────────────────────────────── */
export default function StaffWorkloadPage() {
  const { token } = useAuth();

  const { data: rawStaff, loading, error, refetch: fetchData } = useApi(
    () => adminApi.getStaffWorkload(token),
    [token],
  );
  const staff = Array.isArray(rawStaff) ? rawStaff : rawStaff?.items || [];

  /* ---- derived data ---- */
  const sorted = useMemo(
    () => [...staff].sort((a, b) => (b.high_risk_count ?? 0) - (a.high_risk_count ?? 0)),
    [staff],
  );

  const summary = useMemo(() => {
    const total       = staff.length;
    const totalCourses = staff.reduce((s, r) => s + (r.course_count ?? 0), 0);
    const avgCourses   = total > 0 ? (totalCourses / total).toFixed(1) : "0";
    const totalHighRisk = staff.reduce((s, r) => s + (r.high_risk_count ?? 0), 0);
    const totalSos      = staff.reduce((s, r) => s + (r.open_sos_count ?? 0), 0);
    return { total, avgCourses, totalHighRisk, totalSos };
  }, [staff]);

  const maxWorkload = useMemo(() => {
    if (sorted.length === 0) return 1;
    return Math.max(
      ...sorted.map(r => (r.course_count ?? 0) + (r.intervention_count ?? 0) + (r.open_sos_count ?? 0)),
      1,
    );
  }, [sorted]);

  /* ── render ──────────────────────────────────────────── */
  return (
    <div className="space-y-8">

      {/* ---------- Header ---------- */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
            Staff Workload
          </h1>
          <p className="text-lg text-slate-500">
            Overview of lecturer assignments, interventions, and risk exposure
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={fetchData}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all">
          <RefreshCw size={13} /> Refresh
        </motion.button>
      </div>

      {/* ---------- Error banner ---------- */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* ---------- Loading ---------- */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : staff.length === 0 ? (
        /* ---------- Empty state ---------- */
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <Users size={32} className="mb-3 opacity-30" />
          <p className="text-sm">No staff workload data available for this session</p>
        </div>
      ) : (
        <>
          {/* ====== Summary Stats ====== */}
          <motion.div variants={container} initial="hidden" animate="show"
            className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard icon={Users}         label="Total Lecturers"      value={summary.total}         accent="text-primary" />
            <SummaryCard icon={BookOpen}       label="Avg Courses / Lect."  value={summary.avgCourses}    accent="text-blue-600" />
            <SummaryCard icon={AlertTriangle}  label="Total High-Risk"      value={summary.totalHighRisk} accent="text-red-600" />
            <SummaryCard icon={Bell}           label="Open SOS Requests"    value={summary.totalSos}      accent={summary.totalSos > 0 ? "text-red-600" : "text-emerald-600"} />
          </motion.div>

          {/* ====== Staff Cards / Table ====== */}
          <div className="flex items-center gap-3 mb-1">
            <BarChart2 size={16} className="text-slate-400" />
            <h2 className="font-serif text-xl font-bold text-slate-900">
              Individual Workload
            </h2>
            <span className="text-xs text-slate-400 ml-auto">
              Sorted by high-risk students (descending)
            </span>
          </div>

          <motion.div variants={container} initial="hidden" animate="show"
            className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ds-table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Lecturer</th>
                    <th className="text-center">Courses</th>
                    <th className="text-center">Interventions</th>
                    <th className="text-center">High-Risk</th>
                    <th className="text-center">Open SOS</th>
                    <th className="text-left hidden md:table-cell">Workload</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => {
                    const workload    = (row.course_count ?? 0) + (row.intervention_count ?? 0) + (row.open_sos_count ?? 0);
                    const workloadPct = Math.round((workload / maxWorkload) * 100);

                    return (
                      <motion.tr key={row.staff_id} variants={item}>
                        {/* ── name + id ── */}
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-accent font-bold text-[10px] flex-shrink-0">
                              {(row.lecturer_name || "")
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 text-sm truncate">
                                {row.lecturer_name}
                              </p>
                              <p className="text-xs text-slate-400 font-mono">{row.staff_id}</p>
                            </div>
                          </div>
                        </td>

                        {/* ── courses ── */}
                        <td className="text-center text-slate-600 font-semibold">
                          {row.course_count ?? 0}
                        </td>

                        {/* ── interventions ── */}
                        <td className="text-center text-slate-600 font-semibold">
                          {row.intervention_count ?? 0}
                        </td>

                        {/* ── high risk ── */}
                        <td className="text-center">
                          <span
                            className={`font-bold ${
                              (row.high_risk_count ?? 0) > 5
                                ? "text-red-600"
                                : (row.high_risk_count ?? 0) > 0
                                ? "text-amber-600"
                                : "text-slate-300"
                            }`}
                          >
                            {row.high_risk_count ?? 0}
                          </span>
                        </td>

                        {/* ── open sos ── */}
                        <td className="text-center">
                          {(row.open_sos_count ?? 0) > 0 ? (
                            <span className="inline-flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 border border-red-200 px-2 py-0.5 rounded-lg">
                              <Bell size={10} />
                              {row.open_sos_count}
                            </span>
                          ) : (
                            <span className="text-slate-300 font-semibold">0</span>
                          )}
                        </td>

                        {/* ── workload bar ── */}
                        <td className="hidden md:table-cell">
                          <div className="flex items-center gap-2 min-w-[140px]">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${
                                  workloadPct > 75
                                    ? "bg-red-500"
                                    : workloadPct > 40
                                    ? "bg-amber-400"
                                    : "bg-emerald-400"
                                }`}
                                initial={{ width: 0 }}
                                animate={{ width: `${workloadPct}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono w-6 text-right">
                              {workload}
                            </span>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </motion.div>

          {/* ---- footer note ---- */}
          <p className="text-xs text-slate-400 text-center">
            Showing {sorted.length} lecturer{sorted.length !== 1 ? "s" : ""} for the active academic session
          </p>
        </>
      )}
    </div>
  );
}
