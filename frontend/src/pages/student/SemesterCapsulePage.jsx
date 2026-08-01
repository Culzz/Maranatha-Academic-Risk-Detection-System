/**
 * SemesterCapsulePage — Visual summary of the student's semester journey.
 * Aggregates risk trajectory, quiz improvement, attendance, check-ins, and mood.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import {
  Trophy, TrendingUp, TrendingDown, BookOpen,
  CheckCircle, Users, Heart, Loader2, Minus,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import { useAuth } from "../../context/AuthContext";
import { studentsApi } from "../../services/api";

const RISK_COLORS = { High: "#ef4444", Medium: "#f59e0b", Low: "#22c55e" };

function StatCard({ icon: Icon, label, value, color = "text-slate-900", sub }) {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm text-center">
      <Icon size={20} className={`mx-auto mb-2 ${color}`} />
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
      {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

export default function SemesterCapsulePage() {
  const { token } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    studentsApi.getSemesterCapsule(token)
      .then(setData)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  if (!data || data.error) {
    return <p className="text-center text-slate-400 py-12">No semester data available yet.</p>;
  }

  const quizImproved = data.quiz_improvement > 0;

  return (
    <motion.div
      className="max-w-3xl mx-auto space-y-6"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 flex items-center justify-center flex-shrink-0">
          <Trophy size={18} className="text-amber-500" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900">Semester Capsule</h1>
          <p className="text-sm text-slate-500">Your journey this semester at a glance</p>
        </div>
      </div>

      {/* Quick stats grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard icon={CheckCircle} label="Classes Attended" value={data.attendance_count} color="text-emerald-500" />
        <StatCard icon={BookOpen} label="Quizzes Taken" value={data.total_quizzes} color="text-blue-500" />
        <StatCard icon={Heart} label="Check-Ins" value={data.total_checkins} color="text-pink-500" />
        <StatCard icon={Users} label="Study Groups" value={data.groups_joined} color="text-indigo-500" />
      </div>

      {/* Quiz improvement */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          {quizImproved ? (
            <TrendingUp size={16} className="text-emerald-500" />
          ) : data.quiz_improvement < 0 ? (
            <TrendingDown size={16} className="text-red-500" />
          ) : (
            <Minus size={16} className="text-slate-400" />
          )}
          <h2 className="text-sm font-bold text-slate-900">Quiz Progress</h2>
        </div>
        <div className="flex items-center gap-6 text-sm">
          <div>
            <p className="text-xs text-slate-500">First 3 avg</p>
            <p className="text-lg font-bold tabular-nums">{data.quiz_early_avg}%</p>
          </div>
          <div className="text-2xl text-slate-300">→</div>
          <div>
            <p className="text-xs text-slate-500">Last 3 avg</p>
            <p className="text-lg font-bold tabular-nums">{data.quiz_recent_avg}%</p>
          </div>
          <div className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold ${
            quizImproved ? "bg-emerald-50 text-emerald-700" : data.quiz_improvement < 0 ? "bg-red-50 text-red-700" : "bg-slate-50 text-slate-500"
          }`}>
            {quizImproved ? "+" : ""}{data.quiz_improvement}%
          </div>
        </div>
      </div>

      {/* Risk journey chart */}
      {data.risk_journey?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Risk Journey</h2>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={data.risk_journey}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: "Week", position: "insideBottom", offset: -3, fontSize: 11 }} />
              <YAxis domain={[0, 1]} tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(v, name) => [v.toFixed(3), "Risk Prob."]}
                labelFormatter={w => `Week ${w}`}
              />
              <Line
                type="monotone"
                dataKey="probability"
                stroke="#6366f1"
                strokeWidth={2}
                dot={({ cx, cy, payload }) => (
                  <circle key={payload.week} cx={cx} cy={cy} r={4} fill={RISK_COLORS[payload.level] || "#6366f1"} />
                )}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Mood trend */}
      {data.mood_trend?.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <h2 className="text-sm font-bold text-slate-900 mb-3">Mood Over Time</h2>
          <ResponsiveContainer width="100%" height={150}>
            <LineChart data={data.mood_trend}>
              <XAxis dataKey="week" tick={{ fontSize: 11 }} label={{ value: "Week", position: "insideBottom", offset: -3, fontSize: 11 }} />
              <YAxis domain={[1, 5]} tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="mood" stroke="#ec4899" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </motion.div>
  );
}
