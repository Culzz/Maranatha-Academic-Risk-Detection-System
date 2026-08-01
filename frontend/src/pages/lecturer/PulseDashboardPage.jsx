/**
 * PulseDashboardPage — Student Pulse dashboard for lecturers.
 * Visualises real-time student wellbeing data gathered from weekly check-ins.
 *
 * Data sources:
 *   lecturersApi.getCourses        -> course picker
 *   checkinsApi.getCourseSummary   -> weekly mood distribution (stacked bars)
 *   checkinsApi.getCourseStudents  -> individual student check-in status
 */
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Heart,
  Users,
  BarChart2,
  AlertCircle,
  Activity,
  ChevronDown,
  ChevronUp,
  BookOpen,
  TrendingDown,
  VolumeX,
} from "lucide-react";
import CustomDropdown from "../../components/ui/CustomDropdown";
import Badge from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { lecturersApi, checkinsApi } from "../../services/api";
import { initials } from "../../utils/helpers";

// ── Animation variants ────────────────────────────────────
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.24 } },
};

// ── Mood helpers ──────────────────────────────────────────
const MOOD_EMOJI  = { confident: "\uD83D\uDE0A", unsure: "\uD83D\uDE10", lost: "\uD83D\uDE30" };
const MOOD_LABEL  = { confident: "Confident", unsure: "Unsure", lost: "Lost" };
const MOOD_COLORS = {
  confident: { bg: "bg-emerald-500", text: "text-emerald-600", light: "bg-emerald-50", border: "border-emerald-200", hex: "#10b981" },
  unsure:    { bg: "bg-amber-400",   text: "text-amber-600",   light: "bg-amber-50",   border: "border-amber-200",   hex: "#f59e0b" },
  lost:      { bg: "bg-red-500",     text: "text-red-600",     light: "bg-red-50",     border: "border-red-200",     hex: "#ef4444" },
};

// ── Skeleton helpers ──────────────────────────────────────
function SkeletonBar() {
  return (
    <div className="animate-pulse space-y-4">
      {[1, 2, 3].map(i => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-16 h-4 bg-slate-200 rounded" />
          <div className="flex-1 h-6 bg-slate-100 rounded-full" />
          <div className="w-10 h-4 bg-slate-200 rounded" />
        </div>
      ))}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="animate-pulse border border-slate-200 rounded-xl p-6 space-y-3">
      <div className="w-24 h-3 bg-slate-200 rounded" />
      <div className="w-16 h-8 bg-slate-100 rounded" />
    </div>
  );
}

function SkeletonStudentRow() {
  return (
    <div className="animate-pulse flex items-center gap-4 px-6 py-5">
      <div className="w-10 h-10 bg-slate-200 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="w-40 h-4 bg-slate-200 rounded" />
        <div className="w-24 h-3 bg-slate-100 rounded" />
      </div>
      <div className="w-16 h-5 bg-slate-100 rounded-full" />
    </div>
  );
}

