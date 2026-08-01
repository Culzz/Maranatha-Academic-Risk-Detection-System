/**
 * EngagementHeatmapPage — Visual engagement heatmap for lecturers.
 * Real data: lecturersApi.getCourses + getCourseStudents
 *
 * Rows = students (sorted by risk_probability descending)
 * Columns = Attendance, Quiz Avg, Assignments, Risk Level
 * Cells are colour-coded: green (>=80), amber (50-79), red (<50), gray (null).
 */
import { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Grid, Users, BarChart2, AlertTriangle, Info, TrendingUp, TrendingDown, Minus, SlidersHorizontal, Check } from "lucide-react";
import CustomDropdown from "../../components/ui/CustomDropdown";
import Badge from "../../components/ui/Badge";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { lecturersApi } from "../../services/api";
import { initials, RISK_COLORS } from "../../utils/helpers";

/* ── animation variants ─────────────────────────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const item = {
  hidden: { opacity: 0, y: 6 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: "easeOut" } },
};

/* ── heatmap helpers ────────────────────────────────────── */
function heatBg(value, invert = false) {
  if (value == null) return "bg-slate-100 text-slate-400";
  if (invert) {
    // For inverted metrics (e.g. late rate, absences): low = good, high = bad
    if (value <= 20)  return "bg-emerald-100 text-emerald-800";
    if (value <= 50)  return "bg-amber-100 text-amber-800";
    return "bg-red-100 text-red-800";
  }
  if (value >= 80)   return "bg-emerald-100 text-emerald-800";
  if (value >= 50)   return "bg-amber-100 text-amber-800";
  return "bg-red-100 text-red-800";
}

function heatBar(value) {
  if (value == null) return "#cbd5e1";
  if (value >= 80)   return "#10b981";
  if (value >= 50)   return "#f59e0b";
  return "#e11d48";
}

function fmt(value, suffix = "%") {
  if (value == null) return "\u2014";
  return `${Math.round(value)}${suffix}`;
}

function avg(arr, key) {
  const valid = arr.filter(s => s[key] != null);
  if (!valid.length) return null;
  return valid.reduce((sum, s) => sum + s[key], 0) / valid.length;
}

