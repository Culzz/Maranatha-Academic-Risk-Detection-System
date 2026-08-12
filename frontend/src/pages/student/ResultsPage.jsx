/**
 * Student ResultsPage — Premium semester result cards with AI analysis,
 * dispute workflow, CGPA trajectory chart, and graduation tracker.
 */
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  GraduationCap, Loader2, AlertCircle, ChevronLeft, Download,
  ScrollText, Calendar, BookOpen, Award, TrendingUp, ArrowRight,
  MessageSquare, CheckCircle, X, Sparkles, BarChart2,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { resultsApi } from "../../services/api";
import { SkeletonDashboard } from "../../components/ui/Skeleton";

/* ── Animation variants ────────────────────────────────────── */
const containerVariants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.1 },
  },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.97 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { type: "spring", stiffness: 300, damping: 28 },
  },
};

const slideIn = {
  initial: { opacity: 0, x: 30 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.35, ease: "easeOut" } },
  exit: { opacity: 0, x: -30, transition: { duration: 0.2 } },
};

/* ── Grade color helper ──────────────────────────────────────── */
function gradeColor(grade) {
  switch (grade) {
    case "A": return "text-emerald-600";
    case "B": return "text-blue-600";
    case "C": return "text-amber-600";
    case "D": return "text-orange-600";
    case "E":
    case "F": return "text-red-600";
    default:  return "text-slate-500";
  }
}

/* ═══════════════════════════════════════════════════════════
   CGPA TRAJECTORY CHART (C3)
   ═══════════════════════════════════════════════════════════ */
