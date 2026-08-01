/**
 * RoadmapPage — My Day (unified schedule) + Semester Survival Roadmap.
 * Tab 1: Today view (classes, assignments, quizzes for the day)
 * Tab 2: Semester view (risk trajectory, deadlines, AI plan)
 */
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Compass, AlertTriangle, Calendar, CheckCircle,
  Clock, Loader2, TrendingUp, TrendingDown, Minus,
  Sun, BookOpen, HelpCircle,
} from "lucide-react";

import CustomDropdown from "../../components/ui/CustomDropdown";
import DatePicker from "../../components/ui/DatePicker";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { studentsApi, tasksApi } from "../../services/api";

const TABS = ["Today", "Semester"];

export default function RoadmapPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState("Today");

  return (
    <motion.div
      className="max-w-4xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-2">My Day</h1>
          <p className="text-base text-slate-600">Your daily schedule &amp; semester survival plan</p>
        </div>
      </div>

      {/* Tab switcher */}
      <div className="flex gap-1 bg-slate-100 p-1 rounded-xl w-fit">
        {TABS.map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              "px-5 py-2 rounded-lg text-sm font-semibold transition-all",
              tab === t
                ? "bg-white text-primary shadow-sm"
                : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >
            {t === "Today" && <Sun size={14} className="inline mr-1.5 -mt-0.5" />}
            {t === "Semester" && <Compass size={14} className="inline mr-1.5 -mt-0.5" />}
            {t}
          </button>
        ))}
      </div>

      {tab === "Today" ? <TodayTab token={token} /> : <SemesterTab token={token} />}
    </motion.div>
  );
}


