/**
 * SelfStudyPage — AI-generated self-study quizzes + knowledge map.
 */
import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  Lightbulb, Play, CheckCircle, XCircle, Award,
  BarChart3, Clock, Loader2, ChevronRight,
} from "lucide-react";

import CustomDropdown from "../../components/ui/CustomDropdown";
import { useAuth } from "../../context/AuthContext";
import { studentsApi } from "../../services/api";

const DIFFICULTIES = [
  { value: "beginner",     label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced",     label: "Advanced" },
];

export default function SelfStudyPage() {
  const { token } = useAuth();
  const [searchParams] = useSearchParams();
  const prefilledTopic = searchParams.get("topic") || "";
  const [tab, setTab] = useState("generate"); // generate | attempt | results | map | history
  const [topic, setTopic] = useState(prefilledTopic);
  const [difficulty, setDifficulty] = useState("intermediate");
  const [courseId, setCourseId] = useState("");
  const [courses, setCourses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [quiz, setQuiz] = useState(null);       // current quiz with questions
  const [quizId, setQuizId] = useState(null);
  const [answers, setAnswers] = useState({});    // {questionIndex: "A"|"B"...}
  const [results, setResults] = useState(null);
  const [knowledgeMap, setKnowledgeMap] = useState([]);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    studentsApi.getMyCourses(token).then(data => {
      const list = Array.isArray(data) ? data : [];
      setCourses(list);
    }).catch(() => {});
  }, [token]);

  const COURSE_OPTIONS = [
    { value: "", label: "No specific course" },
    ...courses.map(c => ({
      value: String(c.course_id ?? c.id),
      label: `${c.course_code} — ${c.course_title}`,
    })),
  ];

  const generateQuiz = async () => {
    if (!topic.trim() || loading) return;
    setLoading(true);
    try {
      const res = await studentsApi.generateSelfStudyQuiz(
        topic.trim(), difficulty, courseId || null, token
      );
      setQuiz(res.questions);
      setQuizId(res.quiz_id);
      setAnswers({});
      setResults(null);
      setTab("attempt");
    } catch (e) {
      alert(e?.detail || "Failed to generate quiz. Try again.");
    } finally { setLoading(false); }
  };

  const submitQuiz = async () => {
    if (!quizId || loading) return;
    const answerList = Object.entries(answers).map(([idx, selected]) => ({
      question_index: Number(idx),
      selected,
      time_spent_secs: 0,
    }));
    if (answerList.length < (quiz?.length || 0)) {
      if (!confirm(`You've answered ${answerList.length} of ${quiz.length} questions. Submit anyway?`)) return;
    }
    setLoading(true);
    try {
      const res = await studentsApi.submitSelfStudyQuiz(quizId, answerList, token);
      setResults(res);
      setTab("results");
    } catch (e) {
      alert(e?.detail || "Failed to submit. Try again.");
    } finally { setLoading(false); }
  };

  const loadKnowledgeMap = async () => {
    setTab("map");
    try {
      const data = await studentsApi.getKnowledgeMap(token);
      setKnowledgeMap(Array.isArray(data) ? data : []);
    } catch { setKnowledgeMap([]); }
  };

  const loadHistory = async () => {
    setTab("history");
    try {
      const data = await studentsApi.getSelfStudyHistory(token);
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
  };

  return (
    <motion.div
      className="max-w-4xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header */}
      <div>
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-2">Self Study</h1>
        <p className="text-base text-slate-600">Generate AI-powered practice quizzes and track your mastery</p>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "generate", label: "New Quiz", icon: Lightbulb },
          { key: "map",      label: "Knowledge Map", icon: BarChart3, onClick: loadKnowledgeMap },
          { key: "history",  label: "History", icon: Clock, onClick: loadHistory },
        ].map(t => {
          const Icon = t.icon;
          const active = tab === t.key || (t.key === "generate" && tab === "attempt") || (t.key === "generate" && tab === "results");
          return (
            <motion.button
              key={t.key}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={t.onClick || (() => setTab(t.key))}
              className={[
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                active
                  ? "bg-primary text-white border-primary shadow-md"
                  : "bg-white text-slate-600 border-slate-200 hover:border-accent/30",
              ].join(" ")}
            >
              <Icon size={15} />
              {t.label}
            </motion.button>
          );
        })}
      </div>

      {/* Generate tab */}
      {tab === "generate" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5"
        >
          <h2 className="text-lg font-semibold text-slate-800">Generate a Practice Quiz</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Topic</label>
              <input
                className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-accent/20 focus:border-accent/40 outline-none"
                placeholder="e.g. Binary Trees, OSI Model, SQL Joins..."
                value={topic}
                onChange={e => setTopic(e.target.value)}
                onKeyDown={e => e.key === "Enter" && generateQuiz()}
              />
            </div>
            <CustomDropdown
              value={difficulty}
              onChange={setDifficulty}
              options={DIFFICULTIES}
              label="Difficulty"
            />
          </div>
          <CustomDropdown
            value={courseId}
            onChange={setCourseId}
            options={COURSE_OPTIONS}
            label="Course (optional)"
            placeholder="No specific course"
          />
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={generateQuiz}
            disabled={!topic.trim() || loading}
            className={[
              "flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm shadow-sm transition-all",
              topic.trim() && !loading
                ? "bg-primary text-white hover:shadow-md"
                : "bg-slate-200 text-slate-400 cursor-not-allowed",
            ].join(" ")}
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Generate Quiz
          </motion.button>
        </motion.div>
      )}

      {/* Attempt tab */}
      {tab === "attempt" && quiz && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-800">
              {topic} — {quiz.length} Questions
            </h2>
            <span className="text-sm text-slate-500">
              {Object.keys(answers).length}/{quiz.length} answered
            </span>
          </div>

          {quiz.map((q, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm"
            >
              <p className="text-sm font-medium text-slate-800 mb-3">
                <span className="text-accent font-bold mr-2">{idx + 1}.</span>
                {q.question}
              </p>
              {q.topic_tag && (
                <span className="inline-block text-[10px] font-semibold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded mb-3">
                  {q.topic_tag}
                </span>
              )}
              <div className="space-y-2">
                {(q.options || []).map((opt, oi) => {
                  const letter = opt.charAt(0);
                  const selected = answers[idx] === letter;
                  return (
                    <button
                      key={oi}
                      onClick={() => setAnswers(a => ({ ...a, [idx]: letter }))}
                      className={[
                        "w-full text-left px-4 py-3 rounded-xl text-sm transition-all border",
                        selected
                          ? "bg-primary/10 border-primary text-primary font-medium"
                          : "bg-slate-50 border-slate-200 text-slate-700 hover:border-accent/30",
                      ].join(" ")}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            </motion.div>
          ))}

          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={submitQuiz}
            disabled={loading}
            className="flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-sm bg-primary text-white shadow-sm hover:shadow-md transition-all"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
            Submit Answers
          </motion.button>
        </motion.div>
      )}

      {/* Results tab */}
      {tab === "results" && results && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-5"
        >
          {/* Score */}
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
            <Award size={40} className="mx-auto text-accent mb-3" />
            <p className="text-4xl font-bold text-slate-900">{results.score}%</p>
            <p className="text-sm text-slate-500 mt-1">{results.correct} of {results.total} correct</p>
          </div>

          {/* Topic breakdown */}
          {results.topic_breakdown && Object.keys(results.topic_breakdown).length > 0 && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-4">Topic Breakdown</h3>
              <div className="space-y-3">
                {Object.entries(results.topic_breakdown).map(([tag, pct]) => (
                  <div key={tag}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-slate-600">{tag}</span>
                      <span className="font-medium text-slate-800">{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6 }}
                        className={`h-full rounded-full ${pct >= 70 ? "bg-emerald-500" : pct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* AI Feedback */}
          {results.ai_feedback && (
            <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-sm font-semibold text-slate-800 mb-3">AI Feedback</h3>
              <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{results.ai_feedback}</p>
            </div>
          )}

          <div className="flex gap-3">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setTab("generate")}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-primary text-white shadow-sm hover:shadow-md transition-all"
            >
              Try Another Topic
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={loadKnowledgeMap}
              className="px-5 py-2.5 rounded-xl text-sm font-medium bg-white text-slate-700 border border-slate-200 hover:border-accent/30 transition-all"
            >
              View Knowledge Map
            </motion.button>
          </div>
        </motion.div>
      )}

      {/* Knowledge Map */}
      {tab === "map" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-4"
        >
          {knowledgeMap.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
              <BarChart3 size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No mastery data yet. Complete self-study quizzes to build your knowledge map.</p>
            </div>
          ) : (
            knowledgeMap.map((topicEntry, ti) => (
              <div key={ti} className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">{topicEntry.topic}</h3>
                  <span className={`text-sm font-bold ${topicEntry.overall_mastery >= 70 ? "text-emerald-600" : topicEntry.overall_mastery >= 40 ? "text-amber-600" : "text-red-600"}`}>
                    {topicEntry.overall_mastery}%
                  </span>
                </div>
                <div className="space-y-2">
                  {topicEntry.sub_topics.map((st, si) => (
                    <div key={si}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">{st.sub_topic}</span>
                        <span className="text-slate-500">{st.mastery_pct}% ({st.attempts} attempts)</span>
                      </div>
                      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full ${st.mastery_pct >= 70 ? "bg-emerald-500" : st.mastery_pct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                          style={{ width: `${st.mastery_pct}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </motion.div>
      )}

      {/* History */}
      {tab === "history" && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {history.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
              <Clock size={40} className="mx-auto text-slate-300 mb-3" />
              <p className="text-slate-500">No self-study quizzes yet. Generate one to get started!</p>
            </div>
          ) : (
            history.map((h, i) => (
              <div key={i} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-800">{h.topic}</p>
                  <p className="text-xs text-slate-500">
                    {h.difficulty} · {h.question_count} questions
                    {h.course_code ? ` · ${h.course_code}` : ""}
                    {h.created_at ? ` · ${new Date(h.created_at).toLocaleDateString()}` : ""}
                  </p>
                </div>
                <div className="text-right">
                  {h.score !== null ? (
                    <span className={`text-sm font-bold ${h.score >= 70 ? "text-emerald-600" : h.score >= 40 ? "text-amber-600" : "text-red-600"}`}>
                      {h.score}%
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Not attempted</span>
                  )}
                </div>
              </div>
            ))
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
