import { motion } from "framer-motion";
import Card from "../ui/Card";
import { shapImpact } from "../../utils/helpers";

const LABELS = {
  "Attendance Rate":              "Class Attendance",
  "Quiz Average":                 "Quiz Performance",
  "Assignment Rate":              "Assignment Completion",
  "Late Submission Rate":         "Late Submissions",
  "Login Frequency":              "Platform Engagement",
  "Consecutive Absences":         "Consecutive Absences",
  "Mood Score":                   "Emotional Wellbeing",
  "SGPA":                         "Academic Standing",
  "Chat Message Frequency":       "Chat Activity",
  "Study Invite Participation":   "Study Group Engagement",
  "Help-Seeking Ratio":           "Help-Seeking Activity",
  "Peer Interaction Score":       "Peer Engagement",
  "Attendance Trend":             "Attendance Trend",
  "Quiz Score Trend":             "Quiz Trend",
  "Login Frequency Trend":        "Login Trend",
  "Submission Time Ratio":        "Submission Timing",
  "SGPA Delta":                   "SGPA Change",
  "Attendance x Quiz Combined":   "Attendance x Quiz",
  "SGPA x Absence Risk":          "SGPA x Absences",
  "Submission x Mood Combined":   "Submission x Mood",
  "Material Access Rate":         "Material Access",
  "Risk Velocity":                "Risk Momentum",
  "Weekly Checkin Streak":        "Check-In Streak",
};

const COLOR_RISK    = "#e11d48";
const COLOR_PROTECT = "#10b981";

export default function ShapPanel({ shap, courseCode = "Course" }) {
  if (!shap) return null;

  const entries = Object.entries(shap).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const maxVal  = Math.max(...entries.map(([, v]) => Math.abs(v)));

  return (
    <Card title={`Key Factors — ${courseCode}`} padding="lg">
      <div className="space-y-1">
        {entries.slice(0, 6).map(([feature, value], i) => {
          const pct     = (Math.abs(value) / maxVal) * 100;
          const isRisk  = value > 0;
          const color   = isRisk ? COLOR_RISK : COLOR_PROTECT;

          return (
            <motion.div
              key={feature}
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className="flex items-center gap-4 px-3 py-2.5 rounded-xl hover:bg-slate-50 transition-colors"
            >
              <span className="text-sm font-medium text-primary w-36 flex-shrink-0 truncate">
                {LABELS[feature] || feature}
              </span>

              <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  style={{ backgroundColor: color }}
                  transition={{ delay: i * 0.05 + 0.1, duration: 0.4 }}
                />
              </div>

              <span className="text-sm font-semibold min-w-[48px] text-right tabular-nums"
                    style={{ color }}>
                {isRisk ? "+" : ""}{value.toFixed(2)}
              </span>

              <span className="text-xs text-slate-400 min-w-[56px] text-right">
                {shapImpact(value)}
              </span>
            </motion.div>
          );
        })}
      </div>

      <div className="flex gap-6 pt-5 mt-4 border-t border-slate-100 text-sm">
        <div className="flex items-center gap-2 text-risk-high">
          <div className="w-2.5 h-2.5 rounded-full bg-risk-high" />
          Increasing risk
        </div>
        <div className="flex items-center gap-2 text-risk-low">
          <div className="w-2.5 h-2.5 rounded-full bg-risk-low" />
          Protecting standing
        </div>
      </div>
    </Card>
  );
}
