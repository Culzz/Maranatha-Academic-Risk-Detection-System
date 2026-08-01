/**
 * AssignmentMgmtPage — Create assignments + mark student submissions.
 * Real data: lecturersApi.getCourses, getAssignments, getSubmissions, createAssignment, markSubmission
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Plus, CheckCircle, Clock, FileText, Upload, BarChart2, Download, Eye, AlertCircle, Loader2, Target } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import CustomDropdown from "../../components/ui/CustomDropdown";
import DatePicker from "../../components/ui/DatePicker";
import NumberStepper from "../../components/ui/NumberStepper";
import { SuccessBanner, ErrorBanner } from "../../components/ui/Feedback";
import { useAuth } from "../../context/AuthContext";
import { lecturersApi } from "../../services/api";
import { formatDate, initials } from "../../utils/helpers";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.26 } } };

export default function AssignmentMgmtPage() {
  const { token } = useAuth();
  const [courses,       setCourses]       = useState([]);
  const [assignments,   setAssignments]   = useState([]);
  const [submissions,   setSubmissions]   = useState([]);
  const [viewingAssign, setViewingAssign] = useState(null);
  const [createOpen,    setCreateOpen]    = useState(false);
  const [markOpen,      setMarkOpen]      = useState(null);
  const [success,       setSuccess]       = useState("");
  const [error,         setError]         = useState("");
  const [loading,       setLoading]       = useState(false);
  const [title,         setTitle]         = useState("");
  const [courseId,      setCourseId]      = useState("");
  const [dueDate,       setDueDate]       = useState("");
  const [maxMarks,      setMaxMarks]      = useState("20");
  const [description,   setDescription]   = useState("");
  const [allowsFile,    setAllowsFile]    = useState(true);
  const [allowsText,    setAllowsText]    = useState(false);
  const [score,         setScore]         = useState("");
  const [feedback,      setFeedback]      = useState("");
  const [calibration,   setCalibration]   = useState(null);
  const [calibLoading,  setCalibLoading]  = useState(false);
  const [calibAssign,   setCalibAssign]   = useState(null);

  useEffect(() => {
    if (!token) return;
    Promise.allSettled([
      lecturersApi.getCourses(token),
      lecturersApi.getAssignments(token),
    ]).then(([cRes, aRes]) => {
      if (cRes.status === "fulfilled") {
        const arr = Array.isArray(cRes.value) ? cRes.value : [];
        setCourses(arr);
        if (arr.length) setCourseId(String(arr[0].id ?? arr[0].course_id ?? ""));
      }
      if (aRes.status === "fulfilled") {
        setAssignments(Array.isArray(aRes.value) ? aRes.value : []);
      }
    });
  }, [token]);

  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.id ?? c.course_id),
    label: `${c.course_code} — ${c.course_title}`,
  }));

  const handleCreate = async () => {
    if (!title.trim() || !dueDate) return;
    setLoading(true); setError("");
    try {
      // Auto-generate assignment_number from existing assignments for this course
      const courseAssignments = assignments.filter(a => String(a.course_id) === String(courseId));
      const assignmentNumber = courseAssignments.length + 1;

      await lecturersApi.createAssignment({
        title,
        course_id: Number(courseId),
        assignment_number: assignmentNumber,
        due_date: new Date(dueDate).toISOString(),
        max_marks: Number(maxMarks),
        description,
        allows_file: allowsFile,
        allows_text: allowsText,
      }, token);
      const data = await lecturersApi.getAssignments(token);
      setAssignments(Array.isArray(data) ? data : []);
      setCreateOpen(false);
      setSuccess(`"${title}" published successfully.`);
      setTitle(""); setDueDate(""); setDescription("");
    } catch (e) {
      setError(e.message || "Failed to create assignment.");
    } finally {
      setLoading(false);
    }
  };

  const loadSubmissions = async (assignment) => {
    setViewingAssign(assignment);
    setSubmissions([]);
    setError("");
    setCalibration(null);
    setCalibAssign(null);
    try {
      const data = await lecturersApi.getSubmissions(assignment.id, token);
      setSubmissions(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load submissions.");
    }
  };

  const loadCalibration = async (assignment) => {
    setCalibLoading(true);
    setCalibAssign(assignment);
    try {
      const data = await lecturersApi.getAssignmentCalibration(assignment.id, token);
      setCalibration(data);
    } catch {
      setCalibration(null);
    } finally {
      setCalibLoading(false);
    }
  };

  const handleMark = async () => {
    if (!markOpen || !viewingAssign) return;
    setLoading(true); setError("");
    try {
      await lecturersApi.markSubmission(markOpen.id, Number(score), feedback, token);
      const data = await lecturersApi.getSubmissions(viewingAssign.id, token);
      setSubmissions(Array.isArray(data) ? data : []);
      setMarkOpen(null);
      setSuccess("Submission marked and student notified.");
      setScore(""); setFeedback("");
    } catch (e) {
      setError(e.message || "Failed to save mark.");
    } finally {
      setLoading(false);
    }
  };

  const maxPts = viewingAssign?.max_marks ?? viewingAssign?.total_marks ?? 20;

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Assignments</h1>
          <p className="text-lg text-slate-600">Create assignments and mark student submissions</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} icon={<Plus size={14} />}>
          New Assignment
        </Button>
      </div>

      <SuccessBanner message={success} />
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Published table */}
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="font-serif text-xl font-bold text-slate-900">Published Assignments</h2>
            <p className="text-sm text-slate-500 mt-1">Currently visible to enrolled students</p>
          </div>
          {assignments.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <FileText size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No assignments published yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ds-table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Course</th>
                    <th className="text-left">Title</th>
                    <th className="hidden md:table-cell text-left">Due Date</th>
                    <th className="hidden sm:table-cell text-left">Submissions</th>
                    <th className="hidden lg:table-cell text-left">Max Marks</th>
                    <th className="text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {assignments.map(a => (
                    <tr key={a.id}>
                      <td className="font-semibold text-primary">{a.course_code}</td>
                      <td className="text-slate-600">{a.title}</td>
                      <td className="text-slate-500 hidden md:table-cell">{formatDate(a.due_date)}</td>
                      <td className="hidden sm:table-cell">
                        <span className={(a.submissions ?? 0) === (a.total ?? 0) && (a.total ?? 0) > 0
                          ? "text-emerald-600 font-semibold"
                          : "text-slate-600"}>
                          {a.submissions ?? 0}/{a.total ?? "—"}
                        </span>
                      </td>
                      <td className="text-slate-600 hidden lg:table-cell">{a.max_marks ?? a.total_marks}</td>
                      <td className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => loadCalibration(a)}
                            className="text-xs font-semibold text-slate-500 hover:text-accent flex items-center gap-1 transition-colors"
                            title="Difficulty analysis"
                          >
                            <Target size={12} /> Calibrate
                          </button>
                          <button
                            onClick={() => loadSubmissions(a)}
                            className="text-xs font-semibold text-accent hover:text-accent-dark flex items-center gap-1 transition-colors"
                          >
                            <BarChart2 size={12} /> View
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </motion.div>
      </motion.div>

      {/* Calibration panel (Idea 11) */}
      {(calibLoading || calibration) && (
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl font-bold text-slate-900">Difficulty Calibration</h2>
                <p className="text-sm text-slate-500 mt-1">{calibAssign?.title} · {calibAssign?.course_code}</p>
              </div>
              <button onClick={() => { setCalibration(null); setCalibAssign(null); }} className="text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium">
                Close
              </button>
            </div>
            <div className="p-6">
              {calibLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-accent" />
                </div>
              ) : calibration?.submission_count === 0 ? (
                <p className="text-sm text-slate-400 text-center py-8">No graded submissions yet.</p>
              ) : calibration ? (
                <div className="space-y-5">
                  {/* Verdict */}
                  <div className="flex items-center gap-4 bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <div className={[
                      "w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 text-lg font-bold",
                      calibration.verdict === "Well Calibrated" ? "bg-emerald-100 text-emerald-700"
                        : calibration.verdict === "Too Easy" ? "bg-blue-100 text-blue-700"
                        : calibration.verdict === "Challenging" ? "bg-amber-100 text-amber-700"
                        : "bg-red-100 text-red-700",
                    ].join(" ")}>
                      {calibration.verdict === "Well Calibrated" ? "✓" : calibration.verdict === "Too Easy" ? "↑" : "↓"}
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{calibration.verdict}</p>
                      <p className="text-sm text-slate-500">{calibration.verdict_detail}</p>
                    </div>
                  </div>

                  {/* Stats */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <p className="text-xs text-slate-500">Submissions</p>
                      <p className="text-xl font-bold text-slate-900">{calibration.submission_count}</p>
                    </div>
                    <div className="text-center bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <p className="text-xs text-slate-500">Average</p>
                      <p className="text-xl font-bold text-slate-900">{calibration.average_score}%</p>
                    </div>
                    <div className="text-center bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <p className="text-xs text-slate-500">Median</p>
                      <p className="text-xl font-bold text-slate-900">{calibration.median_score}%</p>
                    </div>
                  </div>

                  {/* Distribution */}
                  <div>
                    <p className="text-sm font-semibold text-slate-700 mb-3">Score Distribution</p>
                    <div className="space-y-2">
                      {Object.entries(calibration.distribution || {}).map(([bucket, count]) => {
                        const pct = calibration.submission_count > 0 ? Math.round(count / calibration.submission_count * 100) : 0;
                        return (
                          <div key={bucket} className="flex items-center gap-3">
                            <span className="text-xs text-slate-600 w-16 flex-shrink-0">{bucket}%</span>
                            <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                              <motion.div
                                initial={{ width: 0 }}
                                animate={{ width: `${pct}%` }}
                                transition={{ duration: 0.5 }}
                                className="h-full rounded-full bg-accent"
                              />
                            </div>
                            <span className="text-xs font-semibold text-slate-700 w-16 text-right">{count} ({pct}%)</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Submissions panel */}
      {viewingAssign && (
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div variants={item} className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h2 className="font-serif text-xl font-bold text-slate-900">Submissions Awaiting Mark</h2>
                <p className="text-sm text-slate-500 mt-1">{viewingAssign.title} · {viewingAssign.course_code}</p>
              </div>
              <button onClick={() => setViewingAssign(null)} className="text-xs text-slate-400 hover:text-slate-600 transition-colors font-medium">
                Close
              </button>
            </div>
            {submissions.length === 0 ? (
              <div className="text-center py-12 text-slate-400">
                <FileText size={24} className="mx-auto mb-2 opacity-30" />
                <p className="text-sm">No submissions yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {submissions.map((s, i) => {
                  const fileName = s.file_path ? s.file_path.split("/").pop() : null;
                  const fileUrl = s.file_path ? `/${s.file_path}` : null;
                  const isLate = s.submission_status === "late";

                  return (
                    <motion.div
                      key={s.id}
                      initial={{ opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.06 }}
                      className="px-6 py-4 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div
                            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-accent font-bold flex-shrink-0"
                            style={{ fontSize: 10 }}
                          >
                            {initials(s.student_name || s.full_name || "?")}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-slate-900 truncate">{s.student_name || s.full_name}</p>
                            <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                              {s.matric_number && (
                                <span className="text-xs text-slate-400 font-mono">{s.matric_number}</span>
                              )}
                              <span className="text-xs text-slate-400 flex items-center gap-1">
                                <Clock size={10} /> {formatDate(s.submitted_at || s.created_at)}
                              </span>
                              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                                isLate
                                  ? "bg-red-50 text-red-600 border-red-200"
                                  : "bg-emerald-50 text-emerald-600 border-emerald-200"
                              }`}>
                                {isLate ? <AlertCircle size={9} /> : <CheckCircle size={9} />}
                                {isLate ? "Late" : "On Time"}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-shrink-0">
                          {s.score != null ? (
                            <div className="text-right">
                              <p className="font-serif text-lg font-bold text-primary">{s.score}/{maxPts}</p>
                              <p className="text-xs text-emerald-600 flex items-center justify-end gap-1">
                                <CheckCircle size={10} /> Marked
                              </p>
                            </div>
                          ) : (
                            <Button size="xs" onClick={() => { setMarkOpen(s); setScore(""); setFeedback(""); }}>
                              Mark
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Submitted content preview */}
                      <div className="mt-3 ml-[52px] space-y-2">
                        {fileName && (
                          <a
                            href={fileUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                          >
                            <FileText size={12} className="text-slate-400" />
                            <span className="font-medium truncate max-w-[200px]">{fileName}</span>
                            <Download size={11} className="text-slate-400 ml-1" />
                          </a>
                        )}
                        {s.text_response && (
                          <div className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                            <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1 font-semibold">Text Response</p>
                            <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed line-clamp-4">{s.text_response}</p>
                          </div>
                        )}
                        {!fileName && !s.text_response && (
                          <p className="text-xs text-slate-400 italic">No file or text submitted</p>
                        )}
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create Assignment"
        subtitle="Published assignments are immediately visible to enrolled students"
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={handleCreate} icon={<Upload size={13} />}>Publish</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Title" required placeholder="e.g. Assignment 3 — Red-Black Tree" value={title} onChange={setTitle} />
          <CustomDropdown label="Course" value={courseId} onChange={setCourseId} options={COURSE_OPTIONS} placeholder="Select course" />
          <div className="grid grid-cols-2 gap-4">
            <DatePicker label="Due Date" required value={dueDate} onChange={setDueDate} />
            <NumberStepper label="Max Marks" required value={maxMarks} onChange={setMaxMarks} min={1} max={100} step={1} unit="pts" />
          </div>
          <div>
            <label className="ds-label">Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={4} placeholder="Describe the assignment requirements..." className="ds-textarea" />
          </div>
          <div className="flex items-center gap-6">
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={allowsFile} onChange={e => setAllowsFile(e.target.checked)} className="accent-accent rounded" />
              Allow file upload
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input type="checkbox" checked={allowsText} onChange={e => setAllowsText(e.target.checked)} className="accent-accent rounded" />
              Allow text response
            </label>
          </div>
        </div>
      </Modal>

      {/* Mark modal */}
      <Modal
        open={!!markOpen}
        onClose={() => setMarkOpen(null)}
        title={`Mark — ${markOpen?.student_name || markOpen?.full_name}`}
        subtitle={`${markOpen?.matric_number || ""} · ${viewingAssign?.course_code || ""} · ${viewingAssign?.title || ""}`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setMarkOpen(null)}>Cancel</Button>
            <Button loading={loading} onClick={handleMark}>Save Mark</Button>
          </>
        }
      >
        <div className="space-y-4">
          {/* Student's submitted work */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
              <Eye size={12} /> Student's Submission
            </p>

            {markOpen?.file_path && (() => {
              const fn = markOpen.file_path.split("/").pop();
              const fUrl = `/${markOpen.file_path}`;
              return (
                <a
                  href={fUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-700 hover:bg-slate-100 hover:border-slate-300 transition-colors"
                >
                  <FileText size={12} className="text-slate-400" />
                  <span className="font-medium">{fn}</span>
                  <Download size={11} className="text-slate-400 ml-1" />
                </a>
              );
            })()}

            {markOpen?.text_response ? (
              <div className="bg-white border border-slate-200 rounded-lg px-3 py-2">
                <p className="text-[10px] uppercase tracking-wide text-slate-400 mb-1 font-semibold">Text Response</p>
                <p className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">{markOpen.text_response}</p>
              </div>
            ) : !markOpen?.file_path ? (
              <p className="text-xs text-slate-400 italic">No file or text submitted</p>
            ) : null}

            {markOpen?.submission_status && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border ${
                markOpen.submission_status === "late"
                  ? "bg-red-50 text-red-600 border-red-200"
                  : "bg-emerald-50 text-emerald-600 border-emerald-200"
              }`}>
                {markOpen.submission_status === "late" ? "Submitted Late" : "Submitted On Time"}
              </span>
            )}
          </div>

          <NumberStepper label={`Score (out of ${maxPts})`} required value={score} onChange={setScore} min={0} max={maxPts} step={1} unit="pts" />
          <div>
            <label className="ds-label">Feedback for student</label>
            <textarea value={feedback} onChange={e => setFeedback(e.target.value)} rows={4} placeholder="Optional written feedback..." className="ds-textarea" />
          </div>
        </div>
      </Modal>
    </div>
  );
}
