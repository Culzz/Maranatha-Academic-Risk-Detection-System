/**
 * SpacedRepPage — Spaced Repetition review cards from wrong quiz answers.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, CheckCircle, XCircle, Award, Loader2, Brain } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { studentsApi } from "../../services/api";

export default function SpacedRepPage() {
  const { token } = useAuth();
  const [cards, setCards] = useState([]);
  const [stats, setStats] = useState(null);
  const [current, setCurrent] = useState(0);
  const [feedback, setFeedback] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);
  const { on } = useRealtime();

  useEffect(() => {
    const u1 = on("knowledge_milestone", () => setRefreshTick(t => t + 1));
    return () => { u1(); };
  }, [on]);

  useEffect(() => {
    Promise.all([
      studentsApi.getSpacedRepDue(token),
      studentsApi.getSpacedRepStats(token),
    ]).then(([due, st]) => {
      setCards(Array.isArray(due) ? due : []);
      setStats(st);
    }).catch(() => {}).finally(() => setLoading(false));
  }, [token, refreshTick]);

  const answer = async (selected) => {
    const card = cards[current];
    if (!card) return;
    try {
      const res = await studentsApi.answerSpacedRepCard(card.id, selected, token);
      setFeedback(res);
    } catch {}
  };

  const next = () => {
    setFeedback(null);
    if (current < cards.length - 1) setCurrent(c => c + 1);
    else setCurrent(0);
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-slate-400" size={28} /></div>;
  }

  return (
    <motion.div
      className="max-w-3xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div>
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-2">Daily Review</h1>
        <p className="text-base text-slate-600">Questions from your wrong answers, spaced for optimal memory</p>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Due Today", value: stats.due_today, color: stats.due_today > 0 ? "text-amber-600" : "text-emerald-600" },
            { label: "Active Cards", value: stats.total_active },
            { label: "Consolidated", value: stats.consolidated, color: "text-emerald-600" },
          ].map(s => (
            <div key={s.label} className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
              <p className="text-xs text-slate-500 mb-1">{s.label}</p>
              <p className={`text-2xl font-bold ${s.color || "text-slate-900"}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {cards.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 shadow-sm text-center">
          <Award size={40} className="mx-auto text-emerald-400 mb-3" />
          <p className="text-lg font-semibold text-slate-800">All caught up!</p>
          <p className="text-sm text-slate-500 mt-1">No review cards due right now. Keep taking quizzes to build your deck.</p>
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.div
            key={current}
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -30 }}
            className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm"
          >
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs text-slate-400">Card {current + 1} of {cards.length}</span>
              {cards[current].course_code && (
                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600">{cards[current].course_code}</span>
              )}
            </div>

            <p className="text-base font-medium text-slate-800 mb-5">{cards[current].question}</p>

            {!feedback ? (
              <div className="space-y-2">
                {(cards[current].options || []).map((opt, i) => {
                  const letter = opt.charAt(0);
                  return (
                    <button
                      key={i}
                      onClick={() => answer(letter)}
                      className="w-full text-left px-4 py-3 rounded-xl text-sm border border-slate-200 bg-slate-50 text-slate-700 hover:border-accent/30 transition-all"
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="space-y-4">
                <div className={`flex items-center gap-2 text-sm font-semibold ${feedback.correct ? "text-emerald-600" : "text-red-600"}`}>
                  {feedback.correct ? <CheckCircle size={18} /> : <XCircle size={18} />}
                  {feedback.correct ? "Correct!" : `Incorrect — correct answer: ${feedback.correct_answer}`}
                </div>
                {feedback.explanation && (
                  <p className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3">{feedback.explanation}</p>
                )}
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Streak: {feedback.streak} | Next review in {feedback.new_interval_days} day(s)</span>
                  {feedback.consolidated && <span className="text-emerald-600 font-bold">Consolidated!</span>}
                </div>
                <button
                  onClick={next}
                  className="px-5 py-2.5 rounded-xl text-sm font-medium bg-primary text-white shadow-sm hover:shadow-md transition-all"
                >
                  Next Card
                </button>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </motion.div>
  );
}
