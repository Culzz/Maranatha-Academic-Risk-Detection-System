/**
 * CrossCourseRiskPage — Multi-course risk correlation alerts (Idea 16).
 * Shows students struggling across 3+ courses simultaneously.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { GitBranch, AlertTriangle, Users, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import Badge from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { adminApi } from "../../services/api";
import { initials } from "../../utils/helpers";

const c = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const it = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

function PatternBadge({ pattern }) {
  if (pattern === "multi_course_collapse") {
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">Multi-Course Collapse</span>;
  }
  return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">Spreading Concern</span>;
}

export default function CrossCourseRiskPage() {
  const { token } = useAuth();
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const unsub = on("risk_changed", () => setRefreshTick(t => t + 1));
    return () => unsub();
  }, [on]);

  useEffect(() => {
    adminApi.getCrossCourseAlerts(token)
      .then(d => setAlerts(Array.isArray(d) ? d : []))
      .catch(() => setAlerts([]))
      .finally(() => setLoading(false));
  }, [token, refreshTick]);

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-slate-400" size={28} /></div>;
  }

  return (
    <motion.div variants={c} initial="hidden" animate="show" className="space-y-8">

      {/* Header */}
      <motion.div variants={it}>
        <div className="flex items-center gap-3 mb-2">
          <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
            <GitBranch size={18} className="text-slate-400" />
          </div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">Cross-Course Risk</h1>
        </div>
        <p className="text-lg text-slate-600">
          Students struggling across multiple courses simultaneously — potential welfare concerns
        </p>
      </motion.div>

      {/* Summary bar */}
      <motion.div variants={it} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Total Alerts</p>
          <p className="font-serif text-3xl font-bold text-red-600">{alerts.length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Multi-Course Collapse</p>
          <p className="font-serif text-3xl font-bold text-slate-900">{alerts.filter(a => a.pattern === "multi_course_collapse").length}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-sm text-center">
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Spreading Concern</p>
          <p className="font-serif text-3xl font-bold text-amber-600">{alerts.filter(a => a.pattern === "spreading_concern").length}</p>
        </div>
      </motion.div>

      {/* Alert list */}
      {alerts.length === 0 ? (
        <motion.div variants={it} className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
          <Users size={32} className="mx-auto mb-4 text-slate-300" />
          <p className="text-sm text-slate-400">No cross-course risk alerts found</p>
          <p className="text-xs text-slate-400 mt-1">This is good — no students are struggling across 3+ courses</p>
        </motion.div>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert, idx) => (
            <motion.div
              key={alert.student_id}
              variants={it}
              className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden"
            >
              <button
                onClick={() => setExpanded(expanded === idx ? null : idx)}
                className="w-full flex items-center gap-4 px-6 py-4 text-left hover:bg-slate-50/50 transition-colors"
              >
                <div
                  className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-accent font-bold flex-shrink-0"
                  style={{ fontSize: 11 }}
                >
                  {initials(alert.student_name || "?")}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-slate-900">{alert.student_name}</p>
                    <PatternBadge pattern={alert.pattern} />
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {alert.matric_number} · {alert.high_risk_courses} High + {alert.medium_risk_courses} Medium across {alert.total_courses} courses
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <AlertTriangle size={14} className="text-red-500" />
                  {expanded === idx ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
                </div>
              </button>

              {expanded === idx && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  className="border-t border-slate-100 px-6 py-4 space-y-4"
                >
                  {/* Course breakdown */}
                  <div>
                    <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Performance Across Courses</p>
                    <div className="space-y-2">
                      {alert.courses?.map((c, i) => (
                        <div key={i} className="flex items-center gap-3">
                          <span className="text-sm font-semibold text-slate-900 w-20">{c.course_code}</span>
                          <Badge variant="risk" level={c.risk_level} />
                          <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${c.probability}%`,
                                backgroundColor: c.risk_level === "High" ? "#e11d48" : c.risk_level === "Medium" ? "#f59e0b" : "#10b981",
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-600 w-10 text-right">{c.probability}%</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Recommendation */}
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <p className="text-xs font-semibold text-blue-700 mb-1">Recommendation</p>
                    <p className="text-sm text-blue-800 leading-relaxed">{alert.recommendation}</p>
                  </div>
                </motion.div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}
