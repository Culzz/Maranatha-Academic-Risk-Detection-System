/**
 * TodoPage — Student. Personal to-do list with streak tracking.
 * Supports personal, required, and broadcast tasks grouped by due date.
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Flame, CheckCircle2, Circle, Trash2, Clock,
  AlertTriangle, CalendarDays, ListChecks, Loader,
  ClipboardList, Tag, BookOpen,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { tasksApi } from "../../services/api";
import { formatDate, formatCourseCode } from "../../utils/helpers";
import CustomDropdown from "../../components/ui/CustomDropdown";

import DatePicker from "../../components/ui/DatePicker";

/* ── animation variants ───────────────────────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

/* ── priority config ──────────────────────────────────── */
const PRIORITY_CONFIG = {
  high:   { label: "High",   text: "text-red-700",   bg: "bg-red-50",   border: "border-red-200"   },
  medium: { label: "Medium", text: "text-amber-700",  bg: "bg-amber-50",  border: "border-amber-200"  },
  low:    { label: "Low",    text: "text-slate-600",  bg: "bg-slate-100", border: "border-slate-200" },
};

/* ── task type config ─────────────────────────────────── */
const TYPE_CONFIG = {
  personal:  { label: "Personal",  text: "text-blue-700",   bg: "bg-blue-50",    border: "border-blue-200"   },
  required:  { label: "Required",  text: "text-purple-700", bg: "bg-purple-50",  border: "border-purple-200" },
  broadcast: { label: "Broadcast", text: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
};

/* ── date helpers ─────────────────────────────────────── */
function startOfDay(d) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function classifyTask(task) {
  if (task.is_completed) return "completed";
  if (!task.due_date) return "upcoming";
  const today = startOfDay(new Date());
  const due   = startOfDay(new Date(task.due_date));
  if (due < today) return "overdue";
  if (due.getTime() === today.getTime()) return "today";
  return "upcoming";
}

/* ── stat card ────────────────────────────────────────── */
function StatCard({ label, value, icon: Icon, valueColor = "text-slate-900" }) {
  return (
    <motion.div
      variants={item}
      whileHover={{ y: -2 }}
      className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase text-slate-500 tracking-wide">{label}</span>
        <div className="w-9 h-9 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center">
          <Icon size={15} className="text-slate-400" />
        </div>
      </div>
      <p className={`font-serif text-3xl font-bold leading-none ${valueColor}`}>{value}</p>
    </motion.div>
  );
}

/* ── task row ─────────────────────────────────────────── */
function TaskRow({ task, onComplete, onDelete }) {
  const [completing, setCompleting] = useState(false);
  const [deleting,   setDeleting]   = useState(false);

  const priorityKey = typeof task.priority === "number"
    ? (task.priority >= 100 ? "high" : task.priority >= 50 ? "medium" : "low")
    : (task.priority || "low");
  const priorityCfg = PRIORITY_CONFIG[priorityKey] || PRIORITY_CONFIG.low;
  const typeCfg     = TYPE_CONFIG[task.task_type]     || TYPE_CONFIG.personal;
  const isPersonal  = task.task_type === "personal";
  const isDone      = task.is_completed;

  const handleComplete = async () => {
    if (isDone || completing) return;
    setCompleting(true);
    try { await onComplete(task.id); }
    finally { setCompleting(false); }
  };

  const handleDelete = async () => {
    if (deleting) return;
    setDeleting(true);
    try { await onDelete(task.id); }
    finally { setDeleting(false); }
  };

  return (
    <motion.div
      variants={item}
      layout
      whileHover={{ y: -1 }}
      className={[
        "border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-5 group",
        isDone ? "opacity-60" : "",
      ].join(" ")}
    >
      <div className="flex items-start gap-4">
        {/* Checkbox */}
        <button
          onClick={handleComplete}
          disabled={isDone || completing}
          className="mt-0.5 flex-shrink-0 disabled:cursor-default"
          aria-label={isDone ? "Task completed" : "Mark task complete"}
        >
          {completing ? (
            <Loader size={20} className="animate-spin text-accent" />
          ) : isDone ? (
            <CheckCircle2 size={20} className="text-emerald-500" />
          ) : (
            <Circle size={20} className="text-slate-300 hover:text-accent transition-colors" />
          )}
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <p className={[
            "text-sm font-semibold leading-snug mb-2",
            isDone ? "line-through text-slate-400" : "text-slate-900",
          ].join(" ")}>
            {task.title}
          </p>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Priority badge */}
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${priorityCfg.text} ${priorityCfg.bg} ${priorityCfg.border} border`}>
              {priorityCfg.label}
            </span>

            {/* Urgency chip */}
            {task.urgency_score > 1.5 && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200">
                Urgent
              </span>
            )}

            {/* Task type badge */}
            <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg ${typeCfg.text} ${typeCfg.bg} ${typeCfg.border} border`}>
              {typeCfg.label}
            </span>

            {/* Course info */}
            {task.course_code && (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-lg">
                <BookOpen size={10} />
                {formatCourseCode(task.course_code)}
              </span>
            )}

            {/* Due date */}
            {task.due_date && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <CalendarDays size={11} />
                {formatDate(task.due_date)}
              </span>
            )}

            {/* Completed at */}
            {isDone && task.completed_at && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                <CheckCircle2 size={11} />
                Done {formatDate(task.completed_at)}
              </span>
            )}
          </div>
        </div>

        {/* Delete (personal tasks only) */}
        {isPersonal && !isDone && (
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
            aria-label="Delete task"
          >
            {deleting
              ? <Loader size={14} className="animate-spin" />
              : <Trash2 size={14} />
            }
          </button>
        )}
      </div>
    </motion.div>
  );
}

