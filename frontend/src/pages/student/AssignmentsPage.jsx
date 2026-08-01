/**
 * AssignmentsPage — Student. View pending assignments, submit work.
 */
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, CheckCircle, Clock, X, AlertCircle, Loader, Sparkles, ChevronDown, Search, Save } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Badge from "../../components/ui/Badge";
import { SuccessBanner, ErrorBanner } from "../../components/ui/Feedback";
import { formatDate, isDueSoon, formatCourseCode } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { studentsApi } from "../../services/api";

function SubmitModal({ assignment, token, onClose, onSubmitted }) {
  const draftKey = `assignment_draft_${assignment.id}`;
  const [file,    setFile]    = useState(null);
  const [text,    setText]    = useState(() => {
    try { return localStorage.getItem(draftKey) || ""; } catch { return ""; }
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error,   setError]   = useState("");
  const [draftSaved, setDraftSaved] = useState(false);

  // Auto-save draft every 3s when text changes
  useEffect(() => {
    if (!text.trim()) return;
    const timer = setTimeout(() => {
      try { localStorage.setItem(draftKey, text); setDraftSaved(true); setTimeout(() => setDraftSaved(false), 1500); } catch {}
    }, 3000);
    return () => clearTimeout(timer);
  }, [text, draftKey]);

  const handleSubmit = async () => {
    if (!file && !text.trim()) {
      setError("Please upload a file or enter your response.");
      return;
    }
    setLoading(true); setError("");
    try {
      const fd = new FormData();
      if (file)       fd.append("file", file);
      if (text.trim()) fd.append("text_response", text.trim());
      await studentsApi.submitAssignment(assignment.id, fd, token);
      try { localStorage.removeItem(draftKey); } catch {}
      setSuccess(true);
      setTimeout(() => { onSubmitted?.(); onClose(); }, 1600);
    } catch (e) {
      setError(e.message || "Submission failed.");
    } finally { setLoading(false); }
  };

  return (
    <Modal open onClose={onClose} title="Submit Assignment" subtitle={`${assignment.course_code} · Due ${formatDate(assignment.due_date)}`} size="md">
      <div className="space-y-5">
        {success ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center p-8 text-center border border-emerald-200 rounded-xl bg-emerald-50"
          >
            <CheckCircle size={48} className="text-emerald-500 mb-4" />
            <h3 className="font-serif text-lg font-bold text-slate-900 mb-1">Assignment Submitted</h3>
            <p className="text-sm text-slate-500">Check back for lecturer feedback</p>
          </motion.div>
        ) : (
          <>
            {error && <ErrorBanner message={error} onDismiss={() => setError("")} />}

            <div className="p-5 border border-slate-200 rounded-xl bg-slate-50">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Assignment Brief</p>
              <p className="text-sm text-slate-700 leading-relaxed">{assignment.description}</p>
            </div>

            {assignment.allows_file && (
              <div className="space-y-2">
                <label htmlFor="file-upload" className="text-sm font-semibold text-slate-900">Upload File</label>
                <motion.div
                  whileHover={{ y: -1 }}
                  onClick={() => document.getElementById("file-upload").click()}
                  className={[
                    "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-200",
                    file ? "bg-emerald-50 border-emerald-200" : "border-slate-200 hover:border-slate-300 hover:shadow-sm",
                  ].join(" ")}
                >
                  <input
                    id="file-upload" type="file" className="hidden"
                    accept=".pdf,.docx,.zip,.py,.java,.c,.cpp"
                    onChange={e => setFile(e.target.files[0])}
                  />
                  {file ? (
                    <div className="flex items-center justify-center gap-3">
                      <FileText size={18} className="text-emerald-500" />
                      <span className="text-sm font-medium text-slate-900 truncate max-w-xs">{file.name}</span>
                      <button
                        onClick={e => { e.stopPropagation(); setFile(null); }}
                        className="p-1 hover:bg-slate-100 rounded-lg transition-colors"
                      >
                        <X size={14} className="text-slate-400" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <Upload size={24} className="text-slate-400 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-700 mb-1">Click to upload</p>
                      <p className="text-xs text-slate-500">PDF, DOCX, ZIP, or source files</p>
                    </>
                  )}
                </motion.div>
              </div>
            )}

            {assignment.allows_text && (
              <div className="space-y-2">
                <label htmlFor="assignment-text-response" className="text-sm font-semibold text-slate-900">
                  {assignment.allows_file ? "Or write response" : "Your Response"}
                </label>
                <textarea
                  id="assignment-text-response"
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={5}
                  maxLength={2000}
                  placeholder="Write your response here..."
                  className="ds-textarea"
                />
                <p className="text-xs text-slate-400 flex items-center justify-between">
                  <span>{text.length}/2000 characters</span>
                  {draftSaved && <span className="flex items-center gap-1 text-emerald-500"><Save size={10} /> Draft saved</span>}
                </p>
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <Button variant="ghost" onClick={onClose} className="flex-1">Cancel</Button>
              <Button loading={loading} onClick={handleSubmit} icon={<Upload size={14} />} className="flex-1">
                Submit Assignment
              </Button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}

export default function AssignmentsPage() {
  const { token } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [submitting,  setSubmitting]  = useState(null);
  const [aiReviews,   setAiReviews]   = useState({});
  const [search,      setSearch]      = useState("");   // { submissionId: { loading, data, error, open } }

  const requestAiReview = async (submissionId) => {
    setAiReviews(prev => ({ ...prev, [submissionId]: { ...prev[submissionId], loading: true, error: null, open: true } }));
    try {
      const res = await studentsApi.getAiReview(submissionId, token);
      setAiReviews(prev => ({ ...prev, [submissionId]: { loading: false, data: res.ai_review, error: null, open: true } }));
    } catch (e) {
      setAiReviews(prev => ({ ...prev, [submissionId]: { loading: false, data: null, error: e.message || "Failed to get AI review.", open: true } }));
    }
  };

  const toggleReview = (submissionId) => {
    setAiReviews(prev => ({ ...prev, [submissionId]: { ...prev[submissionId], open: !prev[submissionId]?.open } }));
  };

  const fetchAssignments = async () => {
    setLoading(true);
    setError("");
    try { setAssignments(await studentsApi.getAssignments(token)); }
    catch (e) { setError(e.message || "Failed to load assignments."); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAssignments(); }, [token]);

  // Real-time: refetch on new or graded assignments
  const { on } = useRealtime();
  useEffect(() => {
    const u1 = on("assignment_published", fetchAssignments);
    const u2 = on("assignment_marked", fetchAssignments);
    return () => { u1(); u2(); };
  }, [on]);

  const pending   = assignments
    .filter(a => !a.submitted_at)
    .sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
  const submitted = assignments.filter(a =>  a.submitted_at);

  const isOverdue = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  const daysRemaining = (dateStr) => {
    if (!dateStr) return null;
    return Math.ceil((new Date(dateStr) - new Date()) / (1000 * 60 * 60 * 24));
  };

  const daysLabel = (dateStr) => {
    const d = daysRemaining(dateStr);
    if (d === null) return "";
    if (d < 0) return "";
    if (d === 0) return "Due today";
    if (d === 1) return "1 day left";
    return `${d}d left`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader size={28} className="animate-spin text-accent" />
        <span className="ml-3 text-slate-500">Loading assignments...</span>
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="max-w-2xl">
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Assignments</h1>
        <p className="text-lg text-slate-600">Current assignments and submission history</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchAssignments} className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800">Retry</button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {[
          { label: "Pending",   value: pending.length,   icon: Clock,        color: "text-slate-900" },
          { label: "Submitted", value: submitted.length,  icon: CheckCircle,  color: "text-emerald-600" },
          { label: "Next Due",  value: pending[0] ? formatDate(pending[0].due_date) : "None", icon: Clock, color: "text-slate-900", isDate: true },
        ].map(({ label, value, icon: Icon, color, isDate }) => (
          <motion.div
            key={label}
            whileHover={{ y: -2 }}
            className="p-6 border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold uppercase text-slate-500 tracking-wide">{label}</span>
              <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center">
                <Icon size={16} className="text-slate-400" />
              </div>
            </div>
            {isDate
              ? <p className={`font-serif text-xl font-bold ${color}`}>{value}</p>
              : <p className={`font-serif text-4xl font-bold leading-none ${color}`}>{value}</p>
            }
          </motion.div>
        ))}
      </div>

      {/* Late submission alert */}
      {(() => {
        const recentSubmitted = submitted.slice(-5);
        if (recentSubmitted.length < 2) return null;
        const lateCount = recentSubmitted.filter(a => {
          if (!a.submitted_at || !a.due_date) return false;
          return new Date(a.submitted_at) > new Date(a.due_date);
        }).length;
        if (lateCount === 0) return null;
        return (
          <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-200 rounded-xl">
            <AlertCircle size={18} className="text-amber-500 flex-shrink-0" />
            <p className="text-sm text-amber-800">
              <span className="font-semibold">{lateCount} of your last {recentSubmitted.length} submissions were late</span>
              {" "}&mdash; this affects your risk score. Try submitting earlier.
            </p>
          </div>
        );
      })()}

      {/* Search */}
      <div className="relative max-w-xs">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search assignments..."
          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {/* Pending assignments */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl font-bold text-slate-900">Pending Assignments</h2>
          {pending.length > 0 && (
            <span className="text-sm font-semibold text-slate-700 bg-slate-100 px-3 py-1.5 rounded-xl">
              {pending.length}
            </span>
          )}
        </div>

        {pending.length === 0 ? (
          <div className="text-center py-16 border border-slate-200 rounded-xl bg-white shadow-sm">
            <Upload size={40} className="text-slate-300 mx-auto mb-4" />
            <p className="font-serif text-lg font-semibold text-slate-500 mb-1">No pending assignments</p>
            <p className="text-sm text-slate-400">Assignments will appear here when created by your lecturers</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.filter(a => a.title.toLowerCase().includes(search.toLowerCase())).map((a, i) => {
              const soon = isDueSoon(a.due_date);
              const overdue = isOverdue(a.due_date);
              const countdown = daysLabel(a.due_date);
              return (
                <motion.div
                  key={a.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.06 }}
                  whileHover={{ y: -2 }}
                  className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-6 group"
                >
                  <div className="flex items-start justify-between gap-6 flex-wrap">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-4 flex-wrap">
                        <span className="text-sm font-semibold text-slate-700 px-3 py-1.5 bg-slate-100 rounded-xl">{formatCourseCode(a.course_code)}</span>
                        {overdue ? (
                          <Badge variant="status" label="Missing" color="red" />
                        ) : soon ? (
                          <Badge variant="status" label="Due Soon" color="amber" />
                        ) : (
                          <Badge variant="status" label="Pending" color="slate" />
                        )}
                        {countdown && !overdue && (
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                            daysRemaining(a.due_date) <= 1 ? "bg-red-50 text-red-600" : daysRemaining(a.due_date) <= 3 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"
                          }`}>{countdown}</span>
                        )}
                      </div>
                      <h3 className="font-serif text-xl font-bold text-slate-900 mb-3 leading-snug">{a.title}</h3>
                      <p className="text-sm text-slate-600 mb-5 line-clamp-2">{a.description}</p>
                      <div className="flex items-center gap-5 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1.5">
                          <Clock size={12} /> Due {formatDate(a.due_date)}
                        </span>
                        <span>Max {a.max_marks} marks</span>
                        {a.allows_file && <span className="flex items-center gap-1"><FileText size={12} /> File upload</span>}
                        {a.allows_text && <span>Text entry</span>}
                      </div>
                    </div>
                    <Button
                      onClick={() => setSubmitting(a)}
                      size="md"
                      icon={<Upload size={14} />}
                      className="flex-shrink-0"
                    >
                      Submit
                    </Button>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* Submitted */}
      <div>
        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">Submitted Work</h2>

        {submitted.length === 0 ? (
          <div className="text-center py-16 border border-slate-200 rounded-xl bg-white shadow-sm">
            <CheckCircle size={40} className="text-slate-300 mx-auto mb-4" />
            <p className="font-serif text-lg font-semibold text-slate-500 mb-1">No submissions yet</p>
            <p className="text-sm text-slate-400">Submit assignments above to see grades and feedback here</p>
          </div>
        ) : (
          <div className="space-y-4">
            {submitted.map((a, i) => (
              <motion.div
                key={a.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06 }}
                whileHover={{ y: -2 }}
                className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-6"
              >
                <div className="flex items-start justify-between gap-6 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-4 flex-wrap">
                      <span className="text-sm font-semibold text-slate-700 px-3 py-1.5 bg-slate-100 rounded-xl">{formatCourseCode(a.course_code)}</span>
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-3 py-1.5 rounded-xl">
                        <CheckCircle size={12} /> Submitted
                      </span>
                    </div>
                    <h3 className="font-serif text-xl font-bold text-slate-900 mb-3">{a.title}</h3>
                    <p className="text-sm text-slate-500 flex items-center gap-1.5 mb-4">
                      <CheckCircle size={12} className="text-emerald-500" />
                      {formatDate(a.submitted_at)}
                    </p>
                    {a.feedback && (
                      <div className="p-4 border border-slate-200 rounded-xl bg-slate-50">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Lecturer Feedback</p>
                        <p className="text-sm text-slate-700 leading-relaxed">{a.feedback}</p>
                      </div>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0 min-w-[100px]">
                    {a.score !== null ? (
                      <>
                        <p className="font-serif text-4xl font-bold text-slate-900 leading-none mb-1">{a.score}</p>
                        <p className="text-sm text-slate-500">/{a.max_marks}</p>
                        <p className="text-xs font-semibold uppercase text-slate-400 mt-1.5 tracking-wide">Marked</p>
                        <button
                          onClick={() => aiReviews[a.submission_id]?.data ? toggleReview(a.submission_id) : requestAiReview(a.submission_id)}
                          disabled={aiReviews[a.submission_id]?.loading}
                          className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-blue-700 transition-colors disabled:opacity-50"
                        >
                          {aiReviews[a.submission_id]?.loading ? (
                            <><Loader size={12} className="animate-spin" /> Reviewing...</>
                          ) : aiReviews[a.submission_id]?.data ? (
                            <><ChevronDown size={12} className={aiReviews[a.submission_id]?.open ? "rotate-180 transition-transform" : "transition-transform"} /> AI Review</>
                          ) : (
                            <><Sparkles size={12} /> Get AI Review</>
                          )}
                        </button>
                      </>
                    ) : (
                      <span className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1.5 rounded-xl">
                        Awaiting mark
                      </span>
                    )}
                  </div>
                </div>
                {/* AI Review collapsible */}
                {aiReviews[a.submission_id]?.open && (aiReviews[a.submission_id]?.data || aiReviews[a.submission_id]?.error) && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={14} className="text-accent" />
                      <p className="text-xs font-semibold uppercase text-accent tracking-wide">AI Review</p>
                    </div>
                    {aiReviews[a.submission_id]?.error ? (
                      <p className="text-sm text-red-600">{aiReviews[a.submission_id].error}</p>
                    ) : (
                      <div className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{aiReviews[a.submission_id].data}</div>
                    )}
                  </motion.div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {submitting && (
        <SubmitModal
          assignment={submitting}
          token={token}
          onClose={() => setSubmitting(null)}
          onSubmitted={fetchAssignments}
        />
      )}
    </div>
  );
}