/**
 * QuizManagementPage — Create quizzes + view published results.
 * Real data: lecturersApi.getCourses, getQuizzes, createQuiz, getQuizResults
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, BarChart2, ClipboardList, Upload, X, Loader } from "lucide-react";
import Button from "../../components/ui/Button";
import Input from "../../components/ui/Input";
import Modal from "../../components/ui/Modal";
import CustomDropdown from "../../components/ui/CustomDropdown";
import { SuccessBanner, ErrorBanner } from "../../components/ui/Feedback";
import { useAuth } from "../../context/AuthContext";
import { lecturersApi, quizPatternsApi } from "../../services/api";
import { formatDate, formatCourseCode } from "../../utils/helpers";
import DatePicker from "../../components/ui/DatePicker";

const EMPTY_Q = { question: "", options: ["", "", "", ""], correct: 0, topic: "", type: "mcq", model_answer: "" };
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.26 } } };

/* ── Results modal ─────────────────────────────────────────────────────── */
function ResultsModal({ quiz, token, onClose }) {
  const [results, setResults]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");

  useEffect(() => {
    lecturersApi.getQuizResults(quiz.id, token)
      .then(data => setResults(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message || "Failed to load results."))
      .finally(() => setLoading(false));
  }, [quiz.id, token]);

  const avgScore = results.length
    ? (results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length).toFixed(1)
    : "—";

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6 max-h-[80vh] flex flex-col"
      >
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 className="font-serif text-xl font-bold text-slate-900">{quiz.title}</h3>
            <p className="text-sm text-slate-500">{formatCourseCode(quiz.course_code)} — {results.length} submission{results.length !== 1 ? "s" : ""} — Avg: {avgScore}/{quiz.total_marks || 10}</p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl">
            <X size={16} className="text-slate-400" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader size={24} className="animate-spin text-accent" />
          </div>
        ) : error ? (
          <p className="text-sm text-red-600 py-4">{error}</p>
        ) : results.length === 0 ? (
          <p className="text-sm text-slate-500 py-8 text-center">No submissions yet.</p>
        ) : (
          <div className="overflow-auto flex-1">
            <table className="ds-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Student</th>
                  <th className="text-left">Matric No.</th>
                  <th className="text-left">Score</th>
                  <th className="text-left">Grade</th>
                  <th className="text-left">Security</th>
                  <th className="text-left">Date</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  const pct = r.percentage != null ? Math.round(r.percentage) : null;
                  const gradeCl = pct == null ? "text-slate-400"
                    : pct >= 70 ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                    : pct >= 50 ? "text-amber-700 bg-amber-50 border-amber-200"
                    : "text-red-700 bg-red-50 border-red-200";
                  const tabs     = r.tab_switch_count ?? r.security_flags?.tab_switches ?? 0;
                  const riskFlag = r.security_flags?.risk_flag || tabs >= 10;
                  return (
                    <tr key={i}>
                      <td className="text-slate-700 font-medium">{r.student_name}</td>
                      <td className="text-slate-500 text-xs">{r.matric_number}</td>
                      <td className="font-semibold text-primary">{r.score ?? "—"}</td>
                      <td>
                        {pct != null ? (
                          <span className={`inline-flex items-center text-xs font-semibold px-2 py-0.5 rounded-full border ${gradeCl}`}>
                            {pct}%
                          </span>
                        ) : "—"}
                      </td>
                      <td>
                        {riskFlag ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border bg-amber-50 text-amber-700 border-amber-200"
                            title="High tab-switch count. Use as a signal, not proof.">
                            ⚠ {tabs} tabs
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">{tabs} tabs</span>
                        )}
                      </td>
                      <td className="text-xs text-slate-400">{r.attempted_at ? formatDate(r.attempted_at) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function QuizManagementPage() {
  const { token } = useAuth();
  const [courses,    setCourses]    = useState([]);
  const [quizzes,    setQuizzes]    = useState([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [success,    setSuccess]    = useState("");
  const [error,      setError]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [title,      setTitle]      = useState("");
  const [courseId,   setCourseId]   = useState("");
  const [dueDate,    setDueDate]    = useState("");
  const [timeLimit,  setTimeLimit]  = useState("");
  const [difficulty, setDifficulty] = useState("");
  const [questions,  setQuestions]  = useState([{ ...EMPTY_Q, options: ["", "", "", ""] }]);
  const [parsing,    setParsing]    = useState(false);
  const [viewingResults, setViewingResults] = useState(null);

  useEffect(() => {
    if (!token) return;
    Promise.allSettled([
      lecturersApi.getCourses(token),
      lecturersApi.getQuizzes(token),
    ]).then(([cRes, qRes]) => {
      if (cRes.status === "fulfilled") {
        const arr = Array.isArray(cRes.value) ? cRes.value : [];
        setCourses(arr);
        if (arr.length) setCourseId(String(arr[0].id ?? arr[0].course_id ?? ""));
      }
      if (qRes.status === "fulfilled") {
        setQuizzes(Array.isArray(qRes.value) ? qRes.value : []);
      }
    });
  }, [token]);

  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.id ?? c.course_id),
    label: `${formatCourseCode(c.course_code)} — ${c.course_title}`,
  }));

  const addQuestion    = () => setQuestions(q => [...q, { ...EMPTY_Q, options: ["", "", "", ""] }]);
  const removeQuestion = i  => setQuestions(q => q.filter((_, idx) => idx !== i));
  const updateQuestion = (i, field, value) =>
    setQuestions(q => q.map((qn, idx) => idx === i ? { ...qn, [field]: value } : qn));
  const updateOption = (qi, oi, value) =>
    setQuestions(q => q.map((qn, idx) =>
      idx === qi ? { ...qn, options: qn.options.map((o, oidx) => oidx === oi ? value : o) } : qn
    ));

  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setParsing(true); setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const result = await quizPatternsApi.parseFile(formData, token);
      if (result.questions?.length) {
        const LETTER_MAP = { A: 0, B: 1, C: 2, D: 3 };
        const parsed = result.questions.map(q => ({
          question: q.question_text,
          options: [q.option_a, q.option_b, q.option_c, q.option_d],
          correct: LETTER_MAP[q.correct_option] ?? 0,
        }));
        setQuestions(parsed);
        setSuccess(`Extracted ${parsed.length} question${parsed.length !== 1 ? "s" : ""} from "${file.name}". Review and edit before publishing.`);
      } else {
        setError("No MCQ questions found in the file. Make sure questions follow a standard format (numbered questions with A/B/C/D options).");
      }
    } catch (err) {
      setError(err.message || "Failed to parse file.");
    } finally {
      setParsing(false);
      e.target.value = "";
    }
  };

  const validateQuestions = () => {
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q.question.trim()) {
        return `Question ${i + 1} has no text.`;
      }
      for (let j = 0; j < 4; j++) {
        if (!q.options[j]?.trim()) {
          return `Question ${i + 1}, Option ${String.fromCharCode(65 + j)} is empty.`;
        }
      }
    }
    return null;
  };

  const handleSubmit = async () => {
    if (!title.trim()) { setError("Quiz title is required."); return; }
    if (!dueDate) { setError("Due date is required."); return; }
    if (questions.length === 0) { setError("Add at least one question."); return; }
    const validationError = validateQuestions();
    if (validationError) { setError(validationError); return; }

    const INDEX_TO_LETTER = ["A", "B", "C", "D"];
    setLoading(true); setError("");
    try {
      // Auto-generate quiz_number from existing quizzes for this course
      const courseQuizzes = quizzes.filter(q => String(q.course_id) === String(courseId));
      const quizNumber = courseQuizzes.length + 1;
      const totalMarks = questions.length;

      await lecturersApi.createQuiz({
        title,
        course_id: Number(courseId),
        quiz_number: quizNumber,
        total_marks: totalMarks,
        due_date: new Date(dueDate).toISOString(),
        time_limit_mins: timeLimit ? Number(timeLimit) : null,
        difficulty: difficulty || null,
        questions: questions.map((q, i) => ({
          question_text: q.question,
          question_type: q.type || "mcq",
          option_a: q.type === "theory" ? "" : (q.options[0] || ""),
          option_b: q.type === "theory" ? "" : (q.options[1] || ""),
          option_c: q.type === "theory" ? "" : (q.options[2] || ""),
          option_d: q.type === "theory" ? "" : (q.options[3] || ""),
          correct_option: q.type === "theory" ? "" : (INDEX_TO_LETTER[q.correct] || "A"),
          model_answer: q.type === "theory" ? (q.model_answer || null) : null,
          marks: 1,
          question_order: i + 1,
          topic: q.topic || null,
        })),
      }, token);
      const data = await lecturersApi.getQuizzes(token);
      setQuizzes(Array.isArray(data) ? data : []);
      setCreateOpen(false);
      setSuccess(`"${title}" published successfully.`);
      setTitle(""); setDueDate(""); setTimeLimit(""); setQuestions([{ ...EMPTY_Q, options: ["", "", "", ""] }]);
    } catch (e) {
      setError(e.message || "Failed to create quiz.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Quizzes</h1>
          <p className="text-lg text-slate-600">Create and manage quizzes for your courses</p>
        </div>
        <Button onClick={() => setCreateOpen(true)} icon={<Plus size={14} />}>
          New Quiz
        </Button>
      </div>

      <SuccessBanner message={success} />
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Published quizzes */}
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div variants={item} className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-200">
            <h2 className="font-serif text-xl font-bold text-slate-900">Published Quizzes</h2>
            <p className="text-sm text-slate-500 mt-1">Visible to enrolled students</p>
          </div>
          {quizzes.length === 0 ? (
            <div className="text-center py-16 text-slate-400">
              <ClipboardList size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No quizzes published yet</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ds-table w-full">
                <thead>
                  <tr>
                    <th className="text-left">Course</th>
                    <th className="text-left">Title</th>
                    <th className="hidden md:table-cell text-left">Due Date</th>
                    <th className="hidden sm:table-cell text-left">Attempts</th>
                    <th className="text-right"></th>
                  </tr>
                </thead>
                <tbody>
                  {quizzes.map(q => (
                    <tr key={q.id}>
                      <td className="font-semibold text-primary">{formatCourseCode(q.course_code)}</td>
                      <td className="text-slate-600">{q.title}</td>
                      <td className="text-slate-500 hidden md:table-cell">{formatDate(q.due_date)}</td>
                      <td className="text-slate-600 hidden sm:table-cell">{q.attempt_count ?? "—"}</td>
                      <td className="text-right">
                        <div className="flex items-center gap-2 justify-end">
                          <button
                            onClick={() => setViewingResults(q)}
                            className="text-xs font-semibold text-accent hover:text-accent-dark flex items-center gap-1 transition-colors"
                          >
                            <BarChart2 size={12} /> Results
                          </button>
                          {(q.attempt_count === 0 || q.attempt_count == null) && (
                            <button
                              onClick={async () => {
                                if (!window.confirm(`Delete "${q.title}"? This cannot be undone.`)) return;
                                try {
                                  await lecturersApi.deleteQuiz(q.id, token);
                                  setQuizzes(prev => prev.filter(x => x.id !== q.id));
                                } catch (e) {
                                  alert(e.message || "Failed to delete quiz.");
                                }
                              }}
                              className="text-xs text-red-500 hover:text-red-700 flex items-center gap-1 transition-colors"
                              title="Delete quiz"
                            >
                              <Trash2 size={12} />
                            </button>
                          )}
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

      {/* Create modal */}
      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Create New Quiz"
        subtitle="Published quizzes are immediately visible to enrolled students"
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button loading={loading} onClick={handleSubmit} icon={<Plus size={13} />}>
              Publish Quiz
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <Input label="Quiz Title" required placeholder="e.g. Quiz 4 — Sorting Algorithms" value={title} onChange={setTitle} />
            </div>
            <div>
              <CustomDropdown
                label="Course"
                placeholder="Select course"
                value={String(courseId)}
                onChange={val => setCourseId(val)}
                options={COURSE_OPTIONS}
              />
            </div>
            <DatePicker label="Due Date" required value={dueDate} onChange={setDueDate} />
            <Input label="Time Limit (minutes)" type="number" placeholder="e.g. 15" value={timeLimit} onChange={setTimeLimit} />
            <CustomDropdown
              label="Difficulty"
              placeholder="Select difficulty"
              value={difficulty}
              onChange={val => setDifficulty(val)}
              options={[
                { value: "easy", label: "Easy" },
                { value: "medium", label: "Medium" },
                { value: "hard", label: "Hard" },
              ]}
            />
          </div>

          {/* Questions */}
          <div className="border-t border-slate-100 pt-5">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-900">Questions ({questions.length})</p>
              <div className="flex items-center gap-2">
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept=".pdf,.docx,.txt"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={parsing}
                  />
                  <span className={[
                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all",
                    parsing
                      ? "bg-slate-50 text-slate-400 border-slate-200 cursor-wait"
                      : "bg-blue-50 text-blue-600 border-blue-200 hover:bg-blue-100 hover:border-blue-300",
                  ].join(" ")}>
                    {parsing ? (
                      <span className="w-3 h-3 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                    ) : (
                      <Upload size={12} />
                    )}
                    {parsing ? "Parsing..." : "Import from File"}
                  </span>
                </label>
                <Button variant="ghost" size="xs" onClick={addQuestion} icon={<Plus size={12} />}>
                  Add Question
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <AnimatePresence>
                {questions.map((q, qi) => (
                  <motion.div
                    key={qi}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                    transition={{ duration: 0.2 }}
                    className="bg-slate-50 border border-slate-200 rounded-xl p-5 space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Question {qi + 1}</p>
                        <div className="flex gap-1 bg-slate-200/60 p-0.5 rounded-lg">
                          {["mcq", "theory"].map(t => (
                            <button key={t} type="button"
                              onClick={() => updateQuestion(qi, "type", t)}
                              className={[
                                "px-2.5 py-1 rounded-md text-[10px] font-semibold uppercase tracking-wide transition-all",
                                (q.type || "mcq") === t
                                  ? "bg-white text-primary shadow-sm"
                                  : "text-slate-400 hover:text-slate-600",
                              ].join(" ")}>
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                      {questions.length > 1 && (
                        <motion.button
                          whileTap={{ scale: 0.95 }}
                          onClick={() => removeQuestion(qi)}
                          className="text-slate-400 hover:text-risk-high transition-colors p-1 rounded-lg hover:bg-red-50"
                        >
                          <Trash2 size={14} />
                        </motion.button>
                      )}
                    </div>
                    <textarea
                      value={q.question}
                      onChange={e => updateQuestion(qi, "question", e.target.value)}
                      placeholder="Enter your question..."
                      rows={2}
                      className="ds-textarea"
                    />
                    <input
                      value={q.topic || ""}
                      onChange={e => updateQuestion(qi, "topic", e.target.value)}
                      placeholder="Topic tag (optional, e.g. Binary Trees, Sorting)"
                      className="w-full h-9 bg-white border border-slate-200 rounded-xl text-sm text-primary px-3 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent/40 transition-all placeholder:text-slate-400"
                    />
                    {(q.type || "mcq") === "mcq" ? (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {q.options.map((opt, oi) => (
                            <div key={oi} className="flex items-center gap-2">
                              <input
                                type="radio"
                                name={`correct-${qi}`}
                                checked={q.correct === oi}
                                onChange={() => updateQuestion(qi, "correct", oi)}
                                className="accent-accent flex-shrink-0 w-4 h-4"
                              />
                              <input
                                value={opt}
                                onChange={e => updateOption(qi, oi, e.target.value)}
                                placeholder={`Option ${String.fromCharCode(65 + oi)}`}
                                className="flex-1 h-9 bg-white border border-slate-200 rounded-xl text-sm text-primary px-3 outline-none focus:ring-2 focus:ring-accent/10 focus:border-accent/40 transition-all placeholder:text-slate-400"
                              />
                            </div>
                          ))}
                        </div>
                        <p className="text-xs text-slate-400">Select the radio button next to the correct answer.</p>
                      </>
                    ) : (
                      <div>
                        <label className="block text-xs font-semibold text-slate-500 mb-1">Model Answer (optional — used for AI grading)</label>
                        <textarea
                          value={q.model_answer || ""}
                          onChange={e => updateQuestion(qi, "model_answer", e.target.value)}
                          placeholder="Enter the ideal answer for AI grading reference..."
                          rows={3}
                          className="ds-textarea"
                        />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </Modal>

      {/* Results modal */}
      {viewingResults && (
        <ResultsModal
          quiz={viewingResults}
          token={token}
          onClose={() => setViewingResults(null)}
        />
      )}
    </div>
  );
}