function CGPAChart({ results }) {
  const data = results.map((r) => ({
    label: `${(r.session_label || "").slice(-4)} ${(r.semester || "").slice(0, 3)}`,
    cgpa: r.cgpa != null ? Number(Number(r.cgpa).toFixed(2)) : null,
    sgpa: r.sgpa != null ? Number(Number(r.sgpa).toFixed(2)) : null,
  }));

  return (
    <div className="mb-5 bg-white rounded-2xl border border-slate-100 shadow-premium-sm p-5">
      <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center gap-2">
        <TrendingUp size={14} className="text-accent" />
        GPA Trajectory
      </h3>
      <ResponsiveContainer width="100%" height={160}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
          <XAxis dataKey="label" tick={{ fontSize: 10 }} />
          <YAxis domain={[0, 5]} tick={{ fontSize: 10 }} />
          <Tooltip formatter={(v) => v?.toFixed(2)} />
          <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="cgpa"
            stroke="#0f1f3d"
            strokeWidth={2}
            name="CGPA"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="sgpa"
            stroke="#b38b00"
            strokeWidth={2}
            name="SGPA"
            dot={{ r: 3 }}
            activeDot={{ r: 5 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   GRADUATION TRACKER (C6)
   ═══════════════════════════════════════════════════════════ */
function GraduationTracker({ token }) {
  const [tracker, setTracker] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    resultsApi
      .getGraduationTracker(token)
      .then((d) => setTracker(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-48 gap-3">
        <Loader2 size={22} className="animate-spin text-accent" />
        <span className="text-sm text-slate-400">Loading tracker…</span>
      </div>
    );
  }
  if (error) {
    return (
      <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
        <AlertCircle size={14} /> {error}
      </div>
    );
  }
  if (!tracker || !tracker.has_results) {
    return (
      <div className="bg-white border border-slate-100 rounded-2xl shadow-premium p-14 text-center">
        <BarChart2 size={36} className="text-slate-300 mx-auto mb-4" />
        <h3 className="font-serif text-lg font-semibold text-slate-600 mb-1">
          No Data Yet
        </h3>
        <p className="text-slate-400 text-sm">
          Your graduation tracker will appear once results have been published.
        </p>
      </div>
    );
  }

  const pct = Math.min(
    100,
    Math.round((tracker.semesters_completed / tracker.total_semesters) * 100)
  );

  const cgpa = tracker.latest_cgpa;
  let cgpaColor = "text-emerald-600";
  let cgpaLabel = "Excellent";
  if (cgpa < 2.0) { cgpaColor = "text-red-600"; cgpaLabel = "Below Average"; }
  else if (cgpa < 3.5) { cgpaColor = "text-amber-600"; cgpaLabel = "Average"; }

  let recommendation = "";
  if (cgpa < 2.0) {
    recommendation =
      "Your CGPA is below 2.0. Seek academic support immediately and consider retaking outstanding courses. Visit the student affairs office.";
  } else if (cgpa < 3.5) {
    recommendation =
      "Keep pushing — consistent effort this semester can meaningfully raise your CGPA. Focus on clearing any carry-over courses.";
  } else {
    recommendation =
      "Great work! Maintain your momentum and start thinking about research projects or internships to strengthen your degree.";
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-bold text-slate-900 mt-1 mb-1">
          Graduation Tracker
        </h1>
        <p className="text-sm text-slate-500">
          Track your progress towards degree completion
        </p>
      </div>

      {/* Progress block */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-premium-sm p-6">
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-semibold text-slate-700">
            Programme Progress
          </span>
          <span className="text-sm font-bold text-primary">
            {tracker.semesters_completed} / {tracker.total_semesters} semesters
          </span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 mb-1">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-xs text-slate-400 text-right">{pct}% complete</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <StatBox label="Semesters Done" value={tracker.semesters_completed} />
          <StatBox label="Remaining" value={tracker.semesters_remaining} />
          <StatBox label="Units Passed" value={tracker.total_units_passed} />
          <StatBox label="Units Failed" value={tracker.total_units_failed} />
        </div>
      </div>

      {/* Status row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* CGPA */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-premium-sm p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1">
            Latest CGPA
          </p>
          <p className={`text-3xl font-bold tabular-nums ${cgpaColor}`}>
            {cgpa != null ? cgpa.toFixed(2) : "—"}
          </p>
          <p className={`text-xs font-semibold mt-0.5 ${cgpaColor}`}>{cgpaLabel}</p>
        </div>

        {/* On-track badge */}
        <div
          className={`rounded-2xl border shadow-premium-sm p-5 flex flex-col justify-between ${
            tracker.on_track
              ? "bg-emerald-50 border-emerald-200"
              : "bg-amber-50 border-amber-200"
          }`}
        >
          <div className="flex items-center gap-2">
            {tracker.on_track ? (
              <CheckCircle size={18} className="text-emerald-600" />
            ) : (
              <AlertCircle size={18} className="text-amber-600" />
            )}
            <span
              className={`font-bold text-sm ${
                tracker.on_track ? "text-emerald-700" : "text-amber-700"
              }`}
            >
              {tracker.on_track ? "On Track" : "Needs Attention"}
            </span>
          </div>
          <p
            className={`text-xs mt-2 leading-relaxed ${
              tracker.on_track ? "text-emerald-600" : "text-amber-600"
            }`}
          >
            {recommendation}
          </p>
        </div>
      </div>

      {/* Outstanding courses */}
      {tracker.outstanding_courses?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle size={15} className="text-red-500" />
            <span className="font-semibold text-red-700 text-sm">
              {tracker.outstanding_courses.length} carry-over course
              {tracker.outstanding_courses.length > 1 ? "s" : ""} accumulated
            </span>
          </div>
          <div className="flex flex-wrap gap-2 mb-2">
            {tracker.outstanding_courses.map((code) => (
              <span
                key={code}
                className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-mono rounded-lg border border-red-200"
              >
                {code}
              </span>
            ))}
          </div>
          <p className="text-xs text-red-500">
            Register these courses for re-sitting through your department office.
          </p>
        </div>
      )}

      {/* CGPA trajectory */}
      {tracker.cgpa_trajectory?.length >= 2 && (
        <CGPAChart
          results={tracker.cgpa_trajectory.map((t) => ({
            session_label: t.label,
            semester: "",
            cgpa: t.cgpa,
            sgpa: t.sgpa,
          }))}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════════ */
export default function ResultsPage() {
  const { token, user } = useAuth();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedResult, setSelectedResult] = useState(null);
  const [activeTab, setActiveTab] = useState("results");
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const u1 = on("result_released", () => setRefreshTick((t) => t + 1));
    return () => { u1(); };
  }, [on]);

  useEffect(() => {
    setLoading(true);
    resultsApi
      .getMyResults(token)
      .then((data) => setResults(Array.isArray(data) ? data : []))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token, refreshTick]);

  if (loading) return <SkeletonDashboard />;

  return (
    <AnimatePresence mode="wait">
      {selectedResult ? (
        <motion.div key="slip" {...slideIn}>
          <ResultSlipView
            result={selectedResult}
            user={user}
            token={token}
            onBack={() => setSelectedResult(null)}
          />
        </motion.div>
      ) : (
        <motion.div key="main" {...slideIn}>
          {/* ── Tab bar ─────────────────────────────────────── */}
          <div className="max-w-4xl mx-auto mb-5">
            <div className="inline-flex bg-slate-100 rounded-xl p-1 gap-1">
              {[
                { id: "results", label: "My Results", icon: <ScrollText size={13} /> },
                { id: "tracker", label: "Graduation Tracker", icon: <TrendingUp size={13} /> },
              ].map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    activeTab === tab.id
                      ? "bg-white text-primary shadow-sm"
                      : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "results" ? (
            <ResultsListView
              results={results}
              error={error}
              onSelect={setSelectedResult}
            />
          ) : (
            <GraduationTracker token={token} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════════════════════
   LIST VIEW — Premium result cards
   ═══════════════════════════════════════════════════════════ */
function ResultsListView({ results, error, onSelect }) {
  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="font-serif text-3xl font-bold text-slate-900 mt-1 mb-1">
          Semester Results
        </h1>
        <p className="text-sm text-slate-500">
          View your academic performance and download official result slips
        </p>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Empty State */}
      {results.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-100 rounded-2xl shadow-premium p-14 text-center"
        >
          <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mx-auto mb-5">
            <ScrollText size={32} className="text-slate-300" />
          </div>
          <h3 className="font-serif text-xl font-semibold text-slate-700 mb-2">
            No Results Available
          </h3>
          <p className="text-slate-400 text-sm max-w-sm mx-auto">
            Your semester results have not been released yet. Check back after the examination period.
          </p>
        </motion.div>
      ) : (
        <>
          {/* CGPA trajectory chart (C3) — shown when 2+ semesters */}
          {results.length >= 2 && <CGPAChart results={results} />}

          <motion.div
            className="grid gap-4"
            variants={containerVariants}
            initial="hidden"
            animate="show"
          >
            {results.map((r) => (
              <motion.button
                key={r.id}
                variants={cardVariants}
                onClick={() => onSelect(r)}
                whileHover={{ y: -2, transition: { duration: 0.2 } }}
                className="w-full text-left group"
              >
                <div className="relative bg-white border border-slate-100 rounded-2xl shadow-premium-sm hover:shadow-premium hover:border-slate-200 transition-all duration-300 overflow-hidden">
                  {/* Navy gradient accent bar */}
                  <div className="absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl bg-gradient-to-b from-primary via-primary-light to-accent" />

                  <div className="pl-6 pr-5 py-5">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                      {/* Left: Session info */}
                      <div className="flex items-start gap-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            r.status === "GS"
                              ? "bg-emerald-50 text-emerald-600"
                              : "bg-red-50 text-red-500"
                          }`}
                        >
                          <GraduationCap size={22} />
                        </div>
                        <div>
                          <h3 className="font-serif text-lg font-bold text-slate-800 leading-tight">
                            {r.session_label}
                          </h3>
                          <p className="text-sm font-semibold text-primary/70 mt-0.5">
                            {r.semester} Semester
                          </p>
                          <div className="flex items-center gap-3 mt-1.5">
                            {r.department && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                <BookOpen size={11} />
                                {r.department}
                              </span>
                            )}
                            {r.level && (
                              <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                                <TrendingUp size={11} />
                                Level {r.level}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: GPA + Status */}
                      <div className="flex items-center gap-4 sm:gap-5 pl-16 sm:pl-0">
                        {/* SGPA */}
                        <div className="text-center min-w-[52px]">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                            SGPA
                          </p>
                          <p className="text-xl font-bold text-slate-800 tabular-nums">
                            {r.sgpa != null ? Number(r.sgpa).toFixed(2) : "\u2014"}
                          </p>
                        </div>

                        {/* Divider */}
                        <div className="w-px h-10 bg-slate-200" />

                        {/* CGPA */}
                        <div className="text-center min-w-[52px]">
                          <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                            CGPA
                          </p>
                          <p className="text-xl font-bold text-accent tabular-nums">
                            {r.cgpa != null ? Number(r.cgpa).toFixed(2) : "\u2014"}
                          </p>
                        </div>

                        {/* Status badge */}
                        <span
                          className={`hidden sm:inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                            r.status === "GS"
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-red-50 text-red-700 border border-red-200"
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              r.status === "GS" ? "bg-emerald-500" : "bg-red-500 animate-pulse"
                            }`}
                          />
                          {r.status === "GS" ? "Good Standing" : "Not in Good Standing"}
                        </span>

                        {/* Arrow */}
                        <ArrowRight
                          size={16}
                          className="text-slate-300 group-hover:text-accent group-hover:translate-x-0.5 transition-all duration-200 hidden sm:block"
                        />
                      </div>
                    </div>

                    {/* Mobile status badge */}
                    <div className="mt-3 sm:hidden">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full ${
                          r.status === "GS"
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${
                            r.status === "GS" ? "bg-emerald-500" : "bg-red-500 animate-pulse"
                          }`}
                        />
                        {r.status === "GS" ? "Good Standing" : "Not in Good Standing"}
                      </span>
                    </div>
                  </div>
                </div>
              </motion.button>
            ))}
          </motion.div>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   RESULT SLIP VIEW — University-branded premium slip (C1-C5)
   ═══════════════════════════════════════════════════════════ */
function ResultSlipView({ result, user, token, onBack }) {
  const slipRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  /* AI analysis state (C4) */
  const [analysis, setAnalysis] = useState(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  /* Dispute state (C5) */
  const [showDisputeModal, setShowDisputeModal] = useState(false);
  const [disputeReason, setDisputeReason] = useState("");
  const [disputeSubmitting, setDisputeSubmitting] = useState(false);
  const [disputeSuccess, setDisputeSuccess] = useState(false);
  const [disputeError, setDisputeError] = useState("");

  const now = new Date();
  const timestamp =
    now.toLocaleDateString("en-GB") +
    ", " +
    now.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

  const cumulativeTNU = (result.tul || 0) + (result.ctul || 0);
  const cumulativeTCP = (result.gp || 0) + (result.pgpa || 0) * (result.ctul || 0);

  const handleExportPDF = async () => {
    setExporting(true);
    try {
      const html2canvas = (await import("html2canvas")).default;
      const { jsPDF } = await import("jspdf");
      const element = slipRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pdfWidth, pdfHeight);
      pdf.save(
        `result_${user?.matric_number || "student"}_${result.session_label}_${result.semester}.pdf`
      );
    } catch (err) {
      console.error("PDF export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  /* C4: Fetch AI analysis */
  const handleLoadAnalysis = async () => {
    setAnalysisLoading(true);
    try {
      const data = await resultsApi.getResultAnalysis(result.id, token);
      setAnalysis(data.analysis || "Unable to generate analysis.");
    } catch {
      setAnalysis("Unable to generate analysis at this time.");
    } finally {
      setAnalysisLoading(false);
    }
  };

  /* C5: Submit dispute */
  const handleSubmitDispute = async () => {
    if (!disputeReason.trim()) return;
    setDisputeSubmitting(true);
    setDisputeError("");
    try {
      await resultsApi.createDispute(result.id, disputeReason.trim(), token);
      setDisputeSuccess(true);
      setDisputeReason("");
      setTimeout(() => setShowDisputeModal(false), 2000);
    } catch (e) {
      setDisputeError(e.message || "Failed to submit dispute.");
    } finally {
      setDisputeSubmitting(false);
    }
  };

  const courses = result.course_results || [];

  /* C2: Outstanding course codes as array of chips */
  const outstandingCodes = (result.courses_outstanding || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  return (
    <div className="max-w-4xl mx-auto space-y-5">
      {/* Controls bar */}
      <div className="flex items-center justify-between">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary font-medium transition-colors group"
        >
          <ChevronLeft
            size={16}
            className="group-hover:-translate-x-0.5 transition-transform"
          />
          Back to Results
        </button>
        <button
          onClick={handleExportPDF}
          disabled={exporting}
          className="inline-flex items-center gap-2 h-10 px-5 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-light disabled:opacity-50 transition-all shadow-premium-sm"
        >
          {exporting ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Download size={15} />
          )}
          {exporting ? "Generating..." : "Export PDF"}
        </button>
      </div>

      {/* Result Slip Card */}
      <div className="bg-white border border-slate-100 rounded-2xl shadow-premium-lg overflow-hidden">
        <div ref={slipRef} className="bg-white">
          {/* ── Navy Header Section ──────────────────────────── */}
          <div
            className="px-8 sm:px-10 pt-8 pb-6"
            style={{
              background: "linear-gradient(135deg, #0f1f3d 0%, #1e3058 60%, #2a3f6e 100%)",
            }}
          >
            <div className="text-center space-y-1">
              <div className="flex items-center justify-center gap-3 mb-2">
                <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center">
                  <GraduationCap size={20} className="text-white/90" />
                </div>
              </div>
              <h1
                className="text-xl sm:text-2xl font-bold text-white uppercase tracking-wide"
                style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}
              >
                Maranatha University, Okota, Lagos
              </h1>
              {result.faculty && (
                <p className="text-sm text-white/70 uppercase tracking-wider">
                  Faculty of {result.faculty}
                </p>
              )}
              {result.department && (
                <p className="text-sm text-white/70 uppercase tracking-wider">
                  Department of {result.department}
                </p>
              )}
              <p className="text-sm text-white/60 uppercase tracking-wider">
                Program: B.Sc. {result.department || ""}
              </p>
              <div className="pt-3">
                <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-white/20 bg-white/5">
                  <Award size={13} className="text-amber-400" />
                  <span
                    className="text-sm font-semibold text-amber-300 tracking-wide"
                    style={{ fontFamily: "'Source Serif 4', Georgia, serif" }}
                  >
                    Semester Result
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Student Info Grid ────────────────────────────── */}
          <div className="px-8 sm:px-10 py-5 border-b border-slate-100 bg-slate-50/50">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <InfoField
                icon={<Calendar size={13} />}
                label="Session"
                value={result.session_label || "--"}
              />
              <InfoField
                icon={<BookOpen size={13} />}
                label="Semester"
                value={`${result.level ? `${result.level} Level, ` : ""}${result.semester}`}
              />
              <InfoField
                icon={<Calendar size={13} />}
                label="Date"
                value={new Date().toLocaleDateString("en-GB")}
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <InfoField
                icon={<Award size={13} />}
                label="Matric Number"
                value={user?.matric_number || "--"}
                highlight
              />
              <InfoField
                icon={<GraduationCap size={13} />}
                label="Full Name"
                value={user?.full_name?.toUpperCase() || "--"}
              />
            </div>
          </div>

          {/* ── Course Results Table ─────────────────────────── */}
          <div className="px-8 sm:px-10 py-6">
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-sm">
                <thead>
                  <tr
                    style={{
                      background: "linear-gradient(135deg, #0f1f3d 0%, #1e3058 100%)",
                    }}
                  >
                    <th className="px-3 py-3 text-left text-xs font-semibold text-white/90 uppercase tracking-wider w-12">
                      S/N
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-white/90 uppercase tracking-wider">
                      Course Code
                    </th>
                    <th className="px-3 py-3 text-left text-xs font-semibold text-white/90 uppercase tracking-wider">
                      Course Title
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-white/90 uppercase tracking-wider w-16">
                      Units
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-white/90 uppercase tracking-wider w-16">
                      Score
                    </th>
                    <th className="px-3 py-3 text-center text-xs font-semibold text-white/90 uppercase tracking-wider w-16">
                      Grade
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {courses.map((cr, idx) => {
                    const failed = cr.passed === false;
                    return (
                      <tr
                        key={idx}
                        className={`transition-colors ${
                          failed
                            ? "bg-red-50/70"
                            : idx % 2 === 0
                            ? "bg-white"
                            : "bg-slate-50/60"
                        }`}
                      >
                        <td className="px-3 py-2.5 text-center text-slate-400 font-medium">
                          {idx + 1}
                        </td>
                        <td className="px-3 py-2.5 font-semibold text-slate-700">
                          {(cr.course_code || "").replace(/^([A-Z]+)(\d)/, "$1 $2")}
                        </td>
                        <td className="px-3 py-2.5 text-slate-600">
                          {cr.course_title || "--"}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600 font-medium">
                          {cr.credit_units}
                        </td>
                        <td className="px-3 py-2.5 text-center text-slate-600 font-medium tabular-nums">
                          {cr.score ?? "--"}
                        </td>
                        <td
                          className={`px-3 py-2.5 text-center font-bold ${gradeColor(cr.grade)}`}
                        >
                          {cr.grade || "--"}
                        </td>
                      </tr>
                    );
                  })}
                  {courses.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="px-4 py-8 text-center text-slate-400 text-sm"
                      >
                        No course results available.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── Summary Stats ────────────────────────────────── */}
          <div className="px-8 sm:px-10 pb-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatBox label="TNU" value={result.tul ?? 0} />
              <StatBox label="TCP" value={result.gp ?? 0} />
              <StatBox label="Cumulative TNU" value={cumulativeTNU} />
              <StatBox
                label="Cumulative TCP"
                value={typeof cumulativeTCP === "number" ? cumulativeTCP.toFixed(2) : 0}
              />
            </div>

            {/* C1+C2: Fixed type bug — use string check; display chip badges */}
            {result.courses_outstanding && result.courses_outstanding.trim() && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertCircle size={14} className="text-red-500 flex-shrink-0" />
                  <span className="font-semibold text-red-700 text-sm">
                    {result.tuf} credit unit(s) outstanding — carry-over required
                  </span>
                </div>
                <div className="flex flex-wrap gap-2 mb-2">
                  {outstandingCodes.map((code) => (
                    <span
                      key={code}
                      className="px-2.5 py-1 bg-red-100 text-red-700 text-xs font-mono rounded-lg border border-red-200"
                    >
                      {code}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-red-500">
                  These courses must be retaken. Contact your department office for registration details.
                </p>
              </div>
            )}
          </div>

          {/* ── GPA and Remark ────────────────────────────────── */}
          <div className="mx-8 sm:mx-10 border-t border-slate-200" />
          <div className="px-8 sm:px-10 py-5">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4">
              {/* SGPA / CGPA prominent display */}
              <div className="flex items-center gap-4 flex-1">
                <div className="flex-1 text-center bg-slate-50 rounded-xl py-3 px-4 border border-slate-100">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
                    Semester GPA
                  </p>
                  <p className="text-2xl font-bold text-slate-800 tabular-nums">
                    {result.sgpa != null ? Number(result.sgpa).toFixed(2) : "\u2014"}
                  </p>
                </div>
                <div
                  className="flex-1 text-center rounded-xl py-3 px-4 border"
                  style={{
                    background:
                      "linear-gradient(135deg, rgba(179,139,0,0.04) 0%, rgba(179,139,0,0.08) 100%)",
                    borderColor: "rgba(179,139,0,0.2)",
                  }}
                >
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-accent/70 mb-0.5">
                    Cumulative GPA
                  </p>
                  <p className="text-2xl font-bold text-accent tabular-nums">
                    {result.cgpa != null ? Number(result.cgpa).toFixed(2) : "\u2014"}
                  </p>
                </div>
              </div>

              {/* Remark */}
              <div
                className={`text-center sm:text-left rounded-xl py-3 px-5 border ${
                  result.status === "GS"
                    ? "bg-emerald-50 border-emerald-200"
                    : "bg-red-50 border-red-200"
                }`}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-0.5">
                  Remark
                </p>
                <p
                  className={`text-sm font-bold ${
                    result.status === "GS" ? "text-emerald-700" : "text-red-700"
                  }`}
                >
                  {result.remark ||
                    (result.status === "GS" ? "Good Standing" : "Not in Good Standing")}
                </p>
              </div>
            </div>

            {/* C5: Dispute button */}
            <div className="mt-3 text-right">
              <button
                onClick={() => {
                  setShowDisputeModal(true);
                  setDisputeSuccess(false);
                  setDisputeError("");
                }}
                className="text-xs text-slate-400 underline hover:text-slate-600 transition-colors"
              >
                Something looks wrong? Raise a dispute
              </button>
            </div>
          </div>

          {/* C4: AI result analysis section */}
          <div className="mx-8 sm:mx-10 border-t border-slate-200" />
          <div className="px-8 sm:px-10 py-5">
            {!analysis ? (
              <button
                onClick={handleLoadAnalysis}
                disabled={analysisLoading}
                className="inline-flex items-center gap-2 h-9 px-4 bg-slate-50 border border-slate-200 text-slate-600 text-xs font-semibold rounded-lg hover:bg-primary/5 hover:border-primary/20 hover:text-primary disabled:opacity-50 transition-all"
              >
                {analysisLoading ? (
                  <Loader2 size={13} className="animate-spin" />
                ) : (
                  <Sparkles size={13} className="text-accent" />
                )}
                {analysisLoading ? "Generating analysis…" : "Understand My Results"}
              </button>
            ) : (
              <div className="bg-gradient-to-r from-slate-50 to-blue-50/30 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles size={13} className="text-accent" />
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wider">
                    AI Result Analysis
                  </span>
                </div>
                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
                  {analysis}
                </p>
                <button
                  onClick={() => setAnalysis(null)}
                  className="mt-2 text-xs text-slate-400 hover:text-slate-600 underline"
                >
                  Hide
                </button>
              </div>
            )}
          </div>

          {/* ── Disclaimer Footer ────────────────────────────── */}
          <div
            className="px-8 sm:px-10 py-4 text-center space-y-1"
            style={{ backgroundColor: "rgba(15,31,61,0.03)" }}
          >
            <p className="text-xs text-slate-400 leading-relaxed">
              This is not an official transcript. Please apply for an official transcript through
              the Registrar's Office.
            </p>
            <p className="text-[11px] text-slate-400">Generated on {timestamp}</p>
          </div>
        </div>
      </div>

      {/* C5: Dispute modal */}
      <AnimatePresence>
        {showDisputeModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ backgroundColor: "rgba(0,0,0,0.45)" }}
          >
            <motion.div
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              className="bg-white rounded-2xl shadow-2xl p-7 w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <MessageSquare size={16} className="text-primary" />
                  <h3 className="font-serif text-lg font-bold text-slate-800">
                    Raise a Result Dispute
                  </h3>
                </div>
                <button
                  onClick={() => setShowDisputeModal(false)}
                  className="text-slate-400 hover:text-slate-600"
                >
                  <X size={18} />
                </button>
              </div>

              {disputeSuccess ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle size={36} className="text-emerald-500" />
                  <p className="text-sm font-semibold text-emerald-700">
                    Dispute submitted successfully!
                  </p>
                  <p className="text-xs text-slate-400 text-center">
                    The admin team has been notified and will review your dispute.
                  </p>
                </div>
              ) : (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
                    <p className="text-xs text-amber-700 leading-relaxed">
                      <strong>Note:</strong> Disputes are for factual errors only (e.g. missing
                      score, wrong course unit). Disagreements with grading are not disputable at
                      this stage.
                    </p>
                  </div>

                  <label className="block text-xs font-semibold text-slate-600 mb-1.5">
                    Describe the issue clearly *
                  </label>
                  <textarea
                    value={disputeReason}
                    onChange={(e) => setDisputeReason(e.target.value)}
                    placeholder="e.g. My score for CSC 221 appears as 45 but I scored 72 in the examination..."
                    rows={4}
                    className="w-full border border-slate-200 rounded-xl text-sm px-4 py-3 text-slate-700 placeholder-slate-300 resize-none focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/40"
                  />

                  {disputeError && (
                    <p className="mt-2 text-xs text-red-600">{disputeError}</p>
                  )}

                  <div className="flex gap-3 mt-4">
                    <button
                      onClick={() => setShowDisputeModal(false)}
                      className="flex-1 h-10 border border-slate-200 text-slate-600 text-sm font-semibold rounded-xl hover:bg-slate-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSubmitDispute}
                      disabled={disputeSubmitting || !disputeReason.trim()}
                      className="flex-1 h-10 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary-light disabled:opacity-50 transition-all inline-flex items-center justify-center gap-2"
                    >
                      {disputeSubmitting && <Loader2 size={13} className="animate-spin" />}
                      Submit Dispute
                    </button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Info Field sub-component (for student info grid) ────── */
function InfoField({ icon, label, value, highlight = false }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-slate-400 mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
          {label}
        </p>
        <p
          className={`text-sm font-semibold ${
            highlight ? "text-primary" : "text-slate-700"
          }`}
        >
          {value}
        </p>
      </div>
    </div>
  );
}

/* ── Stat Box sub-component (for summary stats) ─────────── */
function StatBox({ label, value }) {
  return (
    <div className="bg-slate-50 rounded-lg border border-slate-100 px-3 py-2.5 text-center">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
        {label}
      </p>
      <p className="text-base font-bold text-slate-700 tabular-nums">{value}</p>
    </div>
  );
}
