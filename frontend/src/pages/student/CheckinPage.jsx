/**
 * CheckinPage — Student weekly wellbeing check-in.
 * Students select their mood per course and an optional note.
 * Includes optional 30-second Voice Check-In (Idea 3).
 * Data feeds directly into the lecturer's Student Pulse dashboard.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Heart, CheckCircle2, Clock, ChevronRight, Mic, MicOff, Loader2, Sparkles, DollarSign, BookOpen, GraduationCap, MessageSquare, Flame } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { studentsApi, checkinsApi, voiceCheckinApi } from "../../services/api";
import useWeekInfo from "../../hooks/useWeekInfo";

import { formatDate } from "../../utils/helpers";
import CustomDropdown from "../../components/ui/CustomDropdown";

const MOODS = [
  {
    key: "confident",
    emoji: "😊",
    label: "Confident",
    desc: "I understand the material and feel on track.",
    bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200",
    active: "bg-emerald-500 border-emerald-500 text-white",
    badge: "bg-emerald-100 text-emerald-700",
  },
  {
    key: "unsure",
    emoji: "😐",
    label: "Unsure",
    desc: "Some parts are unclear but I'm managing.",
    bg: "bg-amber-50 hover:bg-amber-100 border-amber-200",
    active: "bg-amber-400 border-amber-400 text-white",
    badge: "bg-amber-100 text-amber-700",
  },
  {
    key: "lost",
    emoji: "😰",
    label: "Need Help",
    desc: "I'm struggling and need support.",
    bg: "bg-red-50 hover:bg-red-100 border-red-200",
    active: "bg-red-500 border-red-500 text-white",
    badge: "bg-red-100 text-red-700",
  },
];

const MOOD_STYLE = { confident: "🟢", unsure: "🟡", lost: "🔴" };

const FINANCIAL_OPTIONS = [
  { key: "none",        label: "Not at all",   desc: "No financial concerns affecting my studies",  bg: "bg-emerald-50 hover:bg-emerald-100 border-emerald-200", active: "bg-emerald-500 border-emerald-500 text-white" },
  { key: "minor",       label: "Minor",        desc: "Some concerns but managing",                bg: "bg-amber-50 hover:bg-amber-100 border-amber-200",    active: "bg-amber-400 border-amber-400 text-white" },
  { key: "significant", label: "Significant",  desc: "It's affecting my ability to study",         bg: "bg-orange-50 hover:bg-orange-100 border-orange-200",  active: "bg-orange-500 border-orange-500 text-white" },
  { key: "severe",      label: "Severe",       desc: "I may not be able to continue",              bg: "bg-red-50 hover:bg-red-100 border-red-200",          active: "bg-red-500 border-red-500 text-white" },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

export default function CheckinPage() {
  const { token } = useAuth();
  const { weekInfo } = useWeekInfo();
  const weekNum = weekInfo?.week || 1;
  const [courses,   setCourses]   = useState([]);
  const [courseId,  setCourseId]  = useState("");
  const [mood,      setMood]      = useState("");
  const [note,      setNote]      = useState("");
  const [financialStress, setFinancialStress] = useState("");
  const [history,   setHistory]   = useState([]);
  const [success,   setSuccess]   = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState("");

  // Voice check-in state (Idea 3)
  const [voiceMode,      setVoiceMode]      = useState(false);
  const [isListening,    setIsListening]    = useState(false);
  const [transcript,     setTranscript]     = useState("");
  const [voiceLoading,   setVoiceLoading]   = useState(false);
  const [voiceResult,    setVoiceResult]    = useState(null);
  const [voiceSeconds,   setVoiceSeconds]   = useState(0);
  const recognitionRef = useRef(null);
  const timerRef = useRef(null);

  const speechSupported = typeof window !== "undefined" && ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);

  const startListening = useCallback(() => {
    if (!speechSupported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-NG";

    let finalText = "";
    recognition.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          finalText += e.results[i][0].transcript + " ";
        } else {
          interim += e.results[i][0].transcript;
        }
      }
      setTranscript(finalText + interim);
    };
    recognition.onerror = () => { stopListening(); };
    recognition.onend = () => { setIsListening(false); };

    recognition.start();
    recognitionRef.current = recognition;
    setIsListening(true);
    setVoiceSeconds(0);
    setVoiceResult(null);
    setTranscript("");

    // 30-second timer
    timerRef.current = setInterval(() => {
      setVoiceSeconds(prev => {
        if (prev >= 29) { stopListening(); return 30; }
        return prev + 1;
      });
    }, 1000);
  }, [speechSupported]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setIsListening(false);
  }, []);

  const submitVoiceCheckin = async () => {
    if (!transcript.trim() || transcript.trim().length < 10) {
      setError("Please speak for a few more seconds before submitting.");
      return;
    }
    setVoiceLoading(true);
    setError("");
    try {
      const result = await voiceCheckinApi.processTranscript(
        transcript.trim(),
        courseId ? Number(courseId) : null,
        token,
      );
      setVoiceResult(result);
      // Refresh history
      const updated = await checkinsApi.getMyCheckins(token);
      setHistory(Array.isArray(updated) ? updated : []);
    } catch (e) {
      setError(e.message || "Voice check-in failed.");
    } finally {
      setVoiceLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => { stopListening(); };
  }, [stopListening]);

  /* Load enrolled courses + past check-ins */
  useEffect(() => {
    if (!token) return;
    studentsApi.getMyCourses(token)
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setCourses(arr);
        if (arr.length) setCourseId(String(arr[0].id ?? arr[0].course_id ?? ""));
      })
      .catch(() => {});
    checkinsApi.getMyCheckins(token)
      .then(data => setHistory(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.id ?? c.course_id),
    label: `${c.course_code} — ${c.course_title}`,
  }));

  const handleSubmit = async () => {
    if (!mood || !courseId) return;
    setLoading(true); setError("");
    try {
      await checkinsApi.submitCheckin(
        { course_id: Number(courseId), week_number: weekNum, mood, note: note.trim() || null, financial_stress: financialStress || null },
        token
      );
      const updated = await checkinsApi.getMyCheckins(token);
      setHistory(Array.isArray(updated) ? updated : []);
      setSuccess(true);
      setMood(""); setNote(""); setFinancialStress("");
      setTimeout(() => setSuccess(false), 4000);
    } catch (e) {
      setError(e.message || "Submission failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const alreadyCheckedIn = history.some(
    h => String(h.course_id) === String(courseId) && h.week_number === weekNum
  );

  return (
    <div className="max-w-2xl mx-auto space-y-8">

      {/* Header */}
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div variants={item}>
          <div className="flex items-center gap-3 mb-1">
            <div className="w-10 h-10 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-center flex-shrink-0">
              <Heart size={18} className="text-rose-500" />
            </div>
            <div>
              <h1 className="font-serif text-2xl font-bold text-slate-900 leading-tight">
                Weekly Check-In
              </h1>
              <p className="text-sm text-slate-500 mt-0.5">Week {weekNum} · Let your lecturer know how you're doing</p>
            </div>
          </div>
        </motion.div>
      </motion.div>

      {/* Success banner */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
          >
            <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
            <p className="text-sm font-medium text-emerald-700">
              Check-in submitted. Your lecturer will see your update.
            </p>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* "Lost" follow-up guidance */}
      <AnimatePresence>
        {success && mood === "lost" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="bg-blue-50 border border-blue-200 rounded-xl p-5"
          >
            <p className="text-sm font-semibold text-blue-800 mb-3">
              We hear you. Here are some things that might help:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Link to="/student/tutor" className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 bg-white border border-blue-200 rounded-lg px-3 py-2 transition-colors">
                <MessageSquare size={14} /> Talk to AI Tutor
              </Link>
              <Link to="/student/self-study" className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 bg-white border border-blue-200 rounded-lg px-3 py-2 transition-colors">
                <BookOpen size={14} /> Self-Study Materials
              </Link>
              <Link to="/student/office-hours" className="flex items-center gap-2 text-sm text-blue-700 hover:text-blue-900 bg-white border border-blue-200 rounded-lg px-3 py-2 transition-colors">
                <GraduationCap size={14} /> Book Office Hours
              </Link>
              {(financialStress === "significant" || financialStress === "severe") && (
                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <DollarSign size={14} /> Contact Student Affairs for financial support
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Check-in streak visualization */}
      {(() => {
        // Count consecutive weeks with check-ins (simple heuristic from history)
        const weeksSorted = [...new Set(history.map(h => h.week_number))].sort((a, b) => b - a);
        let streak = 0;
        for (let i = 0; i < weeksSorted.length; i++) {
          if (weeksSorted[i] === weekNum - i || weeksSorted[i] === weekNum - i - (success ? 0 : 1)) {
            streak++;
          } else break;
        }
        if (streak === 0 && success) streak = 1;
        if (streak === 0) return null;
        return (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <Flame size={18} className="text-amber-500" />
            <div>
              <p className="text-sm font-semibold text-amber-800">{streak}-week check-in streak</p>
              <p className="text-xs text-amber-600">Students with 5+ week streaks have 23% lower risk on average</p>
            </div>
          </div>
        );
      })()}

      {/* Mode toggle: Text vs Voice */}
      {speechSupported && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setVoiceMode(false); setVoiceResult(null); stopListening(); }}
            className={[
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              !voiceMode ? "bg-primary text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
            ].join(" ")}
          >
            <Heart size={14} /> Mood Check-In
          </button>
          <button
            onClick={() => { setVoiceMode(true); setSuccess(false); }}
            className={[
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all",
              voiceMode ? "bg-primary text-white shadow-sm" : "bg-slate-100 text-slate-500 hover:bg-slate-200",
            ].join(" ")}
          >
            <Mic size={14} /> Voice Check-In
          </button>
        </div>
      )}

      {/* Voice check-in card (Idea 3) */}
      {voiceMode && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden"
        >
          {/* Course selector */}
          <div className="px-6 pt-6 pb-4 border-b border-slate-100">
            <label className="ds-label mb-2">Course</label>
            {COURSE_OPTIONS.length > 0 ? (
              <CustomDropdown
                value={courseId}
                onChange={setCourseId}
                options={COURSE_OPTIONS}
                placeholder="Select course"
              />
            ) : (
              <p className="text-sm text-slate-400">No enrolled courses found.</p>
            )}
          </div>

          <div className="px-6 py-6 space-y-5">
            <div className="text-center">
              <p className="text-sm text-slate-600 mb-1">
                Just speak for up to 30 seconds. How are you doing with the course this week?
              </p>
              <p className="text-xs text-slate-400">No wrong answers.</p>
            </div>

            {/* Recording button */}
            <div className="flex flex-col items-center gap-4">
              <button
                onClick={isListening ? stopListening : startListening}
                disabled={voiceLoading}
                className={[
                  "w-20 h-20 rounded-full flex items-center justify-center transition-all shadow-lg",
                  isListening
                    ? "bg-red-500 hover:bg-red-600 animate-pulse"
                    : "bg-primary hover:bg-primary/90",
                ].join(" ")}
              >
                {isListening
                  ? <MicOff size={28} className="text-white" />
                  : <Mic size={28} className="text-white" />
                }
              </button>
              <div className="text-center">
                {isListening && (
                  <p className="text-sm font-semibold text-red-600">
                    Listening... {voiceSeconds}s / 30s
                  </p>
                )}
                {!isListening && !transcript && !voiceResult && (
                  <p className="text-sm text-slate-400">Tap the mic to start</p>
                )}
                {!isListening && transcript && !voiceResult && (
                  <p className="text-sm text-slate-500">Recording complete. Review and submit below.</p>
                )}
              </div>
            </div>

            {/* Transcript display */}
            {transcript && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-semibold text-slate-500 mb-2">Your words:</p>
                <p className="text-sm text-slate-700 leading-relaxed italic">"{transcript}"</p>
              </div>
            )}

            {/* Submit voice check-in */}
            {transcript && !voiceResult && !isListening && (
              <button
                onClick={submitVoiceCheckin}
                disabled={voiceLoading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm bg-primary text-white hover:bg-primary/90 shadow-sm transition-all"
              >
                {voiceLoading
                  ? <Loader2 size={16} className="animate-spin" />
                  : <><Sparkles size={14} /> Analyse & Submit</>
                }
              </button>
            )}

            {/* AI response */}
            {voiceResult && !voiceResult.error && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-4"
              >
                {/* Detected mood/topics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">Detected Mood</p>
                    <p className="text-lg font-bold text-slate-900 capitalize">
                      {voiceResult.mood === "confident" ? "😊" : voiceResult.mood === "lost" ? "😰" : "😐"} {voiceResult.mood}
                    </p>
                  </div>
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-500 mb-1">Urgency</p>
                    <p className={[
                      "text-lg font-bold capitalize",
                      voiceResult.urgency === "high" ? "text-red-600"
                        : voiceResult.urgency === "moderate" ? "text-amber-600"
                        : "text-emerald-600",
                    ].join(" ")}>
                      {voiceResult.urgency}
                    </p>
                  </div>
                </div>

                {/* Topics & Stressors */}
                {voiceResult.topics?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">Topics flagged</p>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceResult.topics.map((t, i) => (
                        <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">{t}</span>
                      ))}
                    </div>
                  </div>
                )}
                {voiceResult.stressors?.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-slate-500 mb-2">Stressors identified</p>
                    <div className="flex flex-wrap gap-1.5">
                      {voiceResult.stressors.map((s, i) => (
                        <span key={i} className="text-xs font-medium px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">{s}</span>
                      ))}
                    </div>
                  </div>
                )}

                {/* AI response */}
                {voiceResult.response && (
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles size={13} className="text-blue-600" />
                      <p className="text-xs font-semibold text-blue-700">AI Response</p>
                    </div>
                    <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-line">{voiceResult.response}</p>
                  </div>
                )}

                {voiceResult.checkin_saved && (
                  <div className="flex items-center gap-2 text-sm text-emerald-600">
                    <CheckCircle2 size={14} /> Check-in saved for Week {voiceResult.week_number}
                  </div>
                )}

                {/* Reset */}
                <button
                  onClick={() => { setVoiceResult(null); setTranscript(""); }}
                  className="text-xs text-slate-400 hover:text-slate-600 font-medium transition-colors"
                >
                  Record another
                </button>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}

      {/* Check-in card */}
      <motion.div variants={item} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">

        {/* Course selector */}
        <div className="px-6 pt-6 pb-4 border-b border-slate-100">
          <label className="ds-label mb-2">Course</label>
          {COURSE_OPTIONS.length > 0 ? (
            <CustomDropdown
              value={courseId}
              onChange={setCourseId}
              options={COURSE_OPTIONS}
              placeholder="Select course"
            />
          ) : (
            <p className="text-sm text-slate-400">No enrolled courses found.</p>
          )}
          {alreadyCheckedIn && (
            <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
              <Clock size={12} /> You already checked in for this course this week. Submitting again will update it.
            </p>
          )}
        </div>

        {/* Mood selection */}
        <div className="px-6 py-5">
          <p className="ds-label mb-3">How are you feeling in this course?</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {MOODS.map(m => {
              const isActive = mood === m.key;
              return (
                <button
                  key={m.key}
                  onClick={() => setMood(m.key)}
                  className={[
                    "flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-150 text-center",
                    isActive ? m.active : m.bg,
                  ].join(" ")}
                >
                  <span className="text-3xl">{m.emoji}</span>
                  <span className={["text-sm font-semibold", isActive ? "text-white" : "text-slate-700"].join(" ")}>
                    {m.label}
                  </span>
                  <span className={["text-xs leading-snug", isActive ? "text-white/80" : "text-slate-500"].join(" ")}>
                    {m.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Financial stress (optional) */}
        <div className="px-6 pb-5">
          <div className="flex items-center gap-2 mb-3">
            <DollarSign size={14} className="text-slate-400" />
            <p className="ds-label">Are financial difficulties affecting your studies?</p>
            <span className="text-xs text-slate-400 font-normal">(optional)</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {FINANCIAL_OPTIONS.map(f => {
              const isActive = financialStress === f.key;
              return (
                <button
                  key={f.key}
                  onClick={() => setFinancialStress(prev => prev === f.key ? "" : f.key)}
                  className={[
                    "flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all duration-150 text-center",
                    isActive ? f.active : f.bg,
                  ].join(" ")}
                >
                  <span className={["text-sm font-semibold", isActive ? "text-white" : "text-slate-700"].join(" ")}>
                    {f.label}
                  </span>
                  <span className={["text-[11px] leading-snug", isActive ? "text-white/80" : "text-slate-500"].join(" ")}>
                    {f.desc}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional note */}
        <div className="px-6 pb-5">
          <label className="ds-label mb-2">
            Note <span className="text-slate-400 normal-case font-normal tracking-normal">(optional)</span>
          </label>
          <textarea
            className="ds-textarea h-20 resize-none"
            placeholder="Share anything specific — topics you're confused about, areas you need help with..."
            value={note}
            onChange={e => setNote(e.target.value)}
            maxLength={500}
          />
          <p className="text-right text-xs text-slate-400 mt-1">{note.length}/500</p>
        </div>

        {/* Submit */}
        <div className="px-6 pb-6">
          <button
            onClick={handleSubmit}
            disabled={!mood || !courseId || loading}
            className={[
              "w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-sm transition-all",
              mood && courseId && !loading
                ? "bg-primary text-white hover:bg-primary/90 shadow-sm hover:shadow-md"
                : "bg-slate-100 text-slate-400 cursor-not-allowed",
            ].join(" ")}
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
            ) : (
              <>Submit Check-In <ChevronRight size={16} /></>
            )}
          </button>
        </div>
      </motion.div>

      {/* Check-in history */}
      {history.length > 0 && (
        <motion.div variants={item} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100">
            <h2 className="font-serif text-base font-bold text-slate-900">Past Check-Ins</h2>
            <p className="text-xs text-slate-500 mt-0.5">{history.length} submission{history.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y divide-slate-100">
            {history.slice(0, 10).map((h, i) => {
              const mood = MOODS.find(m => m.key === h.mood);
              const course = courses.find(c => String(c.id ?? c.course_id) === String(h.course_id));
              return (
                <div key={i} className="flex items-start gap-4 px-6 py-4">
                  <span className="text-xl mt-0.5 flex-shrink-0">{mood?.emoji || "😐"}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-900">
                        {course?.course_code || `Course ${h.course_id}`}
                      </span>
                      <span className={["text-xs font-medium px-2 py-0.5 rounded-full", mood?.badge || "bg-slate-100 text-slate-600"].join(" ")}>
                        {mood?.label || h.mood}
                      </span>
                      <span className="text-xs text-slate-400">Week {h.week_number}</span>
                    </div>
                    {h.note && (
                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">{h.note}</p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 flex-shrink-0">
                    {h.created_at ? formatDate(h.created_at) : ""}
                  </span>
                </div>
              );
            })}
          </div>
        </motion.div>
      )}
    </div>
  );
}
