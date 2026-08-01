/**
 * CourseStudentsPage — Risk leaderboard (KF6) + student detail modal.
 * Real data: lecturersApi.getCourses + getCourseStudents + getStudentDetail
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, X, TrendingUp, Activity, Sparkles, Loader2, Zap } from "lucide-react";
import Badge from "../../components/ui/Badge";
import Button from "../../components/ui/Button";
import CustomDropdown from "../../components/ui/CustomDropdown";
import VirtualizedTable from "../../components/shared/VirtualizedTable";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { lecturersApi } from "../../services/api";
import { riskColors, initials } from "../../utils/helpers";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } };

const FILTERS = ["All", "High", "Medium", "Low"];

function DetailModal({ student, courseId, token, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("stats"); // "stats" | "deepdive"
  const [deepDive, setDeepDive] = useState(null);
  const [deepLoading, setDeepLoading] = useState(false);
  const [genLoading, setGenLoading] = useState(false);
  const [genResult, setGenResult] = useState(null);
  const [genError, setGenError] = useState("");

  useEffect(() => {
    const sid = student?.student_id ?? student?.id;
    if (!sid || !courseId) { setLoading(false); return; }
    lecturersApi.getStudentDetail(sid, courseId, token)
      .then(d => setDetail(d))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [student, courseId, token]);

  const loadDeepDive = () => {
    if (deepDive || deepLoading) return;
    const sid = student?.student_id ?? student?.id;
    if (!sid) return;
    setDeepLoading(true);
    lecturersApi.getStudentDeepDive(sid, courseId, token)
      .then(d => setDeepDive(d))
      .catch(() => setDeepDive({ error: true }))
      .finally(() => setDeepLoading(false));
  };

  const handleGenerate = async () => {
    const sid = student?.student_id ?? student?.id;
    if (!sid || !courseId || genLoading) return;
    setGenLoading(true); setGenError(""); setGenResult(null);
    try {
      const res = await lecturersApi.generateIntervention(sid, courseId, token);
      setGenResult(res);
    } catch (e) {
      setGenError(e.message || "Failed to generate intervention.");
    } finally {
      setGenLoading(false);
    }
  };

  const shapEntries = detail?.shap_explanation
    ? Object.entries(detail.shap_explanation).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    : [];

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-primary/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-start justify-between p-6 border-b border-slate-200">
            <div className="flex items-center gap-4">
              <div
                className="w-12 h-12 rounded-full bg-primary flex items-center justify-center text-accent font-bold flex-shrink-0"
                style={{ fontSize: 13 }}
              >
                {initials(student?.full_name || student?.name || "?")}
              </div>
              <div>
                <h3 className="font-serif text-xl font-bold text-slate-900">
                  {student?.full_name || student?.name}
                </h3>
                <p className="text-sm text-slate-500">{student?.matric_number}</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all">
              <X size={16} />
            </button>
          </div>

          {/* Tab switcher */}
          <div className="flex border-b border-slate-200">
            {[
              { key: "stats", label: "Stats & SHAP" },
              { key: "deepdive", label: "AI Deep Dive" },
            ].map(t => (
              <button
                key={t.key}
                onClick={() => { setTab(t.key); if (t.key === "deepdive") loadDeepDive(); }}
                className={[
                  "flex-1 py-3 text-sm font-semibold transition-all border-b-2",
                  tab === t.key
                    ? "text-primary border-accent"
                    : "text-slate-400 border-transparent hover:text-slate-600",
                ].join(" ")}
              >
                {t.key === "deepdive" && <Sparkles size={13} className="inline-block mr-1.5 -mt-0.5" />}
                {t.label}
              </button>
            ))}
          </div>

          <div className="p-6 space-y-5 overflow-y-auto max-h-[60vh]">

            {/* === Stats tab === */}
            {tab === "stats" && (
              <>
                {/* Risk snapshot */}
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { label: "Risk Level", value: <Badge variant="risk" level={student?.risk_level} /> },
                    { label: "Probability", value: `${Math.round((student?.risk_probability ?? 0) * 100)}%`, color: riskColors(student?.risk_level).text },
                    { label: "Attendance", value: student?.attendance_rate != null ? `${student.attendance_rate}%` : "—" },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                      <p className="text-xs text-slate-500 mb-2">{label}</p>
                      {typeof value === "string"
                        ? <p className={`text-lg font-bold ${color || "text-slate-900"}`}>{value}</p>
                        : value
                      }
                    </div>
                  ))}
                </div>

                {/* Stats */}
                {(detail || student) && (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "Quiz Average", value: (detail?.quiz_average ?? student?.quiz_average)?.toFixed(1), unit: "%" },
                      { label: "Submission Rate", value: (detail?.submission_rate ?? student?.submission_rate)?.toFixed(1), unit: "%" },
                      { label: "Late Submissions", value: detail?.late_submissions ?? student?.late_submissions ?? "—" },
                      { label: "Absences", value: detail?.absences ?? student?.absences ?? "—" },
                    ].map(({ label, value, unit }) => (
                      <div key={label} className="flex justify-between items-center py-2 border-b border-slate-100">
                        <span className="text-sm text-slate-600">{label}</span>
                        <span className="text-sm font-semibold text-slate-900">
                          {value != null ? `${value}${unit || ""}` : "—"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {/* SHAP factors */}
                {shapEntries.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Activity size={14} className="text-slate-400" />
                      <p className="text-sm font-semibold text-slate-900">Key Risk Factors</p>
                    </div>
                    <div className="space-y-2">
                      {shapEntries.slice(0, 5).map(([feat, val]) => {
                        const isRisk = val > 0;
                        const pct = Math.abs(val / shapEntries[0][1]) * 100;
                        return (
                          <div key={feat} className="flex items-center gap-3">
                            <span className="text-xs text-slate-600 w-36 flex-shrink-0 truncate">{feat}</span>
                            <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full"
                                style={{ width: `${pct}%`, backgroundColor: isRisk ? "#e11d48" : "#10b981" }}
                              />
                            </div>
                            <span className="text-xs font-bold w-12 text-right" style={{ color: isRisk ? "#e11d48" : "#10b981" }}>
                              {isRisk ? "+" : ""}{val.toFixed(2)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Generate AI Intervention */}
                {student?.risk_level && student.risk_level !== "Low" && (
                  <div className="pt-2">
                    {genResult ? (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <p className="text-sm font-semibold text-emerald-800 mb-1">Intervention Sent</p>
                        <p className="text-sm text-emerald-700">{genResult.ai_content?.slice(0, 200)}…</p>
                      </div>
                    ) : genError ? (
                      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                        <p className="text-sm text-red-700">{genError}</p>
                      </div>
                    ) : (
                      <Button
                        onClick={handleGenerate}
                        loading={genLoading}
                        icon={<Zap size={14} />}
                        variant="gold"
                        className="w-full"
                      >
                        Generate AI Intervention
                      </Button>
                    )}
                  </div>
                )}

                {loading && (
                  <div className="flex items-center justify-center py-8">
                    <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                  </div>
                )}
              </>
            )}

            {/* === Deep Dive tab === */}
            {tab === "deepdive" && (
              <>
                {deepLoading && (
                  <div className="flex flex-col items-center justify-center py-12 gap-3">
                    <Loader2 size={24} className="animate-spin text-accent" />
                    <p className="text-sm text-slate-500">Generating AI narrative...</p>
                  </div>
                )}
                {deepDive && !deepDive.error && !deepLoading && (
                  <>
                    {/* Narrative */}
                    {deepDive.narrative && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-3">
                          <Sparkles size={14} className="text-accent" />
                          <p className="text-sm font-semibold text-slate-900">The Story So Far</p>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{deepDive.narrative}</p>
                      </div>
                    )}

                    {/* Risk timeline */}
                    {deepDive.risk_timeline?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-slate-900 mb-2">Risk Timeline</p>
                        <div className="flex gap-2 flex-wrap">
                          {deepDive.risk_timeline.map((r, i) => (
                            <span
                              key={i}
                              className={[
                                "text-[11px] font-semibold px-2.5 py-1 rounded-full border",
                                r.level === "High" ? "bg-red-50 text-red-700 border-red-200"
                                  : r.level === "Medium" ? "bg-amber-50 text-amber-700 border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border-emerald-200",
                              ].join(" ")}
                            >
                              Wk {r.week}: {r.level} ({r.probability}%)
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Quiz scores */}
                    {deepDive.quiz_scores?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-slate-900 mb-2">Quiz Scores</p>
                        <div className="flex items-end gap-1.5 h-16">
                          {deepDive.quiz_scores.map((s, i) => (
                            <div key={i} className="flex-1 flex flex-col items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-500">{s}%</span>
                              <div
                                className="w-full rounded-t"
                                style={{
                                  height: `${Math.max(s * 0.6, 4)}px`,
                                  backgroundColor: s >= 70 ? "#10b981" : s >= 50 ? "#f59e0b" : "#e11d48",
                                }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Moods */}
                    {deepDive.moods?.length > 0 && (
                      <div>
                        <p className="text-sm font-semibold text-slate-900 mb-2">Recent Moods</p>
                        <div className="flex gap-2 flex-wrap">
                          {deepDive.moods.map((m, i) => (
                            <span
                              key={i}
                              className={[
                                "text-xs font-medium px-2.5 py-1 rounded-full border",
                                m === "confident" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                                  : m === "lost" ? "bg-red-50 text-red-700 border-red-200"
                                  : "bg-amber-50 text-amber-700 border-amber-200",
                              ].join(" ")}
                            >
                              {m}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                {deepDive?.error && !deepLoading && (
                  <p className="text-sm text-slate-400 text-center py-8">
                    AI deep dive is not available. Ensure the AI service is configured.
                  </p>
                )}
              </>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default function CourseStudentsPage() {
  const { token } = useAuth();
  const [courses,    setCourses]    = useState([]);
  const [courseId,   setCourseId]   = useState("");
  const [students,   setStudents]   = useState([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState("All");
  const [selected,   setSelected]   = useState(null);  // for detail modal
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const unsub = on("risk_changed", () => setRefreshTick(t => t + 1));
    return () => unsub();
  }, [on]);

  // Load courses
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

  // Load students when course changes
  useEffect(() => {
    if (!courseId || !token) return;
    setLoadingStudents(true);
    lecturersApi.getCourseStudents(courseId, token)
      .then(data => setStudents(Array.isArray(data) ? data : []))
      .catch(() => setStudents([]))
      .finally(() => setLoadingStudents(false));
  }, [courseId, token, refreshTick]);

  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.id ?? c.course_id),
    label: `${c.course_code} — ${c.course_title}`,
  }));

  const selectedCourseObj = courses.find(c => String(c.id ?? c.course_id) === courseId);

  // KF6 — risk leaderboard: sort by risk_probability descending, then apply search/filter
  const sorted = [...students].sort((a, b) => (b.risk_probability ?? 0) - (a.risk_probability ?? 0));
  const filtered = sorted.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = (s.full_name || s.name || "").toLowerCase().includes(q)
      || (s.matric_number || "").toLowerCase().includes(q);
    const matchFilter = filter === "All" || s.risk_level === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Students & Risk</h1>
          <p className="text-lg text-slate-600">
            {selectedCourseObj ? `${selectedCourseObj.course_code} · ${selectedCourseObj.course_title}` : "Select a course"}
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
      </div>

      {/* Leaderboard hint */}
      <div className="flex items-center gap-2 text-sm text-slate-500 -mt-4">
        <TrendingUp size={14} className="text-accent flex-shrink-0" />
        <span>Sorted by risk probability (highest first)</span>
      </div>

      {/* Table card */}
      <motion.div
        variants={container} initial="hidden" animate="show"
        className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden"
      >
        {/* Filter bar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-200 flex-wrap">
          <div className="flex-1 min-w-48 relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              name="student-search"
              aria-label="Search students"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by name or matric number"
              className="w-full h-9 pl-9 pr-3 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all placeholder:text-slate-400"
            />
          </div>
          <div className="flex gap-1.5 flex-shrink-0">
            {FILTERS.map(f => (
              <motion.button
                key={f}
                whileTap={{ scale: 0.96 }}
                onClick={() => setFilter(f)}
                className={[
                  "text-xs font-semibold h-9 px-3 rounded-xl border transition-all",
                  filter === f
                    ? "bg-primary text-white border-primary shadow-sm"
                    : "bg-white text-slate-500 border-slate-200 hover:border-slate-300 hover:bg-slate-50",
                ].join(" ")}
              >
                {f}
              </motion.button>
            ))}
          </div>
        </div>

        {/* Table */}
        {loadingStudents ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <VirtualizedTable
            data={filtered}
            rowHeight={52}
            maxHeight={600}
            onRowClick={(s) => setSelected(s)}
            emptyMessage="No students match your filter."
            columns={[
              { key: "_rank", label: "#", width: 50, render: (_, __, idx) => <span className="text-slate-400 text-xs font-semibold">{idx + 1}</span> },
              { key: "full_name", label: "Student", width: 200, render: (val, s) => (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-accent font-bold flex-shrink-0" style={{ fontSize: 10 }}>
                    {initials(val || s.name || "?")}
                  </div>
                  <span className="text-sm font-semibold text-slate-900 truncate">{val || s.name}</span>
                </div>
              )},
              { key: "matric_number", label: "Matric", width: 130 },
              { key: "risk_level", label: "Risk", width: 100, render: (val) => <Badge variant="risk" level={val} /> },
              { key: "risk_probability", label: "Probability", width: 100, render: (val) => {
                const c = riskColors(filtered.find(s => s.risk_probability === val)?.risk_level);
                return <span className={`text-sm font-bold ${c?.text || ""}`}>{Math.round((val ?? 0) * 100)}%</span>;
              }},
              { key: "attendance_rate", label: "Attendance", width: 100, render: (val) => val != null ? `${val}%` : "—" },
              { key: "quiz_average", label: "Quiz Avg", width: 100, render: (val) => val != null ? `${val}%` : "—" },
              { key: "_action", label: "", width: 60, render: (_, s) => (
                <button onClick={(e) => { e.stopPropagation(); setSelected(s); }} className="text-xs font-semibold text-accent hover:text-accent-dark">View</button>
              )},
            ]}
          />
        )}
      </motion.div>

      {/* Student detail modal (I5) */}
      {selected && (
        <DetailModal
          student={selected}
          courseId={courseId}
          token={token}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
