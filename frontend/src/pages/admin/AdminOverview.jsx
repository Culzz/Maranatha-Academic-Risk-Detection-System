/**
 * AdminOverview — System-wide dashboard
 * Real API: GET /admin/dashboard, GET /interventions/completion-rate
 */
import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Users, GraduationCap, AlertTriangle, CheckCircle,
  Activity, TrendingUp, BookOpen, Shield, BarChart2, Clock, LifeBuoy, Zap, RefreshCw,
} from "lucide-react";
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import { useAuth } from "../../context/AuthContext";
import { useLayout } from "../../context/LayoutContext";
import { useRealtime } from "../../context/RealtimeContext";
import { adminApi } from "../../services/api";
import { getGreeting, firstName, getHolidayGreeting } from "../../utils/greetings";
import { RISK_HEX } from "../../utils/helpers";
import useRealTimeClock from "../../hooks/useRealTimeClock";
import useWeekInfo from "../../hooks/useWeekInfo";
import SemesterWeekTracker from "../../components/shared/SemesterWeekTracker";

const c  = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const it = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

function StatCard({ label, value, sub, icon: Icon, color = "text-primary", layout = "default" }) {
  if (layout === "compact") {
    return (
      <motion.div variants={it}
        className="bg-white border border-slate-100 rounded-2xl p-3 shadow-sm flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
          <Icon size={14} className={color} />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-slate-500">{label}</p>
          <p className="font-serif text-xl font-bold text-primary leading-none">{value ?? "—"}</p>
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div variants={it}
      className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm flex items-start gap-4">
      <div className="w-11 h-11 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center flex-shrink-0">
        <Icon size={20} className={color} />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">{label}</p>
        <p className="font-serif text-3xl font-bold text-primary leading-none mb-1">{value ?? "—"}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </motion.div>
  );
}

function RiskPieChart({ distribution }) {
  const data = Object.entries(distribution)
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

  if (!data.length) return (
    <div className="flex items-center justify-center h-48 text-slate-400 text-sm">No risk data yet</div>
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <PieChart>
        <Pie data={data} cx="50%" cy="50%" innerRadius={55} outerRadius={85}
          paddingAngle={3} dataKey="value">
          {data.map(({ name }) => (
            <Cell key={name} fill={RISK_HEX[name]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 13 }}
          formatter={(val, name) => [`${val} students`, name + " Risk"]}
        />
        <Legend
          formatter={(value) => <span className="text-sm text-slate-600">{value} Risk</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export default function AdminOverview() {
  const { token, user } = useAuth();
  const { layout } = useLayout();
  const navigate = useNavigate();
  const { dateStr, timeStr } = useRealTimeClock();
  const { weekInfo, weekInfoLoading } = useWeekInfo();
  const greeting = useMemo(() => getHolidayGreeting(firstName(user?.full_name || ""), weekInfo?.current_holiday), [user?.full_name, weekInfo?.current_holiday]);
  const [dash,       setDash]       = useState(null);
  const [completion, setCompletion] = useState(null);
  const [sosDash,    setSosDash]    = useState(null);
  const [efficacy,   setEfficacy]   = useState(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState("");
  const [engLoading, setEngLoading] = useState(false);
  const [engResult,  setEngResult]  = useState(null);
  const [riskLoading, setRiskLoading] = useState(false);
  const [riskResult,  setRiskResult]  = useState(null);
  const [retrainLoading, setRetrainLoading] = useState(false);
  const [retrainResult,  setRetrainResult]  = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const unsub1 = on("risk_changed",  () => setRefreshTick(t => t + 1));
    const unsub2 = on("sos_received",  () => setRefreshTick(t => t + 1));
    return () => { unsub1(); unsub2(); };
  }, [on]);

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const data = await adminApi.getOverviewDashboard(token);
        if (ctrl.signal.aborted) return;
        setDash(data?.dashboard || null);
        setCompletion(data?.completion || null);
        setSosDash(data?.sos_dashboard || null);
        setEfficacy(data?.intervention_efficacy || null);
      } catch (e) {
        if (e.name !== "AbortError") {
          setError(e.message);
        }
      } finally {
        setLoading(false);
      }
    })();
    return () => ctrl.abort();
  }, [token, refreshTick]);

  const dist = dash?.risk_distribution || { High: 0, Medium: 0, Low: 0 };
  const totalRisk = dist.High + dist.Medium + dist.Low;

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
    </div>
  );

  return (
    <div className={`${layout === "compact" ? "space-y-4" : "space-y-8"}`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            {greeting}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{dateStr} &middot; {timeStr}</p>
        </div>
      </div>

      {/* Semester week tracker */}
      <SemesterWeekTracker weekInfo={weekInfo} loading={weekInfoLoading} />

      <div>
        <p className="text-lg text-slate-500">
          {dash?.active_session
            ? <><span className="text-emerald-600 font-semibold">●</span> {dash.active_session} — Active session</>
            : <span className="text-red-500">No active academic session</span>
          }
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Stat cards */}
      <motion.div variants={c} initial="hidden" animate="show"
        className={`grid ${layout === "compact" ? "grid-cols-2 lg:grid-cols-4 gap-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"}`}>
        <StatCard label="Total Students"  value={dash?.total_students}  sub="Active accounts"       icon={GraduationCap} color="text-primary"      layout={layout} />
        <StatCard label="Total Lecturers" value={dash?.total_lecturers} sub="Active accounts"       icon={Users}         color="text-blue-500"     layout={layout} />
        <StatCard label="High Risk"        value={dist.High}             sub="Require intervention" icon={AlertTriangle} color="text-risk-high"    layout={layout} />
        <StatCard label="Interventions"    value={completion?.total}     sub={`${completion?.completion_rate ?? 0}% completed`} icon={CheckCircle} color="text-emerald-500" layout={layout} />
      </motion.div>

      {/* Wave 2 stat cards */}
      <motion.div variants={c} initial="hidden" animate="show"
        className={`grid ${layout === "compact" ? "grid-cols-3 gap-3" : "grid-cols-1 sm:grid-cols-3 gap-4"}`}>
        <motion.div variants={it} whileHover={{ y: -2 }} onClick={() => navigate("/admin/sos")}
          className={`bg-white border border-slate-200 rounded-xl ${layout === "compact" ? "p-3" : "p-5"} shadow-sm hover:shadow-md cursor-pointer transition-all flex items-center gap-4`}>
          <div className="w-11 h-11 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center flex-shrink-0">
            <LifeBuoy size={20} className="text-red-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Open SOS</p>
            <p className="font-serif text-2xl font-bold text-red-600 leading-none">{sosDash?.open_count ?? "—"}</p>
          </div>
        </motion.div>
        <motion.div variants={it} whileHover={{ y: -2 }} onClick={() => navigate("/admin/efficacy")}
          className={`bg-white border border-slate-200 rounded-xl ${layout === "compact" ? "p-3" : "p-5"} shadow-sm hover:shadow-md cursor-pointer transition-all flex items-center gap-4`}>
          <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
            <TrendingUp size={20} className="text-emerald-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Efficacy Rate</p>
            <p className="font-serif text-2xl font-bold text-emerald-600 leading-none">{efficacy?.improvement_rate ?? "—"}%</p>
          </div>
        </motion.div>
        <motion.div variants={it} whileHover={{ y: -2 }} onClick={() => navigate("/admin/sos")}
          className={`bg-white border border-slate-200 rounded-xl ${layout === "compact" ? "p-3" : "p-5"} shadow-sm hover:shadow-md cursor-pointer transition-all flex items-center gap-4`}>
          <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
            <Clock size={20} className="text-amber-500" />
          </div>
          <div>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-0.5">Avg Response</p>
            <p className="font-serif text-2xl font-bold text-amber-600 leading-none">{sosDash?.avg_response_hours != null ? `${Number(sosDash.avg_response_hours).toFixed(1)}h` : "—"}</p>
          </div>
        </motion.div>
      </motion.div>

      {/* Risk chart + breakdown */}
      {layout !== "compact" && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Pie chart */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
          className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Risk Distribution</h2>
          <p className="text-sm text-slate-400 mb-4">{totalRisk} students assessed this session</p>
          <RiskPieChart distribution={dist} />
        </motion.div>

        {/* Intervention breakdown */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
          className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Intervention Summary</h2>
          <p className="text-sm text-slate-400 mb-6">Status breakdown across all interventions</p>
          {completion ? (
            <div className="space-y-4">
              {Object.entries(completion.breakdown || {}).map(([status, count]) => {
                const pct = completion.total > 0 ? Math.round(count / completion.total * 100) : 0;
                const color = status === "completed" ? "bg-emerald-500"
                  : status === "pending" ? "bg-amber-400"
                  : status === "dismissed" ? "bg-slate-300"
                  : "bg-blue-400";
                return (
                  <div key={status}>
                    <div className="flex justify-between text-sm mb-1.5">
                      <span className="capitalize font-medium text-slate-700">{status}</span>
                      <span className="text-slate-400">{count} ({pct}%)</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        className={`h-full rounded-full ${color}`}
                        initial={{ width: 0 }} animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                );
              })}
              <div className="pt-4 border-t border-slate-100">
                <p className="text-sm text-slate-500">
                  Overall completion rate:{" "}
                  <span className="font-bold text-emerald-600">{completion.completion_rate}%</span>
                </p>
              </div>
            </div>
          ) : (
            <p className="text-slate-400 text-sm">No intervention data available.</p>
          )}
        </motion.div>
      </div>
      )}

      {/* Quick nav */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <h2 className={`font-serif text-xl font-bold text-slate-900 ${layout === "compact" ? "mb-3" : "mb-4"}`}>Quick Actions</h2>
        <div className={`grid ${layout === "compact" ? "grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"}`}>
          {/* Compute Engagement action card */}
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
            onClick={async () => {
              setEngLoading(true); setEngResult(null);
              try {
                const res = await adminApi.computeEngagement(token);
                setEngResult(res);
              } catch { setEngResult({ error: true }); }
              finally { setEngLoading(false); }
            }}
            disabled={engLoading}
            className={`text-left bg-white border border-slate-200 rounded-xl ${layout === "compact" ? "p-3" : "p-5"} hover:border-accent/40 hover:shadow-md transition-all group`}>
            <div className={`${layout === "compact" ? "w-8 h-8 rounded-lg" : "w-10 h-10 rounded-xl"} bg-slate-50 border border-slate-200 flex items-center justify-center mb-3 group-hover:bg-accent/10 group-hover:border-accent/30 transition-all`}>
              <Zap size={layout === "compact" ? 14 : 18} className="text-slate-400 group-hover:text-accent transition-colors" />
            </div>
            <p className="font-semibold text-slate-900 text-sm mb-1">
              {engLoading ? "Computing..." : "Compute Engagement"}
            </p>
            <p className="text-xs text-slate-400">
              {engResult && !engResult.error
                ? `Week ${engResult.week_number}: ${engResult.computed} computed`
                : engResult?.error ? "Failed — try again" : "Aggregate weekly metrics"}
            </p>
          </motion.button>
          {/* Compute Risk action card */}
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
            onClick={async () => {
              setRiskLoading(true); setRiskResult(null);
              try {
                const res = await adminApi.computeRisk(token);
                setRiskResult(res);
              } catch { setRiskResult({ error: true }); }
              finally { setRiskLoading(false); }
            }}
            disabled={riskLoading}
            className={`text-left bg-white border border-slate-200 rounded-xl ${layout === "compact" ? "p-3" : "p-5"} hover:border-red-300 hover:shadow-md transition-all group`}>
            <div className={`${layout === "compact" ? "w-8 h-8 rounded-lg" : "w-10 h-10 rounded-xl"} bg-slate-50 border border-slate-200 flex items-center justify-center mb-3 group-hover:bg-red-50 group-hover:border-red-200 transition-all`}>
              <AlertTriangle size={layout === "compact" ? 14 : 18} className="text-slate-400 group-hover:text-red-500 transition-colors" />
            </div>
            <p className="font-semibold text-slate-900 text-sm mb-1">
              {riskLoading ? "Computing..." : "Compute Risk"}
            </p>
            <p className="text-xs text-slate-400">
              {riskResult && !riskResult.error
                ? `Week ${riskResult.week_number}: ${riskResult.computed} scored`
                : riskResult?.error ? "Failed — try again" : "XGBoost + SHAP risk scores"}
            </p>
          </motion.button>
          {/* Retrain Model action card */}
          <motion.button whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
            onClick={async () => {
              setRetrainLoading(true); setRetrainResult(null);
              try {
                const res = await adminApi.triggerRetrain(token);
                setRetrainResult(res);
              } catch { setRetrainResult({ status: "error" }); }
              finally { setRetrainLoading(false); }
            }}
            disabled={retrainLoading}
            className={`text-left bg-white border border-slate-200 rounded-xl ${layout === "compact" ? "p-3" : "p-5"} hover:border-purple-300 hover:shadow-md transition-all group`}>
            <div className={`${layout === "compact" ? "w-8 h-8 rounded-lg" : "w-10 h-10 rounded-xl"} bg-slate-50 border border-slate-200 flex items-center justify-center mb-3 group-hover:bg-purple-50 group-hover:border-purple-200 transition-all`}>
              <RefreshCw size={layout === "compact" ? 14 : 18} className={`text-slate-400 group-hover:text-purple-500 transition-colors ${retrainLoading ? "animate-spin" : ""}`} />
            </div>
            <p className="font-semibold text-slate-900 text-sm mb-1">
              {retrainLoading ? "Retraining..." : "Retrain Model"}
            </p>
            <p className="text-xs text-slate-400">
              {retrainResult?.status === "success"
                ? `v${retrainResult.model_version} — ${retrainResult.training_records} records`
                : retrainResult?.status === "skipped"
                ? retrainResult.message
                : retrainResult?.status === "error" ? "Failed — try again" : "Learn from real student data"}
            </p>
          </motion.button>
          {[
            { label: "Manage Users",      path: "/admin/users",           icon: Users,        desc: "Activate or deactivate accounts" },
            { label: "Department Risk",   path: "/admin/department-risk", icon: BarChart2,    desc: "Risk by department breakdown"     },
            { label: "Enrollments",       path: "/admin/enrollments",     icon: BookOpen,     desc: "Bulk CSV or single enrollment"    },
            { label: "Audit Log",         path: "/admin/audit",           icon: Shield,       desc: "Track risk profile access"        },
          ].map(({ label, path, icon: Icon, desc }) => (
            <motion.button key={path} whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}
              onClick={() => navigate(path)}
              className={`text-left bg-white border border-slate-200 rounded-xl ${layout === "compact" ? "p-3" : "p-5"} hover:border-accent/40 hover:shadow-md transition-all group`}>
              <div className={`${layout === "compact" ? "w-8 h-8 rounded-lg" : "w-10 h-10 rounded-xl"} bg-slate-50 border border-slate-200 flex items-center justify-center mb-3 group-hover:bg-accent/10 group-hover:border-accent/30 transition-all`}>
                <Icon size={layout === "compact" ? 14 : 18} className="text-slate-400 group-hover:text-accent transition-colors" />
              </div>
              <p className="font-semibold text-slate-900 text-sm mb-1">{label}</p>
              <p className="text-xs text-slate-400">{desc}</p>
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}