/* ─── Today Tab ─────────────────────────────────────────────────────────── */
function TodayTab({ token }) {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [completingTaskId, setCompletingTaskId] = useState(null);
  const [selectedDate, setSelectedDate] = useState(() => {
    const d = new Date();
    return d.toISOString().split("T")[0];
  });

  const fetchEvents = useCallback(() => {
    if (!token) return Promise.resolve();
    setLoading(true);
    return studentsApi.getUnifiedSchedule(selectedDate, token)
      .then(data => setEvents(data?.events || []))
      .catch(() => setEvents([]))
      .finally(() => setLoading(false));
  }, [token, selectedDate]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  const dayLabel = new Date(selectedDate + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  const iconFor = (type) => {
    if (type === "class") return <BookOpen size={14} className="text-blue-600" />;
    if (type === "assignment") return <Calendar size={14} className="text-amber-600" />;
    if (type === "quiz") return <HelpCircle size={14} className="text-purple-600" />;
    if (type === "task") return <CheckCircle size={14} className="text-emerald-600" />;
    return <Clock size={14} className="text-slate-400" />;
  };

  const bgFor = (type) => {
    if (type === "class") return "bg-blue-50 border-blue-100";
    if (type === "assignment") return "bg-amber-50 border-amber-100";
    if (type === "quiz") return "bg-purple-50 border-purple-100";
    if (type === "task") return "bg-emerald-50 border-emerald-100";
    return "bg-slate-50 border-slate-100";
  };

  const priorityLabel = (priorityValue) => {
    const numeric = Number(priorityValue);
    if (Number.isFinite(numeric)) {
      if (numeric >= 100) return "High";
      if (numeric >= 50) return "Medium";
      return "Low";
    }
    const text = String(priorityValue || "").toLowerCase();
    if (text === "high" || text === "medium" || text === "low") {
      return text[0].toUpperCase() + text.slice(1);
    }
    return "Task";
  };

  const handleCompleteTask = async (taskId) => {
    if (!taskId || completingTaskId) return;
    setCompletingTaskId(taskId);
    try {
      await tasksApi.completeTask(taskId, token);
      await fetchEvents();
    } finally {
      setCompletingTaskId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <DatePicker
          label=""
          value={selectedDate}
          onChange={(val) => setSelectedDate(val)}
          className="w-[170px]"
        />
        <span className="text-sm text-slate-500">{dayLabel}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="animate-spin text-slate-400" size={28} />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center shadow-sm">
          <Sun size={32} className="mx-auto text-slate-300 mb-3" />
          <p className="text-sm text-slate-500 font-medium">No events scheduled for this day</p>
          <p className="text-xs text-slate-400 mt-1">Enjoy your free time or get ahead on coursework!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {events.map((ev, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              className={`flex items-center gap-4 p-4 rounded-xl border shadow-sm ${bgFor(ev.type)}`}
            >
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-white border border-slate-100 flex-shrink-0">
                {iconFor(ev.type)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{ev.title}</p>
                <p className="text-xs text-slate-500 mt-0.5">
                  {ev.course_code && `${ev.course_code} · `}
                  {ev.venue && `${ev.venue} · `}
                  <span className="capitalize">{ev.type}</span>
                </p>
                {ev.type === "task" && (
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg ${
                      priorityLabel(ev.priority) === "High"
                        ? "bg-red-100 text-red-700"
                        : priorityLabel(ev.priority) === "Medium"
                          ? "bg-amber-100 text-amber-700"
                          : "bg-slate-100 text-slate-600"
                    }`}>
                      {priorityLabel(ev.priority)}
                    </span>
                    {ev.overdue && (
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-red-100 text-red-700">
                        Overdue
                      </span>
                    )}
                  </div>
                )}
              </div>
              {ev.time && (
                <span className="text-xs font-mono font-semibold text-slate-600 flex-shrink-0">
                  {ev.time}
                </span>
              )}
              {ev.type === "task" && ev.task_id && (
                <button
                  onClick={() => handleCompleteTask(ev.task_id)}
                  disabled={completingTaskId === ev.task_id}
                  className="text-xs font-semibold text-emerald-700 bg-emerald-100 border border-emerald-200 hover:bg-emerald-200 rounded-lg px-2.5 py-1 transition-colors disabled:opacity-50"
                >
                  {completingTaskId === ev.task_id ? "..." : "Complete"}
                </button>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}


/* ─── Semester Tab ──────────────────────────────────────────────────────── */
function SemesterTab({ token }) {
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");
  const [roadmap, setRoadmap] = useState(null);
  const [deadlines, setDeadlines] = useState(null);
  const [loading, setLoading] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const u1 = on("risk_changed", () => setRefreshTick(t => t + 1));
    return () => { u1(); };
  }, [on]);

  useEffect(() => {
    studentsApi.getMyCourses(token).then(data => {
      const list = Array.isArray(data) ? data : [];
      setCourses(list);
      if (list.length) setCourseId(String(list[0].course_id ?? list[0].id ?? ""));
    }).catch(() => {});

    studentsApi.getDeadlineOverview(token).then(setDeadlines).catch(() => {});
  }, [token, refreshTick]);

  useEffect(() => {
    if (!courseId) return;
    setLoading(true);
    studentsApi.getSemesterRoadmap(courseId, token)
      .then(setRoadmap)
      .catch(() => setRoadmap(null))
      .finally(() => setLoading(false));
  }, [courseId, token, refreshTick]);

  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.course_id ?? c.id),
    label: `${c.course_code} — ${c.course_title}`,
  }));

  const TrendIcon = roadmap?.risk?.trend === "improving" ? TrendingUp
    : roadmap?.risk?.trend === "declining" ? TrendingDown : Minus;
  const trendColor = roadmap?.risk?.trend === "improving" ? "text-emerald-600"
    : roadmap?.risk?.trend === "declining" ? "text-red-600" : "text-slate-500";

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <CustomDropdown value={courseId} onChange={setCourseId} options={COURSE_OPTIONS} label="Course" className="w-80" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40"><Loader2 className="animate-spin text-slate-400" size={28} /></div>
      ) : roadmap ? (
        <>
          {/* Semester progress bar */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-semibold text-slate-700">
                Week {roadmap.semester.current_week} of {roadmap.semester.total_weeks}
              </span>
              <span className="text-sm font-bold text-primary">{roadmap.semester.progress_pct}% complete</span>
            </div>
            <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${roadmap.semester.progress_pct}%` }}
                transition={{ duration: 0.8 }}
                className="h-full bg-primary rounded-full"
              />
            </div>
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: "Risk Level", value: roadmap.risk.level, color: roadmap.risk.level === "High" ? "text-red-600" : roadmap.risk.level === "Medium" ? "text-amber-600" : "text-emerald-600" },
              { label: "Quiz Average", value: roadmap.quiz_avg != null ? `${roadmap.quiz_avg}%` : "N/A" },
              { label: "Attendance", value: roadmap.attendance_pct != null ? `${roadmap.attendance_pct}%` : "N/A" },
              { label: "Remaining Classes", value: roadmap.remaining_sessions },
            ].map(s => (
              <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
                <p className="text-xs text-slate-500 mb-1">{s.label}</p>
                <p className={`text-xl font-bold ${s.color || "text-slate-900"}`}>{s.value}</p>
              </div>
            ))}
          </div>

          {/* Trend */}
          <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm flex items-center gap-3">
            <TrendIcon size={20} className={trendColor} />
            <span className={`text-sm font-medium ${trendColor}`}>
              Risk is {roadmap.risk.trend} compared to last week
            </span>
          </div>

          {/* AI Trajectory */}
          {roadmap.trajectory && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-2">
                <Compass size={16} className="text-accent" /> AI Trajectory Analysis
              </h3>
              <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{roadmap.trajectory}</p>
            </div>
          )}

          {/* Assignments */}
          {roadmap.assignments.length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Assessments</h3>
              <div className="space-y-2">
                {roadmap.assignments.map((a, i) => (
                  <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                    <div>
                      <p className="text-sm font-medium text-slate-800">{a.title}</p>
                      {a.due_date && <p className="text-xs text-slate-500">{new Date(a.due_date).toLocaleDateString()}</p>}
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-lg ${
                      a.status === "submitted" ? "bg-emerald-100 text-emerald-700" :
                      a.status === "overdue" ? "bg-red-100 text-red-700" :
                      "bg-blue-100 text-blue-700"
                    }`}>
                      {a.status === "submitted" ? `Done${a.score !== null ? ` — ${a.score}/${a.max_marks}` : ""}` : a.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : null}

      {/* Deadline Orchestrator */}
      {deadlines && deadlines.deadlines?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-4">
          <h3 className="text-sm font-semibold text-slate-800 flex items-center gap-2">
            <Calendar size={16} className="text-primary" /> Upcoming Deadlines (14 days)
            {deadlines.collision_detected && (
              <span className="ml-2 px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded-lg flex items-center gap-1">
                <AlertTriangle size={12} /> Collision Detected
              </span>
            )}
          </h3>
          <div className="space-y-2">
            {deadlines.deadlines.map((d, i) => (
              <div key={i} className="flex items-center justify-between p-3 rounded-xl bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-800">{d.course_code}: {d.title}</p>
                  {d.due_date && <p className="text-xs text-slate-500">{new Date(d.due_date).toLocaleDateString()}</p>}
                </div>
                {d.days_remaining != null && (
                  <span className={`text-xs font-semibold ${d.days_remaining <= 2 ? "text-red-600" : d.days_remaining <= 5 ? "text-amber-600" : "text-slate-600"}`}>
                    {d.days_remaining}d left
                  </span>
                )}
              </div>
            ))}
          </div>
          {deadlines.suggested_plan && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mt-3">
              <p className="text-xs font-semibold text-blue-700 mb-2">AI Suggested Plan</p>
              <p className="text-sm text-blue-900 whitespace-pre-line leading-relaxed">{deadlines.suggested_plan}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
