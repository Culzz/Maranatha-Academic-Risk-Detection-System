/**
 * OverviewPage — Student academic progress overview.
 * H1: Real API + Killer Features 1, 3, 4, 9, 10
 *   KF1 — Risk level change banner
 *   KF3 — Intervention acknowledgement (will_act / need_help)
 *   KF4 — Self-reflection submission
 *   KF9 — PDF download of risk report
 *   KF10 — Plain-language risk explanation
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  BookOpen, AlertTriangle, AlertCircle, Clock,
  TrendingUp, TrendingDown, CheckCircle2,
  ArrowUp, Sparkles, FileDown, MessageSquare, X, Loader, LifeBuoy, ChevronDown, ChevronRight,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine,
} from "recharts";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { useLayout } from "../../context/LayoutContext";
import { useNavigate } from "react-router-dom";
import { studentsApi, riskApi, sosApi } from "../../services/api";
import { riskColors, formatDate, RISK_COLORS, formatCourseCode } from "../../utils/helpers";
import { getGreeting, firstName, getHolidayGreeting } from "../../utils/greetings";
import useRealTimeClock from "../../hooks/useRealTimeClock";
import useWeekInfo from "../../hooks/useWeekInfo";
import useCountUp from "../../hooks/useCountUp";
import QuizPatternBadges from "../../components/shared/QuizPatternBadges";
import SemesterWeekTracker from "../../components/shared/SemesterWeekTracker";
import CustomDropdown from "../../components/ui/CustomDropdown";
import { SkeletonDashboard } from "../../components/ui/Skeleton";


const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const it = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  const pct = Math.round(payload[0].value * 100);
  return (
    <div className="bg-white border border-slate-200 shadow-lg p-4 rounded-xl">
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <p className="text-lg font-bold text-slate-900">{pct}% risk</p>
    </div>
  );
};

function StatCard({ label, value, sub, icon: Icon, valueColor = "text-slate-900", trend, layout = "default", weekChange }) {
  const animatedValue = useCountUp(Number(value) || 0, 800, 0);

  if (layout === "compact") {
    return (
      <motion.div variants={it} whileHover={{ y: -1 }}
        className="border border-slate-100 rounded-2xl bg-white shadow-sm hover:shadow-premium-sm transition-all duration-200 p-3">
        <div className="flex items-center gap-3">
          <div className="icon-container--sm icon-container flex-shrink-0">
            <Icon size={14} />
          </div>
          <div className="min-w-0 flex-1">
            <span className="text-[10px] font-semibold uppercase text-slate-500 tracking-wide">{label}</span>
            <div className="flex items-baseline gap-2">
              <p className={`font-serif text-2xl font-bold leading-none ${valueColor}`}>{animatedValue}</p>
              <p className="text-xs text-slate-500 truncate">{sub}</p>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div variants={it} whileHover={{ y: -2 }}
      className="border border-slate-100 rounded-2xl bg-white shadow-premium-sm hover:shadow-premium transition-all duration-200 p-6">
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase text-slate-500 tracking-wide">{label}</span>
        <div className="icon-container">
          <Icon size={16} />
        </div>
      </div>
      <p className={`font-serif text-4xl font-bold leading-none mb-2 ${valueColor}`}>{animatedValue}</p>
      <p className="text-sm text-slate-600 flex items-center gap-1.5">
        {trend === "up"   && <TrendingUp   size={14} className="text-amber-500"   />}
        {trend === "down" && <TrendingDown  size={14} className="text-emerald-500" />}
        {sub}
      </p>
      {layout === "detailed" && weekChange !== undefined && (
        <p className={`text-xs mt-2 flex items-center gap-1 ${weekChange > 0 ? "text-red-500" : weekChange < 0 ? "text-emerald-500" : "text-slate-400"}`}>
          {weekChange > 0 ? <TrendingUp size={12} /> : weekChange < 0 ? <TrendingDown size={12} /> : null}
          {weekChange > 0 ? `+${weekChange}` : weekChange < 0 ? weekChange : "No change"} vs last week
        </p>
      )}
    </motion.div>
  );
}

const COMPASSIONATE_LABELS = {
  High:   "Needs Extra Support",
  Medium: "Monitor Closely",
  Low:    "On Track",
};

const STATE_BADGES = {
  CRITICAL:   { label: "Critical",   cls: "bg-red-100 text-red-700" },
  STRUGGLING: { label: "Struggling", cls: "bg-amber-100 text-amber-700" },
  STABLE:     { label: "Stable",     cls: "bg-slate-100 text-slate-600" },
  IMPROVING:  { label: "Improving",  cls: "bg-blue-100 text-blue-700" },
  RECOVERING: { label: "Recovering", cls: "bg-emerald-100 text-emerald-700" },
  THRIVING:   { label: "Thriving",   cls: "bg-emerald-100 text-emerald-700" },
};

const COMPASSIONATE_SUBTITLES = {
  High:   "This is an early warning, not a prediction of failure. Here\u2019s what\u2019s driving it.",
  Medium: "You\u2019re close to getting on track. Small changes can make a big difference.",
};

function CourseRiskCard({ r, onExplain, layout = "default" }) {
  const c = riskColors(r.risk_level);
  const shapEntries = r.shap_explanation ? Object.entries(r.shap_explanation) : [];
  const fs = r.feature_snapshot || {};

  // Risk velocity arrow
  const vel = fs.risk_velocity ?? null;
  const velDisplay = vel === null ? null
    : vel >= 0.05 ? { icon: "↑↑", cls: "text-red-500",     label: "Rising fast" }
    : vel > 0.01  ? { icon: "↑",  cls: "text-amber-500",   label: "Rising" }
    : vel < -0.01 ? { icon: "↓",  cls: "text-emerald-500", label: "Improving" }
    :                { icon: "→",  cls: "text-slate-400",   label: "Stable" };

  if (layout === "compact") {
    return (
      <motion.div variants={it} whileHover={{ y: -1 }}
        className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-slate-900 truncate">{formatCourseCode(r.course_code)}</p>
              <span className={`inline-flex items-center gap-1.5 text-[10px] font-semibold px-2 py-0.5 rounded-lg ${c.text} ${c.bg}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
                {Math.round((r.risk_probability || 0) * 100)}%
              </span>
            </div>
            <p className="text-xs text-slate-500 truncate">{r.course_title}</p>
          </div>
          {onExplain && (
            <button onClick={() => onExplain(r)}
              className="text-xs font-semibold text-accent hover:text-accent-dark transition-colors flex-shrink-0">
              <Sparkles size={12} />
            </button>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div variants={it} whileHover={{ y: -2 }}
      className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{formatCourseCode(r.course_code)}</p>
          <p className="text-lg font-bold text-slate-900 leading-tight">{r.course_title}</p>
        </div>
        <span aria-live="polite" className={`inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl ${c.text} ${c.bg}`}>
          <span className={`w-2 h-2 rounded-full ${c.dot}`} />
          {COMPASSIONATE_LABELS[r.risk_level] || r.risk_level}
        </span>
        {r.student_state && STATE_BADGES[r.student_state] && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${STATE_BADGES[r.student_state].cls}`}>
            {STATE_BADGES[r.student_state].label}
          </span>
        )}
      </div>

      <div className="mb-4">
        <div className="flex justify-between text-xs text-slate-500 mb-2">
          <span>Risk Level</span>
          <span className="font-semibold flex items-center gap-1.5">
            {Math.round((r.risk_probability || 0) * 100)}%
            {velDisplay && (
              <>
                <span aria-hidden="true" className={`${velDisplay.cls} font-bold`} title={velDisplay.label}>{velDisplay.icon}</span>
                <span className="sr-only">{velDisplay.label}</span>
              </>
            )}
          </span>
        </div>
        <div
          role="progressbar"
          aria-valuenow={Math.round((r.risk_probability || 0) * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Risk probability ${Math.round((r.risk_probability || 0) * 100)}%`}
          className="h-2 bg-slate-100 rounded-full overflow-hidden"
        >
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(r.risk_probability || 0) * 100}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ backgroundColor: c.bar }}
          />
        </div>
      </div>

      {COMPASSIONATE_SUBTITLES[r.risk_level] && (
        <p className="text-xs text-slate-500 italic mb-3 leading-relaxed">
          {COMPASSIONATE_SUBTITLES[r.risk_level]}
        </p>
      )}

      {/* v4 feature indicators */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {fs.sgpa_delta != null && fs.sgpa_delta !== 0 && (
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${fs.sgpa_delta > 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"}`}>
            SGPA {fs.sgpa_delta > 0 ? "+" : ""}{(fs.sgpa_delta).toFixed(2)}
          </span>
        )}
        {(fs.weekly_checkin_streak ?? 0) > 0 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700">
            {fs.weekly_checkin_streak}-week streak
          </span>
        )}
        {(fs.material_access_rate ?? 1) < 0.3 && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-amber-50 text-amber-700">
            Low material access
          </span>
        )}
      </div>

      {/* Detailed: SHAP feature importance bars */}
      {layout === "detailed" && shapEntries.length > 0 && (
        <div className="mb-4 space-y-1.5">
          <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wide mb-1">Key Factors</p>
          {shapEntries.slice(0, 4).map(([feature, importance]) => {
            const pct = Math.min(Math.abs(importance) * 100, 100);
            const isPositive = importance > 0;
            return (
              <div key={feature} className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500 w-24 truncate flex-shrink-0">{feature.replace(/_/g, " ")}</span>
                <span className={`w-5 text-center text-[11px] font-bold flex-shrink-0 ${isPositive ? "text-red-500" : "text-emerald-600"}`}>
                  {isPositive ? "+" : "−"}
                </span>
                <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    aria-label={`${feature.replace(/_/g, " ")}: ${isPositive ? "increases" : "reduces"} risk (${Math.round(pct)}%)`}
                    className={`h-full rounded-full ${isPositive ? "bg-red-400" : "bg-emerald-400"}`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>Week {r.week_number}</span>
        {onExplain && (
          <button onClick={() => onExplain(r)}
            className="flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-dark transition-colors">
            <Sparkles size={11} /> Explain
          </button>
        )}
      </div>
    </motion.div>
  );
}

function AcknowledgeModal({ intervention, token, onClose, onDone }) {
  const [willAct,  setWillAct]  = useState(null);
  const [needHelp, setNeedHelp] = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");

  const submit = async () => {
    if (willAct === null || needHelp === null) { setError("Please answer both questions."); return; }
    setLoading(true); setError("");
    try {
      await studentsApi.acknowledgeIntervention(
        intervention.id,
        { will_act: willAct, need_help: needHelp },
        token,
      );
      onDone(); onClose();
    } catch (e) { setError(e.message || "Failed to save."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        role="dialog" aria-modal="true" aria-labelledby="ack-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
        <div className="flex items-start justify-between mb-4">
          <h3 id="ack-modal-title" className="font-serif text-xl font-bold text-slate-900">Acknowledge Guidance</h3>
          <button onClick={onClose} aria-label="Close dialog" className="p-1.5 hover:bg-slate-100 rounded-xl"><X size={16} className="text-slate-400" /></button>
        </div>
        <p className="text-sm text-slate-600 mb-6 leading-relaxed">{intervention.ai_content || intervention.message}</p>
        {[
          { q: "Will you act on this guidance?", val: willAct, set: setWillAct },
          { q: "Do you need additional help?",   val: needHelp, set: setNeedHelp },
        ].map(({ q, val, set }) => (
          <div key={q} className="mb-4">
            <p className="text-sm font-semibold text-slate-900 mb-2">{q}</p>
            <div className="flex gap-3">
              {[true, false].map(v => (
                <button key={String(v)} onClick={() => set(v)}
                  className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                    val === v ? "bg-primary text-white border-primary" : "bg-white border-slate-200 text-slate-600 hover:border-slate-300"
                  }`}>
                  {v ? "Yes" : "No"}
                </button>
              ))}
            </div>
          </div>
        ))}
        {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
        <button onClick={submit} disabled={loading}
          className="mt-5 w-full bg-primary text-white font-semibold h-10 rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
          {loading ? <><Loader size={13} className="animate-spin" /> Saving...</> : "Submit Response"}
        </button>
      </motion.div>
    </div>
  );
}

function ReflectionModal({ riskScore, courseId, token, onClose }) {
  const [mood,    setMood]    = useState("");
  const [text,    setText]    = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [done,    setDone]    = useState(false);

  const MOOD_MAP = {
    "Struggling":       "struggling",
    "Needs Improvement":"needs_help",
    "Good":             "on_track",
    "Confident":        "on_track",
  };

  const submit = async () => {
    if (!text.trim()) { setError("Please write a reflection."); return; }
    setLoading(true); setError("");
    try {
      await studentsApi.submitReflection({
        course_id:   courseId,
        week_number: riskScore?.week_number || 1,
        response:    MOOD_MAP[mood] || "on_track",
        note:        text.trim(),
      }, token);
      setDone(true);
      setTimeout(onClose, 1400);
    } catch (e) { setError(e.message || "Failed to save."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        role="dialog" aria-modal="true" aria-labelledby="reflection-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
        {done ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 size={40} className="text-emerald-500 mb-3" />
            <p className="font-serif text-lg font-bold text-slate-900">Reflection saved!</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <h3 id="reflection-modal-title" className="font-serif text-xl font-bold text-slate-900">Weekly Reflection</h3>
              <button onClick={onClose} aria-label="Close dialog" className="p-1.5 hover:bg-slate-100 rounded-xl"><X size={16} className="text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-5">How are you feeling about your progress this week?</p>
            <div className="flex flex-wrap gap-2 mb-5">
              {["Struggling", "Needs Improvement", "Good", "Confident"].map(m => (
                <button key={m} onClick={() => setMood(m)}
                  className={`px-3 py-2 rounded-xl text-sm font-medium border transition-all ${
                    mood === m ? "bg-primary text-white border-primary" : "bg-slate-50 border-slate-200 text-slate-700"
                  }`}>{m}
                </button>
              ))}
            </div>
            <textarea value={text} onChange={e => setText(e.target.value)} rows={4}
              placeholder="Write your thoughts for this week..."
              className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 resize-none" />
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={submit} disabled={loading}
                className="flex-1 py-2 bg-primary text-white font-semibold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? <><Loader size={13} className="animate-spin" /> Saving...</> : "Submit"}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

function ExplainModal({ riskScore, token, onClose }) {
  const [explanation, setExplanation] = useState("");
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  useEffect(() => {
    riskApi.explain({
      shap_explanation: riskScore.shap_explanation || {},
      student_name:     "",
      course_title:     riskScore.course_title,
      risk_level:       riskScore.risk_level,
      week_number:      riskScore.week_number,
    }, token)
      .then(res => setExplanation(res.explanation || res.message || String(res)))
      .catch(e  => setError(e.message || "Could not load explanation."))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        role="dialog" aria-modal="true" aria-labelledby="explain-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 id="explain-modal-title" className="font-serif text-xl font-bold text-slate-900">Your Risk Explained</h3>
            <p className="text-sm text-slate-500">{formatCourseCode(riskScore.course_code)} — Week {riskScore.week_number}</p>
          </div>
          <button onClick={onClose} aria-label="Close dialog" className="p-1.5 hover:bg-slate-100 rounded-xl"><X size={16} className="text-slate-400" /></button>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader size={24} className="animate-spin text-accent" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 py-4">{error}</p>
        ) : (
          <p className="text-slate-700 text-sm leading-relaxed py-2">{explanation}</p>
        )}
        <button onClick={onClose}
          className="mt-5 w-full border border-slate-200 text-slate-600 font-semibold h-10 rounded-xl text-sm hover:bg-slate-50 transition-colors">
          Close
        </button>
      </motion.div>
    </div>
  );
}

function SosModal({ token, courses, onClose }) {
  const [courseId,  setCourseId]  = useState("");
  const [category,  setCategory]  = useState("academic");
  const [message,   setMessage]   = useState("");
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");
  const [done,      setDone]      = useState(false);

  const submit = async () => {
    if (!courseId) { setError("Please select a course."); return; }
    setLoading(true); setError("");
    try {
      await sosApi.sendSos({ course_id: Number(courseId), category, message: message.trim() || undefined }, token);
      setDone(true);
      setTimeout(onClose, 1800);
    } catch (e) { setError(e.message || "Failed to send SOS."); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
        role="dialog" aria-modal="true" aria-labelledby="sos-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md p-6">
        {done ? (
          <div className="flex flex-col items-center py-8 text-center">
            <CheckCircle2 size={40} className="text-emerald-500 mb-3" />
            <p className="font-serif text-lg font-bold text-slate-900">Help request sent!</p>
            <p className="text-sm text-slate-500 mt-1">The right support staff have been notified.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-4">
              <h3 id="sos-modal-title" className="font-serif text-xl font-bold text-slate-900">Request Help</h3>
              <button onClick={onClose} aria-label="Close dialog" className="p-1.5 hover:bg-slate-100 rounded-xl"><X size={16} className="text-slate-400" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-5">Send an urgent request for support. Your request will be routed to the right person based on the category selected.</p>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-1">Course</label>
                <CustomDropdown
                  value={courseId}
                  onChange={(val) => setCourseId(val)}
                  options={courses.map(c => ({
                    value: String(c.course_id || c.id),
                    label: `${formatCourseCode(c.course_code)} — ${c.course_title}`,
                  }))}
                  placeholder="Select course..."
                  searchable
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-1">Category</label>
                <CustomDropdown
                  value={category}
                  onChange={(val) => setCategory(val)}
                  options={[
                    { value: "academic",  label: "Academic — Course difficulty, grades" },
                    { value: "financial", label: "Financial — Fees, resources" },
                    { value: "emotional", label: "Emotional — Stress, wellbeing" },
                    { value: "health",    label: "Health — Physical / mental health" },
                  ]}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-900 mb-1">Message <span className="text-slate-400 font-normal">(optional)</span></label>
                <textarea value={message} onChange={e => setMessage(e.target.value)} rows={3}
                  placeholder="Describe what you need help with..."
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 resize-none" />
              </div>
            </div>
            {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            <div className="flex gap-3 mt-5">
              <button onClick={onClose} className="flex-1 py-2 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">Cancel</button>
              <button onClick={submit} disabled={loading}
                className="flex-1 py-2 bg-red-600 text-white font-semibold rounded-xl text-sm disabled:opacity-50 flex items-center justify-center gap-2 hover:bg-red-700 transition-colors">
                {loading ? <><Loader size={13} className="animate-spin" /> Sending...</> : <><LifeBuoy size={14} /> Send SOS</>}
              </button>
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

export default function OverviewPage() {
  const { token, user } = useAuth();
  const navigate = useNavigate();
  const { layout } = useLayout();
  const { dateStr, timeStr } = useRealTimeClock();
  const mountedRef = useRef(true);
  const { weekInfo, weekInfoLoading } = useWeekInfo();
  const greeting = useMemo(() => getHolidayGreeting(firstName(user?.full_name || ""), weekInfo?.current_holiday), [user?.full_name, weekInfo?.current_holiday]);
  const [riskScores,     setRiskScores]     = useState([]);
  const [interventions,  setInterventions]  = useState([]);
  const [enrolledCourses, setEnrolledCourses] = useState([]);
  const [loading,        setLoading]        = useState(true);
  const [acknowledging,  setAcknowledging]  = useState(null);
  const [reflecting,     setReflecting]     = useState(null);
  const [explaining,     setExplaining]     = useState(null);
  const [showSos,        setShowSos]        = useState(false);
  const [chartExpanded,  setChartExpanded]  = useState(layout !== "compact");
  const [weeklyPlan,     setWeeklyPlan]     = useState(null);
  const [planLoading,    setPlanLoading]    = useState(false);
  const [planExpanded,   setPlanExpanded]   = useState(false);

  useEffect(() => { return () => { mountedRef.current = false; }; }, []);

  const fetchAll = useCallback(async () => {
    try {
      const overview = await studentsApi.getOverview(token);
      if (!mountedRef.current) return;
      setRiskScores(Array.isArray(overview?.risk_scores) ? overview.risk_scores : []);
      setInterventions(Array.isArray(overview?.interventions) ? overview.interventions : []);
      setEnrolledCourses(Array.isArray(overview?.courses) ? overview.courses : []);
    } catch {
      const [scores, intv, courses] = await Promise.allSettled([
        studentsApi.getRiskScores(token),
        studentsApi.getInterventions(token),
        studentsApi.getMyCourses(token),
      ]);
      if (!mountedRef.current) return;
      if (scores.status   === "fulfilled") setRiskScores(Array.isArray(scores.value)   ? scores.value   : []);
      if (intv.status     === "fulfilled") setInterventions(Array.isArray(intv.value)   ? intv.value     : []);
      if (courses.status  === "fulfilled") setEnrolledCourses(Array.isArray(courses.value) ? courses.value : []);
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Real-time: refetch on risk, intervention, or result events
  const { on } = useRealtime();
  useEffect(() => {
    const u1 = on("risk_changed", fetchAll);
    const u2 = on("intervention_created", fetchAll);
    const u3 = on("result_released", fetchAll);
    return () => { u1(); u2(); u3(); };
  }, [on]);

  // KF1 — Risk level change banner
  const degradedCourse = riskScores.find(r =>
    r.previous_risk_level && r.previous_risk_level !== r.risk_level &&
    (r.risk_level === "High" || (r.risk_level === "Medium" && r.previous_risk_level === "Low"))
  );

  const high    = riskScores.filter(r => r.risk_level === "High").length;
  const medium  = riskScores.filter(r => r.risk_level === "Medium").length;
  const pending = interventions.filter(i => !i.acknowledged_by_student).length;

  // Weekly study plan generation
  const generatePlan = async () => {
    setPlanLoading(true);
    try {
      const data = await studentsApi.getWeeklyPlan(token);
      setWeeklyPlan(data?.plan || "Unable to generate plan.");
      setPlanExpanded(true);
    } catch {
      setWeeklyPlan("Failed to generate study plan. Try again later.");
      setPlanExpanded(true);
    } finally {
      setPlanLoading(false);
    }
  };

  // KF9 — PDF download
  const downloadPDF = async () => {
    try {
      const { default: jsPDF }      = await import("jspdf");
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      doc.setFontSize(18);
      doc.text("Academic Risk Report", 20, 20);
      doc.setFontSize(12);
      doc.text(`Student: ${user?.full_name || ""}`, 20, 32);
      doc.text(`Generated: ${new Date().toLocaleDateString("en-GB")}`, 20, 40);
      let y = 54;
      riskScores.forEach(r => {
        doc.setFontSize(12);
        doc.text(`${formatCourseCode(r.course_code)} — ${r.course_title}`, 20, y);
        doc.setFontSize(10);
        doc.text(`Risk Level: ${r.risk_level}  |  Week: ${r.week_number}  |  Score: ${Math.round((r.risk_probability || 0) * 100)}%`, 20, y + 7);
        y += 18;
        if (y > 270) { doc.addPage(); y = 20; }
      });
      doc.save("maranatha-risk-report.pdf");
    } catch {}
  };

  if (loading) return <SkeletonDashboard />;

  const chartData = riskScores.length
    ? riskScores.map(r => ({
        label: r.course_code || `Course`,
        prob: r.risk_probability || 0,
        course_title: r.course_title || "",
      }))
    : [];

  return (
    <div className={`relative ${layout === "compact" ? "space-y-4" : "space-y-8"}`}>

      {/* Background watermark */}
      <span className="watermark-text top-0 right-0">RISK</span>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
        <div>
          <h1 className="headline-mixed text-2xl mt-2">
            {greeting}{" "}
            <em>here&apos;s your overview.</em>
          </h1>
          <p className="text-sm text-slate-500 mt-1">{dateStr} &middot; {timeStr}</p>
        </div>
        {high > 0 && (
          <motion.button whileTap={{ scale: 0.96 }} onClick={() => setShowSos(true)}
            className="flex items-center gap-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors shadow-sm">
            <LifeBuoy size={16} /> Request Help
          </motion.button>
        )}
      </div>

      {/* Quiz pattern badges */}
      <QuizPatternBadges studentId={user?.user_id || user?.id} />

      {/* Semester week tracker */}
      <SemesterWeekTracker weekInfo={weekInfo} loading={weekInfoLoading} />

      {/* KF1 — Risk level change banner */}
      <AnimatePresence>
        {degradedCourse && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-4 bg-amber-50 border border-amber-200 rounded-xl p-5">
            <div className="w-10 h-10 bg-amber-100 border border-amber-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <ArrowUp size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-800 mb-1">Risk level increased in {formatCourseCode(degradedCourse.course_code)}</p>
              <p className="text-amber-700 text-sm">
                Your risk moved from <span className="font-semibold">{degradedCourse.previous_risk_level}</span> to{" "}
                <span className="font-semibold">{degradedCourse.risk_level}</span> this week.
                Review your engagement and consider speaking with your lecturer.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* No risk data yet — info banner */}
      {riskScores.length === 0 && enrolledCourses.length > 0 && (
        <div className="flex items-start gap-4 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <BookOpen size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-blue-800 mb-1">No risk data yet</p>
            <p className="text-blue-700 text-sm">
              Risk scores are computed as you engage with courses. Attend classes,
              submit assignments, and take quizzes to see your academic risk profile.
            </p>
          </div>
        </div>
      )}

      {/* Stats */}
      <motion.div variants={container} initial="hidden" animate="show"
        className={`grid ${layout === "compact" ? "grid-cols-2 lg:grid-cols-4 gap-3" : "grid-cols-2 lg:grid-cols-4 gap-6"}`}>
        <StatCard label="Enrolled"        value={enrolledCourses.length} sub="Courses this semester" icon={BookOpen}      layout={layout} />
        <StatCard label="Needs Attention" value={high}              sub="Courses at risk"       icon={AlertTriangle} valueColor="text-risk-high" layout={layout} />
        <StatCard label="Monitor"         value={medium}            sub="Showing decline"       icon={AlertCircle}   valueColor="text-amber-600" layout={layout} />
        <StatCard label="Guidance"        value={pending}           sub="Open actions"          icon={Clock}         valueColor="text-emerald-600" layout={layout} />
      </motion.div>

      {/* Chart */}
      {chartData.length > 0 && (
        <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-6">
          <div className="flex items-start justify-between mb-4 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              {layout === "compact" && (
                <button onClick={() => setChartExpanded(v => !v)}
                  className="p-1 hover:bg-slate-100 rounded-lg transition-colors">
                  {chartExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />}
                </button>
              )}
              <div>
                <h2 className="font-serif text-2xl font-bold text-slate-900 mb-1">Risk Overview</h2>
                <p className="text-sm text-slate-500">Current risk probability per course</p>
              </div>
            </div>
            <div className="text-sm font-semibold text-slate-900 bg-slate-100 px-3 py-1.5 rounded-xl">
              {riskScores.length} course{riskScores.length !== 1 ? "s" : ""}
            </div>
          </div>
          {(layout !== "compact" || chartExpanded) && (
            <div className="h-64 mb-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid stroke="#f8fafc" vertical={false} />
                  <ReferenceLine y={0.6} stroke={RISK_COLORS.high.text} strokeDasharray="4 4" strokeOpacity={0.5} />
                  <ReferenceLine y={0.3} stroke={RISK_COLORS.medium.text} strokeDasharray="4 4" strokeOpacity={0.5} />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tickMargin={8} tick={{ fontSize: 12, fill: "#94a3b8" }} />
                  <YAxis tickCount={4}   axisLine={false} tickLine={false} tickMargin={8} tick={{ fontSize: 12, fill: "#94a3b8" }} domain={[0, 1]} />
                  <Tooltip content={<ChartTooltip />} />
                  <Bar dataKey="prob" fill={RISK_COLORS.high.text} radius={[6,6,0,0]} maxBarSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Course Standing */}
      <div>
        <div className={`flex items-center justify-between ${layout === "compact" ? "mb-4" : "mb-8"} flex-wrap gap-4`}>
          <div>
            <h2 className="font-serif text-2xl font-bold text-slate-900 mt-2">Your Courses</h2>
          </div>
          <div className="flex items-center gap-3">
            <motion.button whileTap={{ scale: 0.96 }} onClick={() => {
                setReflecting(riskScores[0] || { week_number: 1 });
              }}
              className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-9 rounded-xl transition-all">
              <MessageSquare size={13} /> Weekly Reflection
            </motion.button>
            <motion.button whileTap={{ scale: 0.96 }} onClick={downloadPDF}
              className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-9 rounded-xl transition-all">
              <FileDown size={13} /> Download Report
            </motion.button>
          </div>
        </div>
        {riskScores.length === 0 && enrolledCourses.length === 0 ? (
          <div className="text-center py-16 border border-slate-200 rounded-xl bg-white">
            <BookOpen size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No enrolled courses found for this session</p>
          </div>
        ) : riskScores.length === 0 ? (
          <motion.div variants={container} initial="hidden" animate="show"
            className={`grid ${layout === "compact"
              ? "grid-cols-1 sm:grid-cols-2 gap-3"
              : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"}`}>
            {enrolledCourses.map(c => (
              <motion.div key={formatCourseCode(c.course_code)} variants={it}
                className="border border-slate-200 rounded-xl bg-white shadow-sm p-6">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{formatCourseCode(c.course_code)}</p>
                <p className="text-lg font-bold text-slate-900 leading-tight mb-4">{c.course_title}</p>
                <span className="inline-flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-xl text-slate-600 bg-slate-100">
                  <span className="w-2 h-2 rounded-full bg-slate-400" /> Awaiting assessment
                </span>
              </motion.div>
            ))}
          </motion.div>
        ) : (
          <>
          {/* Next Best Action */}
          {(() => {
            const actionItem = riskScores
              .filter(r => r.risk_level !== "Low" && r.next_best_action)
              .sort((a, b) => (b.risk_probability || 0) - (a.risk_probability || 0))[0];
            if (!actionItem) return null;
            return (
              <motion.div variants={it} initial="hidden" animate="show"
                className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-500 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-semibold text-amber-900">Your Next Best Action</p>
                  <p className="text-sm text-amber-800 mt-1">{actionItem.next_best_action}</p>
                  <p className="text-xs text-amber-600 mt-1">{formatCourseCode(actionItem.course_code)}</p>
                </div>
              </motion.div>
            );
          })()}
          <motion.div variants={container} initial="hidden" animate="show"
            className={`grid ${layout === "compact"
              ? "grid-cols-1 sm:grid-cols-2 gap-3"
              : "grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"}`}>
            {riskScores.map(r => (
              <CourseRiskCard key={formatCourseCode(r.course_code)} r={r} onExplain={setExplaining} layout={layout} />
            ))}
          </motion.div>
          </>
        )}
      </div>

      {/* Recommended Actions */}
      {interventions.length > 0 && (
        <div>
          <h2 className={`font-serif text-2xl font-bold text-slate-900 mt-2 ${layout === "compact" ? "mb-4" : "mb-8"}`}>Actions for You</h2>
          <div className={`grid md:grid-cols-2 ${layout === "compact" ? "gap-3" : "gap-6"}`}>
            {interventions.map((intv, i) => {
              const done   = intv.acknowledged_by_student;
              const isHigh = intv.risk_level === "High";
              return (
                <motion.div key={intv.id}
                  initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.07 }}
                  whileHover={{ y: -2 }}
                  className={[
                    `border-l-4 ${layout === "compact" ? "p-4" : "p-6"} rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200`,
                    done     ? "border-emerald-400 border border-slate-200 opacity-70"
                    : isHigh ? "border-amber-500 border border-slate-200 bg-amber-50/30"
                             : "border-slate-300 border border-slate-200",
                  ].join(" ")}>
                  <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
                    <div>
                      <h4 className="font-serif text-lg font-bold text-slate-900 mb-1">{intv.intervention_title || "Academic Guidance"}</h4>
                      <p className="text-sm text-slate-500">{formatCourseCode(intv.course_code)} · {intv.course_title}</p>
                    </div>
                    <span className={`text-xs font-semibold px-3 py-1.5 rounded-xl flex-shrink-0 ${
                      done ? "text-emerald-700 bg-emerald-50" : isHigh ? "text-amber-800 bg-amber-100" : "text-slate-700 bg-slate-100"
                    }`}>
                      {done ? "Acknowledged" : isHigh ? "Needs attention" : "Recommended"}
                    </span>
                  </div>
                  {layout !== "compact" && (
                    <p className="text-sm text-slate-700 mb-6 leading-relaxed">{intv.ai_content || intv.message}</p>
                  )}

                  {/* Detailed: show intervention history inline */}
                  {layout === "detailed" && intv.history && intv.history.length > 0 && (
                    <div className="mb-4 p-3 bg-slate-50 rounded-lg border border-slate-100">
                      <p className="text-[10px] font-semibold uppercase text-slate-400 tracking-wide mb-2">History</p>
                      {intv.history.map((h, idx) => (
                        <p key={idx} className="text-xs text-slate-500">{formatDate(h.date)} — {h.action}</p>
                      ))}
                    </div>
                  )}

                  <div className={`flex items-center justify-between ${layout === "compact" ? "pt-3" : "pt-4"} border-t border-slate-200 flex-wrap gap-3`}>
                    <p className="text-xs text-slate-500 flex items-center gap-1.5">
                      <Clock size={12} /> {formatDate(intv.recommended_at || intv.created_at)}
                    </p>
                    {!done && (
                      <button onClick={() => setAcknowledging(intv)}
                        className="text-sm font-semibold text-slate-900 hover:text-slate-700 flex items-center gap-2 px-4 py-2 hover:bg-slate-50 rounded-xl transition-all">
                        <CheckCircle2 size={15} /> Respond
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      )}

      {/* Weekly Study Plan */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <button
          onClick={() => weeklyPlan ? setPlanExpanded(!planExpanded) : generatePlan()}
          className="w-full flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-50 border border-purple-100 flex items-center justify-center">
              <Sparkles size={16} className="text-purple-600" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-900">Weekly Study Plan</p>
              <p className="text-xs text-slate-500">AI-generated personalised plan</p>
            </div>
          </div>
          {planLoading ? (
            <Loader size={16} className="animate-spin text-slate-400" />
          ) : weeklyPlan ? (
            planExpanded ? <ChevronDown size={16} className="text-slate-400" /> : <ChevronRight size={16} className="text-slate-400" />
          ) : (
            <span className="text-xs font-semibold text-purple-600 px-3 py-1.5 bg-purple-50 rounded-lg">Generate</span>
          )}
        </button>
        <AnimatePresence>
          {planExpanded && weeklyPlan && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="px-6 pb-5 border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{weeklyPlan}</p>
                <button onClick={generatePlan} disabled={planLoading}
                  className="mt-3 text-xs font-semibold text-purple-600 hover:text-purple-700 flex items-center gap-1">
                  <Sparkles size={12} /> Regenerate
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Quick Links */}
      <motion.div variants={container} initial="hidden" animate="show"
        className="flex flex-wrap gap-2 mt-6"
      >
        {[
          { label: "Recovery Simulator", to: "/student/recovery-path", icon: Sparkles },
          { label: "Engagement", to: "/student/engagement", icon: TrendingUp },
          { label: "Weekly Check-In", to: "/student/checkin", icon: Clock },
          { label: "Self-Study", to: "/student/self-study", icon: BookOpen },
        ].map(link => (
          <motion.button key={link.to} variants={it} whileHover={{ y: -1 }}
            onClick={() => navigate(link.to)}
            className="flex items-center gap-2 text-xs font-semibold text-slate-600 bg-white border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-50 hover:border-slate-300 transition-all"
          >
            <link.icon size={13} className="text-slate-400" /> {link.label}
          </motion.button>
        ))}
      </motion.div>

      {/* Modals */}
      {acknowledging && (
        <AcknowledgeModal intervention={acknowledging} token={token}
          onClose={() => setAcknowledging(null)} onDone={fetchAll} />
      )}
      {reflecting && (
        <ReflectionModal
          riskScore={reflecting}
          courseId={(enrolledCourses.find(c => c.course_code === reflecting?.course_code) || enrolledCourses[0])?.course_id}
          token={token}
          onClose={() => setReflecting(null)} />
      )}
      {explaining && (
        <ExplainModal riskScore={explaining} token={token}
          onClose={() => setExplaining(null)} />
      )}
      {showSos && (
        <SosModal token={token} courses={enrolledCourses}
          onClose={() => setShowSos(false)} />
      )}
    </div>
  );
}
