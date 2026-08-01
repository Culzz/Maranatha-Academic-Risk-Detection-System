/**
 * BroadcastPage — Broadcast tasks to all students in a course.
 * Real data: lecturersApi.getCourses, tasksApi.broadcastTask, tasksApi.broadcastHistory
 */
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Send, Clock, CheckCircle, AlertTriangle,
  BookOpen, Users, BarChart2, Radio,
} from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import CustomDropdown from "../../components/ui/CustomDropdown";
import DatePicker from "../../components/ui/DatePicker";
import { SuccessBanner, ErrorBanner } from "../../components/ui/Feedback";
import { useAuth } from "../../context/AuthContext";
import { lecturersApi, tasksApi } from "../../services/api";
import { formatDate } from "../../utils/helpers";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.26 } } };

const PRIORITY_OPTIONS = [
  { value: "low",    label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high",   label: "High" },
];

const PRIORITY_COLORS = {
  low:    { bg: "bg-emerald-50", text: "text-emerald-700", border: "border-emerald-200", dot: "bg-emerald-500" },
  medium: { bg: "bg-amber-50",   text: "text-amber-700",   border: "border-amber-200",   dot: "bg-amber-500"   },
  high:   { bg: "bg-red-50",     text: "text-red-700",     border: "border-red-200",     dot: "bg-red-500"     },
};

export default function BroadcastPage() {
  const { token } = useAuth();

  // Courses
  const [courses,  setCourses]  = useState([]);
  const [courseId,  setCourseId] = useState("");

  // Form fields
  const [title,       setTitle]       = useState("");
  const [description, setDescription] = useState("");
  const [priority,    setPriority]    = useState("medium");
  const [dueDate,     setDueDate]     = useState("");

  // Broadcast history
  const [history,     setHistory]     = useState([]);
  const [histLoading, setHistLoading] = useState(false);

  // UI state
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error,   setError]   = useState("");

  // ── Load courses once ──────────────────────────────────
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

  // ── Load broadcast history when course changes ─────────
  useEffect(() => {
    if (!courseId || !token) return;
    setHistLoading(true);
    tasksApi.broadcastHistory(courseId, token)
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => setHistory([]))
      .finally(() => setHistLoading(false));
  }, [courseId, token]);

  // ── Course dropdown options ────────────────────────────
  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.id ?? c.course_id),
    label: `${c.course_code} — ${c.course_title}`,
  }));

  // ── Completion stats (derived) ─────────────────────────
  const stats = useMemo(() => {
    if (!history.length) {
      return { totalBroadcasts: 0, avgCompletion: 0, mostRecent: null };
    }
    const rates = history
      .map(b => (typeof b.completion_rate === "number" ? b.completion_rate : null))
      .filter(r => r !== null);
    const avgCompletion = rates.length
      ? Math.round(rates.reduce((sum, r) => sum + r, 0) / rates.length)
      : 0;
    const sorted = [...history].sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at),
    );
    return {
      totalBroadcasts: history.length,
      avgCompletion,
      mostRecent: sorted[0]?.created_at ?? null,
    };
  }, [history]);

  const statItems = [
    {
      label: "Total Broadcasts",
      value: stats.totalBroadcasts,
      icon: Radio,
      color: "text-slate-900",
    },
    {
      label: "Avg Completion",
      value: `${stats.avgCompletion}%`,
      icon: BarChart2,
      color: stats.avgCompletion >= 70
        ? "text-emerald-600"
        : stats.avgCompletion >= 45
          ? "text-amber-600"
          : "text-red-600",
    },
    {
      label: "Most Recent",
      value: stats.mostRecent ? formatDate(stats.mostRecent) : "--",
      icon: Clock,
      color: "text-slate-900",
      small: true,
    },
  ];

  // ── Broadcast handler ──────────────────────────────────
  const handleBroadcast = async () => {
    if (!title.trim() || !courseId) return;
    setLoading(true);
    setError("");
    setSuccess("");
    try {
      await tasksApi.broadcastTask(
        {
          course_id: Number(courseId),
          title: title.trim(),
          description: description.trim(),
          priority,
          due_date: dueDate || undefined,
        },
        token,
      );
      setSuccess(`"${title.trim()}" has been broadcast to all enrolled students.`);
      setTitle("");
      setDescription("");
      setPriority("medium");
      setDueDate("");
      // Refresh history
      const data = await tasksApi.broadcastHistory(courseId, token);
      setHistory(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to broadcast task.");
    } finally {
      setLoading(false);
    }
  };

  // ── Today's date for min on date picker ────────────────
  const today = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-8">

      {/* ── Header ──────────────────────────────────────── */}
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
            Broadcast Tasks
          </h1>
          <p className="text-lg text-slate-600">
            Send tasks and announcements to all students enrolled in a course
          </p>
        </motion.div>
      </motion.div>

      <SuccessBanner message={success} />
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* ── Completion Stats ────────────────────────────── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-3 gap-5"
      >
        {statItems.map(({ label, value, icon: Icon, color, small }) => (
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
              <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <Icon size={16} className="text-slate-400" />
              </div>
            </div>
            <p
              className={`font-serif font-bold leading-none ${color} ${small ? "text-2xl" : "text-4xl"}`}
            >
              {value}
            </p>
          </motion.div>
        ))}
      </motion.div>

      {/* ── Broadcast Form ──────────────────────────────── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
      >
        <motion.div
          variants={item}
          className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden"
        >
          <div className="px-6 py-5 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-amber-50 border border-amber-200 rounded-xl flex items-center justify-center flex-shrink-0">
                <Send size={16} className="text-amber-600" />
              </div>
              <div>
                <h2 className="font-serif text-xl font-bold text-slate-900">
                  New Broadcast
                </h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  Create a task and send it to every student in the selected course
                </p>
              </div>
            </div>
          </div>

          <div className="px-6 py-6 space-y-5">
            {/* Course selector */}
            <CustomDropdown
              label="Course"
              required
              value={courseId}
              onChange={setCourseId}
              options={COURSE_OPTIONS}
              placeholder="Select a course"
            />

            {/* Task title */}
            <Input
              label="Task Title"
              required
              placeholder="e.g. Complete Chapter 5 exercises"
              value={title}
              onChange={setTitle}
            />

            {/* Description */}
            <div>
              <label htmlFor="broadcast-description" className="ds-label">
                Description
              </label>
              <textarea
                id="broadcast-description"
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="Provide additional details or instructions for students..."
                className="ds-textarea"
              />
            </div>

            {/* Priority + Due date row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <CustomDropdown
                label="Priority"
                value={priority}
                onChange={setPriority}
                options={PRIORITY_OPTIONS}
                placeholder="Select priority"
              />
              <DatePicker
                label="Due Date"
                value={dueDate}
                onChange={setDueDate}
                min={today}
                hint="Optional — leave blank for no deadline"
              />
            </div>

            {/* Info banner */}
            <div className="flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-amber-700">
                This task will be added to the to-do list of every student enrolled in the selected course.
              </p>
            </div>

            {/* Submit button */}
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleBroadcast}
                loading={loading}
                disabled={!title.trim() || !courseId}
                icon={<Send size={14} />}
                variant="gold"
                size="md"
              >
                Broadcast to All Students
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* ── Broadcast History ───────────────────────────── */}
      <div>
        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">
          Broadcast History
        </h2>

        {histLoading ? (
          <div className="border border-slate-200 rounded-xl bg-white shadow-sm py-16 flex flex-col items-center justify-center gap-3">
            <div className="w-5 h-5 border-2 border-slate-200 border-t-slate-500 rounded-full animate-spin" />
            <p className="text-sm text-slate-400">Loading history...</p>
          </div>
        ) : history.length === 0 ? (
          <div className="border border-dashed border-slate-200 rounded-xl py-16 text-center text-slate-400">
            <Radio size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No broadcasts sent yet for this course</p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((broadcast, i) => {
              const rate = typeof broadcast.completion_rate === "number"
                ? Math.round(broadcast.completion_rate)
                : 0;
              const pColor = PRIORITY_COLORS[broadcast.priority] || PRIORITY_COLORS.medium;
              return (
                <motion.div
                  key={broadcast.id ?? i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.07, duration: 0.26 }}
                  whileHover={{ y: -1 }}
                  className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-6"
                >
                  {/* Top row — title + priority */}
                  <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-base font-semibold text-slate-900 mb-1">
                        {broadcast.title}
                      </p>
                      {broadcast.description && (
                        <p className="text-sm text-slate-500 leading-relaxed line-clamp-2">
                          {broadcast.description}
                        </p>
                      )}
                    </div>
                    {broadcast.priority && (
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg ${pColor.bg} ${pColor.text} ${pColor.border} border flex-shrink-0`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full ${pColor.dot}`} />
                        {broadcast.priority.charAt(0).toUpperCase() + broadcast.priority.slice(1)}
                      </span>
                    )}
                  </div>

                  {/* Completion progress bar */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
                        <Users size={12} />
                        {broadcast.completed_count ?? 0} of {broadcast.total_students ?? 0} students completed
                      </span>
                      <span
                        className={`text-xs font-bold ${
                          rate >= 70
                            ? "text-emerald-600"
                            : rate >= 45
                              ? "text-amber-600"
                              : "text-red-600"
                        }`}
                      >
                        {rate}%
                      </span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${rate}%` }}
                        transition={{ duration: 0.6, ease: "easeOut", delay: i * 0.07 }}
                        className={`h-full rounded-full ${
                          rate >= 70
                            ? "bg-emerald-500"
                            : rate >= 45
                              ? "bg-amber-400"
                              : "bg-red-500"
                        }`}
                      />
                    </div>
                  </div>

                  {/* Footer meta */}
                  <div className="flex items-center gap-4 text-xs text-slate-400 pt-3 border-t border-slate-100">
                    <span className="flex items-center gap-1.5">
                      <Clock size={11} /> {formatDate(broadcast.created_at)}
                    </span>
                    <span className="flex items-center gap-1.5">
                      <BookOpen size={11} /> {broadcast.total_students ?? 0} students
                    </span>
                    {rate === 100 && (
                      <span className="flex items-center gap-1.5 text-emerald-600">
                        <CheckCircle size={11} /> All completed
                      </span>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
