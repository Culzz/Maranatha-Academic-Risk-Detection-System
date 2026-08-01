/**
 * RecoveryPathPage — Predictive risk simulator for students.
 * Lets students adjust hypothetical metrics (attendance, quiz score,
 * submission rate) and see how their risk level would change.
 */
import { useState, useEffect, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sliders, ArrowRight, TrendingUp, TrendingDown, Minus,
  BookOpen, ClipboardCheck, Clock, Users, Loader,
  ChevronDown, Play, Lightbulb, ShieldCheck, AlertTriangle,
  Eye, Frown, Flame,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";

import { studentsApi, simulatorApi, riskApi } from "../../services/api";
import { riskColors } from "../../utils/helpers";

/* ── animation variants ─────────────────────────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

/* ── risk badge helper ──────────────────────────────────── */
function RiskBadge({ level, size = "md" }) {
  const c = riskColors(level);
  const px = size === "lg" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs";
  return (
    <span className={`inline-flex items-center gap-2 font-semibold rounded-xl ${px} ${c.text} ${c.bg}`}>
      <span className={`w-2 h-2 rounded-full ${c.dot}`} />
      {level}
    </span>
  );
}

/* ── slider component ───────────────────────────────────── */
function SimSlider({ label, value, onChange, icon: Icon }) {
  const barColor =
    value >= 70 ? "accent-emerald-500" :
    value >= 40 ? "accent-amber-500"   : "accent-red-500";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon size={14} className="text-slate-400" />
          </div>
          <span className="text-sm font-semibold text-slate-700">{label}</span>
        </div>
        <span className="text-lg font-bold text-slate-900 tabular-nums">{value}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full h-2 rounded-full appearance-none cursor-pointer bg-slate-100 ${barColor}
          [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5
          [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:border-2
          [&::-webkit-slider-thumb]:border-slate-300 [&::-webkit-slider-thumb]:shadow-md [&::-webkit-slider-thumb]:cursor-pointer
          [&::-webkit-slider-thumb]:hover:border-slate-400 [&::-webkit-slider-thumb]:transition-colors`}
      />
      <div className="flex justify-between text-xs text-slate-400">
        <span>0%</span>
        <span>50%</span>
        <span>100%</span>
      </div>
    </div>
  );
}

/* ── direction helpers ──────────────────────────────────── */
function directionMeta(direction) {
  switch (direction) {
    case "improved":
      return {
        icon:  TrendingDown,
        color: "text-emerald-600",
        bg:    "bg-emerald-50",
        border: "border-emerald-200",
        label: "Risk Decreased",
        motivational: "Great news! These changes would lower your risk. Keep pushing towards these targets and you will see real improvement in your standing.",
      };
    case "worsened":
      return {
        icon:  TrendingUp,
        color: "text-red-600",
        bg:    "bg-red-50",
        border: "border-red-200",
        label: "Risk Increased",
        motivational: "These values would raise your risk. Consider increasing your attendance, quiz preparation, and assignment submissions to stay on track.",
      };
    default:
      return {
        icon:  Minus,
        color: "text-slate-600",
        bg:    "bg-slate-50",
        border: "border-slate-200",
        label: "No Change",
        motivational: "Your risk level stays the same with these values. Try adjusting the sliders further to see what combination of efforts would move the needle.",
      };
  }
}

/* ── course risk card ───────────────────────────────────── */
function CourseRiskCard({ r }) {
  const c = riskColors(r.risk_level);
  return (
    <motion.div
      variants={item}
      whileHover={{ y: -2 }}
      className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-6"
    >
      <div className="flex items-start justify-between gap-4 mb-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
            {r.course_code}
          </p>
          <p className="text-lg font-bold text-slate-900 leading-tight">{r.course_title}</p>
        </div>
        <RiskBadge level={r.risk_level} />
      </div>

      <div className="mb-2">
        <div className="flex justify-between text-xs text-slate-500 mb-2">
          <span>Risk Probability</span>
          <span className="font-semibold">{Math.round((r.risk_probability || 0) * 100)}%</span>
        </div>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(r.risk_probability || 0) * 100}%` }}
            transition={{ duration: 0.8, ease: "easeOut" }}
            className="h-full rounded-full"
            style={{ backgroundColor: c.bar }}
          />
        </div>
      </div>
    </motion.div>
  );
}

