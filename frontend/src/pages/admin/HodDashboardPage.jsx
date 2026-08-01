/**
 * HodDashboardPage -- HOD broadcast + lecturer activity monitoring
 * API: POST /admin/hod/broadcast, GET /admin/hod/lecturer-activity
 */
import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Users, Send, RefreshCw, AlertCircle, CheckCircle2,
  ClipboardList, BookOpen, Shield, MessageSquare, BarChart2,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";

/* -- animation variants --------------------------------------------------- */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

/* -- small stat card ------------------------------------------------------ */
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

/* -- activity level helper ------------------------------------------------ */
function activityLevel(row) {
  const total =
    (row.attendance_sessions ?? 0) +
    (row.quizzes_created ?? 0) +
    (row.assignments_created ?? 0) +
    (row.interventions_sent ?? 0) +
    (row.sos_responses ?? 0);
  if (total >= 10) return { label: "Active",   color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200" };
  if (total >= 3)  return { label: "Moderate", color: "text-amber-600",   bg: "bg-amber-50 border-amber-200" };
  return               { label: "Inactive", color: "text-slate-400",   bg: "bg-slate-50 border-slate-200" };
}

function totalActions(row) {
  return (
    (row.attendance_sessions ?? 0) +
    (row.quizzes_created ?? 0) +
    (row.assignments_created ?? 0) +
    (row.interventions_sent ?? 0) +
    (row.sos_responses ?? 0)
  );
}

/* ========================================================================= */
export default function HodDashboardPage() {
  const { token } = useAuth();

  /* -- broadcast state -- */
  const [title, setTitle]           = useState("");
  const [message, setMessage]       = useState("");
  const [sending, setSending]       = useState(false);
  const [broadcastResult, setBroadcastResult] = useState(null);
  const [broadcastError, setBroadcastError]   = useState("");

  /* -- activity state -- */
  const [lecturers, setLecturers]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  /* -- fetch activity data -- */
  const fetchActivity = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminApi.hodLecturerActivity(token);
      setLecturers(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActivity();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  /* -- send broadcast -- */
  const handleBroadcast = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    setBroadcastResult(null);
    setBroadcastError("");
    try {
      const res = await adminApi.hodBroadcast({ title: title.trim(), message: message.trim() }, token);
      setBroadcastResult(res);
      setTitle("");
      setMessage("");
    } catch (err) {
      setBroadcastError(err.message);
    } finally {
      setSending(false);
    }
  };

  /* -- derived data -- */
  const sorted = useMemo(
    () => [...lecturers].sort((a, b) => totalActions(b) - totalActions(a)),
    [lecturers],
  );

  const summary = useMemo(() => {
    const total            = lecturers.length;
    const totalAttendance  = lecturers.reduce((s, r) => s + (r.attendance_sessions ?? 0), 0);
    const totalQuizzes     = lecturers.reduce((s, r) => s + (r.quizzes_created ?? 0), 0);
    const totalAssignments = lecturers.reduce((s, r) => s + (r.assignments_created ?? 0), 0);
    const totalInterv      = lecturers.reduce((s, r) => s + (r.interventions_sent ?? 0), 0);
    return { total, totalAttendance, totalQuizzes, totalAssignments, totalInterv };
  }, [lecturers]);

  const maxActions = useMemo(() => {
    if (sorted.length === 0) return 1;
    return Math.max(...sorted.map(totalActions), 1);
  }, [sorted]);

  /* ====================================================================== */
  return (
    <div className="space-y-8">

      {/* ---------- Header ---------- */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
            Department Management
          </h1>
          <p className="text-lg text-slate-500">
            Broadcast messages and monitor lecturer activity in your department
          </p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={fetchActivity}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all">
          <RefreshCw size={13} /> Refresh
        </motion.button>
      </div>

      {/* ================================================================= */}
      {/* BROADCAST SECTION                                                  */}
      {/* ================================================================= */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden"
      >
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <div className="w-9 h-9 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center flex-shrink-0">
            <Send size={16} className="text-primary" />
          </div>
          <div>
            <h2 className="font-serif text-lg font-bold text-slate-900">Broadcast to Lecturers</h2>
            <p className="text-xs text-slate-400">Send a notification to all lecturers in your department</p>
          </div>
        </div>

        <form onSubmit={handleBroadcast} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Title</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Reminder: Submit CA Scores"
              required
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
            />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Enter your broadcast message..."
              required
              rows={4}
              className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all resize-none"
            />
          </div>

          {/* broadcast error */}
          {broadcastError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
              <AlertCircle size={14} /> {broadcastError}
            </div>
          )}

          {/* broadcast success */}
          {broadcastResult && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700"
            >
              <CheckCircle2 size={14} />
              Broadcast sent to <strong>{broadcastResult.sent_to}</strong> lecturer{broadcastResult.sent_to !== 1 ? "s" : ""} in <strong>{broadcastResult.department}</strong>
            </motion.div>
          )}

          <div className="flex justify-end">
            <motion.button
              whileTap={{ scale: 0.96 }}
              type="submit"
              disabled={sending || !title.trim() || !message.trim()}
              className="flex items-center gap-2 bg-primary hover:bg-primary/90 text-white text-sm font-semibold px-6 py-2.5 rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              <Send size={14} />
              {sending ? "Sending..." : "Send to All Lecturers"}
            </motion.button>
          </div>
        </form>
      </motion.div>

      {/* ================================================================= */}
      {/* LECTURER ACTIVITY SECTION                                          */}
      {/* ================================================================= */}

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : lecturers.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center h-64 text-slate-400">
          <Users size={32} className="mb-3 opacity-30" />
          <p className="text-sm">No lecturers found in your department</p>
        </div>
      ) : (
        <>
          {/* ====== Summary Stats ====== */}
          <motion.div variants={container} initial="hidden" animate="show"
            className="grid grid-cols-2 lg:grid-cols-5 gap-4">
            <SummaryCard icon={Users}         label="Lecturers"    value={summary.total}            accent="text-primary" />
            <SummaryCard icon={ClipboardList}  label="Attendance"   value={summary.totalAttendance}  accent="text-blue-600" />
            <SummaryCard icon={BookOpen}       label="Quizzes"      value={summary.totalQuizzes}     accent="text-violet-600" />
            <SummaryCard icon={Shield}         label="Assignments"  value={summary.totalAssignments} accent="text-teal-600" />
            <SummaryCard icon={MessageSquare}  label="Interventions" value={summary.totalInterv}     accent="text-amber-600" />
          </motion.div>

          {/* ====== Activity Table ====== */}
          <div className="flex items-center gap-3 mb-1">
            <BarChart2 size={16} className="text-slate-400" />
            <h2 className="font-serif text-xl font-bold text-slate-900">
              Lecturer Activity
            </h2>
            <span className="text-xs text-slate-400 ml-auto">
              Sorted by total actions (descending)
            </span>
          </div>

          <motion.div variants={container} initial="hidden" animate="show"
            className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="ds-table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Lecturer</th>
                    <th className="text-center">Attendance</th>
                    <th className="text-center">Quizzes</th>
                    <th className="text-center">Assignments</th>
                    <th className="text-center">Interventions</th>
                    <th className="text-center">SOS Resp.</th>
                    <th className="text-center">Status</th>
                    <th className="text-left hidden md:table-cell">Activity</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((row) => {
                    const total      = totalActions(row);
                    const pct        = Math.round((total / maxActions) * 100);
                    const level      = activityLevel(row);

                    return (
                      <motion.tr key={row.lecturer_id} variants={item}>
                        {/* name + staff id */}
                        <td>
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-accent font-bold text-[10px] flex-shrink-0">
                              {(row.full_name || "")
                                .split(" ")
                                .map((n) => n[0])
                                .join("")
                                .slice(0, 2)
                                .toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 text-sm truncate">
                                {row.full_name}
                              </p>
                              <p className="text-xs text-slate-400 font-mono">{row.staff_id || row.email}</p>
                            </div>
                          </div>
                        </td>

                        {/* attendance */}
                        <td className="text-center text-slate-600 font-semibold">
                          {row.attendance_sessions ?? 0}
                        </td>

                        {/* quizzes */}
                        <td className="text-center text-slate-600 font-semibold">
                          {row.quizzes_created ?? 0}
                        </td>

                        {/* assignments */}
                        <td className="text-center text-slate-600 font-semibold">
                          {row.assignments_created ?? 0}
                        </td>

                        {/* interventions */}
                        <td className="text-center text-slate-600 font-semibold">
                          {row.interventions_sent ?? 0}
                        </td>

                        {/* sos responses */}
                        <td className="text-center text-slate-600 font-semibold">
                          {row.sos_responses ?? 0}
                        </td>

                        {/* status badge */}
                        <td className="text-center">
                          <span className={`inline-flex items-center text-xs font-bold px-2.5 py-1 rounded-lg border ${level.bg} ${level.color}`}>
                            {level.label}
                          </span>
                        </td>

                        {/* activity bar */}
                        <td className="hidden md:table-cell">
                          <div className="flex items-center gap-2 min-w-[140px]">
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div
                                className={`h-full rounded-full ${
                                  pct > 75
                                    ? "bg-emerald-500"
                                    : pct > 30
                                    ? "bg-amber-400"
                                    : "bg-slate-300"
                                }`}
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.6, ease: "easeOut" }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono w-6 text-right">
                              {total}
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

          {/* footer note */}
          <p className="text-xs text-slate-400 text-center">
            Showing {sorted.length} lecturer{sorted.length !== 1 ? "s" : ""} in scope
          </p>
        </>
      )}
    </div>
  );
}
