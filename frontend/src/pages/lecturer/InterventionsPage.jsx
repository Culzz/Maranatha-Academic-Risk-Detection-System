/**
 * InterventionsPage — AI-generated guidance + send manual messages + reflections (KF2 weekly digest).
 * Real data: lecturersApi.getCourses, getInterventions, getCourseStudents,
 *            getReflections (KF2), sendMessage
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Send, CheckCircle, Clock, AlertTriangle, MessageSquare,
  BarChart2, BookOpen, ChevronDown, ChevronUp, XCircle, Zap, X, RefreshCw,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import Modal from "../../components/ui/Modal";
import CustomDropdown from "../../components/ui/CustomDropdown";
import { SuccessBanner, ErrorBanner } from "../../components/ui/Feedback";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { lecturersApi } from "../../services/api";
import { formatDate, initials } from "../../utils/helpers";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.26 } } };

const MOOD_EMOJI = { great: "😊", okay: "😐", struggling: "😟", lost: "😰" };

export default function InterventionsPage() {
  const { token } = useAuth();
  const [courses,       setCourses]       = useState([]);
  const [courseId,      setCourseId]      = useState("");
  const [students,      setStudents]      = useState([]);
  const [interventions, setInterventions] = useState([]);
  const [reflections,   setReflections]   = useState([]);
  const [manualOpen,    setManualOpen]    = useState(false);
  const [genOpen,       setGenOpen]       = useState(false);
  const [genStudentId,  setGenStudentId]  = useState("");
  const [genResult,     setGenResult]     = useState(null);
  const [genLoading,    setGenLoading]    = useState(false);
  const [genError,      setGenError]      = useState("");
  const [success,       setSuccess]       = useState("");
  const [error,         setError]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [recipient,     setRecipient]     = useState("");
  const [message,       setMessage]       = useState("");
  const [showReflect,   setShowReflect]   = useState(true); // KF2 panel collapsed state
  const [refreshTick, setRefreshTick] = useState(0);
  const [actionLoading, setActionLoading] = useState(null);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");
  const { on } = useRealtime();

  useEffect(() => {
    const unsub = on("intervention_created", () => setRefreshTick(t => t + 1));
    return () => unsub();
  }, [on]);

  // Load courses once
  useEffect(() => {
    if (!token) return;
    lecturersApi.getCourses(token)
      .then(cs => {
        const arr = Array.isArray(cs) ? cs : [];
        setCourses(arr);
        if (arr.length) setCourseId(String(arr[0].id ?? arr[0].course_id ?? ""));
      })
      .catch(() => {});
  }, [token]);

  // Load interventions, students (for recipient), and reflections (KF2) per course
  useEffect(() => {
    if (!courseId || !token) return;
    Promise.allSettled([
      lecturersApi.getInterventions(courseId, token),
      lecturersApi.getCourseStudents(courseId, token),
      lecturersApi.getReflections(courseId, token),
    ]).then(([iRes, sRes, rRes]) => {
      if (iRes.status === "fulfilled") setInterventions(Array.isArray(iRes.value) ? iRes.value : []);
      if (sRes.status === "fulfilled") setStudents(Array.isArray(sRes.value) ? sRes.value : []);
      if (rRes.status === "fulfilled") setReflections(Array.isArray(rRes.value) ? rRes.value : []);
    });
  }, [courseId, token, refreshTick]);

  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.id ?? c.course_id),
    label: `${c.course_code} — ${c.course_title}`,
  }));

  const atRiskStudents = students.filter(s => s.risk_level !== "Low");

  const statItems = [
    { label: "Total Sent",     value: interventions.length,                               icon: MessageSquare, color: "text-slate-900"  },
    { label: "Acknowledged",   value: interventions.filter(i => i.acknowledged).length,   icon: CheckCircle,   color: "text-emerald-600" },
    { label: "Pending Review", value: interventions.filter(i => !i.acknowledged).length,  icon: Clock,         color: "#d97706"          },
    { label: "Efficacy Rate",
      value: interventions.length > 0
        ? `${Math.round(interventions.filter(i => i.status === "completed").length / interventions.length * 100)}%`
        : "—",
      icon: BarChart2, color: "text-blue-600" },
  ];

  const handleSend = async () => {
    if (!recipient || !message.trim()) return;
    setLoading(true); setError("");
    try {
      await lecturersApi.sendMessage(recipient, message.trim(), Number(courseId), token);
      setManualOpen(false);
      setSuccess("Message sent and logged successfully.");
      setMessage(""); setRecipient("");
    } catch (e) {
      setError(e.message || "Failed to send message.");
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (interventionId, status) => {
    setActionLoading(interventionId);
    try {
      await lecturersApi.updateIntervention(interventionId, { status }, token);
      setSuccess(`Intervention marked as ${status}.`);
      setRefreshTick(t => t + 1);
    } catch (e) {
      setError(e.message || `Failed to mark as ${status}.`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleGenerate = async () => {
    if (!genStudentId || !courseId) { setGenError("Select a student first."); return; }
    setGenLoading(true); setGenError(""); setGenResult(null);
    try {
      const result = await lecturersApi.generateIntervention(genStudentId, Number(courseId), token);
      setGenResult(result);
      setRefreshTick(t => t + 1);
    } catch (e) {
      setGenError(e.message || "Failed to generate intervention.");
    } finally {
      setGenLoading(false);
    }
  };

  const handleBulkGenerate = async () => {
    if (!courseId) return;
    setBulkLoading(true); setError("");
    try {
      const result = await lecturersApi.bulkGenerateInterventions(Number(courseId), token);
      setSuccess(`Generated ${result.generated} intervention(s) for ${result.course}. ${result.skipped} skipped (cooldown or no risk data).`);
      setRefreshTick(t => t + 1);
    } catch (e) {
      setError(e.message || "Bulk generation failed.");
    } finally {
      setBulkLoading(false);
    }
  };

  // Intervention types for filter
  const interventionTypes = [...new Set(interventions.map(i => i.intervention_type || i.intervention_title || "Unknown").filter(Boolean))];
  const TYPE_FILTER_OPTIONS = [{ value: "", label: "All Types" }, ...interventionTypes.map(t => ({ value: t, label: t }))];

  // Filtered interventions
  const filteredInterventions = typeFilter
    ? interventions.filter(i => (i.intervention_type || i.intervention_title) === typeFilter)
    : interventions;

  // High risk count
  const highRiskCount = students.filter(s => s.risk_level === "High").length;

  return (
    <div className="space-y-8">

      {/* Header */}
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className="flex items-start justify-between gap-6 flex-wrap mb-2">
          <div className="max-w-2xl">
            <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Interventions</h1>
            <p className="text-lg text-slate-600">Guidance messages sent to students based on academic standing</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            {COURSE_OPTIONS.length > 1 && (
              <CustomDropdown
                value={courseId}
                onChange={setCourseId}
                options={COURSE_OPTIONS}
                placeholder="Select course"
                label="Course"
                className="w-72"
              />
            )}
            <Button onClick={() => { setGenStudentId(""); setGenResult(null); setGenError(""); setGenOpen(true); }}
              icon={<Zap size={14} />} variant="primary">
              New AI Intervention
            </Button>
            {highRiskCount > 0 && (
              <Button onClick={handleBulkGenerate} loading={bulkLoading}
                icon={<AlertTriangle size={14} />} variant="danger">
                Bulk ({highRiskCount} High Risk)
              </Button>
            )}
            <Button onClick={() => setManualOpen(true)} icon={<Send size={14} />} variant="gold">
              Send Message
            </Button>
          </div>
        </motion.div>
      </motion.div>

      <SuccessBanner message={success} />
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Stats */}
      <motion.div
        variants={container} initial="hidden" animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5"
      >
        {statItems.map(({ label, value, icon: Icon, color }) => (
          <motion.div
            key={label}
            variants={item}
            whileHover={{ y: -2 }}
            className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-6"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-semibold uppercase text-slate-500 tracking-wide">{label}</span>
              <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon size={16} className="text-slate-400" />
              </div>
            </div>
            <p
              className={`font-serif text-4xl font-bold leading-none ${!color?.startsWith("#") ? color : ""}`}
              style={{ color: color?.startsWith("#") ? color : undefined }}
            >
              {value}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* KF2 — Weekly Digest: Student Reflections panel */}
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setShowReflect(v => !v)}
          className="w-full flex items-center justify-between px-6 py-5 border-b border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <BookOpen size={16} className="text-amber-600" />
            </div>
            <div className="text-left">
              <h2 className="font-serif text-xl font-bold text-slate-900">Weekly Digest — Student Reflections</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {reflections.length} reflection{reflections.length !== 1 ? "s" : ""} this week
              </p>
            </div>
          </div>
          {showReflect ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        {showReflect && (
          <div>
            {reflections.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <BookOpen size={28} className="mb-3 opacity-30" />
                <p className="text-sm">No student reflections submitted yet for this course</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {reflections.map((r, i) => (
                  <motion.div
                    key={r.id ?? i}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.05, duration: 0.22 }}
                    className="px-6 py-5 hover:bg-slate-50/50 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-4 mb-2">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-accent font-bold flex-shrink-0"
                          style={{ fontSize: 10 }}
                        >
                          {initials(r.student_name || r.full_name || "?")}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-slate-900">{r.student_name || r.full_name}</p>
                          <p className="text-xs text-slate-500">Week {r.week_number} · {formatDate(r.created_at || r.submitted_at)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {r.mood && (
                          <span className="text-lg" title={r.mood}>{MOOD_EMOJI[r.mood] || "😐"}</span>
                        )}
                        {r.risk_level && <Badge variant="risk" level={r.risk_level} />}
                      </div>
                    </div>
                    {r.content && (
                      <p className="text-sm text-slate-600 leading-relaxed pl-12">{r.content}</p>
                    )}
                  </motion.div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Intervention list */}
      <div>
        <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
          <h2 className="font-serif text-2xl font-bold text-slate-900">Sent Guidance</h2>
          {interventionTypes.length > 1 && (
            <CustomDropdown
              value={typeFilter}
              onChange={setTypeFilter}
              options={TYPE_FILTER_OPTIONS}
              placeholder="Filter by type"
              className="w-56"
            />
          )}
        </div>
        {filteredInterventions.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl py-16 text-center text-slate-400">
            <MessageSquare size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No interventions sent yet for this course</p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredInterventions.map((intv, i) => {
              const isHigh = intv.high_priority || intv.risk_level === "High";
              return (
                <motion.div
                  key={intv.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.26 }}
                  whileHover={{ y: -1 }}
                  className={[
                    "border-l-4 border-t border-r border-b border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-6",
                    isHigh ? "border-l-risk-high" : "border-l-amber-400",
                  ].join(" ")}
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
                    <div>
                      <p className="text-base font-semibold text-slate-900 mb-1">
                        {intv.intervention_title || intv.title || "Guidance Message"}
                      </p>
                      <p className="text-sm text-slate-500">
                        {intv.course_code} · {intv.course_title || intv.student_name}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
                      <Badge variant="status" label={isHigh ? "High Priority" : "Advisory"} color={isHigh ? "red" : "amber"} />
                      <Badge variant="status" label={intv.acknowledged ? "Acknowledged" : "Pending"} color={intv.acknowledged ? "green" : "slate"} />
                    </div>
                  </div>

                  <p className="text-sm text-slate-600 leading-relaxed mb-4">
                    {intv.ai_content || intv.content || intv.message}
                  </p>

                  <div className="flex items-center justify-between gap-4 text-xs text-slate-400 pt-4 border-t border-slate-100">
                    <div className="flex items-center gap-4">
                      <span className="flex items-center gap-1.5">
                        <Clock size={11} /> {formatDate(intv.recommended_at || intv.created_at)}
                      </span>
                      {intv.acknowledged && (
                        <span className="flex items-center gap-1.5 text-emerald-600">
                          <CheckCircle size={11} /> Student acknowledged
                        </span>
                      )}
                    </div>
                    {intv.status !== "completed" && intv.status !== "dismissed" && (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleUpdateStatus(intv.id, "completed")}
                          disabled={actionLoading === intv.id}
                          className="flex items-center gap-1 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors disabled:opacity-50"
                        >
                          <CheckCircle size={12} /> Complete
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(intv.id, "dismissed")}
                          disabled={actionLoading === intv.id}
                          className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-500 transition-colors disabled:opacity-50"
                        >
                          <XCircle size={12} /> Dismiss
                        </button>
                      </div>
                    )}
                    {(intv.status === "completed" || intv.status === "dismissed") && (
                      <span className={`text-xs font-semibold ${intv.status === "completed" ? "text-emerald-600" : "text-slate-400"}`}>
                        {intv.status === "completed" ? "Completed" : "Dismissed"}
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Intervention generation modal */}
      {genOpen && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
                  <Zap size={18} className="text-accent" /> New AI Intervention
                </h3>
                <p className="text-sm text-slate-500 mt-1">
                  {genResult ? "Review the generated message below." : "Select an at-risk student to generate a personalised AI intervention."}
                </p>
              </div>
              <button onClick={() => setGenOpen(false)} className="p-1.5 hover:bg-slate-100 rounded-xl">
                <X size={16} className="text-slate-400" />
              </button>
            </div>

            {!genResult ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">At-Risk Student</label>
                  <CustomDropdown
                    value={genStudentId}
                    onChange={setGenStudentId}
                    placeholder="Select student (Medium or High risk only)"
                    options={atRiskStudents.map(s => ({
                      value: String(s.student_id || s.id),
                      label: `${s.full_name} — ${s.risk_level || "At Risk"} (${s.matric_number || ""})`,
                    }))}
                  />
                  {atRiskStudents.length === 0 && (
                    <p className="text-xs text-slate-400 mt-1">No at-risk students in this course.</p>
                  )}
                </div>
                {genError && <p className="text-xs text-red-500">{genError}</p>}
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setGenOpen(false)}
                    className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleGenerate} disabled={genLoading || !genStudentId}
                    className="flex-1 py-2 bg-primary text-white font-semibold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-primary/90 transition-colors">
                    {genLoading ? <><RefreshCw size={13} className="animate-spin" /> Generating…</> : <><Zap size={13} /> Generate</>}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Generated for {genResult.student}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${genResult.risk_level === "High" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>
                      {genResult.risk_level} Risk
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">Type: {genResult.intervention_type}</p>
                  <div className="border-t border-slate-200 pt-3">
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{genResult.ai_content}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 text-xs text-emerald-700">
                  <CheckCircle size={13} className="shrink-0" />
                  Intervention saved and student notified.
                </div>
                <button onClick={() => setGenOpen(false)}
                  className="w-full py-2 bg-primary text-white font-semibold rounded-xl text-sm hover:bg-primary/90 transition-colors">
                  Done
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}

      {/* Manual message modal */}
      <Modal
        open={manualOpen}
        onClose={() => setManualOpen(false)}
        title="Send Student Message"
        subtitle="Your message will appear on the student's dashboard and be logged."
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setManualOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={handleSend} icon={<Send size={13} />}>Send Message</Button>
          </>
        }
      >
        <div className="space-y-4">
          <CustomDropdown
            label="Student"
            placeholder="Select a student"
            value={recipient}
            onChange={setRecipient}
            options={atRiskStudents.map(s => ({
              value: String(s.student_id ?? s.id),
              label: `${s.full_name || s.name} (${s.matric_number}) — ${s.risk_level} Risk`,
            }))}
          />
          <div>
            <label htmlFor="intervention-message" className="ds-label">Message</label>
            <textarea
              id="intervention-message"
              value={message}
              onChange={e => setMessage(e.target.value)}
              rows={5}
              placeholder="Write your message here..."
              className="ds-textarea"
            />
          </div>
          <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-amber-700">This message will be logged in the audit trail and attributed to you.</p>
          </div>
        </div>
      </Modal>
    </div>
  );
}