/* ── static tips ────────────────────────────────────────── */
const RECOVERY_TIPS = [
  {
    icon: BookOpen,
    title: "Attend all remaining lectures",
    description: "Consistent attendance is one of the strongest predictors of academic success. Make every session count.",
  },
  {
    icon: ClipboardCheck,
    title: "Complete pending assignments before deadline",
    description: "Submitting work on time demonstrates engagement and directly lowers your risk score.",
  },
  {
    icon: Clock,
    title: "Take advantage of office hours",
    description: "Your lecturers are available to help clarify difficult concepts. Do not hesitate to reach out.",
  },
  {
    icon: Users,
    title: "Join a peer study group",
    description: "Collaborative learning improves understanding and keeps you accountable to your coursework.",
  },
];

/* ================================================================ */
/*  MAIN PAGE                                                        */
/* ================================================================ */
export default function RecoveryPathPage() {
  const { token, user } = useAuth();

  /* ── data state ────────────────────────────────────────── */
  const [riskScores, setRiskScores] = useState([]);
  const [courses,    setCourses]    = useState([]);
  const [loading,    setLoading]    = useState(true);

  /* ── simulator state ───────────────────────────────────── */
  const [selectedCourseId,    setSelectedCourseId]    = useState("");
  const [attendance,          setAttendance]          = useState(50);
  const [quizScore,           setQuizScore]           = useState(50);
  const [submissionRate,      setSubmissionRate]       = useState(50);
  const [lateRate,            setLateRate]             = useState(20);
  const [materialAccess,      setMaterialAccess]       = useState(50);
  const [moodScore,           setMoodScore]            = useState(50);
  const [checkinStreak,       setCheckinStreak]        = useState(3);
  const [simulating,          setSimulating]          = useState(false);
  const [simResult,           setSimResult]           = useState(null);
  const [simError,            setSimError]            = useState("");
  const [optimalResult,       setOptimalResult]       = useState(null);
  const [findingOptimal,      setFindingOptimal]      = useState(false);
  const [dropdownOpen,        setDropdownOpen]        = useState(false);

  /* ── fetch initial data ────────────────────────────────── */
  const fetchData = useCallback(async () => {
    try {
      const [scoresRes, coursesRes] = await Promise.allSettled([
        studentsApi.getRiskScores(token),
        studentsApi.getMyCourses(token),
      ]);
      if (scoresRes.status === "fulfilled")
        setRiskScores(Array.isArray(scoresRes.value) ? scoresRes.value : []);
      if (coursesRes.status === "fulfilled") {
        const list = Array.isArray(coursesRes.value) ? coursesRes.value : [];
        setCourses(list);
        if (list.length) setSelectedCourseId(list[0].course_id);
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── pre-fill sliders from current feature_snapshot ────── */
  useEffect(() => {
    const risk = riskScores.find(r => {
      const cid = courses.find(c => c.course_id === selectedCourseId);
      return cid && r.course_code === cid.course_code;
    });
    const fs = risk?.feature_snapshot;
    if (fs) {
      setAttendance(Math.round((fs.attendance_rate ?? 0.5) * 100));
      setQuizScore(Math.round((fs.quiz_avg ?? 0.5) * 100));
      setSubmissionRate(Math.round((fs.assignment_rate ?? 0.5) * 100));
      setLateRate(Math.round((fs.late_submission_rate ?? 0.2) * 100));
      setMaterialAccess(Math.round((fs.material_access_rate ?? 0.5) * 100));
      setMoodScore(Math.round((fs.mood_score ?? 0.5) * 100));
      setCheckinStreak(Math.round(fs.weekly_checkin_streak ?? 3));
    }
  }, [selectedCourseId, riskScores, courses]);

  /* ── simulate ──────────────────────────────────────────── */
  const runSimulation = async () => {
    if (!selectedCourseId) return;
    setSimulating(true);
    setSimError("");
    setSimResult(null);
    try {
      const result = await simulatorApi.simulate(
        {
          student_id:                user.user_id,
          course_id:                 selectedCourseId,
          hypothetical_attendance:   attendance / 100,
          hypothetical_quiz_score:   quizScore / 100,
          hypothetical_assignment_rate: submissionRate / 100,
          hypothetical_late_rate:    lateRate / 100,
          hypothetical_material_access: materialAccess / 100,
          hypothetical_mood_score:   moodScore / 100,
          hypothetical_checkin_streak: checkinStreak,
        },
        token,
      );
      setSimResult(result);
    } catch (e) {
      setSimError(e.message || "Simulation failed. Please try again.");
    } finally {
      setSimulating(false);
    }
  };

  /* ── derived ───────────────────────────────────────────── */
  const selectedCourse = courses.find((c) => c.course_id === selectedCourseId);
  const highRiskCount  = riskScores.filter((r) => r.risk_level === "High").length;

  /* ── loading state ─────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-3xl"
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Sliders size={22} className="text-accent" />
          </div>
          <div>
            <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">
              Recovery Path
            </h1>
            <p className="text-lg text-slate-600 mt-1">
              Predict how changes in your behaviour could affect your risk level
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed mt-2 ml-[60px]">
          Use the simulator below to adjust hypothetical attendance, quiz scores, and
          submission rates, then see how your predicted risk level responds. This helps
          you set targeted goals for academic recovery.
        </p>
      </motion.div>

      {/* ── Current Risk Summary ────────────────────────── */}
      {riskScores.length > 0 && (
        <div>
          <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">
            Current Risk Summary
          </h2>
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
          >
            {riskScores.map((r) => (
              <CourseRiskCard key={r.course_code} r={r} />
            ))}
          </motion.div>
        </div>
      )}

      {riskScores.length === 0 && courses.length === 0 && (
        <div className="text-center py-16 border border-slate-200 rounded-xl bg-white">
          <BookOpen size={32} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No enrolled courses found</p>
          <p className="text-sm text-slate-400 mt-1">
            Enroll in courses to start tracking your academic risk.
          </p>
        </div>
      )}

      {/* ── Risk Simulator Panel ────────────────────────── */}
      {courses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="border border-slate-200 rounded-xl bg-white shadow-sm"
        >
          {/* Panel header */}
          <div className="flex items-center gap-3 p-6 pb-0 mb-6">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
              <Sliders size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold text-slate-900">Risk Simulator</h2>
              <p className="text-sm text-slate-500">
                Adjust the sliders and simulate to preview your predicted risk
              </p>
            </div>
          </div>

          <div className="p-6 pt-0 grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Left — controls */}
            <div className="space-y-6">
              {/* Course selector */}
              <div>
                <label className="block text-xs font-semibold uppercase text-slate-500 tracking-wide mb-2">
                  Course
                </label>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    className="w-full flex items-center justify-between h-11 px-4 border border-slate-200 rounded-xl bg-white text-sm font-medium text-slate-900 hover:border-slate-300 transition-colors"
                  >
                    <span className="truncate">
                      {selectedCourse
                        ? `${selectedCourse.course_code} — ${selectedCourse.course_title}`
                        : "Select a course"}
                    </span>
                    <ChevronDown
                      size={16}
                      className={`text-slate-400 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
                    />
                  </button>
                  <AnimatePresence>
                    {dropdownOpen && (
                      <motion.ul
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-xl shadow-lg max-h-56 overflow-auto"
                      >
                        {courses.map((c) => (
                          <li key={c.course_id}>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedCourseId(c.course_id);
                                setDropdownOpen(false);
                                setSimResult(null);
                              }}
                              className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-slate-50
                                ${c.course_id === selectedCourseId
                                  ? "font-semibold text-slate-900 bg-slate-50"
                                  : "text-slate-700"
                                }`}
                            >
                              {c.course_code} — {c.course_title}
                            </button>
                          </li>
                        ))}
                      </motion.ul>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Sliders */}
              <SimSlider
                label="Hypothetical Attendance Rate"
                value={attendance}
                onChange={setAttendance}
                icon={BookOpen}
              />
              <SimSlider
                label="Hypothetical Quiz Score"
                value={quizScore}
                onChange={setQuizScore}
                icon={ClipboardCheck}
              />
              <SimSlider
                label="Hypothetical Submission Rate"
                value={submissionRate}
                onChange={setSubmissionRate}
                icon={ClipboardCheck}
              />
              <SimSlider
                label="Late Submission Rate"
                value={lateRate}
                onChange={setLateRate}
                icon={Clock}
              />
              <SimSlider
                label="Material Access Rate"
                value={materialAccess}
                onChange={setMaterialAccess}
                icon={Eye}
              />
              <SimSlider
                label="Mood Score"
                value={moodScore}
                onChange={setMoodScore}
                icon={Frown}
              />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Flame size={14} className="text-slate-400" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">Check-In Streak</span>
                  </div>
                  <span className="text-lg font-bold text-slate-900 tabular-nums">{checkinStreak} weeks</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={15}
                  step={1}
                  value={checkinStreak}
                  onChange={(e) => setCheckinStreak(Number(e.target.value))}
                  className="w-full h-2 rounded-full appearance-none cursor-pointer accent-emerald-500"
                />
              </div>

              {/* Simulate button */}
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={runSimulation}
                disabled={simulating || !selectedCourseId}
                className="w-full flex items-center justify-center gap-2 h-12 bg-slate-900 text-white font-semibold rounded-xl text-sm
                  hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {simulating ? (
                  <>
                    <Loader size={15} className="animate-spin" />
                    Simulating...
                  </>
                ) : (
                  <>
                    <Play size={15} />
                    Simulate
                  </>
                )}
              </motion.button>

              {simError && (
                <p className="text-sm text-red-600 text-center">{simError}</p>
              )}

              {/* Optimal Path auto-search */}
              <button
                onClick={async () => {
                  if (!selectedCourseId) return;
                  setFindingOptimal(true);
                  try {
                    const res = await riskApi.getOptimalPath(selectedCourseId, token);
                    setOptimalResult(res);
                  } catch { setOptimalResult(null); }
                  setFindingOptimal(false);
                }}
                disabled={findingOptimal || !selectedCourseId}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-indigo-50 border border-indigo-200 text-indigo-700 font-semibold rounded-xl text-xs hover:bg-indigo-100 disabled:opacity-50 transition-colors"
              >
                {findingOptimal ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
                Auto-Find Best Improvement
              </button>

              {optimalResult?.top_improvements?.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-indigo-700">Top Improvements:</p>
                  {optimalResult.top_improvements.map((imp, i) => {
                    const LABELS = {
                      attendance_rate: "Attendance", quiz_avg: "Quiz Average", assignment_rate: "Assignments",
                      mood_score: "Mood", late_submission_rate: "Late Rate", material_access_rate: "Materials",
                      weekly_checkin_streak: "Check-In Streak",
                    };
                    return (
                      <div key={i} className="flex items-center justify-between bg-white border border-indigo-100 rounded-lg px-3 py-2">
                        <span className="text-xs font-medium text-slate-700">{LABELS[imp.field] || imp.field}</span>
                        <span className="text-xs text-slate-500">
                          {Math.round(imp.current_value * 100)}% → {Math.round(imp.suggested_value * 100)}%
                        </span>
                        <span className="text-xs font-bold text-emerald-600">-{Math.round(imp.risk_reduction * 100)}%</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Right — result */}
            <div className="flex items-center justify-center min-h-[280px]">
              <AnimatePresence mode="wait">
                {simResult ? (
                  <SimulationResult key="result" result={simResult} />
                ) : (
                  <motion.div
                    key="placeholder"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="text-center px-6"
                  >
                    <div className="w-16 h-16 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Sliders size={24} className="text-slate-300" />
                    </div>
                    <p className="text-slate-500 font-medium mb-1">No simulation yet</p>
                    <p className="text-sm text-slate-400 max-w-xs">
                      Adjust the sliders on the left and click Simulate to see your
                      predicted risk level.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </motion.div>
      )}

      {/* ── Recovery Tips ───────────────────────────────── */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center flex-shrink-0">
            <Lightbulb size={16} className="text-emerald-600" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold text-slate-900">Recovery Tips</h2>
            <p className="text-sm text-slate-500">
              {highRiskCount > 0
                ? `You have ${highRiskCount} course${highRiskCount > 1 ? "s" : ""} at high risk. Start with these actions.`
                : "Actionable steps to maintain and improve your academic standing."}
            </p>
          </div>
        </div>

        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 sm:grid-cols-2 gap-6"
        >
          {RECOVERY_TIPS.map((tip) => (
            <motion.div
              key={tip.title}
              variants={item}
              whileHover={{ y: -2 }}
              className="flex items-start gap-4 p-6 border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200"
            >
              <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <tip.icon size={16} className="text-emerald-600" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 mb-1">{tip.title}</h3>
                <p className="text-sm text-slate-600 leading-relaxed">{tip.description}</p>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
}

/* ================================================================ */
/*  SIMULATION RESULT PANEL                                          */
/* ================================================================ */
function SimulationResult({ result }) {
  const {
    current_level,
    predicted_level,
    predicted_probability,
    change_direction,
    message,
    recommended_action,
  } = result;

  const dir = directionMeta(change_direction);
  const DirIcon = dir.icon;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.3 }}
      className="w-full space-y-5"
    >
      {/* Level comparison */}
      <div className="flex items-center justify-center gap-4 flex-wrap">
        <div className="text-center">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Current
          </p>
          <RiskBadge level={current_level} size="lg" />
        </div>

        <div className="flex items-center justify-center w-10 h-10 bg-slate-100 rounded-full flex-shrink-0">
          <ArrowRight size={18} className="text-slate-400" />
        </div>

        <div className="text-center">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">
            Predicted
          </p>
          <RiskBadge level={predicted_level} size="lg" />
        </div>
      </div>

      {/* Predicted probability */}
      {predicted_probability != null && (
        <div className="text-center">
          <span className="text-sm text-slate-500">Predicted probability: </span>
          <span className="text-sm font-bold text-slate-900">
            {Math.round(predicted_probability * 100)}%
          </span>
        </div>
      )}

      {/* Direction indicator */}
      <div className={`flex items-center gap-3 p-4 rounded-xl border ${dir.bg} ${dir.border}`}>
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${dir.bg}`}>
          <DirIcon size={18} className={dir.color} />
        </div>
        <div>
          <p className={`text-sm font-bold ${dir.color}`}>{dir.label}</p>
          <p className="text-xs text-slate-600 mt-0.5">
            {change_direction === "improved"
              ? "Your risk would decrease with these metrics."
              : change_direction === "worsened"
              ? "Your risk would increase with these metrics."
              : "Your risk level remains unchanged."}
          </p>
        </div>
      </div>

      {/* API message */}
      {message && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
            <p className="text-sm text-slate-700 leading-relaxed">{message}</p>
          </div>
        </div>
      )}

      {/* Recommended action */}
      {recommended_action && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <Lightbulb size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-1">Highest Impact Action</p>
              <p className="text-sm text-amber-900 leading-relaxed">{recommended_action}</p>
            </div>
          </div>
        </div>
      )}

      {/* Motivational note */}
      <div className={`rounded-xl p-4 border ${dir.border} ${dir.bg}`}>
        <div className="flex items-start gap-3">
          {change_direction === "improved" ? (
            <ShieldCheck size={16} className="text-emerald-500 mt-0.5 flex-shrink-0" />
          ) : change_direction === "worsened" ? (
            <AlertTriangle size={16} className="text-red-500 mt-0.5 flex-shrink-0" />
          ) : (
            <Lightbulb size={16} className="text-slate-500 mt-0.5 flex-shrink-0" />
          )}
          <p className="text-sm text-slate-700 leading-relaxed">{dir.motivational}</p>
        </div>
      </div>

      {/* Cross-page links */}
      <div className="flex flex-wrap gap-3">
        <Link to="/student/overview" className="flex items-center gap-2 text-sm font-semibold text-primary bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 hover:bg-blue-100 transition-colors">
          <ArrowRight size={14} /> Back to Overview
        </Link>
        <Link to="/student/engagement" className="flex items-center gap-2 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 hover:bg-slate-100 transition-colors">
          <TrendingUp size={14} /> View Engagement
        </Link>
        <Link to="/student/checkin" className="flex items-center gap-2 text-sm font-semibold text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 hover:bg-slate-100 transition-colors">
          <ClipboardCheck size={14} /> Weekly Check-In
        </Link>
      </div>
    </motion.div>
  );
}