/* ── task section ─────────────────────────────────────── */
function TaskSection({ title, icon: Icon, iconColor, tasks, onComplete, onDelete }) {
  if (tasks.length === 0) return null;
  return (
    <div>
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon size={14} className="text-white" />
        </div>
        <h3 className="font-serif text-lg font-bold text-slate-900">{title}</h3>
        <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
          {tasks.length}
        </span>
      </div>
      <motion.div variants={container} initial="hidden" animate="show" className="space-y-3">
        {tasks.map(t => (
          <TaskRow key={t.id} task={t} onComplete={onComplete} onDelete={onDelete} />
        ))}
      </motion.div>
    </div>
  );
}

/* ── main page ────────────────────────────────────────── */
export default function TodoPage() {
  const { token } = useAuth();

  const [tasks,          setTasks]          = useState([]);
  const [streak,         setStreak]         = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [overdueCount,   setOverdueCount]   = useState(0);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState("");

  /* add-task form state */
  const [newTitle,    setNewTitle]    = useState("");
  const [newPriority, setNewPriority] = useState("medium");
  const [newDueDate,  setNewDueDate]  = useState("");
  const [adding,      setAdding]      = useState(false);
  const [typeFilter,  setTypeFilter]  = useState("all");

  /* ── fetch tasks ─────────────────────────────────────── */
  const fetchTasks = useCallback(async () => {
    try {
      const data = await tasksApi.getMyTasks(token);
      setTasks(data.tasks || []);
      setStreak(data.streak || 0);
      setCompletedToday(data.completed_today || 0);
      setOverdueCount(data.overdue_count || 0);
    } catch (e) {
      setError(e.message || "Failed to load tasks.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  // Real-time: refetch when new tasks may be created
  const { on } = useRealtime();
  useEffect(() => {
    const u1 = on("assignment_published", fetchTasks);
    const u2 = on("quiz_published", fetchTasks);
    const u3 = on("material_uploaded", fetchTasks);
    return () => { u1(); u2(); u3(); };
  }, [on]);

  /* ── create task ─────────────────────────────────────── */
  const handleAddTask = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setAdding(true);
    setError("");
    try {
      await tasksApi.createTask({
        title:     newTitle.trim(),
        priority:  newPriority,
        due_date:  newDueDate || null,
        course_id: null,
      }, token);
      setNewTitle("");
      setNewPriority("medium");
      setNewDueDate("");
      await fetchTasks();
    } catch (e) {
      setError(e.message || "Failed to create task.");
    } finally {
      setAdding(false);
    }
  };

  /* ── complete task ───────────────────────────────────── */
  const handleComplete = async (taskId) => {
    try {
      await tasksApi.completeTask(taskId, token);
      await fetchTasks();
    } catch (e) {
      setError(e.message || "Failed to complete task.");
    }
  };

  /* ── delete task ─────────────────────────────────────── */
  const handleDelete = async (taskId) => {
    try {
      await tasksApi.deleteTask(taskId, token);
      await fetchTasks();
    } catch (e) {
      setError(e.message || "Failed to delete task.");
    }
  };

  /* ── group tasks ─────────────────────────────────────── */
  const grouped = useMemo(() => {
    const filtered = typeFilter === "all" ? tasks : tasks.filter(t => t.task_type === typeFilter);
    const groups = { overdue: [], today: [], upcoming: [], completed: [] };
    filtered.forEach(t => {
      const cat = classifyTask(t);
      groups[cat].push(t);
    });
    return groups;
  }, [tasks, typeFilter]);

  const pendingTotal = grouped.overdue.length + grouped.today.length + grouped.upcoming.length;

  /* ── loading state ───────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* ── Header ─────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">To-Do List</h1>
          <p className="text-lg text-slate-600">Stay organized and build momentum</p>
        </div>

        {/* Streak badge */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2.5 bg-amber-50 border border-amber-200 px-4 py-2.5 rounded-xl"
        >
          <Flame size={18} className="text-amber-500" />
          <span className="text-sm font-bold text-amber-800">{streak} day streak</span>
        </motion.div>
      </div>

      {/* ── Error banner ───────────────────────────────── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl"
          >
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 flex-1">{error}</p>
            <button onClick={() => setError("")} className="text-red-400 hover:text-red-600 text-xs font-semibold">
              Dismiss
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add Task Form ──────────────────────────────── */}
      <motion.form
        onSubmit={handleAddTask}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="border border-slate-200 rounded-xl bg-white shadow-sm p-5"
      >
        <div className="flex items-end gap-3 flex-wrap">
          {/* Title */}
          <div className="flex-1 min-w-[200px]">
            <label htmlFor="task-title" className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5 block">
              New Task
            </label>
            <input
              id="task-title"
              type="text"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="What do you need to do?"
              className="w-full h-10 px-3.5 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 transition-all"
            />
          </div>

          {/* Priority */}
          <div className="min-w-[120px]">
            <CustomDropdown
              label="Priority"
              value={newPriority}
              onChange={(val) => setNewPriority(val)}
              options={[
                { value: "low", label: "Low" },
                { value: "medium", label: "Medium" },
                { value: "high", label: "High" },
              ]}
            />
          </div>

          {/* Due date */}
          <div className="min-w-[160px]">
            <DatePicker
              label="Due Date"
              value={newDueDate}
              onChange={(val) => setNewDueDate(val)}
            />
          </div>

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={adding || !newTitle.trim()}
            whileTap={{ scale: 0.96 }}
            className="h-10 px-5 bg-primary text-white text-sm font-semibold rounded-xl flex items-center gap-2 disabled:opacity-50 hover:opacity-90 transition-all flex-shrink-0"
          >
            {adding
              ? <><Loader size={14} className="animate-spin" /> Adding...</>
              : <><Plus size={14} /> Add Task</>
            }
          </motion.button>
        </div>
      </motion.form>

      {/* ── Category Filter ──────────────────────────────── */}
      <div className="flex items-center gap-2">
        <Tag size={14} className="text-slate-400" />
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Filter:</span>
        <div className="flex gap-1.5">
          {[
            { value: "all", label: "All" },
            { value: "personal", label: "Personal" },
            { value: "required", label: "Required" },
            { value: "broadcast", label: "Broadcast" },
          ].map(opt => (
            <button
              key={opt.value}
              onClick={() => setTypeFilter(opt.value)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                typeFilter === opt.value
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats Bar ──────────────────────────────────── */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-1 sm:grid-cols-3 gap-4"
      >
        <StatCard
          label="Completed Today"
          value={completedToday}
          icon={CheckCircle2}
          valueColor="text-emerald-600"
        />
        <StatCard
          label="Overdue"
          value={overdueCount}
          icon={AlertTriangle}
          valueColor={overdueCount > 0 ? "text-red-600" : "text-slate-900"}
        />
        <StatCard
          label="Pending"
          value={pendingTotal}
          icon={ListChecks}
        />
      </motion.div>

      {/* ── Task Sections ──────────────────────────────── */}
      {tasks.length === 0 ? (
        /* Empty state */
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center py-20 border border-slate-200 rounded-xl bg-white shadow-sm"
        >
          <div className="w-16 h-16 bg-slate-100 border border-slate-200 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <ClipboardList size={28} className="text-slate-300" />
          </div>
          <h3 className="font-serif text-xl font-bold text-slate-500 mb-2">No tasks yet</h3>
          <p className="text-sm text-slate-400 max-w-sm mx-auto leading-relaxed">
            Add your first task above to start tracking your work and building your streak.
          </p>
        </motion.div>
      ) : (
        <div className="space-y-10">
          {/* Overdue */}
          <TaskSection
            title="Overdue"
            icon={AlertTriangle}
            iconColor="bg-red-500"
            tasks={grouped.overdue}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />

          {/* Today */}
          <TaskSection
            title="Today"
            icon={CalendarDays}
            iconColor="bg-accent"
            tasks={grouped.today}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />

          {/* Upcoming */}
          <TaskSection
            title="Upcoming"
            icon={Clock}
            iconColor="bg-slate-500"
            tasks={grouped.upcoming}
            onComplete={handleComplete}
            onDelete={handleDelete}
          />

          {/* Completed */}
          {grouped.completed.length > 0 && (
            <TaskSection
              title="Completed"
              icon={CheckCircle2}
              iconColor="bg-emerald-500"
              tasks={grouped.completed}
              onComplete={handleComplete}
              onDelete={handleDelete}
            />
          )}
        </div>
      )}
    </div>
  );
}
