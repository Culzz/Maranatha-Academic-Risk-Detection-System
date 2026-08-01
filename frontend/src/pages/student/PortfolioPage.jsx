/**
 * PortfolioPage — Personal Academic Portfolio showing growth over the semester.
 * Includes Milestone Moments and PDF export (Idea 5 completion).
 */
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Award, TrendingUp, BookOpen, Users, CheckCircle, Loader2, Download, Star, Sparkles } from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { studentsApi } from "../../services/api";

const c = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const it = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

function buildMilestones(data) {
  const milestones = [];
  const habits = data.study_habits || {};
  const journey = data.risk_journey || {};
  const growth = data.knowledge_growth || [];

  // Risk improvement milestone
  if (journey.initial && journey.current) {
    const riskMap = { High: 3, Medium: 2, Low: 1 };
    if ((riskMap[journey.current.level] || 2) < (riskMap[journey.initial.level] || 2)) {
      milestones.push({
        icon: "📈",
        title: `Risk improved: ${journey.initial.level} → ${journey.current.level}`,
        message: "Your consistent effort is paying off. Keep going.",
        color: "emerald",
      });
    }
  }

  // Big quiz comeback
  const highGrowth = growth.filter(k => k.mastery_pct >= 70);
  if (highGrowth.length > 0) {
    milestones.push({
      icon: "🎯",
      title: `Mastered ${highGrowth.length} topic${highGrowth.length > 1 ? "s" : ""}`,
      message: `You've reached 70%+ mastery in: ${highGrowth.map(k => k.topic).join(", ")}`,
      color: "blue",
    });
  }

  // Attendance streak
  if (habits.longest_streak >= 5) {
    milestones.push({
      icon: "🔥",
      title: `${habits.longest_streak}-day attendance streak`,
      message: "Showing up is harder than it looks. You did it.",
      color: "amber",
    });
  }

  // Quiz engagement
  if (habits.total_quizzes >= 10) {
    milestones.push({
      icon: "📝",
      title: `${habits.total_quizzes} quizzes completed`,
      message: "Active engagement with assessments builds lasting understanding.",
      color: "purple",
    });
  }

  // Assignment consistency
  if (habits.assignment_rate >= 80) {
    milestones.push({
      icon: "✅",
      title: `${habits.assignment_rate}% assignment submission rate`,
      message: "Consistent submission shows discipline. That's a skill.",
      color: "emerald",
    });
  }

  // Peer study
  if (habits.peer_sessions >= 2) {
    milestones.push({
      icon: "👥",
      title: `${habits.peer_sessions} peer study sessions`,
      message: "Learning together builds understanding that sticks.",
      color: "blue",
    });
  }

  // Self-study
  if (habits.self_study_sessions >= 3) {
    milestones.push({
      icon: "📖",
      title: `${habits.self_study_sessions} self-study sessions`,
      message: "Self-directed learning is the strongest predictor of long-term success.",
      color: "slate",
    });
  }

  // Material access (v4)
  if (habits.material_access_rate != null && habits.material_access_rate >= 0.7) {
    milestones.push({
      icon: "📚",
      title: "Opened 70%+ of course materials",
      message: "Engaging with materials shows initiative beyond just attending class.",
      color: "blue",
    });
  }

  // Check-in streak (v4)
  if (habits.checkin_streak >= 8) {
    milestones.push({
      icon: "💚",
      title: `${habits.checkin_streak}-week check-in streak`,
      message: "Regularly sharing how you feel helps your lecturers support you better.",
      color: "emerald",
    });
  } else if (habits.checkin_streak >= 5) {
    milestones.push({
      icon: "💬",
      title: `${habits.checkin_streak}-week check-in streak`,
      message: "Consistent weekly check-ins show self-awareness.",
      color: "emerald",
    });
  }

  // Late submission improvement (v4)
  if (habits.late_rate_improved) {
    milestones.push({
      icon: "⏰",
      title: "Reduced late submissions",
      message: "Improving your submission timing is a real sign of growing discipline.",
      color: "amber",
    });
  }

  return milestones;
}

