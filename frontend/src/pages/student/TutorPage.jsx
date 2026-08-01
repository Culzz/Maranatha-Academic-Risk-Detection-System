/**
 * TutorPage — AI course tutor with 5 counsellor modes + chat interface.
 * Modes: tutor, advisor, coach, support, career.
 */
import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Send, BookOpen, Sparkles,
  GraduationCap, Brain, Heart, Briefcase, BookOpenCheck,
} from "lucide-react";
import CustomDropdown from "../../components/ui/CustomDropdown";
import { useAuth } from "../../context/AuthContext";
import { studentsApi } from "../../services/api";
import { getGreeting, firstName } from "../../utils/greetings";

const MODES = [
  { key: "tutor",   label: "Course Tutor",      icon: BookOpenCheck, desc: "Ask questions using your course materials" },
  { key: "advisor", label: "Academic Advisor",   icon: GraduationCap, desc: "Get priority actions based on your risk profile" },
  { key: "coach",   label: "Study Coach",        icon: Brain,         desc: "Study techniques based on your quiz patterns" },
  { key: "support", label: "Support",            icon: Heart,         desc: "Talk through how you're feeling about academics" },
  { key: "career",  label: "Career Guide",       icon: Briefcase,     desc: "Explore career paths in your field" },
];

const MODE_INTROS = {
  tutor:   "I can help you understand course topics, clarify lecture concepts, or solve problems step-by-step. Select your course above and ask away!",
  advisor: "I'm your Academic Advisor. I can see your risk profile across courses and help you prioritise what to focus on this week.",
  coach:   "I'm your Study Coach. Based on your quiz patterns, I'll recommend study techniques that work for your learning style.",
  support: "I'm here to listen. If you're feeling overwhelmed, stressed, or unsure about your academics, let's talk through it together.",
  career:  "I'm your Career Guide. Ask me about career paths, skills to develop, or how your studies connect to real-world opportunities.",
};

const SUGGESTIONS_BY_MODE = {
  tutor:   ["Explain recursion with code", "Binary search tree explained", "Process vs thread differences", "TCP/IP protocol stack"],
  advisor: ["Which courses need urgent attention?", "Create a weekly study plan", "How do I improve my GPA?", "Am I at risk of failing?"],
  coach:   ["How can I stop cramming?", "I keep guessing on quizzes", "Tips for better focus", "How to study effectively"],
  support: ["I feel overwhelmed", "I'm struggling to keep up", "I don't understand the point", "I feel like giving up"],
  career:  ["What jobs fit my degree?", "Skills employers want in Nigeria", "Should I learn extra skills?", "How to build a portfolio"],
};

const MODE_LABELS = {
  tutor: "Academic Tutor",
  advisor: "Academic Advisor",
  coach: "Study Coach",
  support: "Support Companion",
  career: "Career Guide",
};

const PLACEHOLDERS = {
  tutor:   "What concept would you like me to break down?",
  advisor: "Ask me about your academic priorities...",
  coach:   "Tell me about your study challenges...",
  support: "How are you feeling about your academics?",
  career:  "What career path interests you?",
};

