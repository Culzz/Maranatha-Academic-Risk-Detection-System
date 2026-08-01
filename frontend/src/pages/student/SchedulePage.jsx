/**
 * SchedulePage — Student. Weekly timetable, exam countdowns, upcoming deadlines,
 * and scheduling conflict warnings.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Clock, MapPin, AlertTriangle, BookOpen,
  FlaskConical, GraduationCap, Timer, FileText, ClipboardList,
  CalendarDays, ChevronRight, Download,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";

import { scheduleApi } from "../../services/api";
import { formatDate, formatCourseCode } from "../../utils/helpers";

/* ── animation variants (project standard) ─────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/* ── constants ──────────────────────────────────────────── */
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const DAY_NORMALIZATION = {
  MON: "Monday",
  TUE: "Tuesday",
  WED: "Wednesday",
  THURS: "Thursday",
  THU: "Thursday",
  FRI: "Friday",
  SAT: "Saturday",
  SUN: "Sunday",
};

function normalizeDay(day) {
  if (!day) return "";
  const key = String(day).trim().toUpperCase();
  return DAY_NORMALIZATION[key] || String(day).trim();
}

function normalizeScheduleEntry(entry) {
  const type = (entry.entry_type || entry.schedule_type || "lecture").toLowerCase();
  return {
    ...entry,
    day_of_week: normalizeDay(entry.day_of_week),
    entry_type: type,
    schedule_type: type,
    venue: entry.venue || entry.hall || "",
  };
}