export default function PortfolioPage() {
  const { token, user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef(null);

  useEffect(() => {
    studentsApi.getAcademicPortfolio(token)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [token]);

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64"><Loader2 className="animate-spin text-slate-400" size={28} /></div>;
  }
  if (!data) {
    return <p className="text-slate-500 text-center py-12">Unable to load portfolio.</p>;
  }

  const milestones = buildMilestones(data);
  const colorMap = {
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-800",
    blue: "bg-blue-50 border-blue-200 text-blue-800",
    amber: "bg-amber-50 border-amber-200 text-amber-800",
    purple: "bg-purple-50 border-purple-200 text-purple-800",
    slate: "bg-slate-50 border-slate-200 text-slate-700",
  };

  return (
    <motion.div
      ref={printRef}
      variants={c}
      initial="hidden"
      animate="show"
      className="max-w-3xl mx-auto space-y-6"
    >
      {/* Header */}
      <motion.div variants={it} className="text-center">
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-1">{data.student_name}</h1>
        <p className="text-sm text-slate-500">{data.matric_number}</p>

        {/* Export button */}
        <button
          onClick={handlePrint}
          className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-xl text-sm font-semibold hover:bg-primary/90 transition-all shadow-sm print:hidden"
        >
          <Download size={14} /> Export Portfolio
        </button>
      </motion.div>

      {/* Risk Journey */}
      {data.risk_journey.initial && data.risk_journey.current && (
        <motion.div variants={it} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-center">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Your Risk Journey</h3>
          <div className="flex items-center justify-center gap-8">
            <div>
              <p className="text-xs text-slate-500">Week {data.risk_journey.initial.week}</p>
              <p className={`text-xl font-bold ${data.risk_journey.initial.level === "High" ? "text-red-600" : data.risk_journey.initial.level === "Medium" ? "text-amber-600" : "text-emerald-600"}`}>
                {data.risk_journey.initial.level}
              </p>
            </div>
            <TrendingUp size={24} className="text-accent" />
            <div>
              <p className="text-xs text-slate-500">Week {data.risk_journey.current.week}</p>
              <p className={`text-xl font-bold ${data.risk_journey.current.level === "High" ? "text-red-600" : data.risk_journey.current.level === "Medium" ? "text-amber-600" : "text-emerald-600"}`}>
                {data.risk_journey.current.level}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Milestone Moments */}
      {milestones.length > 0 && (
        <motion.div variants={it} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Star size={16} className="text-accent" />
            <h3 className="text-sm font-semibold text-slate-700">Moments That Mattered</h3>
          </div>
          <div className="space-y-3">
            {milestones.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.08 }}
                className={`flex items-start gap-3 px-4 py-3 rounded-xl border ${colorMap[m.color] || colorMap.slate}`}
              >
                <span className="text-xl flex-shrink-0 mt-0.5">{m.icon}</span>
                <div>
                  <p className="text-sm font-semibold">{m.title}</p>
                  <p className="text-xs mt-0.5 opacity-80">{m.message}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Study Habits */}
      <motion.div variants={it} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
        <h3 className="text-sm font-semibold text-slate-700 mb-4">Study Habits Built</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          {[
            { icon: CheckCircle, label: "Attendance streak", value: `${data.study_habits.longest_streak} days` },
            { icon: BookOpen, label: "Quizzes completed", value: data.study_habits.total_quizzes },
            { icon: Award, label: "Self-study sessions", value: data.study_habits.self_study_sessions },
            { icon: TrendingUp, label: "Assignment rate", value: `${data.study_habits.assignment_rate}%` },
            { icon: Users, label: "Peer study sessions", value: data.study_habits.peer_sessions },
          ].map(s => {
            const Icon = s.icon;
            return (
              <div key={s.label} className="text-center p-3 rounded-xl bg-slate-50">
                <Icon size={20} className="mx-auto text-accent mb-2" />
                <p className="text-lg font-bold text-slate-900">{s.value}</p>
                <p className="text-xs text-slate-500">{s.label}</p>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Knowledge Growth */}
      {data.knowledge_growth.length > 0 && (
        <motion.div variants={it} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Knowledge Growth</h3>
          <div className="space-y-3">
            {data.knowledge_growth.map((k, i) => (
              <div key={i}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-slate-600">{k.topic}{k.sub_topic ? ` — ${k.sub_topic}` : ""}</span>
                  <span className="font-medium text-slate-800">{k.mastery_pct}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${k.mastery_pct}%` }}
                    transition={{ duration: 0.6, delay: i * 0.1 }}
                    className={`h-full rounded-full ${k.mastery_pct >= 70 ? "bg-emerald-500" : k.mastery_pct >= 40 ? "bg-amber-500" : "bg-red-500"}`}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Skills */}
      {data.skills.length > 0 && (
        <motion.div variants={it} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-sm font-semibold text-slate-700 mb-4">Skills Demonstrated</h3>
          <div className="flex flex-wrap gap-2">
            {data.skills.map(s => (
              <span key={s} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-50 text-emerald-700 text-sm rounded-xl">
                <CheckCircle size={14} /> {s}
              </span>
            ))}
          </div>
        </motion.div>
      )}

      {/* Print footer */}
      <div className="hidden print:block text-center text-xs text-slate-400 pt-4 border-t border-slate-200">
        Maranatha University Academic Risk Detection System — Portfolio generated {new Date().toLocaleDateString()}
      </div>
    </motion.div>
  );
}