/* ── Risk Distribution (CSS bars) ───────────────────────── */
function RiskDistribution({ students }) {
  const counts = { High: 0, Medium: 0, Low: 0 };
  students.forEach(s => {
    if (counts[s.risk_level] !== undefined) counts[s.risk_level]++;
  });
  const total = students.length || 1;

  const bars = [
    { level: "High",   count: counts.High,   color: RISK_COLORS.high.text,   bg: "bg-red-50",     border: "border-red-200"     },
    { level: "Medium", count: counts.Medium,  color: RISK_COLORS.medium.text, bg: "bg-amber-50",   border: "border-amber-200"   },
    { level: "Low",    count: counts.Low,     color: RISK_COLORS.low.text,    bg: "bg-emerald-50", border: "border-emerald-200" },
  ];

  return (
    <motion.div
      variants={item}
      className="border border-slate-200 rounded-xl bg-white shadow-sm p-6"
    >
      <div className="flex items-center gap-2 mb-5">
        <div className="w-9 h-9 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
          <BarChart2 size={15} className="text-slate-400" />
        </div>
        <h3 className="font-serif text-lg font-bold text-slate-900">Risk Distribution</h3>
      </div>

      <div className="space-y-4">
        {bars.map(({ level, count, color, bg, border }) => {
          const pct = Math.round((count / total) * 100);
          return (
            <div key={level}>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-sm font-semibold text-slate-700">{level} Risk</span>
                <span className="text-sm font-bold text-slate-900">
                  {count} <span className="text-slate-400 font-normal text-xs">({pct}%)</span>
                </span>
              </div>
              <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.7, ease: "easeOut" }}
                  className="h-full rounded-full"
                  style={{ backgroundColor: color, minWidth: count > 0 ? 6 : 0 }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary below bars */}
      <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
        <span className="text-xs text-slate-500">Total students</span>
        <span className="text-sm font-bold text-slate-900">{students.length}</span>
      </div>
    </motion.div>
  );
}

/* ── Main Page ──────────────────────────────────────────── */
export default function EngagementHeatmapPage() {
  const { token } = useAuth();
  const [courses,  setCourses]  = useState([]);
  const [courseId,  setCourseId] = useState("");
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const PAGE_SIZE = 50;
  const [page, setPage] = useState(1);
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const unsub = on("risk_changed", () => setRefreshTick(t => t + 1));
    return () => unsub();
  }, [on]);

  /* Load courses */
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

  /* Load students when course changes */
  useEffect(() => {
    if (!courseId || !token) return;
    setLoading(true);
    setPage(1);
    lecturersApi.getCourseStudents(courseId, token)
      .then(data => setStudents(Array.isArray(data) ? data : []))
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [courseId, token, refreshTick]);

  /* Dropdown options */
  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.id ?? c.course_id),
    label: `${c.course_code} \u2014 ${c.course_title}`,
  }));

  const selectedCourse = courses.find(c => String(c.id ?? c.course_id) === courseId);

  /* Sort by risk_probability descending */
  const sorted = useMemo(
    () => [...students].sort((a, b) => (b.risk_probability ?? 0) - (a.risk_probability ?? 0)),
    [students],
  );

  /* Paginated slice */
  const visible = useMemo(() => sorted.slice(0, page * PAGE_SIZE), [sorted, page]);
  const hasMore = visible.length < sorted.length;

  /* Class averages */
  /* Metric columns for the heatmap */
  const ALL_METRICS = [
    { key: "attendance_rate",        label: "Attendance" },
    { key: "quiz_average",           label: "Quiz Avg" },
    { key: "assignment_score",       label: "Assignments" },
    { key: "quiz_attempt_rate",      label: "Quiz Attempt" },
    { key: "on_time_submission_rate", label: "On-Time Rate" },
    { key: "study_time_score",       label: "Study Time" },
    { key: "engagement_score",       label: "Engagement" },
    // v4 feature-snapshot columns
    { key: "late_submission_rate",   label: "Late Rate",   invert: true,  scale: 100 },
    { key: "material_access_rate",   label: "Materials",                  scale: 100 },
    { key: "mood_score",             label: "Mood",                       scale: 100 },
    { key: "consecutive_absences",   label: "Absences",    invert: true,  scale: 1, suffix: "" },
    { key: "weekly_checkin_streak",  label: "Check-In",                   scale: 1, suffix: "w" },
    { key: "risk_velocity",          label: "Velocity",    invert: true,  scale: 100 },
  ];

  const DEFAULT_VISIBLE = new Set([
    "attendance_rate", "quiz_average", "assignment_score",
    "quiz_attempt_rate", "on_time_submission_rate", "study_time_score", "engagement_score",
    "late_submission_rate", "material_access_rate",
  ]);
  const [visibleKeys, setVisibleKeys] = useState(DEFAULT_VISIBLE);
  const [colToggleOpen, setColToggleOpen] = useState(false);
  const colToggleRef = useRef(null);

  useEffect(() => {
    if (!colToggleOpen) return;
    function handleClick(e) {
      if (colToggleRef.current && !colToggleRef.current.contains(e.target)) setColToggleOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [colToggleOpen]);

  const METRICS = useMemo(
    () => ALL_METRICS.filter(m => visibleKeys.has(m.key)),
    [visibleKeys],
  );

  function toggleColumn(key) {
    setVisibleKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const classAvg = useMemo(() => {
    const values = {};
    ALL_METRICS.forEach((m) => {
      const scale = m.scale ?? 1;
      const validStudents = students.filter(s => s[m.key] != null);
      if (!validStudents.length) { values[m.key] = null; return; }
      values[m.key] = (validStudents.reduce((sum, s) => sum + s[m.key], 0) / validStudents.length) * scale;
    });
    return values;
  }, [students]);

  return (
    <div className="space-y-8">

      {/* ── Header ───────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-11 h-11 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <Grid size={18} className="text-slate-400" />
            </div>
            <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">
              Engagement Map
            </h1>
          </div>
          <p className="text-lg text-slate-600">
            {selectedCourse
              ? `${selectedCourse.course_code} \u00B7 ${selectedCourse.course_title}`
              : "Visualise student engagement across key metrics"}
          </p>
        </div>

        {COURSE_OPTIONS.length > 0 && (
          <div className="flex items-end gap-3">
            <CustomDropdown
              value={courseId}
              onChange={setCourseId}
              options={COURSE_OPTIONS}
              placeholder="Select course"
              label="Course"
              className="w-80"
            />
            {/* Column toggle */}
            <div className="relative" ref={colToggleRef}>
              <button
                onClick={() => setColToggleOpen(o => !o)}
                className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                <SlidersHorizontal size={14} />
                Columns ({visibleKeys.size})
              </button>
              {colToggleOpen && (
                <div className="absolute right-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-xl shadow-lg py-2 w-56 max-h-80 overflow-y-auto">
                  {ALL_METRICS.map(m => (
                    <button
                      key={m.key}
                      onClick={() => toggleColumn(m.key)}
                      className="flex items-center justify-between w-full px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
                    >
                      <span>{m.label}</span>
                      {visibleKeys.has(m.key) && <Check size={14} className="text-emerald-500" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Loading state ────────────────────────────────── */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-7 h-7 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────── */}
      {!loading && sorted.length === 0 && (
        <div className="text-center py-20 border border-dashed border-slate-200 rounded-xl">
          <Users size={32} className="mx-auto mb-4 text-slate-300" />
          <p className="text-sm text-slate-400 mb-1">No student data available</p>
          <p className="text-xs text-slate-400">
            {courses.length === 0
              ? "You have no courses assigned this semester."
              : "Select a course to view the engagement heatmap."}
          </p>
        </div>
      )}

      {/* ── Content (only when data exists) ──────────────── */}
      {!loading && sorted.length > 0 && (
        <motion.div variants={container} initial="hidden" animate="show" className="space-y-8">

          {/* ── Risk Distribution + Summary Stats ────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* Risk Distribution */}
            <RiskDistribution students={students} />

            {/* Class average cards */}
            {[
              { label: "Class Attendance", value: classAvg.attendance_rate, icon: Users },
              { label: "Class Quiz Average", value: classAvg.quiz_average, icon: BarChart2 },
            ].map(({ label, value, icon: Icon }) => (
              <motion.div
                key={label}
                variants={item}
                className="border border-slate-200 rounded-xl bg-white shadow-sm p-6 flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-4">
                  <span className="text-xs font-semibold uppercase text-slate-500 tracking-wide">{label}</span>
                  <div className="w-9 h-9 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Icon size={15} className="text-slate-400" />
                  </div>
                </div>
                <p
                  className="font-serif text-4xl font-bold leading-none mb-2"
                  style={{ color: heatBar(value) }}
                >
                  {fmt(value)}
                </p>
                <p className="text-sm text-slate-500">Across {students.length} students</p>
              </motion.div>
            ))}
          </div>

          {/* ── Legend ────────────────────────────────────── */}
          <motion.div
            variants={item}
            className="flex items-center gap-6 flex-wrap px-1"
          >
            <div className="flex items-center gap-1.5 text-xs text-slate-500">
              <Info size={12} className="flex-shrink-0" />
              <span className="font-semibold">Colour Scale:</span>
            </div>
            {[
              { label: "\u2265 80%", cls: "bg-emerald-100 text-emerald-800 border-emerald-200" },
              { label: "50 \u2013 79%", cls: "bg-amber-100 text-amber-800 border-amber-200" },
              { label: "< 50%",   cls: "bg-red-100 text-red-800 border-red-200" },
              { label: "No data", cls: "bg-slate-100 text-slate-400 border-slate-200" },
            ].map(({ label, cls }) => (
              <span
                key={label}
                className={`inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full border ${cls}`}
              >
                {label}
              </span>
            ))}
          </motion.div>

          {/* ── Heatmap Grid ─────────────────────────────── */}
          <motion.div
            variants={item}
            className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/60">
                    <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase text-slate-500 tracking-wide w-8">
                      #
                    </th>
                    <th className="text-left px-5 py-3.5 text-xs font-semibold uppercase text-slate-500 tracking-wide min-w-[200px]">
                      Student
                    </th>
                    {METRICS.map(m => (
                      <th
                        key={m.key}
                        className="text-center px-5 py-3.5 text-xs font-semibold uppercase text-slate-500 tracking-wide min-w-[110px]"
                      >
                        {m.label}
                      </th>
                    ))}
                    <th className="text-center px-5 py-3.5 text-xs font-semibold uppercase text-slate-500 tracking-wide min-w-[110px]">
                      Risk Level
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {/* ── Summary row (class averages) ─────── */}
                  <tr className="border-b-2 border-slate-200 bg-slate-50/40">
                    <td className="px-5 py-3" />
                    <td className="px-5 py-3">
                      <span className="text-xs font-bold uppercase text-slate-500 tracking-wide">
                        Class Average
                      </span>
                    </td>
                    {METRICS.map((metric) => {
                      const val = classAvg[metric.key];
                      return (
                      <td key={metric.key} className="px-5 py-3 text-center">
                        <span
                          className={`inline-block px-3 py-1.5 rounded-lg text-xs font-bold ${heatBg(val, metric.invert)}`}
                        >
                          {fmt(val, metric.suffix ?? "%")}
                        </span>
                      </td>
                      );
                    })}
                    <td className="px-5 py-3 text-center">
                      <span className="text-xs text-slate-400">\u2014</span>
                    </td>
                  </tr>

                  {/* ── Student rows ─────────────────────── */}
                  <AnimatePresence>
                    {visible.map((s, idx) => (
                      <motion.tr
                        key={s.student_id ?? s.id ?? idx}
                        variants={item}
                        className="border-b border-slate-100 hover:bg-slate-50/50 transition-colors"
                      >
                        {/* Rank */}
                        <td className="px-5 py-3 text-slate-400 text-xs font-semibold">
                          {idx + 1}
                        </td>

                        {/* Student name + initials avatar + matric */}
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-accent font-bold flex-shrink-0"
                              style={{ fontSize: 11 }}
                            >
                              {initials(s.full_name || s.name || "?")}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-slate-900 leading-tight truncate">
                                {s.full_name || s.name}
                              </p>
                              <p className="text-[11px] text-slate-400 mt-0.5">{s.matric_number}</p>
                            </div>
                          </div>
                        </td>

                        {/* Metric cells */}
                        {METRICS.map(m => {
                          const raw = s[m.key];
                          const scale = m.scale ?? 1;
                          const val = raw != null ? raw * scale : null;
                          return (
                            <td key={m.key} className="px-5 py-3 text-center">
                              <span
                                className={`inline-block px-3 py-1.5 rounded-lg text-xs font-bold min-w-[52px] ${heatBg(val, m.invert)}`}
                              >
                                {fmt(val, m.suffix ?? "%")}
                              </span>
                            </td>
                          );
                        })}

                        {/* Risk Level + Delta */}
                        <td className="px-5 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <Badge variant="risk" level={s.risk_level} />
                            {s.risk_level === "High" && (
                              <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
                            )}
                            {s.risk_delta != null && s.risk_delta !== 0 && (
                              s.risk_delta < 0
                                ? <TrendingDown size={13} className="text-emerald-500 flex-shrink-0" title={`Improved ${Math.abs(s.risk_delta * 100).toFixed(0)}%`} />
                                : <TrendingUp size={13} className="text-red-500 flex-shrink-0" title={`Worsened ${(s.risk_delta * 100).toFixed(0)}%`} />
                            )}
                            {s.risk_delta != null && s.risk_delta === 0 && (
                              <Minus size={13} className="text-slate-400 flex-shrink-0" title="No change" />
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>

            {/* Footer count + Load more */}
            <div className="px-5 py-3 border-t border-slate-200 bg-slate-50/40 flex items-center justify-between">
              <span className="text-xs text-slate-500">
                Showing <strong className="text-slate-700">{visible.length}</strong> of{" "}
                <strong className="text-slate-700">{sorted.length}</strong> student{sorted.length !== 1 ? "s" : ""}
              </span>
              {hasMore ? (
                <button
                  onClick={() => setPage(p => p + 1)}
                  className="text-xs font-semibold text-accent hover:underline"
                >
                  Load more
                </button>
              ) : (
                <span className="text-xs text-slate-400">Sorted by risk probability (highest first)</span>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </div>
  );
}