const ENTRY_STYLES = {
  lecture:  { bg: "bg-blue-50",   border: "border-blue-200",   text: "text-blue-700",   dot: "bg-blue-500",   badge: "bg-blue-100 text-blue-700"   },
  lab:      { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  tutorial: { bg: "bg-purple-50",  border: "border-purple-200",  text: "text-purple-700",  dot: "bg-purple-500",  badge: "bg-purple-100 text-purple-700"  },
};

const fallbackStyle = { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", dot: "bg-slate-400", badge: "bg-slate-100 text-slate-700" };

function getEntryStyle(entryType) {
  const key = (entryType || "").toLowerCase();
  return ENTRY_STYLES[key] || fallbackStyle;
}

function getEntryIcon(entryType) {
  const key = (entryType || "").toLowerCase();
  if (key === "lab")      return FlaskConical;
  if (key === "tutorial") return GraduationCap;
  return BookOpen;
}

/** Urgency colour for exam countdown cards */
function countdownColors(daysUntil) {
  if (daysUntil <= 7)  return { bg: "bg-red-50",   border: "border-red-200",   text: "text-red-700",   num: "text-red-600",   icon: "text-red-500"   };
  if (daysUntil <= 14) return { bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  num: "text-amber-600",  icon: "text-amber-500"  };
  return                       { bg: "bg-slate-50",  border: "border-slate-200",  text: "text-slate-600",  num: "text-slate-700",  icon: "text-slate-400"  };
}

/* ── skeleton helpers ───────────────────────────────────── */
function SkeletonCard({ className = "" }) {
  return (
    <div className={`animate-pulse border border-slate-200 rounded-xl bg-white p-5 ${className}`}>
      <div className="h-3 bg-slate-200 rounded w-1/3 mb-3" />
      <div className="h-4 bg-slate-100 rounded w-2/3 mb-4" />
      <div className="h-3 bg-slate-100 rounded w-1/2" />
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="animate-pulse flex gap-4 py-4">
      <div className="w-10 h-10 bg-slate-200 rounded-xl flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-3 bg-slate-200 rounded w-1/2" />
        <div className="h-3 bg-slate-100 rounded w-1/3" />
      </div>
    </div>
  );
}

/* ── sub-components ─────────────────────────────────────── */

function CountdownCard({ exam }) {
  const c = countdownColors(exam.days_until);
  return (
    <motion.div
      variants={item}
      whileHover={{ y: -2 }}
      className={`border ${c.border} ${c.bg} rounded-xl p-5 hover:shadow-md transition-all duration-200`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">
            {formatCourseCode(exam.course_code)}
          </p>
          <p className={`text-sm font-bold leading-tight mb-2 ${c.text}`}>
            {exam.exam_type || "Exam"}
          </p>
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <CalendarDays size={11} />
            {formatDate(exam.exam_date)}
          </p>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center mb-1 ${c.bg} border ${c.border}`}>
            <Timer size={16} className={c.icon} />
          </div>
          <p className={`font-serif text-2xl font-bold leading-none ${c.num}`}>
            {exam.days_until}
          </p>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400 mt-0.5">
            {exam.days_until === 1 ? "day" : "days"}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

function TimetableEntry({ entry }) {
  const style = getEntryStyle(entry.entry_type);
  const Icon  = getEntryIcon(entry.entry_type);

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -1 }}
      className={`border ${style.border} ${style.bg} rounded-xl p-4 hover:shadow-md transition-all duration-200`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${style.badge}`}>
          <Icon size={14} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 leading-tight mb-1">
            {formatCourseCode(entry.course_code)}
          </p>
          <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-1.5">
            <Clock size={10} />
            {entry.start_time} &ndash; {entry.end_time}
          </p>
          {entry.venue && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-2">
              <MapPin size={10} />
              {entry.venue}
            </p>
          )}
          <span className={`inline-block text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-lg ${style.badge}`}>
            {entry.entry_type}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function DeadlineItem({ item: d, icon: Icon, typeLabel }) {
  const dueDate   = d.due_date || d.deadline;
  const dueDiff   = dueDate ? Math.ceil((new Date(dueDate) - new Date()) / (1000 * 60 * 60 * 24)) : null;
  const isUrgent  = dueDiff !== null && dueDiff <= 2;
  const isSoon    = dueDiff !== null && dueDiff <= 5;

  return (
    <motion.div
      initial={{ opacity: 0, x: -4 }}
      animate={{ opacity: 1, x: 0 }}
      className="flex items-start gap-4 py-4 border-b border-slate-100 last:border-0"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isUrgent ? "bg-red-50 border border-red-200" : "bg-slate-50 border border-slate-200"
      }`}>
        <Icon size={14} className={isUrgent ? "text-red-500" : "text-slate-400"} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-slate-900 leading-tight mb-0.5">
          {d.title || d.quiz_title || d.assignment_title || "Untitled"}
        </p>
        <p className="text-xs text-slate-500 mb-1">
          {formatCourseCode(d.course_code) || ""}{d.course_code && " \u00B7 "}{typeLabel}
        </p>
        <div className="flex items-center gap-2">
          <p className={`text-xs font-semibold flex items-center gap-1 ${
            isUrgent ? "text-red-600" : isSoon ? "text-amber-600" : "text-slate-500"
          }`}>
            <Clock size={10} />
            {dueDate ? formatDate(dueDate) : "No due date"}
          </p>
          {dueDiff !== null && dueDiff > 0 && (
            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${
              isUrgent ? "bg-red-100 text-red-700" : isSoon ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"
            }`}>
              {dueDiff} {dueDiff === 1 ? "day" : "days"} left
            </span>
          )}
          {dueDiff !== null && dueDiff <= 0 && (
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-red-100 text-red-700">
              Overdue
            </span>
          )}
        </div>
      </div>
      <ChevronRight size={14} className="text-slate-300 flex-shrink-0 mt-1" />
    </motion.div>
  );
}

