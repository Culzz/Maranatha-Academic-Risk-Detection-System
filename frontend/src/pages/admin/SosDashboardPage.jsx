/**
 * SosDashboardPage -- Admin SOS Dashboard
 * Shows open SOS request count, average response time, and recent open requests.
 * API: GET /admin/sos-dashboard  (via adminApi.getSosDashboard)
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  AlertTriangle,
  Clock,
  CheckCircle,
  Users,
  RefreshCw,
  AlertCircle,
  MessageSquare,
  Send,
  ShieldCheck,
  X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi, sosApi } from "../../services/api";
import { useApi } from "../../hooks/useApi";

/* ── animation variants ──────────────────────────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item      = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

/* ── helpers ─────────────────────────────────────────────── */
function timeAgo(iso) {
  if (!iso) return "";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function statusConfig(status) {
  switch (status) {
    case "acknowledged":
      return { label: "Acknowledged", bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", dot: "bg-amber-400" };
    case "resolved":
      return { label: "Resolved", bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-400" };
    default:
      return { label: "Open", bg: "bg-red-50", text: "text-red-700", border: "border-red-200", dot: "bg-red-400" };
  }
}

function responseColor(hours) {
  if (hours < 2) return { label: "Excellent", bar: "bg-emerald-500", text: "text-emerald-600", track: "bg-emerald-100" };
  if (hours <= 6) return { label: "Acceptable", bar: "bg-amber-500", text: "text-amber-600", track: "bg-amber-100" };
  return { label: "Needs Improvement", bar: "bg-red-500", text: "text-red-600", track: "bg-red-100" };
}

/* ── stat card ───────────────────────────────────────────── */
function StatCard({ icon: Icon, label, value, accent = false, iconColor = "text-primary" }) {
  return (
    <motion.div variants={item}
      className={[
        "rounded-xl border p-5 shadow-sm transition-all",
        accent ? "bg-red-50 border-red-200" : "bg-white border-slate-200",
      ].join(" ")}
    >
      <div className="flex items-center gap-3 mb-3">
        <div className={[
          "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
          accent ? "bg-red-100 border border-red-200" : "bg-slate-100 border border-slate-200",
        ].join(" ")}>
          <Icon size={16} className={accent ? "text-red-600" : iconColor} />
        </div>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`font-serif text-3xl font-bold leading-none ${accent ? "text-red-700" : "text-slate-900"}`}>
        {value ?? "\u2014"}
      </p>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════ */
export default function SosDashboardPage() {
  const { token } = useAuth();

  const { data, loading, error, refetch: fetchData } = useApi(
    () => adminApi.getSosDashboard(token),
    [token],
  );

  /* respond form state */
  const [respondingId,   setRespondingId]   = useState(null);
  const [responseNote,   setResponseNote]   = useState("");
  const [responseStatus, setResponseStatus] = useState("acknowledged");
  const [responding,     setResponding]     = useState(false);
  const [respondError,   setRespondError]   = useState(null);

  const openRespondForm = (sosId, defaultStatus = "acknowledged") => {
    setRespondingId(sosId);
    setResponseNote("");
    setResponseStatus(defaultStatus);
  };

  const closeRespondForm = () => {
    setRespondingId(null);
    setResponseNote("");
    setResponseStatus("acknowledged");
  };

  const handleRespond = async (sosId) => {
    setResponding(true);
    setRespondError(null);
    try {
      await sosApi.respond(sosId, { response_note: responseNote, status: responseStatus }, token);
      closeRespondForm();
      fetchData();
    } catch (e) {
      setRespondError(e.message);
    } finally {
      setResponding(false);
    }
  };

  const openCount        = data?.open_count ?? 0;
  const avgResponseHours = data?.avg_response_hours ?? 0;
  const recentSos        = data?.recent_open ?? [];
  const rc               = responseColor(avgResponseHours);
  // Clamp gauge width at 12 hours max for display
  const gaugePercent     = Math.min((avgResponseHours / 12) * 100, 100);

  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
            SOS Dashboard
          </h1>
          <p className="text-lg text-slate-500">
            Monitor and respond to student SOS requests across all courses
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={fetchData}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all"
        >
          <RefreshCw size={13} /> Refresh
        </motion.button>
      </div>

      {/* ── Error ──────────────────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
        {respondError && (
          <motion.div key="respond-err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {respondError}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Loading ────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* ── Summary Stats Cards ────────────────────────── */}
          <motion.div variants={container} initial="hidden" animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            <StatCard
              icon={AlertTriangle}
              label="Open SOS Requests"
              value={openCount}
              accent={openCount > 0}
            />
            <StatCard
              icon={Clock}
              label="Avg Response Time"
              value={`${avgResponseHours.toFixed(1)}h`}
              iconColor="text-slate-500"
            />
          </motion.div>

          {/* ── Response Time Indicator ─────────────────────── */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-white border border-slate-200 rounded-xl shadow-sm p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-serif text-xl font-bold text-slate-900">Response Time Performance</h2>
              <span className={`text-sm font-semibold ${rc.text}`}>{rc.label}</span>
            </div>

            {/* Gauge bar */}
            <div className="relative">
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${rc.bar}`}
                  initial={{ width: 0 }}
                  animate={{ width: `${gaugePercent}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                />
              </div>

              {/* Scale labels */}
              <div className="flex justify-between mt-2 text-xs text-slate-400">
                <span>0h</span>
                <span className="text-emerald-500 font-medium">2h</span>
                <span className="text-amber-500 font-medium">6h</span>
                <span>12h+</span>
              </div>

              {/* Threshold markers */}
              <div className="absolute top-0 left-[16.67%] w-px h-3 bg-emerald-300" />
              <div className="absolute top-0 left-[50%] w-px h-3 bg-amber-300" />
            </div>

            {/* Legend */}
            <div className="flex flex-wrap gap-4 mt-4 text-xs text-slate-500">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-emerald-500" /> &lt; 2h &mdash; Excellent
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-amber-500" /> 2&ndash;6h &mdash; Acceptable
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500" /> &gt; 6h &mdash; Needs Improvement
              </span>
            </div>
          </motion.div>

          {/* ── Recent Open SOS List ───────────────────────── */}
          <div>
            <h2 className="font-serif text-xl font-bold text-slate-900 mb-4">Recent Open SOS Requests</h2>

            {recentSos.length === 0 ? (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                className="flex flex-col items-center justify-center h-48 bg-white border border-slate-200 rounded-xl shadow-sm text-slate-400"
              >
                <CheckCircle size={32} className="mb-3 opacity-30" />
                <p className="text-sm font-medium">No open SOS requests</p>
                <p className="text-xs mt-1">All student requests have been addressed</p>
              </motion.div>
            ) : (
              <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
                {recentSos.map((sos) => {
                  const sc = statusConfig(sos.status);
                  return (
                    <motion.div key={sos.id} variants={item}
                      className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 hover:border-slate-300 transition-all"
                    >
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        {/* Left: student info */}
                        <div className="flex items-start gap-3 min-w-0">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                            <Users size={15} className="text-slate-500" />
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 text-sm truncate">
                              {sos.student_name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {sos.course_code}{sos.course_title ? <> &mdash; {sos.course_title}</> : ""}
                            </p>
                          </div>
                        </div>

                        {/* Right: badge + time */}
                        <div className="flex items-center gap-3 flex-shrink-0">
                          <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border ${sc.bg} ${sc.text} ${sc.border}`}>
                            <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                            {sc.label}
                          </span>
                          <span className="text-xs text-slate-400 flex items-center gap-1">
                            <Clock size={11} /> {timeAgo(sos.created_at)}
                          </span>
                        </div>
                      </div>

                      {/* Message */}
                      {sos.message && (
                        <div className="mt-3 flex items-start gap-2">
                          <MessageSquare size={13} className="text-slate-300 mt-0.5 flex-shrink-0" />
                          <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">
                            {sos.message}
                          </p>
                        </div>
                      )}

                      {/* Respond buttons */}
                      {respondingId !== sos.id && sos.status === "open" && (
                        <div className="mt-4 flex items-center gap-2">
                          <button
                            onClick={() => openRespondForm(sos.id)}
                            className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <ShieldCheck size={12} /> Acknowledge
                          </button>
                          <button
                            onClick={() => openRespondForm(sos.id, "resolved")}
                            className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition-colors"
                          >
                            <CheckCircle size={12} /> Resolve
                          </button>
                        </div>
                      )}

                      {/* Inline respond form */}
                      <AnimatePresence>
                        {respondingId === sos.id && (
                          <motion.div
                            key="respond-form"
                            initial={{ opacity: 0, height: 0 }}
                            animate={{ opacity: 1, height: "auto" }}
                            exit={{ opacity: 0, height: 0 }}
                            className="mt-4 border-t border-slate-100 pt-4 space-y-3 overflow-hidden"
                          >
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Respond to SOS</p>
                              <button onClick={closeRespondForm} className="text-slate-400 hover:text-slate-600 transition-colors">
                                <X size={14} />
                              </button>
                            </div>

                            {/* Status select */}
                            <div className="flex items-center gap-2">
                              <label className="text-xs font-medium text-slate-600">Status:</label>
                              <select
                                value={responseStatus}
                                onChange={(e) => setResponseStatus(e.target.value)}
                                className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                              >
                                <option value="acknowledged">Acknowledged</option>
                                <option value="resolved">Resolved</option>
                              </select>
                            </div>

                            {/* Note input */}
                            <textarea
                              value={responseNote}
                              onChange={(e) => setResponseNote(e.target.value)}
                              placeholder="Add a response note..."
                              rows={2}
                              className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 bg-white text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent resize-none"
                            />

                            {/* Submit */}
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => handleRespond(sos.id)}
                                disabled={responding}
                                className="flex items-center gap-1.5 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 disabled:opacity-50 px-4 py-2 rounded-lg transition-colors"
                              >
                                <Send size={11} /> {responding ? "Sending..." : "Submit Response"}
                              </button>
                              <button
                                onClick={closeRespondForm}
                                className="text-xs font-medium text-slate-500 hover:text-slate-700 px-3 py-2 transition-colors"
                              >
                                Cancel
                              </button>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </motion.div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