// ── Stacked horizontal bar for one week ───────────────────
function WeekBar({ week }) {
  const { week_number, confident = 0, unsure = 0, lost = 0, total = 0 } = week;
  const safeDenom = total || 1;

  return (
    <motion.div
      variants={item}
      className="flex items-center gap-4"
    >
      <span className="w-20 text-sm font-semibold text-slate-600 flex-shrink-0">
        Week {week_number}
      </span>

      <div className="flex-1 h-7 bg-slate-100 rounded-full overflow-hidden flex">
        {confident > 0 && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(confident / safeDenom) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className="h-full bg-emerald-500 flex items-center justify-center"
            title={`Confident: ${confident}`}
          >
            {confident / safeDenom > 0.12 && (
              <span className="text-[10px] font-bold text-white">{confident}</span>
            )}
          </motion.div>
        )}
        {unsure > 0 && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(unsure / safeDenom) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.05 }}
            className="h-full bg-amber-400 flex items-center justify-center"
            title={`Unsure: ${unsure}`}
          >
            {unsure / safeDenom > 0.12 && (
              <span className="text-[10px] font-bold text-white">{unsure}</span>
            )}
          </motion.div>
        )}
        {lost > 0 && (
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${(lost / safeDenom) * 100}%` }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
            className="h-full bg-red-500 flex items-center justify-center"
            title={`Lost: ${lost}`}
          >
            {lost / safeDenom > 0.12 && (
              <span className="text-[10px] font-bold text-white">{lost}</span>
            )}
          </motion.div>
        )}
      </div>

      <span className="w-12 text-right text-xs font-semibold text-slate-500 flex-shrink-0">
        {total}
      </span>
    </motion.div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export default function PulseDashboardPage() {
  const { token } = useAuth();

  // ── State ─────────────────────────────────────────────
  const [courses,        setCourses]        = useState([]);
  const [courseId,       setCourseId]       = useState("");
  const [weeklySummary,  setWeeklySummary]  = useState([]);
  const [studentList,    setStudentList]    = useState([]);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [courseStudents, setCourseStudents] = useState([]);
  const [showStudents,   setShowStudents]   = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const unsub = on("student_struggling", () => setRefreshTick(t => t + 1));
    return () => unsub();
  }, [on]);

  // ── Load courses on mount ─────────────────────────────
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

  // ── Fetch check-in data when course changes ───────────
  useEffect(() => {
    if (!courseId || !token) return;

    setLoadingSummary(true);
    setLoadingStudents(true);

    checkinsApi.getCourseSummary(courseId, token)
      .then(data => setWeeklySummary(Array.isArray(data) ? data : []))
      .catch(() => setWeeklySummary([]))
      .finally(() => setLoadingSummary(false));

    checkinsApi.getCourseStudents(courseId, token)
      .then(data => setStudentList(Array.isArray(data) ? data : []))
      .catch(() => setStudentList([]))
      .finally(() => setLoadingStudents(false));

    // Fetch full student data (with feature_snapshot fields) for derived stats
    lecturersApi.getCourseStudents(courseId, token)
      .then(data => setCourseStudents(Array.isArray(data) ? data : []))
      .catch(() => setCourseStudents([]));
  }, [courseId, token, refreshTick]);

  // ── Derived data ──────────────────────────────────────
  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.id ?? c.course_id),
    label: `${c.course_code} — ${c.course_title}`,
  }));

  // Latest week number from the summary (for "this week" stats)
  const latestWeek = useMemo(() => {
    if (!weeklySummary.length) return null;
    return weeklySummary.reduce((max, w) => (w.week_number > max.week_number ? w : max), weeklySummary[0]);
  }, [weeklySummary]);

  // Summary stats
  const stats = useMemo(() => {
    const thisWeekTotal     = latestWeek?.total ?? 0;
    const thisWeekConfident = latestWeek?.confident ?? 0;
    const thisWeekLost      = latestWeek?.lost ?? 0;

    const pctConfident = thisWeekTotal > 0 ? Math.round((thisWeekConfident / thisWeekTotal) * 100) : 0;
    const pctLost      = thisWeekTotal > 0 ? Math.round((thisWeekLost / thisWeekTotal) * 100) : 0;

    // Average mood score: confident=3, unsure=2, lost=1
    const allTotal     = weeklySummary.reduce((s, w) => s + (w.total || 0), 0);
    const weightedSum  = weeklySummary.reduce((s, w) => s + (w.confident || 0) * 3 + (w.unsure || 0) * 2 + (w.lost || 0) * 1, 0);
    const avgMood      = allTotal > 0 ? (weightedSum / allTotal).toFixed(1) : "—";

    // Material access and login trend from course students data
    const matAccessRates = courseStudents.map(s => s.material_access_rate).filter(v => v != null);
    const avgMaterialAccess = matAccessRates.length > 0
      ? Math.round(matAccessRates.reduce((s, v) => s + v, 0) / matAccessRates.length * 100)
      : null;
    const lowLoginStudents = courseStudents.filter(s => s.login_frequency != null && s.login_frequency < 0.3).length;
    const silentStudents = courseStudents.filter(s =>
      (s.quiz_average == null) && (s.assignments_submitted === 0) && (s.chat_message_count === 0 || s.chat_message_count == null)
    ).length;

    return [
      {
        label: "Check-ins This Week",
        value: thisWeekTotal,
        icon: BarChart2,
        color: "text-slate-900",
        accent: "bg-slate-50 border-slate-200",
      },
      {
        label: "Feeling Confident",
        value: `${pctConfident}%`,
        icon: Heart,
        color: "text-emerald-600",
        accent: "bg-emerald-50 border-emerald-200",
      },
      {
        label: "Need Attention",
        value: `${pctLost}%`,
        icon: AlertCircle,
        color: "text-red-600",
        accent: "bg-red-50 border-red-200",
      },
      {
        label: "Avg Mood Score",
        value: avgMood,
        icon: Activity,
        color: "text-amber-600",
        accent: "bg-amber-50 border-amber-200",
      },
      {
        label: "Material Access",
        value: avgMaterialAccess != null ? `${avgMaterialAccess}%` : "—",
        icon: BookOpen,
        color: "text-blue-600",
        accent: "bg-blue-50 border-blue-200",
      },
      {
        label: "Low Login",
        value: lowLoginStudents,
        icon: TrendingDown,
        color: lowLoginStudents > 0 ? "text-red-600" : "text-slate-900",
        accent: lowLoginStudents > 0 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200",
      },
      {
        label: "Silent Students",
        value: silentStudents,
        icon: VolumeX,
        color: silentStudents > 0 ? "text-orange-600" : "text-slate-900",
        accent: silentStudents > 0 ? "bg-orange-50 border-orange-200" : "bg-slate-50 border-slate-200",
      },
    ];
  }, [weeklySummary, latestWeek, courseStudents]);

  // Sort students: "lost" first, then "unsure", then "confident"
  const sortedStudents = useMemo(() => {
    const order = { lost: 0, unsure: 1, confident: 2 };
    return [...studentList].sort(
      (a, b) => (order[a.mood] ?? 3) - (order[b.mood] ?? 3)
    );
  }, [studentList]);

  const hasData = weeklySummary.length > 0 || studentList.length > 0;

  // ── Render ────────────────────────────────────────────
  return (
    <div className="space-y-8">

      {/* ── Header ───────────────────────────────────────── */}
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className="flex items-start justify-between gap-6 flex-wrap mb-2">
          <div className="max-w-2xl">
            <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
              Student Pulse
            </h1>
            <p className="text-lg text-slate-600">
              Real-time wellbeing insights from weekly student check-ins
            </p>
          </div>
          {COURSE_OPTIONS.length > 0 && (
            <CustomDropdown
              value={courseId}
              onChange={setCourseId}
              options={COURSE_OPTIONS}
              placeholder="Select course"
              label="Course"
              className="w-80"
            />
          )}
        </motion.div>
      </motion.div>

      {/* ── Summary Stat Cards ───────────────────────────── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
      >
        {(loadingSummary && !hasData) ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : (
          stats.map(({ label, value, icon: Icon, color, accent }) => (
            <motion.div
              key={label}
              variants={item}
              whileHover={{ y: -2 }}
              className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-6"
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold uppercase text-slate-500 tracking-wide">
                  {label}
                </span>
                <div className={`w-10 h-10 border rounded-xl flex items-center justify-center flex-shrink-0 ${accent}`}>
                  <Icon size={16} className="text-slate-400" />
                </div>
              </div>
              <p className={`font-serif text-4xl font-bold leading-none ${color}`}>
                {value}
              </p>
            </motion.div>
          ))
        )}
      </motion.div>

      {/* ── Silent Students Alert ─────────────────────── */}
      {courseStudents.length > 0 && (() => {
        const silent = courseStudents.filter(s =>
          (s.quiz_average == null) && (s.assignments_submitted === 0) && (s.chat_message_count === 0 || s.chat_message_count == null)
        );
        if (silent.length === 0) return null;
        return (
          <motion.div variants={item} className="border border-orange-200 rounded-xl bg-orange-50 shadow-sm p-5">
            <div className="flex items-center gap-2 mb-3">
              <VolumeX size={18} className="text-orange-600" />
              <h3 className="font-serif font-bold text-orange-900">
                Silent Students ({silent.length})
              </h3>
            </div>
            <p className="text-sm text-orange-700 mb-3">
              These students have no quiz attempts, no assignment submissions, and no chat messages.
            </p>
            <div className="flex flex-wrap gap-2">
              {silent.slice(0, 10).map(s => (
                <span key={s.student_id} className="inline-flex items-center gap-1.5 text-xs font-medium bg-white border border-orange-200 text-orange-800 px-2.5 py-1.5 rounded-lg">
                  <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center text-[10px] font-bold">{initials(s.full_name)}</span>
                  {s.full_name}
                </span>
              ))}
              {silent.length > 10 && (
                <span className="text-xs text-orange-600 self-center">+{silent.length - 10} more</span>
              )}
            </div>
          </motion.div>
        );
      })()}

      {/* ── Weekly Mood Distribution ─────────────────────── */}
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <BarChart2 size={16} className="text-slate-400" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-slate-900">
                Weekly Mood Distribution
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                How students felt each week across all check-ins
              </p>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center gap-5 mt-4 ml-[52px]">
            {Object.entries(MOOD_LABEL).map(([key, label]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={`w-3 h-3 rounded-sm ${MOOD_COLORS[key].bg}`} />
                <span className="text-xs text-slate-500">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="px-6 py-6">
          {loadingSummary ? (
            <SkeletonBar />
          ) : weeklySummary.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <BarChart2 size={28} className="mb-3 opacity-30" />
              <p className="text-sm">No check-in data yet for this course</p>
            </div>
          ) : (
            <motion.div
              variants={container}
              initial="hidden"
              animate="show"
              className="space-y-3"
            >
              {[...weeklySummary]
                .sort((a, b) => a.week_number - b.week_number)
                .map(week => (
                  <WeekBar key={week.week_number} week={week} />
                ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* ── Student Check-in Status List ─────────────────── */}
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setShowStudents(v => !v)}
          className="w-full flex items-center justify-between px-6 py-5 border-b border-slate-200 hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <Users size={16} className="text-slate-400" />
            </div>
            <div className="text-left">
              <h2 className="font-serif text-xl font-bold text-slate-900">
                Student Check-in Status
              </h2>
              <p className="text-sm text-slate-500 mt-0.5">
                {studentList.length} student{studentList.length !== 1 ? "s" : ""} checked in
              </p>
            </div>
          </div>
          {showStudents
            ? <ChevronUp size={16} className="text-slate-400" />
            : <ChevronDown size={16} className="text-slate-400" />}
        </button>

        <AnimatePresence initial={false}>
          {showStudents && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: "easeInOut" }}
              className="overflow-hidden"
            >
              {loadingStudents ? (
                <div className="divide-y divide-slate-100">
                  {[1, 2, 3, 4].map(i => <SkeletonStudentRow key={i} />)}
                </div>
              ) : sortedStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <Users size={28} className="mb-3 opacity-30" />
                  <p className="text-sm">No check-in data yet for this course</p>
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {sortedStudents.map((s, i) => {
                    const mood = s.mood || "unsure";
                    const isLost = mood === "lost";
                    const moodStyle = MOOD_COLORS[mood] || MOOD_COLORS.unsure;

                    return (
                      <motion.div
                        key={s.matric_number || i}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.04, duration: 0.22 }}
                        className={[
                          "px-6 py-5 hover:bg-slate-50/50 transition-colors",
                          isLost ? "border-l-4 border-l-red-400" : "",
                        ].join(" ")}
                      >
                        <div className="flex items-start justify-between gap-4">
                          {/* Left: avatar + info */}
                          <div className="flex items-start gap-3 min-w-0">
                            <div
                              className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-accent font-bold flex-shrink-0"
                              style={{ fontSize: 11 }}
                            >
                              {initials(s.student_name || "?")}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 truncate">
                                {s.student_name}
                              </p>
                              <p className="text-xs text-slate-500">
                                {s.matric_number}
                                {s.week_number != null && (
                                  <span className="ml-2 text-slate-400">
                                    Week {s.week_number}
                                  </span>
                                )}
                              </p>
                            </div>
                          </div>

                          {/* Right: mood + confidence + risk badge */}
                          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
                            {/* Mood emoji chip */}
                            <span
                              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${moodStyle.light} ${moodStyle.border} border`}
                            >
                              <span className="text-sm">{MOOD_EMOJI[mood] || "\uD83D\uDE10"}</span>
                              {MOOD_LABEL[mood] || mood}
                            </span>

                            {/* Confidence level */}
                            {s.confidence_level != null && (
                              <span className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-50 border border-slate-200 px-2.5 py-1 rounded-full">
                                <Activity size={10} className="flex-shrink-0" />
                                {s.confidence_level}%
                              </span>
                            )}

                            {/* Risk badge */}
                            {s.risk_level && (
                              <Badge variant="risk" level={s.risk_level} />
                            )}
                          </div>
                        </div>

                        {/* Note */}
                        {s.note && (
                          <p className="text-sm text-slate-600 leading-relaxed mt-3 pl-[52px]">
                            {s.note}
                          </p>
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
