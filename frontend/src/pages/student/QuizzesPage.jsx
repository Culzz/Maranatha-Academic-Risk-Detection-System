/**
 * QuizzesPage — Student. Pending quizzes table + completed results table.
 * Includes: countdown timer, per-question results modal with explanations,
 * real-time SSE listener for new quizzes.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { ClipboardList, CheckCircle, AlertCircle, Play, X, Loader, Clock, Eye, TrendingDown, TrendingUp, Minus, BookOpen } from "lucide-react";
import { formatDate, isDueSoon, formatCourseCode } from "../../utils/helpers";
import { useNavigate } from "react-router-dom";

import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { studentsApi } from "../../services/api";
import { SkeletonTable } from "../../components/ui/Skeleton";
import useOfflineQueue from "../../hooks/useOfflineQueue";

/* ── Countdown timer hook ──────────────────────────────────────────────── */
function useCountdown(totalSeconds, onExpire) {
  const [remaining, setRemaining] = useState(totalSeconds);
  const expiredRef = useRef(false);

  useEffect(() => {
    if (totalSeconds <= 0) return;
    setRemaining(totalSeconds);
    expiredRef.current = false;

    const interval = setInterval(() => {
      setRemaining(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!expiredRef.current) {
            expiredRef.current = true;
            onExpire?.();
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [totalSeconds]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const display = `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const urgent = remaining <= 60 && remaining > 0;

  return { remaining, display, urgent };
}

/* ── Quiz Results Modal ────────────────────────────────────────────────── */
function QuizResultsModal({ result, onClose }) {
  if (!result) return null;

  const { score, total_marks, percentage, results = [], behavioural_flags = [] } = result;
  const correct = results.filter(r => r.is_correct).length;
  const total = results.length;

  const gradeColor = percentage >= 70
    ? "text-emerald-600"
    : percentage >= 50
    ? "text-amber-600"
    : "text-red-600";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div aria-hidden="true" className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        role="dialog" aria-modal="true" aria-labelledby="quiz-results-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100">
          <div>
            <h3 id="quiz-results-modal-title" className="font-serif text-xl font-bold text-slate-900">Quiz Results</h3>
            <p className="text-sm text-slate-500 mt-1">
              {correct}/{total} correct
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className={`font-serif text-3xl font-bold ${gradeColor}`}>{percentage}%</p>
              <p className="text-xs text-slate-400">{score}/{total_marks} marks</p>
            </div>
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl">
              <X size={16} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Question results */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {results.map((r, i) => (
            <div
              key={r.question_id}
              className={`p-4 rounded-xl border ${
                r.is_correct
                  ? "bg-emerald-50/50 border-emerald-200"
                  : "bg-red-50/50 border-red-200"
              }`}
            >
              <div className="flex items-start gap-3 mb-3">
                <span className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                  r.is_correct ? "bg-emerald-500" : "bg-red-500"
                }`}>
                  {i + 1}
                </span>
                <p className="text-sm font-semibold text-slate-900 leading-relaxed">
                  {r.question_text}
                </p>
              </div>

              {/* Options display */}
              <div className="ml-9 space-y-1.5 mb-3">
                {["A", "B", "C", "D"].map(opt => {
                  const optText = r[`option_${opt.toLowerCase()}`];
                  if (!optText) return null;
                  const isCorrect = opt === r.correct_answer;
                  const isStudentAnswer = opt === r.your_answer;
                  let cls = "text-xs px-3 py-2 rounded-lg border ";
                  if (isCorrect) cls += "bg-emerald-100 border-emerald-300 text-emerald-800 font-semibold";
                  else if (isStudentAnswer && !r.is_correct) cls += "bg-red-100 border-red-300 text-red-800 line-through";
                  else cls += "bg-white border-slate-200 text-slate-600";

                  return (
                    <div key={opt} className={cls}>
                      <span className="font-semibold mr-1.5">{opt}.</span>
                      {optText}
                      {isCorrect && <span className="ml-2 text-emerald-600">(Correct)</span>}
                      {isStudentAnswer && !r.is_correct && <span className="ml-2 text-red-500">(Your answer)</span>}
                    </div>
                  );
                })}
              </div>

              {/* Explanation */}
              {!r.is_correct && r.explanation && (
                <div className="ml-9 p-3 bg-white/80 border border-slate-200 rounded-lg">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Explanation</p>
                  <p className="text-sm text-slate-700 leading-relaxed">{r.explanation}</p>
                </div>
              )}

              {r.is_correct && (
                <p className="ml-9 text-xs text-emerald-600 font-semibold">
                  +{r.marks_earned} mark{r.marks_earned !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Study Resources — YouTube links for wrong-answer topics */}
        {(() => {
          const wrongWithResources = results.filter(r => !r.is_correct && r.youtube_query);
          if (!wrongWithResources.length) return null;
          return (
            <div className="mx-6 mb-4 p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <h4 className="font-semibold text-blue-800 text-sm mb-2.5 flex items-center gap-1.5">
                <BookOpen size={14} /> Study Resources for Topics You Missed
              </h4>
              <ul className="space-y-2">
                {wrongWithResources.map(r => (
                  <li key={r.question_id} className="flex items-start gap-2 text-sm">
                    <span className="text-blue-400 mt-0.5 flex-shrink-0">▶</span>
                    <div>
                      {r.read_topic && (
                        <span className="text-slate-600 font-medium">{r.read_topic}: </span>
                      )}
                      <a
                        href={`https://www.youtube.com/results?search_query=${encodeURIComponent(r.youtube_query)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 underline hover:text-blue-800"
                      >
                        Search on YouTube →
                      </a>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Behavioural insights */}
        {behavioural_flags.length > 0 && (
          <div className="px-6 pb-4 space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Study Insights</p>
            {behavioural_flags.map((f, i) => {
              const colors = {
                high: "bg-red-50 border-red-200 text-red-800",
                medium: "bg-amber-50 border-amber-200 text-amber-800",
                positive: "bg-emerald-50 border-emerald-200 text-emerald-800",
              };
              return (
                <div key={i} className={`flex items-start gap-2 px-3 py-2.5 rounded-xl border text-xs leading-relaxed ${colors[f.severity] || colors.medium}`}>
                  {f.severity === "positive" ? <CheckCircle size={13} className="mt-0.5 flex-shrink-0" /> : <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />}
                  {f.message}
                </div>
              );
            })}
          </div>
        )}

        {/* Recovery Plan — shown when score < 80% */}
        {percentage < 80 && (
          <div className="px-6 pb-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-2.5">
              <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Recovery Plan</p>
              <p className="text-xs text-blue-600 leading-relaxed">
                You scored below 80%. Here are steps to strengthen your understanding:
              </p>
              <div className="space-y-1.5">
                <a href="/student/materials" className="flex items-center gap-2 text-xs text-blue-800 hover:underline font-medium">
                  <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold">1</span>
                  Review the relevant course materials
                </a>
                <a href="/student/self-study" className="flex items-center gap-2 text-xs text-blue-800 hover:underline font-medium">
                  <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold">2</span>
                  Practice with a self-study quiz
                </a>
                <a href="/student/peer-study" className="flex items-center gap-2 text-xs text-blue-800 hover:underline font-medium">
                  <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold">3</span>
                  Find a study partner
                </a>
                <a href="/student/ai-tutor" className="flex items-center gap-2 text-xs text-blue-800 hover:underline font-medium">
                  <span className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center text-[10px] font-bold">4</span>
                  Ask the AI Tutor for help
                </a>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-6 border-t border-slate-100">
          <button
            onClick={onClose}
            className="w-full bg-primary text-white text-sm font-semibold py-2.5 rounded-xl hover:bg-primary-light transition-colors"
          >
            Done
          </button>
        </div>
      </motion.div>
    </div>
  );
}

/* ── Quiz-taking modal with timer ──────────────────────────────────────── */
function QuizTakingModal({ quiz, token, onClose, onComplete }) {
  const [questions, setQuestions]     = useState([]);
  const [currentIdx, setCurrentIdx]  = useState(0);
  const [answers, setAnswers]        = useState({});
  const [loading, setLoading]        = useState(true);
  const [submitting, setSubmitting]  = useState(false);
  const [error, setError]            = useState("");
  const [showConfirm, setShowConfirm] = useState(false);
  const [timeLimitMins, setTimeLimitMins] = useState(0);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const { enqueue } = useOfflineQueue();

  // Timing refs
  const questionTimesRef  = useRef({});
  const firstSelectionsRef = useRef({});   // track initial answer per question
  const questionStartRef  = useRef(Date.now());
  const quizStartRef      = useRef(Date.now());
  const submitCalledRef   = useRef(false);
  const [preConfidence, setPreConfidence] = useState(null); // 0-100 self-assessment

  useEffect(() => {
    studentsApi.getQuizQuestions(quiz.id, token)
      .then(data => {
        const qs = Array.isArray(data) ? data : data.questions || [];
        setQuestions(qs);
        setTimeLimitMins(data.time_limit_mins || 0);
        questionStartRef.current = Date.now();
        quizStartRef.current     = Date.now();
      })
      .catch(e => setError(e.message || "Failed to load questions."))
      .finally(() => setLoading(false));
  }, [quiz.id, token]);

  // Anti-cheat: track tab switches
  useEffect(() => {
    const handler = () => { if (document.hidden) setTabSwitchCount(c => c + 1); };
    document.addEventListener("visibilitychange", handler);
    return () => document.removeEventListener("visibilitychange", handler);
  }, []);

  const recordCurrentQuestionTime = () => {
    const q = questions[currentIdx];
    if (q) {
      const elapsed = Math.floor((Date.now() - questionStartRef.current) / 1000);
      questionTimesRef.current[q.id] = (questionTimesRef.current[q.id] || 0) + elapsed;
    }
  };

  const goTo = (idx) => {
    recordCurrentQuestionTime();
    setCurrentIdx(idx);
    questionStartRef.current = Date.now();
  };

  const selectAnswer = (option) => {
    const q = questions[currentIdx];
    // Track initial selection — only record the very first pick
    if (!firstSelectionsRef.current[q.id]) {
      firstSelectionsRef.current[q.id] = option;
    }
    setAnswers(prev => ({ ...prev, [q.id]: option }));
  };

  const unansweredCount = questions.length - Object.keys(answers).length;

  const handleSubmitClick = () => {
    setShowConfirm(true);
  };

  const doSubmit = useCallback(async () => {
    if (submitCalledRef.current) return;
    submitCalledRef.current = true;
    setShowConfirm(false);
    recordCurrentQuestionTime();
    const time_taken_secs = Math.floor((Date.now() - quizStartRef.current) / 1000);

    const per_question = Object.entries(answers).map(([qId, option]) => ({
      question_id:    parseInt(qId),
      selected_option: option,
      first_selection: firstSelectionsRef.current[qId] || firstSelectionsRef.current[parseInt(qId)] || null,
      time_spent_secs: questionTimesRef.current[qId] || questionTimesRef.current[parseInt(qId)] || null,
    }));

    const body = {
      answers,
      time_taken_secs,
      per_question,
      pre_confidence: preConfidence,
      tab_switch_count: tabSwitchCount,
    };

    // Offline: queue for later submission
    if (!navigator.onLine) {
      await enqueue(`/api/quizzes/${quiz.id}/submit`, "POST", body, token);
      onComplete({
        score: 0,
        total_marks: 0,
        percentage: 0,
        results: [],
        _offline: true,
        _message: "Your quiz has been saved and will be submitted when you are back online.",
      });
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      const result = await studentsApi.submitQuiz(quiz.id, body, token);
      onComplete(result);
    } catch (e) {
      setError(e.message || "Failed to submit quiz.");
      submitCalledRef.current = false;
    } finally {
      setSubmitting(false);
    }
  }, [answers, questions, quiz.id, token, onComplete, enqueue]);

  // Timer auto-submit callback
  const handleTimerExpire = useCallback(() => {
    doSubmit();
  }, [doSubmit]);

  const { display: timerDisplay, urgent: timerUrgent } = useCountdown(
    timeLimitMins > 0 ? timeLimitMins * 60 : 0,
    handleTimerExpire
  );

  const q = questions[currentIdx];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onCopy={e => e.preventDefault()} onCut={e => e.preventDefault()} onContextMenu={e => e.preventDefault()}
    >
      <div aria-hidden="true" className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        role="dialog" aria-modal="true" aria-labelledby="quiz-taking-modal-title"
        className="relative bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg p-6"
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div>
            <h3 id="quiz-taking-modal-title" className="font-serif text-xl font-bold text-slate-900">{quiz.title}</h3>
            <p className="text-sm text-slate-500">{formatCourseCode(quiz.course_code)}</p>
          </div>
          <div className="flex items-center gap-3">
            {/* Timer */}
            {timeLimitMins > 0 && (
              <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-bold ${
                timerUrgent
                  ? "bg-red-100 text-red-700 animate-pulse"
                  : "bg-slate-100 text-slate-700"
              }`}>
                <Clock size={14} />
                {timerDisplay}
              </div>
            )}
            <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-xl">
              <X size={16} className="text-slate-400" />
            </button>
          </div>
        </div>

        {/* Body */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader size={24} className="animate-spin text-accent" />
          </div>
        ) : error && questions.length === 0 ? (
          <p className="text-sm text-red-600 py-4">{error}</p>
        ) : !q ? (
          <p className="text-sm text-slate-500 py-4">No questions found for this quiz.</p>
        ) : preConfidence === null ? (
          /* Pre-quiz confidence prompt */
          <div className="py-6 text-center">
            <p className="text-sm font-semibold text-slate-900 mb-2">Before you start&hellip;</p>
            <p className="text-xs text-slate-500 mb-4">How confident are you about this material? This helps us understand your self-assessment accuracy.</p>
            <input
              type="range"
              min="0"
              max="100"
              defaultValue="50"
              id="confidence-slider"
              className="w-full accent-primary mb-2"
            />
            <p className="text-xs text-slate-500 mb-4">
              Drag the slider: 0% (not confident) &mdash; 100% (very confident)
            </p>
            <button
              onClick={() => setPreConfidence(parseInt(document.getElementById("confidence-slider").value))}
              className="px-6 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-blue-900 transition"
            >
              Start Quiz
            </button>
          </div>
        ) : (
          <>
            {/* Progress bar */}
            <div className="w-full h-1.5 bg-slate-100 rounded-full mb-3">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${((Object.keys(answers).length) / questions.length) * 100}%` }}
              />
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Question {currentIdx + 1} of {questions.length}
              {unansweredCount > 0 && (
                <span className="ml-2 text-amber-600">({unansweredCount} unanswered)</span>
              )}
            </p>
            <p className="text-sm font-semibold text-slate-900 mb-4 leading-relaxed">
              {q.question_text}
            </p>

            {(q.question_type || "mcq") === "theory" ? (
              <div className="mb-6">
                <textarea
                  value={answers[q.id] || ""}
                  onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                  placeholder="Type your answer here..."
                  rows={5}
                  className="w-full border border-slate-200 rounded-xl p-3 text-sm outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 resize-none"
                />
                <p className="text-xs text-slate-400 mt-1">Theory question — will be graded by your lecturer</p>
              </div>
            ) : (
              <div className="space-y-2 mb-6">
                {["A", "B", "C", "D"].map(opt => {
                  const text = q[`option_${opt.toLowerCase()}`];
                  if (!text) return null;
                  const selected = answers[q.id] === opt;
                  return (
                    <button
                      key={opt}
                      onClick={() => selectAnswer(opt)}
                      className={`w-full text-left px-4 py-3 rounded-xl border text-sm transition-all ${
                        selected
                          ? "bg-primary text-white border-primary"
                          : "bg-white border-slate-200 text-slate-700 hover:border-slate-300"
                      }`}
                    >
                      <span className="font-semibold mr-2">{opt}.</span> {text}
                    </button>
                  );
                })}
              </div>
            )}

            {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

            {/* Confirmation dialog */}
            {showConfirm && (
              <div className="mb-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <p className="text-sm text-amber-800 font-semibold mb-1">Submit Quiz?</p>
                {unansweredCount > 0 ? (
                  <p className="text-xs text-amber-700 mb-2">
                    You have {unansweredCount} unanswered question{unansweredCount > 1 ? "s" : ""}. Unanswered questions will be marked as incorrect.
                  </p>
                ) : (
                  <p className="text-xs text-amber-700 mb-2">Are you sure you want to submit?</p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={doSubmit}
                    disabled={submitting}
                    className="text-xs font-semibold bg-primary text-white px-3 py-1.5 rounded-lg hover:bg-primary-light disabled:opacity-50"
                  >
                    {submitting ? "Submitting..." : "Yes, Submit"}
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="text-xs font-semibold text-slate-600 px-3 py-1.5 rounded-lg hover:bg-slate-100"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            )}

            {/* Question navigation dots */}
            <div className="flex flex-wrap gap-1.5 mb-4">
              {questions.map((qq, i) => (
                <button
                  key={qq.id}
                  onClick={() => goTo(i)}
                  className={`w-7 h-7 rounded-lg text-xs font-semibold transition-all ${
                    i === currentIdx
                      ? "bg-primary text-white"
                      : answers[qq.id]
                      ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                      : "bg-slate-100 text-slate-500 border border-slate-200"
                  }`}
                >
                  {i + 1}
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={() => goTo(currentIdx - 1)}
                disabled={currentIdx === 0}
                className="text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                Previous
              </button>
              {currentIdx < questions.length - 1 ? (
                <button
                  onClick={() => goTo(currentIdx + 1)}
                  className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-primary-light transition-colors"
                >
                  Next
                </button>
              ) : (
                <button
                  onClick={handleSubmitClick}
                  disabled={submitting || showConfirm}
                  className="bg-primary text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-primary-light transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? (
                    <><Loader size={13} className="animate-spin" /> Submitting...</>
                  ) : (
                    "Submit Quiz"
                  )}
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  );
}

/* ── Score Trend Spark ────────────────────────────────────────────────── */
function ScoreTrendSpark({ completed }) {
  if (!completed || completed.length < 2) return null;

  // Last 5 quiz scores (most recent last)
  const recent = completed
    .filter(q => q.score != null && q.total_marks)
    .slice(-5)
    .map(q => Math.round((q.score / q.total_marks) * 100));

  if (recent.length < 2) return null;

  const trend = recent[recent.length - 1] - recent[0];
  const TrendIcon = trend > 5 ? TrendingUp : trend < -5 ? TrendingDown : Minus;
  const trendColor = trend > 5 ? "text-emerald-600" : trend < -5 ? "text-red-600" : "text-slate-500";
  const trendBg = trend > 5 ? "bg-emerald-50 border-emerald-200" : trend < -5 ? "bg-red-50 border-red-200" : "bg-slate-50 border-slate-200";

  return (
    <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${trendBg}`}>
      <TrendIcon size={14} className={trendColor} />
      <span className={`text-xs font-semibold ${trendColor}`}>
        Last {recent.length} quizzes: {recent.join(" → ")}%
      </span>
    </div>
  );
}

/* ── Main page ──────────────────────────────────────────────────────────── */
export default function QuizzesPage() {
  const { token } = useAuth();
  const navigate = useNavigate();
  const [quizzes, setQuizzes]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [activeQuiz, setActiveQuiz]   = useState(null);
  const [quizResult, setQuizResult]   = useState(null);
  const [search, setSearch]           = useState("");

  const fetchQuizzes = () => {
    setError("");
    studentsApi.getQuizzes(token)
      .then(data => setQuizzes(Array.isArray(data) ? data : []))
      .catch(e => setError(e.message || "Failed to load quizzes."))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchQuizzes(); }, [token]);

  // Real-time: refetch when new quiz published
  const { on } = useRealtime();
  useEffect(() => on("quiz_published", fetchQuizzes), [on]);

  const pending   = quizzes.filter(q => q.status !== "completed");
  const completed = quizzes.filter(q => q.status === "completed");

  const handleQuizComplete = (result) => {
    setActiveQuiz(null);
    setQuizResult(result);
    fetchQuizzes();
  };

  const isOverdue = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date();
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Quizzes</h1>
          <p className="text-lg text-slate-600">Available and completed quizzes across your courses</p>
        </div>
        <SkeletonTable rows={4} cols={5} />
        <SkeletonTable rows={3} cols={5} />
      </div>
    );
  }

  return (
    <motion.div
      className="space-y-8"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.28 }}
    >
      {/* Header */}
      <div className="max-w-2xl">
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Quizzes</h1>
        <p className="text-lg text-slate-600">Available and completed quizzes across your courses</p>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-xl">
          <AlertCircle size={18} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
          <button onClick={fetchQuizzes} className="ml-auto text-xs font-semibold text-red-600 hover:text-red-800">Retry</button>
        </div>
      )}

      {/* Search */}
      <div className="relative max-w-xs">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search quizzes by title..."
          className="w-full pl-3 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
        />
      </div>

      {/* Score trend + weak topics CTA */}
      {completed.length >= 2 && (
        <div className="flex items-center gap-3 flex-wrap">
          <ScoreTrendSpark completed={completed} />
          {(() => {
            // Find the weakest course topic based on lowest avg score
            const courseScores = {};
            completed.forEach(q => {
              if (q.score == null || !q.total_marks) return;
              const code = q.course_code || "Unknown";
              if (!courseScores[code]) courseScores[code] = { total: 0, count: 0 };
              courseScores[code].total += (q.score / q.total_marks) * 100;
              courseScores[code].count += 1;
            });
            const weakest = Object.entries(courseScores)
              .map(([code, { total, count }]) => ({ code, avg: Math.round(total / count) }))
              .sort((a, b) => a.avg - b.avg)[0];

            if (weakest && weakest.avg < 70) {
              return (
                <button
                  onClick={() => navigate(`/student/self-study?topic=${encodeURIComponent(weakest.code)}`)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-blue-700 bg-blue-50 border border-blue-200 px-3 py-2 rounded-xl transition-colors"
                >
                  <BookOpen size={13} />
                  Review Weak Topics ({formatCourseCode(weakest.code)} avg {weakest.avg}%)
                </button>
              );
            }
            return null;
          })()}
        </div>
      )}

      {/* Pending */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-serif text-2xl font-bold text-slate-900">Pending</h2>
          {pending.length > 0 && (
            <span className="text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-1 rounded-full">
              {pending.length}
            </span>
          )}
        </div>

        <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          {pending.length === 0 ? (
            <div className="text-center py-16">
              <ClipboardList size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="font-serif text-lg font-semibold text-slate-500 mb-1">All quizzes complete</p>
              <p className="text-sm text-slate-400">No pending quizzes at the moment</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ds-table w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th className="text-left">Course</th>
                    <th className="text-left">Quiz</th>
                    <th className="hidden sm:table-cell text-left">Marks</th>
                    <th className="hidden md:table-cell text-left">Due</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pending.filter(q => q.title.toLowerCase().includes(search.toLowerCase())).map(q => {
                    const dueSoon = isDueSoon(q.due_date);
                    const overdue = isOverdue(q.due_date);
                    return (
                      <tr key={q.id}>
                        <td className="font-semibold text-primary whitespace-nowrap">{formatCourseCode(q.course_code)}</td>
                        <td className="text-slate-600">
                          {q.title}
                          {q.time_limit_mins > 0 && (
                            <span className="ml-2 text-xs text-slate-400 inline-flex items-center gap-1">
                              <Clock size={10} /> {q.time_limit_mins}min
                            </span>
                          )}
                          {q.topic_tag && (
                            <span className="ml-2 text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                              {q.topic_tag}
                            </span>
                          )}
                          {q.difficulty && (
                            <span className={`ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              q.difficulty === "hard" ? "bg-red-50 text-red-600" :
                              q.difficulty === "medium" ? "bg-amber-50 text-amber-600" :
                              "bg-green-50 text-green-600"
                            }`}>
                              {q.difficulty.charAt(0).toUpperCase() + q.difficulty.slice(1)}
                            </span>
                          )}
                        </td>
                        <td className="text-slate-500 hidden sm:table-cell">{q.total_marks}</td>
                        <td className="hidden md:table-cell">
                          {overdue ? (
                            <span className="flex items-center gap-1.5 text-sm text-red-600 font-semibold">
                              <AlertCircle size={12} />
                              Overdue
                            </span>
                          ) : (
                            <span className={`flex items-center gap-1.5 text-sm ${dueSoon ? "text-risk-high font-semibold" : "text-slate-500"}`}>
                              {dueSoon && <AlertCircle size={12} />}
                              {formatDate(q.due_date)}
                            </span>
                          )}
                        </td>
                        <td className="text-right">
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={() => setActiveQuiz(q)}
                            className="inline-flex items-center gap-1.5 bg-primary text-white text-xs font-semibold px-3 py-1.5 rounded-xl hover:bg-primary-light transition-colors"
                          >
                            <Play size={11} />
                            <span className="hidden sm:inline">Start</span>
                          </motion.button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Completed */}
      <section>
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-serif text-2xl font-bold text-slate-900">Completed</h2>
          <CheckCircle size={18} className="text-emerald-500" />
        </div>

        <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          {completed.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle size={32} className="text-slate-300 mx-auto mb-3" />
              <p className="font-serif text-lg font-semibold text-slate-500 mb-1">No completed quizzes yet</p>
              <p className="text-sm text-slate-400">Completed quizzes will appear here with your scores</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="ds-table w-full min-w-[560px]">
                <thead>
                  <tr>
                    <th className="text-left">Course</th>
                    <th className="text-left">Quiz</th>
                    <th className="hidden sm:table-cell text-left">Score</th>
                    <th className="text-left">Grade</th>
                    <th className="text-right">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {completed.map(q => {
                    const total  = q.total_marks || 1;
                    const pct    = Math.round(((q.score ?? 0) / total) * 100);
                    const gradeCl = pct >= 70
                      ? "text-emerald-700 bg-emerald-50 border-emerald-200"
                      : pct >= 50
                      ? "text-amber-700 bg-amber-50 border-amber-200"
                      : "text-red-700 bg-red-50 border-red-200";

                    return (
                      <tr key={q.id}>
                        <td className="font-semibold text-primary whitespace-nowrap">{formatCourseCode(q.course_code)}</td>
                        <td className="text-slate-600">{q.title}</td>
                        <td className="hidden sm:table-cell text-slate-600">
                          <span className="font-semibold text-primary">{q.score ?? 0}</span>/{total}
                        </td>
                        <td>
                          <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-1 rounded-full border ${gradeCl}`}>
                            {pct}%
                          </span>
                        </td>
                        <td className="text-right text-xs text-slate-400">
                          {q.attempted_at ? formatDate(q.attempted_at) : "\u2014"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Quiz-taking modal */}
      {activeQuiz && (
        <QuizTakingModal
          quiz={activeQuiz}
          token={token}
          onClose={() => setActiveQuiz(null)}
          onComplete={handleQuizComplete}
        />
      )}

      {/* Quiz results modal */}
      {quizResult && (
        <QuizResultsModal
          result={quizResult}
          onClose={() => setQuizResult(null)}
        />
      )}
    </motion.div>
  );
}
