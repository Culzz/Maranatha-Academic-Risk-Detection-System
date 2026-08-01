import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FileText, Save, RefreshCw, AlertCircle, CheckCircle, Users } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { studentsApi } from "../../services/api";

export default function SharedNotesPage() {
  const { token } = useAuth();
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [week, setWeek] = useState(1);
  const [content, setContent] = useState("");
  const [lastEditor, setLastEditor] = useState(null);
  const [editedAt, setEditedAt] = useState(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [dirty, setDirty] = useState(false);

  // Load courses
  useEffect(() => {
    const load = async () => {
      try {
        const data = await studentsApi.getMyCourses(token);
        const list = Array.isArray(data) ? data : data.courses || data.items || [];
        setCourses(list);
        if (list.length > 0) setSelectedCourse(String(list[0].id || list[0].course_id));
      } catch {}
    };
    load();
  }, [token]);

  // Load note when course/week changes
  useEffect(() => {
    if (!selectedCourse) return;
    const loadNote = async () => {
      setLoading(true);
      try {
        const data = await studentsApi.getSharedNote(selectedCourse, week, token);
        setContent(data.content || "");
        setLastEditor(data.last_edited_by || null);
        setEditedAt(data.edited_at || null);
        setDirty(false);
      } catch (e) {
        setContent("");
        setLastEditor(null);
        setEditedAt(null);
      } finally {
        setLoading(false);
      }
    };
    loadNote();
  }, [selectedCourse, week, token]);

  const saveNote = async () => {
    if (!selectedCourse) return;
    setSaving(true);
    setFeedback(null);
    try {
      await studentsApi.saveSharedNote(selectedCourse, {
        content,
        week_number: week,
      }, token);
      setFeedback({ type: "success", message: "Note saved." });
      setDirty(false);
    } catch (e) {
      setFeedback({ type: "error", message: e.message || "Failed to save." });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  // Auto-save on blur
  const handleBlur = () => {
    if (dirty) saveNote();
  };

  // Compute current semester week (approximate)
  const currentWeek = Math.max(1, Math.ceil(
    (Date.now() - new Date("2026-01-13").getTime()) / (7 * 24 * 60 * 60 * 1000)
  ));

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3">Shared Notes</h1>
        <p className="text-lg text-slate-500">Collaborate with classmates on shared study notes per course per week</p>
      </div>

      {/* Selectors */}
      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:ring-2 focus:ring-accent/15"
        >
          <option value="">Select Course</option>
          {courses.map(c => (
            <option key={c.id || c.course_id} value={c.id || c.course_id}>
              {c.course_code || c.code} — {c.course_title || c.title}
            </option>
          ))}
        </select>

        <select
          value={week}
          onChange={(e) => setWeek(parseInt(e.target.value))}
          className="h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:ring-2 focus:ring-accent/15"
        >
          {Array.from({ length: 20 }, (_, i) => i + 1).map(w => (
            <option key={w} value={w}>
              Week {w} {w === currentWeek ? "(Current)" : ""}
            </option>
          ))}
        </select>

        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={saveNote}
          disabled={saving || !dirty}
          className={`flex items-center gap-2 text-sm font-semibold px-4 h-10 rounded-xl transition-all ${
            dirty
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"
          } disabled:opacity-50`}
        >
          {saving ? (
            <><RefreshCw size={13} className="animate-spin" /> Saving...</>
          ) : (
            <><Save size={13} /> Save</>
          )}
        </motion.button>
      </div>

      {/* Editor */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm text-slate-400">
            <Users size={14} />
            <span>Collaborative — any enrolled student can edit</span>
          </div>
          {lastEditor && (
            <p className="text-xs text-slate-400">
              Last edited by {lastEditor}
              {editedAt && ` · ${new Date(editedAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`}
            </p>
          )}
        </div>

        {loading ? (
          <div className="h-64 bg-slate-50 rounded-xl animate-pulse" />
        ) : (
          <textarea
            value={content}
            onChange={(e) => { setContent(e.target.value); setDirty(true); }}
            onBlur={handleBlur}
            rows={16}
            placeholder="Start writing shared notes for this week's lectures..."
            className="w-full bg-slate-50 border border-slate-200 rounded-xl text-sm p-4 outline-none focus:ring-2 focus:ring-accent/15 resize-none placeholder:text-slate-400 transition-all"
          />
        )}
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm border ${
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-red-50 border-red-200 text-red-700"
            }`}
          >
            {feedback.type === "success" ? <CheckCircle size={14} /> : <AlertCircle size={14} />}
            {feedback.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