/* ── main page ──────────────────────────────────────────── */
export default function SchedulePage() {
  const { token } = useAuth();

  const [schedule,    setSchedule]    = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [quizzes,     setQuizzes]     = useState([]);
  const [conflicts,   setConflicts]   = useState([]);
  const [countdowns,  setCountdowns]  = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [scheduleRes, countdownRes] = await Promise.allSettled([
        scheduleApi.getMySchedule(token),
        scheduleApi.getCountdown(token),
      ]);

      if (scheduleRes.status === "fulfilled") {
        const d = scheduleRes.value;
        const scheduleRows = Array.isArray(d.schedule) ? d.schedule.map(normalizeScheduleEntry) : [];
        const assignmentsRows = Array.isArray(d.upcoming_assignments)
          ? d.upcoming_assignments
          : (Array.isArray(d.assignments) ? d.assignments : []);
        const quizzesRows = Array.isArray(d.upcoming_quizzes)
          ? d.upcoming_quizzes
          : (Array.isArray(d.quizzes) ? d.quizzes : []);
        setSchedule(scheduleRows);
        setAssignments(assignmentsRows);
        setQuizzes(quizzesRows);
        setConflicts(Array.isArray(d.conflicts) ? d.conflicts : []);
      }

      if (countdownRes.status === "fulfilled") {
        const rows = Array.isArray(countdownRes.value) ? countdownRes.value : [];
        setCountdowns(rows.map((exam) => ({
          ...exam,
          exam_type: exam.exam_type || exam.schedule_type || "Exam",
        })));
      }
    } catch (e) {
      setError(e.message || "Failed to load schedule.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time: refetch on schedule-affecting events
  const { on } = useRealtime();
  useEffect(() => {
    const u1 = on("assignment_published", fetchData);
    const u2 = on("class_cancelled", fetchData);
    const u3 = on("exam_timetable_published", fetchData);
    return () => { u1(); u2(); u3(); };
  }, [on]);

  /* Group schedule entries by day of week */
  const scheduleByDay = {};
  WEEKDAYS.forEach(day => { scheduleByDay[day] = []; });
  schedule.forEach(entry => {
    const day = entry.day_of_week;
    if (scheduleByDay[day]) {
      scheduleByDay[day].push(entry);
    }
  });
  /* Sort each day's entries by start_time */
  WEEKDAYS.forEach(day => {
    scheduleByDay[day].sort((a, b) => (a.start_time || "").localeCompare(b.start_time || ""));
  });

  /* Combine and sort deadlines */
  const deadlines = [
    ...assignments.map(a => ({ ...a, _type: "assignment" })),
    ...quizzes.map(q => ({ ...q, _type: "quiz" })),
  ].sort((a, b) => {
    const dateA = a.due_date || a.deadline || "";
    const dateB = b.due_date || b.deadline || "";
    return dateA.localeCompare(dateB);
  });

  const hasSchedule = schedule.length > 0;
  const hasCountdowns = countdowns.length > 0;
  const hasDeadlines = deadlines.length > 0;
  const hasConflicts = conflicts.length > 0;

  /* ── loading state ─── */
  if (loading) {
    return (
      <div className="space-y-8">
        <div className="max-w-2xl">
          <div className="h-10 bg-slate-200 rounded w-56 mb-3 animate-pulse" />
          <div className="h-5 bg-slate-100 rounded w-80 animate-pulse" />
        </div>

        {/* Countdown skeletons */}
        <div>
          <div className="h-6 bg-slate-200 rounded w-44 mb-6 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>

        {/* Timetable skeletons */}
        <div>
          <div className="h-6 bg-slate-200 rounded w-52 mb-6 animate-pulse" />
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {WEEKDAYS.map(day => (
              <div key={day} className="border border-slate-200 rounded-xl bg-white p-4">
                <div className="h-4 bg-slate-200 rounded w-20 mb-4 animate-pulse" />
                <SkeletonCard />
              </div>
            ))}
          </div>
        </div>

        {/* Deadlines skeleton */}
        <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-6">
          <div className="h-6 bg-slate-200 rounded w-48 mb-6 animate-pulse" />
          {[1, 2, 3].map(i => <SkeletonRow key={i} />)}
        </div>
      </div>
    );
  }

  /* ── empty state ─── */
  if (!hasSchedule && !hasCountdowns && !hasDeadlines) {
    return (
      <div className="space-y-8">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">My Schedule</h1>
          <p className="text-lg text-slate-600">View your weekly timetable and upcoming deadlines</p>
        </div>
        <div className="text-center py-20 border border-slate-200 rounded-xl bg-white shadow-sm">
          <Calendar size={36} className="text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500 font-medium mb-1">No schedule entries yet</p>
          <p className="text-sm text-slate-400">Your timetable and deadlines will appear here once your courses are set up</p>
        </div>
      </div>
    );
  }

  /* ── main render ─── */
  return (
    <div className="space-y-8">

      {/* ── Header ─── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">My Schedule</h1>
          <p className="text-lg text-slate-600">View your weekly timetable and upcoming deadlines</p>
        </div>
        <a
          href="/api/timetable/class/my/export.ics"
          download="timetable.ics"
          className="flex items-center gap-2 text-sm font-semibold text-primary bg-blue-50 border border-blue-200 rounded-xl px-4 py-2.5 hover:bg-blue-100 transition-colors"
        >
          <Download size={14} /> Export to Calendar
        </a>
      </div>

      {/* ── Error banner ─── */}
      {error && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4">
          <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* ── Conflict warnings ─── */}
      <AnimatePresence>
        {hasConflicts && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-start gap-4 bg-amber-50 border border-amber-200 rounded-xl p-5"
          >
            <div className="w-10 h-10 bg-amber-100 border border-amber-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle size={18} className="text-amber-600" />
            </div>
            <div>
              <p className="font-semibold text-amber-800 mb-1">Scheduling Conflicts Detected</p>
              <ul className="space-y-1">
                {conflicts.map((conflict, idx) => (
                  <li key={idx} className="text-sm text-amber-700 flex items-start gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                    {typeof conflict === "string" ? conflict : (
                      `${conflict.course_code_a || ""} and ${conflict.course_code_b || ""} overlap on ${conflict.day_of_week || ""} (${conflict.start_time || ""} - ${conflict.end_time || ""})`
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Exam countdown ─── */}
      {hasCountdowns && (
        <div>
          <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">Exam Countdown</h2>
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
          >
            {countdowns.map((exam, idx) => (
              <CountdownCard key={`${exam.course_code}-${idx}`} exam={exam} />
            ))}
          </motion.div>
        </div>
      )}

      {/* ── Weekly timetable grid ─── */}
      <div>
        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">Weekly Timetable</h2>
        {hasSchedule ? (
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
            {WEEKDAYS.map(day => {
              const entries = scheduleByDay[day];
              return (
                <div key={day} className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
                  {/* Day header */}
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                    <h3 className="text-sm font-bold text-slate-900">{day}</h3>
                    <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">
                      {entries.length} {entries.length === 1 ? "class" : "classes"}
                    </p>
                  </div>

                  {/* Entries */}
                  <div className="p-3 space-y-3 min-h-[120px]">
                    {entries.length > 0 ? (
                      entries.map(entry => (
                        <TimetableEntry key={entry.id} entry={entry} />
                      ))
                    ) : (
                      <div className="flex flex-col items-center justify-center h-full py-6 text-slate-300">
                        <Calendar size={18} className="mb-1.5 opacity-50" />
                        <p className="text-xs">No classes</p>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-16 border border-slate-200 rounded-xl bg-white shadow-sm">
            <Calendar size={28} className="text-slate-300 mx-auto mb-3 opacity-50" />
            <p className="text-sm text-slate-500">No timetable entries found for this semester</p>
          </div>
        )}
      </div>

      {/* ── Upcoming deadlines ─── */}
      {hasDeadlines && (
        <div>
          <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">Upcoming Deadlines</h2>
          <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-6">
            <div className="divide-y divide-slate-100">
              {deadlines.map((d, idx) => (
                <DeadlineItem
                  key={`${d._type}-${d.id || idx}`}
                  item={d}
                  icon={d._type === "quiz" ? ClipboardList : FileText}
                  typeLabel={d._type === "quiz" ? "Quiz" : "Assignment"}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Legend ─── */}
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Legend</p>
          {[
            { label: "Lecture",  color: "bg-blue-500"    },
            { label: "Lab",     color: "bg-emerald-500"  },
            { label: "Tutorial", color: "bg-purple-500"  },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-xs text-slate-600 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
