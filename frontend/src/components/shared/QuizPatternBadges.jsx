import { useState, useEffect } from "react";
import { AlertTriangle, TrendingUp, TrendingDown, Clock, Brain, MinusCircle, SkipForward, Zap } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { quizPatternsApi } from "../../services/api";

const SEVERITY_STYLES = {
  high:     "bg-red-50    border-red-200    text-red-700",
  medium:   "bg-amber-50  border-amber-200  text-amber-700",
  positive: "bg-emerald-50 border-emerald-200 text-emerald-700",
};

const PATTERN_ICONS = {
  rapid_decline:       TrendingDown,
  random_guessing:     Zap,
  last_minute:         Clock,
  improvement:         TrendingUp,
  struggling:          Brain,
  plateau:             MinusCircle,
  selective_avoidance: SkipForward,
};

export default function QuizPatternBadges({ studentId }) {
  const { token } = useAuth();
  const [patterns, setPatterns] = useState([]);

  useEffect(() => {
    if (!studentId || !token) return;
    quizPatternsApi.getPatterns(studentId, token)
      .then(data => setPatterns(data?.patterns || []))
      .catch(() => setPatterns([]));
  }, [studentId, token]);

  if (patterns.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {patterns.map((p, i) => {
        const Icon = PATTERN_ICONS[p.type] || AlertTriangle;
        return (
          <div
            key={i}
            title={p.description}
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-semibold ${SEVERITY_STYLES[p.severity] || SEVERITY_STYLES.medium}`}
          >
            <Icon size={11} className="flex-shrink-0" />
            {p.label}
          </div>
        );
      })}
    </div>
  );
}
