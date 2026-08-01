/**
 * EngagementPage — Weekly metrics + Risk factor analysis.
 * Uses CustomDropdown (Perplexity's version, unchanged).
 * Jargon fix: "Key Factors Affecting Your Progress" not "Model v{version}".
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Activity, AlertCircle, Info, Loader, LogIn, Clock, BookOpen, CheckCircle2, BarChart3, ClipboardList, TrendingUp, TrendingDown, Eye, Frown, Zap, Flame, FileText } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import CustomDropdown from "../../components/ui/CustomDropdown";

import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { studentsApi } from "../../services/api";
import { SkeletonDashboard } from "../../components/ui/Skeleton";
import { shapImpact, formatCourseCode } from "../../utils/helpers";
import useWeekInfo from "../../hooks/useWeekInfo";

const ENGAGEMENT_CACHE_TTL_MS = 5 * 60 * 1000;
let engagementPageCache = {
  token: null,
  timestamp: 0,
  payload: null,
};

const FACTOR_KEYS = [
  "attendance_rate", "quiz_avg", "assignment_rate", "late_submission_rate",
  "login_frequency", "mood_score", "material_access_rate",
  "consecutive_absences", "weekly_checkin_streak", "risk_velocity",
  "peer_interaction_score", "attendance_trend", "quiz_score_trend",
  "submission_time_ratio", "login_frequency_trend",
  "sgpa_absence_combined", "attendance_quiz_combined", "submission_mood_combined",
  "help_seeking_ratio", "sgpa", "sgpa_delta", "note_taking_frequency",
];

const FACTOR_LABELS = {
  attendance_rate: "Attendance Rate",
  quiz_avg: "Quiz Performance",
  assignment_rate: "Assignment Completion",
  late_submission_rate: "Late Submission Rate",
  login_frequency: "Login Frequency",
  mood_score: "Mood Score",
  material_access_rate: "Material Access Rate",
  consecutive_absences: "Consecutive Absences",
  weekly_checkin_streak: "Check-In Streak",
  risk_velocity: "Risk Velocity",
  peer_interaction_score: "Peer Engagement",
  attendance_trend: "Attendance Trend",
  quiz_score_trend: "Quiz Score Trend",
  submission_time_ratio: "Submission Timing",
  login_frequency_trend: "Login Frequency Trend",
  sgpa_absence_combined: "SGPA x Absence Risk",
  attendance_quiz_combined: "Attendance x Quiz",
  submission_mood_combined: "Submission x Mood",
  help_seeking_ratio: "Help-Seeking Activity",
  sgpa: "SGPA",
  sgpa_delta: "SGPA Change",
  note_taking_frequency: "Note-Taking",
};

const FACTOR_TOOLTIPS = {
  attendance_rate: "How often you attend class. Higher is better.",
  quiz_avg: "Your average quiz score across attempts.",
  assignment_rate: "Proportion of assignments submitted on time.",
  late_submission_rate: "Percentage of assignments submitted late. Lower is better.",
  login_frequency: "How often you log in to the platform.",
  mood_score: "Your reported mood from weekly check-ins.",
  material_access_rate: "How much you access uploaded course materials.",
  consecutive_absences: "Number of classes missed in a row. Lower is better.",
  weekly_checkin_streak: "Consecutive weeks you've completed a check-in.",
  risk_velocity: "How fast your risk is changing. Negative means improving.",
  peer_interaction_score: "Study group participation and peer engagement.",
  attendance_trend: "Whether your attendance is improving or declining.",
  quiz_score_trend: "Whether your quiz scores are improving or declining.",
  submission_time_ratio: "How early you submit assignments before deadlines.",
  login_frequency_trend: "Whether your login frequency is increasing or decreasing.",
  sgpa_absence_combined: "Combined effect of SGPA and absence pattern.",
  attendance_quiz_combined: "Combined effect of attendance and quiz performance.",
  submission_mood_combined: "Combined effect of submission behaviour and mood.",
  help_seeking_ratio: "How often you ask questions and seek help in course chat.",
  sgpa: "Your session GPA. Higher is better.",
  sgpa_delta: "Change in SGPA from previous session.",
  note_taking_frequency: "How often you take lecture notes. 2+ notes/week = excellent.",
};

const item = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3, ease: "easeOut" } },
};

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white/90 backdrop-blur-sm border border-slate-200 rounded-xl p-3 shadow-lg space-y-1 min-w-[140px]">
      <p className="text-slate-700 text-xs font-semibold">{label}</p>
      {payload.map(p => (
        <div key={p.name} className="flex justify-between items-center gap-4">
          <span className="text-xs text-slate-500" style={{ color: p.color }}>{p.name}</span>
          <span className="text-sm font-bold text-slate-900">{p.value}%</span>
        </div>
      ))}
    </div>
  );
};

function ShapRow({ feature, value, maxVal, delay, tooltip }) {
  const safeMax = maxVal || 0.01;
  const pct   = Math.round((Math.abs(value) / safeMax) * 100);
  const isRisk = value > 0;
  const label  = shapImpact(value);
  const color  = isRisk ? "#e11d48" : "#10b981";

  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay, duration: 0.35, ease: "easeOut" }}
      className="flex items-center gap-4 py-2.5"
    >
      <span className="text-sm text-slate-600 font-medium w-36 flex-shrink-0 truncate" title={tooltip}>{feature}</span>
      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ delay: delay + 0.1, duration: 0.6, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: color }}
        />
      </div>
      <span className="text-xs font-bold w-12 text-right flex-shrink-0" style={{ color }}>
        {isRisk ? "+" : ""}{value.toFixed(2)}
      </span>
      <span className="text-xs text-slate-400 w-16 text-right flex-shrink-0 capitalize">{label}</span>
    </motion.div>
  );
}

export default function EngagementPage() {
  const { token } = useAuth();
  const { weekInfo } = useWeekInfo();
  const [courses,      setCourses]      = useState([]);
  const [riskScores,   setRiskScores]   = useState([]);
  const [engagement,   setEngagement]   = useState([]);
  const [selected,     setSelected]     = useState("");
  const [selectedWeek, setSelectedWeek] = useState("");
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState("");
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const u1 = on("risk_changed", () => setRefreshTick(t => t + 1));
    return () => { u1(); };
  }, [on]);

  const applyPayload = (payload) => {
    const courseList = Array.isArray(payload?.coursesData) ? payload.coursesData : [];
    const scores = Array.isArray(payload?.riskData) ? payload.riskData : [];
    const engagementData = Array.isArray(payload?.engData) ? payload.engData : [];

    setCourses(courseList);
    setRiskScores(scores);
    setEngagement(engagementData);

    setSelected((current) => {
      if (current && (
        courseList.some((course) => course.course_code === current)
        || scores.some((score) => score.course_code === current)
      )) {
        return current;
      }
      if (courseList.length) return courseList[0].course_code;
      if (scores.length) return scores[0].course_code;
      return "";
    });
  };

  useEffect(() => {
    let mounted = true;
    setError("");

    if (!token) {
      setCourses([]);
      setRiskScores([]);
      setEngagement([]);
      setSelected("");
      setLoading(false);
      return () => { mounted = false; };
    }

    const cacheIsFresh = (
      engagementPageCache.token === token
      && engagementPageCache.payload
      && (Date.now() - engagementPageCache.timestamp) < ENGAGEMENT_CACHE_TTL_MS
    );

    if (cacheIsFresh) {
      applyPayload(engagementPageCache.payload);
      setLoading(false);
    } else {
      setLoading(true);
    }

    Promise.all([
      studentsApi.getMyCourses(token),
      studentsApi.getRiskScores(token),
      studentsApi.getEngagement(token),
    ])
      .then(([coursesData, riskData, engData]) => {
        if (!mounted) return;
        const payload = { coursesData, riskData, engData };
        engagementPageCache = {
          token,
          timestamp: Date.now(),
          payload,
        };
        applyPayload(payload);
      })
      .catch((e) => {
        if (mounted && !cacheIsFresh) {
          setError(e.message || "Failed to load engagement data.");
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => { mounted = false; };
  }, [token, refreshTick]);

  const COURSES = courses.length
    ? courses.map(c => ({
        value: c.course_code,
        label: `${formatCourseCode(c.course_code)} — ${c.course_title}`,
      }))
    : riskScores.map(r => ({
        value: r.course_code,
        label: `${formatCourseCode(r.course_code)} — ${r.course_title}`,
      }));

  const risk = riskScores.find(r => r.course_code === selected) || {};

  const maxWeek = weekInfo?.total_weeks || 52;
  const chartData = engagement
    .filter(e => e.course_code === selected && e.week_number <= maxWeek)
    .map(e => ({
      ...e,
      attendance_rate:    Math.round((e.attendance_rate || 0) * 100),
      quiz_average_score: Math.round(e.quiz_average_score || 0),
      submission_rate:    Math.round((e.submission_rate || 0) * 100),
      login_pct:          Math.min(Math.round((e.login_count || 0) * 2), 100),
      study_pct:          Math.min(Math.round((e.total_study_time_mins || 0) / 3), 100),
      quiz_attempt_pct:   Math.round((e.quiz_attempt_rate || 0) * 100),
    }));

  useEffect(() => {
    if (!chartData.length) {
      setSelectedWeek("");
      return;
    }
    const hasWeek = chartData.some((d) => String(d.week_number) === String(selectedWeek));
    if (!hasWeek) {
      setSelectedWeek(String(chartData[chartData.length - 1].week_number));
    }
  }, [selected, chartData, selectedWeek]);

  const selectedWeekData = chartData.find((d) => String(d.week_number) === String(selectedWeek))
    || chartData[chartData.length - 1]
    || null;

  // fs must be declared before signalData (TDZ fix — was previously declared after)
  const fs = risk.feature_snapshot || {};
  const newStudentNote = risk.shap_explanation?._new_student_note || "";
  const shapSource = (risk.shap_explanation && typeof risk.shap_explanation === "object")
    ? risk.shap_explanation
    : {};

  const signalData = selectedWeekData ? [
    { metric: "Attendance", value: selectedWeekData.attendance_rate ?? 0 },
    { metric: "Quiz Avg", value: selectedWeekData.quiz_average_score ?? 0 },
    { metric: "Submissions", value: selectedWeekData.submission_rate ?? 0 },
    { metric: "Quiz Attempt", value: Math.round((selectedWeekData.quiz_attempt_rate || 0) * 100) },
    {
      metric: "On-Time",
      value: selectedWeekData.on_time_submissions != null && selectedWeekData.assignments_submitted
        ? Math.round((selectedWeekData.on_time_submissions / Math.max(selectedWeekData.assignments_submitted, 1)) * 100)
        : 50,
    },
    { metric: "Logins", value: Math.min((selectedWeekData.login_count || 0) * 2, 100) },
    { metric: "Study Time", value: Math.min(Math.round((selectedWeekData.total_study_time_mins || 0) / 3), 100) },
    { metric: "Materials", value: Math.round((fs.material_access_rate ?? 0.5) * 100) },
    { metric: "Mood", value: Math.round((fs.mood_score ?? 0.5) * 100) },
    { metric: "On-Time Sub", value: Math.round((1 - (fs.late_submission_rate ?? 0.2)) * 100) },
  ] : [];
  const derivedFactorMap = {
    attendance_rate: (50 - (signalData.find((s) => s.metric === "Attendance")?.value || 50)) / 100,
    quiz_avg: (50 - (signalData.find((s) => s.metric === "Quiz Avg")?.value || 50)) / 100,
    assignment_rate: (50 - (signalData.find((s) => s.metric === "Submissions")?.value || 50)) / 100,
    login_frequency: (50 - (signalData.find((s) => s.metric === "Logins")?.value || 50)) / 100,
    peer_interaction_score: (50 - (signalData.find((s) => s.metric === "Study Time")?.value || 50)) / 100,
    late_submission_rate: fs.late_submission_rate ?? 0,
    mood_score: -(fs.mood_score ?? 0.5),
    material_access_rate: -(fs.material_access_rate ?? 0.5),
    consecutive_absences: fs.consecutive_absences ? fs.consecutive_absences / 10 : 0,
    weekly_checkin_streak: -(fs.weekly_checkin_streak ?? 0) / 10,
    risk_velocity: fs.risk_velocity ?? 0,
    attendance_trend: -(fs.attendance_trend ?? 0),
    quiz_score_trend: -(fs.quiz_score_trend ?? 0),
    submission_time_ratio: -(fs.submission_time_ratio ?? 0.5),
    login_frequency_trend: -(fs.login_frequency_trend ?? 0),
    sgpa_absence_combined: fs.sgpa_absence_combined ?? 0,
    attendance_quiz_combined: -(fs.attendance_quiz_combined ?? 0),
    submission_mood_combined: -(fs.submission_mood_combined ?? 0),
    help_seeking_ratio: -(fs.help_seeking_ratio ?? 0),
    sgpa: -(fs.sgpa ?? 2.5) / 5,
    sgpa_delta: -(fs.sgpa_delta ?? 0),
  };
  const shapEntries = FACTOR_KEYS.map((key) => {
    const raw = shapSource[key];
    const val = Number.isFinite(Number(raw)) ? Number(raw) : derivedFactorMap[key];
    return [FACTOR_LABELS[key], val, FACTOR_TOOLTIPS[key] || ""];
  }).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxVal = shapEntries.length
    ? Math.max(...shapEntries.map(([, v]) => Math.abs(v)), 0.01)
    : 0.01;

  if (loading) return <SkeletonDashboard />;

  return (
    <motion.div
      className="space-y-8"
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.1 } } }}
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
            Engagement Tracking
          </h1>
          <p className="text-lg text-slate-600">Weekly behavioural metrics across your courses</p>
        </div>

        <CustomDropdown
          value={selected}
          onChange={setSelected}
          options={COURSES}
          placeholder={COURSES.length ? "Select course" : "No courses available"}
          label="Course"
          className="w-80"
        />
      </motion.div>

      {/* Error banner */}
      {error && (
        <motion.div variants={item} className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </motion.div>
      )}

      {/* Weekly Summary narrative */}
      {(() => {
        const fs = risk.feature_snapshot || {};
        const parts = [];
        if (fs.attendance_rate != null) parts.push(`Your attendance is at ${Math.round(fs.attendance_rate * 100)}%`);
        if (fs.quiz_avg != null) parts.push(`quiz average is ${Math.round(fs.quiz_avg * 100)}%`);
        if (fs.assignment_rate != null) parts.push(`you've submitted ${Math.round(fs.assignment_rate * 100)}% of assignments`);
        if (fs.late_submission_rate != null && fs.late_submission_rate > 0.1) parts.push(`with ${Math.round(fs.late_submission_rate * 100)}% submitted late`);
        if (fs.mood_score != null) parts.push(`and your mood score is ${Math.round(fs.mood_score * 100)}%`);
        if (!parts.length) return null;
        const vel = fs.risk_velocity ?? 0;
        const suffix = vel < -0.01
          ? " Your overall risk trend is improving — keep it up!"
          : vel > 0.02
            ? " Your risk is trending upward. Focus on small, consistent improvements."
            : "";
        return (
          <motion.div variants={item} className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
            <div className="flex items-center gap-2 mb-2">
              <BarChart3 size={16} className="text-accent" />
              <h3 className="text-sm font-bold text-slate-900">Weekly Summary</h3>
            </div>
            <p className="text-sm text-slate-600 leading-relaxed">{parts.join(", ")}.{suffix}</p>
          </motion.div>
        );
      })()}

      {/* Chart card */}
      <motion.div variants={item} className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 bg-primary rounded-xl flex items-center justify-center flex-shrink-0">
            <Activity size={16} className="text-accent" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold text-slate-900">Weekly Engagement</h2>
            <p className="text-slate-500 text-sm">{risk.course_title}</p>
          </div>
        </div>

        {chartData.length === 0 ? (
          <div className="text-center py-12">
            <Activity size={32} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500">No engagement data available for this course yet.</p>
          </div>
        ) : (
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} barGap={6} barCategoryGap={20}>
                <CartesianGrid stroke="#f8fafc" strokeDasharray="3 3" vertical={false} />
                <XAxis
                  dataKey="week_number"
                  tickLine={false} axisLine={false}
                  tick={{ fontSize: 13, fill: "#64748b" }}
                  tickFormatter={v => `W${v}`}
                />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={v => `${v}%`}
                  tickLine={false} axisLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ paddingTop: 16 }} iconSize={10} />
                <Bar dataKey="attendance_rate"    name="Attendance"    fill="#1e3a8a" radius={[6,6,0,0]} maxBarSize={28} />
                <Bar dataKey="quiz_average_score" name="Quiz Avg"      fill="#f59e0b" radius={[6,6,0,0]} maxBarSize={28} />
                <Bar dataKey="submission_rate"    name="Submissions"   fill="#10b981" radius={[6,6,0,0]} maxBarSize={28} />
                <Bar dataKey="login_pct"          name="Login Activity" fill="#6366f1" radius={[6,6,0,0]} maxBarSize={28} />
                <Bar dataKey="study_pct"          name="Study Time"    fill="#8b5cf6" radius={[6,6,0,0]} maxBarSize={28} />
                <Bar dataKey="quiz_attempt_pct"   name="Quiz Attempts" fill="#ec4899" radius={[6,6,0,0]} maxBarSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </motion.div>

      {/* Detailed Metrics Cards */}
      {chartData.length > 0 && (() => {
        const latest = chartData[chartData.length - 1];
        const metricCards = [
          { label: "Login Activity", value: latest.login_count ?? 0, unit: "logins", icon: LogIn, color: "bg-blue-500" },
          { label: "Study Time", value: latest.total_study_time_mins ?? 0, unit: "mins", icon: Clock, color: "bg-purple-500" },
          { label: "Classes Attended", value: `${latest.classes_attended ?? 0}/${latest.classes_held ?? 0}`, unit: "classes", icon: BookOpen, color: "bg-emerald-500" },
          { label: "On-Time Submissions", value: `${latest.on_time_submissions ?? 0}/${latest.assignments_submitted ?? 0}`, unit: "on time", icon: CheckCircle2, color: "bg-amber-500" },
          { label: "Quiz Attempt Rate", value: latest.quiz_attempt_rate != null ? `${Math.round(latest.quiz_attempt_rate * 100)}%` : "N/A", unit: "", icon: ClipboardList, color: "bg-rose-500" },
          { label: "Engagement Score", value: latest.engagement_score != null ? `${Math.round(latest.engagement_score * 100)}%` : "N/A", unit: "", icon: BarChart3, color: "bg-indigo-500" },
          { label: "Check-In Streak", value: fs.weekly_checkin_streak ?? 0, unit: "weeks", icon: Flame, color: "bg-orange-500" },
          { label: "Material Access", value: fs.material_access_rate != null ? `${Math.round(fs.material_access_rate * 100)}%` : "N/A", unit: "", icon: Eye, color: "bg-teal-500" },
          { label: "Late Submissions", value: fs.late_submission_rate != null ? `${Math.round(fs.late_submission_rate * 100)}%` : "N/A", unit: "", icon: TrendingDown, color: "bg-red-500" },
          { label: "Risk Velocity", value: fs.risk_velocity != null ? (fs.risk_velocity > 0 ? `+${fs.risk_velocity.toFixed(2)}` : fs.risk_velocity.toFixed(2)) : "N/A", unit: "", icon: fs.risk_velocity > 0 ? TrendingUp : TrendingDown, color: fs.risk_velocity > 0 ? "bg-red-500" : "bg-emerald-500" },
          { label: "Note-Taking", value: fs.note_taking_frequency != null ? `${Math.round(fs.note_taking_frequency * 100)}%` : "N/A", unit: "", icon: FileText, color: "bg-violet-500" },
        ];
        return (
          <motion.div variants={item} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            {metricCards.map((mc) => (
              <div key={mc.label} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 text-center hover:shadow-md transition-all">
                <div className={`w-9 h-9 ${mc.color} rounded-xl flex items-center justify-center mx-auto mb-2`}>
                  <mc.icon size={16} className="text-white" />
                </div>
                <p className="text-lg font-bold text-slate-900 tabular-nums">{mc.value}</p>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">{mc.label}</p>
              </div>
            ))}
          </motion.div>
        );
      })()}

      {/* 7-signal chart (selected week) */}
      {chartData.length > 0 && selectedWeekData && (
        <motion.div variants={item} className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
          <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center flex-shrink-0">
                <Activity size={16} className="text-white" />
              </div>
              <div>
                <h2 className="font-serif text-2xl font-bold text-slate-900">10-Key Signals</h2>
                <p className="text-slate-500 text-sm">Week {selectedWeekData.week_number} snapshot</p>
              </div>
            </div>
            <CustomDropdown
              value={String(selectedWeek)}
              onChange={setSelectedWeek}
              options={chartData.map((d) => ({
                value: String(d.week_number),
                label: `Week ${d.week_number}`,
              }))}
              label="Week"
              className="w-44"
            />
          </div>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={signalData} cx="50%" cy="50%" outerRadius="70%">
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 12, fill: "#475569" }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 10, fill: "#94a3b8" }} />
                <Radar name="Signal Value" dataKey="value" stroke="#6366f1" fill="#6366f1" fillOpacity={0.25} strokeWidth={2} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </motion.div>
      )}

      {/* New student info banner */}
      {newStudentNote && (
        <motion.div variants={item} className="flex items-start gap-3 p-4 bg-blue-50 border border-blue-200 rounded-xl">
          <Info size={18} className="text-blue-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-blue-700">{newStudentNote}</p>
        </motion.div>
      )}

      {/* Risk factor analysis */}
      <motion.div variants={item} className="bg-white border border-slate-200 rounded-xl shadow-sm p-8">
        <div className="flex items-center gap-3 mb-8 pb-6 border-b border-slate-200">
          <div className="w-10 h-10 bg-red-500 rounded-xl flex items-center justify-center flex-shrink-0">
            <Activity size={16} className="text-white" />
          </div>
          <div>
            <h2 className="font-serif text-2xl font-bold text-slate-900 mb-1">Risk Factor Analysis</h2>
            <p className="text-slate-500 text-sm">{risk.course_code ? `${risk.course_code} — ` : ""}Key Factors Affecting Your Progress</p>
          </div>
        </div>

        {shapEntries.length > 0 ? (
          <>
            <div className="space-y-1 mb-8">
              {shapEntries.map(([feature, value, tooltip], i) => (
                <ShapRow
                  key={feature}
                  feature={feature}
                  value={value}
                  maxVal={maxVal}
                  delay={i * 0.08}
                  tooltip={tooltip}
                />
              ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
              <div className="flex items-start gap-3 p-4 bg-red-50/50 border border-red-100 rounded-xl">
                <div className="w-2 h-2 bg-red-500 rounded-full mt-1.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-red-800">Red bars</p>
                  <p className="text-slate-600 text-sm">Factors that increase academic risk</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-4 bg-emerald-50/50 border border-emerald-100 rounded-xl">
                <div className="w-2 h-2 bg-emerald-500 rounded-full mt-1.5 flex-shrink-0" />
                <div>
                  <p className="font-semibold text-emerald-800">Green bars</p>
                  <p className="text-slate-600 text-sm">Factors protecting your standing</p>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <AlertCircle size={28} className="text-slate-300 mx-auto mb-3" />
            <p className="text-sm text-slate-500 mb-1">No risk factor data available</p>
            <p className="text-xs text-slate-400">Risk factors will appear here once the system has enough data to analyse your academic patterns.</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