export default function TutorPage() {
  const { user, token } = useAuth();
  const [messages,   setMessages]   = useState([]);
  const [input,      setInput]      = useState("");
  const [courseId,   setCourseId]   = useState("");
  const [mode,       setMode]       = useState("tutor");
  const [loading,    setLoading]    = useState(false);
  const [courses, setCourses] = useState([]);
  const [hasSelectedMode, setHasSelectedMode] = useState(false);
  const bottomRef = useRef(null);

  const greeting = getGreeting(firstName(user?.full_name || ""));

  useEffect(() => {
    studentsApi.getMyCourses(token).then(data => {
      const list = Array.isArray(data) ? data : [];
      setCourses(list);
      if (list.length) setCourseId(String(list[0].course_id ?? list[0].id ?? ""));
    }).catch(() => {});
  }, [token]);

  // Reset chat when mode changes
  useEffect(() => {
    setMessages([{ role: "ai", text: MODE_INTROS[mode] }]);
  }, [mode]);

  const COURSES = courses.map(c => ({
    value: String(c.course_id ?? c.id),
    label: `${c.course_code} — ${c.course_title}`,
  }));

  const course = courses.find(c => String(c.course_id ?? c.id) === courseId);
  const suggestions = SUGGESTIONS_BY_MODE[mode] || SUGGESTIONS_BY_MODE.tutor;
  const currentMode = MODES.find(m => m.key === mode) || MODES[0];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const question = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "student", text: question }]);
    setLoading(true);
    try {
      const history = messages
        .filter((_, i) => i > 0)
        .map(msg => ({
          role: msg.role === "student" ? "user" : "assistant",
          content: msg.text,
        }));

      const res = await studentsApi.askTutor(courseId, question, token, history, mode);
      setMessages(m => [...m, { role: "ai", text: res.answer || res.response || String(res) }]);
    } catch {
      setMessages(m => [...m, {
        role: "ai",
        text: "Sorry, I couldn't get an answer right now. Please try again or consult your course materials.",
      }]);
    } finally { setLoading(false); }
  };

  return (
    <motion.div
      className="max-w-4xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
    >
      {/* Header with greeting + course selector */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-xl">
          <h1 className="font-serif text-3xl font-bold text-slate-900 mb-1 leading-tight">
            {greeting}
          </h1>
          <p className="text-base text-slate-600">{currentMode.desc}</p>
        </div>

        <CustomDropdown
          value={courseId}
          onChange={setCourseId}
          options={COURSES}
          placeholder="Select course"
          label="Current Course"
          className="w-80"
        />
      </div>

      {/* Chat box */}
      <motion.div
        initial={{ opacity: 0, scale: 0.99 }}
        animate={{ opacity: 1, scale: 1 }}
        className="bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden flex flex-col"
        style={{ minHeight: 440 }}
      >
        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <AnimatePresence initial={false}>
            {messages.map((msg, i) => (
              <motion.div
                key={`${msg.role}-${i}`}
                initial={{ opacity: 0, y: 10, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className={`flex ${msg.role === "student" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "ai" && (
                  <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center flex-shrink-0 mr-3 mt-1 shadow-md">
                    <currentMode.icon size={16} className="text-accent" />
                  </div>
                )}
                <div className={[
                  "max-w-[78%] px-5 py-4 rounded-2xl shadow-sm",
                  msg.role === "student"
                    ? "bg-primary text-white rounded-br-md"
                    : "bg-slate-50 border border-slate-200 text-slate-800 rounded-bl-md",
                ].join(" ")}>
                  {msg.role === "ai" && (
                    <div className="flex items-center gap-2 mb-2.5 pb-2 border-b border-slate-200/60">
                      <BookOpen size={13} className="text-accent" />
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        {MODE_LABELS[mode]}
                      </span>
                    </div>
                  )}
                  <p className="text-sm leading-relaxed whitespace-pre-line">{msg.text}</p>
                </div>
              </motion.div>
            ))}

            {loading && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex justify-start"
              >
                <div className="w-10 h-10 bg-primary rounded-2xl flex items-center justify-center flex-shrink-0 mr-3 mt-1 shadow-md">
                  <Sparkles size={16} className="text-accent" />
                </div>
                <div className="bg-slate-50 border border-slate-200 px-5 py-4 rounded-2xl rounded-bl-md flex items-center gap-3">
                  <div className="flex gap-1">
                    {[0, 1, 2].map(i => (
                      <motion.div
                        key={i}
                        className="w-2 h-2 bg-slate-400 rounded-full"
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity, delay: i * 0.15 }}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-slate-500 font-medium">Thinking...</span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Input bar with creative placeholder */}
        <div className="p-5 border-t border-slate-200 bg-slate-50/50">
          <div className="bg-white border border-slate-200 rounded-2xl px-4 py-3 shadow-sm focus-within:ring-2 focus-within:ring-accent/20 focus-within:border-accent/40 transition-all flex items-center gap-3">
            <MessageSquare size={16} className="text-slate-400 flex-shrink-0" />
            <input
              name="tutor-message"
              aria-label="Ask a question"
              className="flex-1 bg-transparent outline-none text-sm placeholder-slate-400 text-slate-800"
              placeholder={PLACEHOLDERS[mode] || "Type your message..."}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !e.shiftKey && send()}
              disabled={loading}
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={send}
              disabled={loading || !input.trim()}
              className={[
                "w-10 h-10 rounded-xl flex items-center justify-center shadow-sm transition-all flex-shrink-0",
                input.trim() && !loading
                  ? "bg-primary text-white hover:shadow-md"
                  : "bg-slate-200 text-slate-400 cursor-not-allowed",
              ].join(" ")}
            >
              <Send size={15} />
            </motion.button>
          </div>
          <p className="text-xs text-slate-400 text-center mt-3">
            {mode === "tutor"
              ? "Answers use your lecturer's uploaded materials and course content"
              : `${currentMode.label} — powered by AI with your academic data`}
          </p>
        </div>
      </motion.div>

      {/* Mode tabs — BELOW chat */}
      <div className="flex flex-wrap gap-2">
        {MODES.map(m => {
          const Icon = m.icon;
          const active = m.key === mode;
          return (
            <motion.button
              key={m.key}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { setMode(m.key); setHasSelectedMode(true); }}
              className={[
                "flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all border",
                active
                  ? "bg-primary text-white border-primary shadow-md"
                  : "bg-white text-slate-600 border-slate-200 hover:border-accent/30 hover:shadow-sm",
              ].join(" ")}
            >
              <Icon size={15} />
              {m.label}
            </motion.button>
          );
        })}
      </div>

      {/* Quick suggestions — only after mode selection */}
      {hasSelectedMode && (
        <div className="flex flex-wrap gap-3">
          {suggestions.map(suggestion => (
            <motion.button
              key={suggestion}
              whileHover={{ scale: 1.02, y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setInput(suggestion)}
              className="px-4 py-2.5 bg-white border border-slate-200 text-sm font-medium text-slate-700 rounded-xl hover:shadow-sm hover:border-accent/30 transition-all"
            >
              {suggestion}
            </motion.button>
          ))}
        </div>
      )}
    </motion.div>
  );
}
