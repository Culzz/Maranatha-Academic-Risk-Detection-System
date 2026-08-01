/**
 * LecturerOverview — Dashboard landing. Real API data.
 */
import { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  BookOpen, Users, AlertTriangle, AlertCircle,
  ArrowRight, CalendarCheck, ClipboardList, Clock, LifeBuoy, ShieldCheck,
} from "lucide-react";
import Badge from "../../components/ui/Badge";
import SemesterWeekTracker from "../../components/shared/SemesterWeekTracker";
import { useAuth } from "../../context/AuthContext";
import { useLayout } from "../../context/LayoutContext";
import { lecturersApi, officeHoursApi, sosApi } from "../../services/api";
import { riskColors, initials, formatCourseCode } from "../../utils/helpers";
import { getGreeting, firstName, getHolidayGreeting } from "../../utils/greetings";
import useRealTimeClock from "../../hooks/useRealTimeClock";
import useWeekInfo from "../../hooks/useWeekInfo";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: "easeOut" } } };

function scheduleNonCritical(work, delay = 180) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(work, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const timeoutId = window.setTimeout(work, delay);
  return () => window.clearTimeout(timeoutId);
}

function StatCard({ label, value, sub, icon: Icon, valueColor, layout = "default" }) {
  if (layout === "compact") {
    return (
      <motion.div variants={item} whileHover={{ y: -1 }}
        className="border border-slate-100 rounded-2xl bg-white shadow-sm hover:shadow-premium-sm transition-all duration-200 p-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
            <Icon size={14} className="text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-slate-500">{label}</p>
            <p className="font-serif text-xl font-bold leading-none" style={{ color: valueColor || undefined }}>{value}</p>
          </div>
        </div>
      </motion.div>
    );
  }
  return (
    <motion.div
      variants={item}
      whileHover={{ y: -2 }}
      className="border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 p-6"
    >
      <div className="flex items-center justify-between mb-4">
        <span className="text-xs font-semibold uppercase text-slate-500 tracking-wide">{label}</span>
        <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-slate-400" />
        </div>
      </div>
      <p className="font-serif text-4xl font-bold leading-none mb-2" style={{ color: valueColor || undefined }}>
        {value}
      </p>
      {sub && <p className="text-sm text-slate-500">{sub}</p>}
    </motion.div>
  );
}

export default function LecturerOverview() {
  const { user, token } = useAuth();
  const { layout } = useLayout();
  const navigate = useNavigate();
  const { dateStr, timeStr } = useRealTimeClock();
  const { weekInfo, weekInfoLoading } = useWeekInfo();
  const greeting = useMemo(() => getHolidayGreeting(firstName(user?.full_name || "Lecturer"), weekInfo?.current_holiday), [user?.full_name, weekInfo?.current_holiday]);
  const [courses,  setCourses]  = useState([]);
  const [studentTotal, setStudentTotal] = useState(0);
  const [highRiskTotal, setHighRiskTotal] = useState(0);
  const [mediumRiskTotal, setMediumRiskTotal] = useState(0);
  const [atRiskStudents, setAtRiskStudents] = useState([]);
  const [slots,    setSlots]    = useState([]);
  const [incoming, setIncoming] = useState([]);
  const [sosReqs,  setSosReqs]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [ackingId, setAckingId] = useState(null);
  const [briefCourseId, setBriefCourseId] = useState("");
  const [brief, setBrief] = useState(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [pendingInterventions, setPendingInterventions] = useState([]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    let cleanupNonCritical = () => {};

    async function loadLegacyOverview() {
      try {
        const cs = await lecturersApi.getCourses(token);
        if (cancelled) return;
        const arr = Array.isArray(cs) ? cs : [];
        setCourses(arr);
        if (!arr.length) {
          setStudentTotal(0);
          setHighRiskTotal(0);
          setMediumRiskTotal(0);
          setAtRiskStudents([]);
          setPendingInterventions([]);
          return;
        }

        const results = await Promise.allSettled(
          arr.map(c => lecturersApi.getCourseStudents(c.id ?? c.course_id, token))
        );
        if (cancelled) return;
        const all = results
          .filter(r => r.status === "fulfilled")
          .flatMap(r => Array.isArray(r.value) ? r.value : []);
        const bestByStudent = new Map();
        all.forEach((student) => {
          const key = student.student_id ?? student.id;
          const current = bestByStudent.get(key);
          if (!current || (student.risk_probability ?? 0) > (current.risk_probability ?? 0)) {
            bestByStudent.set(key, student);
          }
        });
        const uniqueStudents = Array.from(bestByStudent.values());
        setStudentTotal(uniqueStudents.length);
        setHighRiskTotal(uniqueStudents.filter(s => s.risk_level === "High").length);
        setMediumRiskTotal(uniqueStudents.filter(s => s.risk_level === "Medium").length);
        setAtRiskStudents(
          uniqueStudents
            .filter(s => s.risk_level !== "Low")
            .sort((a, b) => (b.risk_probability ?? 0) - (a.risk_probability ?? 0))
        );
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    lecturersApi.getOverview(token)
      .then((data) => {
        if (cancelled) return;
        setCourses(Array.isArray(data?.courses) ? data.courses : []);
        setStudentTotal(Number(data?.student_total) || 0);
        setHighRiskTotal(Number(data?.high_risk_total) || 0);
        setMediumRiskTotal(Number(data?.medium_risk_total) || 0);
        setAtRiskStudents(Array.isArray(data?.at_risk_students) ? data.at_risk_students : []);
        setPendingInterventions(Array.isArray(data?.pending_interventions) ? data.pending_interventions : []);
        setLoading(false);

        cleanupNonCritical = scheduleNonCritical(() => {
          officeHoursApi.getMySlots(token).then(d => { if (!cancelled) setSlots(Array.isArray(d) ? d : []); }).catch(() => {});
          officeHoursApi.getIncomingBookings(token).then(d => { if (!cancelled) setIncoming(Array.isArray(d) ? d : []); }).catch(() => {});
          sosApi.getOpenRequests(token).then(d => { if (!cancelled) setSosReqs(Array.isArray(d) ? d : []); }).catch(() => {});
        });
      })
      .catch(() => {
        loadLegacyOverview().catch(() => {
          if (!cancelled) setLoading(false);
        });
        cleanupNonCritical = scheduleNonCritical(() => {
          officeHoursApi.getMySlots(token).then(d => { if (!cancelled) setSlots(Array.isArray(d) ? d : []); }).catch(() => {});
          officeHoursApi.getIncomingBookings(token).then(d => { if (!cancelled) setIncoming(Array.isArray(d) ? d : []); }).catch(() => {});
          sosApi.getOpenRequests(token).then(d => { if (!cancelled) setSosReqs(Array.isArray(d) ? d : []); }).catch(() => {});
          lecturersApi.getLecturerPendingInterventions(token).then(d => { if (!cancelled) setPendingInterventions(Array.isArray(d) ? d : []); }).catch(() => {});
        });
      });

    return () => {
      cancelled = true;
      cleanupNonCritical();
    };
  }, [token]);

  const refreshSos = () => {
    sosApi.getOpenRequests(token).then(d => setSosReqs(Array.isArray(d) ? d : [])).catch(() => {});
  };

  const loadBrief = async () => {
    if (!briefCourseId) return;
    setBriefLoading(true);
    setBrief(null);
    try {
      const data = await lecturersApi.getPreLectureBrief(briefCourseId, token);
      setBrief(data);
    } catch {
      setBrief({ error: "Failed to load brief. Please try again." });
    } finally {
      setBriefLoading(false);
    }
  };

  const handleAcknowledge = async (sosId) => {
    setAckingId(sosId);
    try {
      await sosApi.respond(sosId, { response_note: "Acknowledged by lecturer", status: "acknowledged" }, token);
      refreshSos();
    } catch {
      // silently ignore
    } finally {
      setAckingId(null);
    }
  };

  const highRisk = highRiskTotal;
  const medRisk  = mediumRiskTotal;
  const atRisk   = atRiskStudents;

  return (
    <div className={`relative ${layout === "compact" ? "space-y-4" : "space-y-8"}`}>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-6">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900">
            {greeting}
          </h1>
          <p className="text-sm text-slate-500 mt-1">{dateStr} &middot; {timeStr}</p>
        </div>
      </div>

      {/* Semester week tracker */}
      <SemesterWeekTracker weekInfo={weekInfo} loading={weekInfoLoading} />

      {/* Stats */}
      <motion.div
        variants={container} initial="hidden" animate="show"
        className={`grid ${layout === "compact" ? "grid-cols-2 lg:grid-cols-4 gap-3" : "grid-cols-2 lg:grid-cols-4 gap-5"}`}
      >
        <StatCard label="My Courses"      value={loading ? "—" : courses.length}  sub="This semester"        icon={BookOpen}      layout={layout} />
        <StatCard label="Students"        value={loading ? "—" : studentTotal}   sub="Across all courses"   icon={Users}         layout={layout} />
        <StatCard label="Needs Attention" value={loading ? "—" : highRisk}        sub="Act before next week" icon={AlertTriangle} valueColor="#dc2626" layout={layout} />
        <StatCard label="Monitor Closely" value={loading ? "—" : medRisk}         sub="Showing some decline" icon={AlertCircle}   valueColor="#d97706" layout={layout} />
      </motion.div>

      {/* Awaiting Response — pending interventions > 3 days */}
      {pendingInterventions.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <h3 className="text-sm font-bold text-amber-800 mb-3 flex items-center gap-2">
            <Clock size={14} /> Students Awaiting Response
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {pendingInterventions.map(iv => (
              <div
                key={iv.id}
                onClick={() => navigate("/lecturer/interventions")}
                className="bg-white border border-amber-100 rounded-lg p-3 cursor-pointer hover:border-amber-300 transition-colors"
              >
                <p className="text-sm font-semibold text-slate-900">{iv.student_name}</p>
                <p className="text-xs text-slate-500">{formatCourseCode(iv.course_code)} — {iv.intervention_type}</p>
                <p className="text-[10px] text-amber-600 font-semibold mt-1">{iv.days_pending} days pending</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My Courses */}
      <div>
        <h2 className={`font-serif text-2xl font-bold text-slate-900 ${layout === "compact" ? "mb-3" : "mb-6"}`}>My Courses</h2>
        {courses.length === 0 && !loading && (
          <p className="text-slate-400 text-sm py-4">No courses assigned to you this semester.</p>
        )}
        <div className={`grid ${layout === "compact" ? "grid-cols-1 sm:grid-cols-2 gap-3" : "grid-cols-1 sm:grid-cols-2 gap-5"}`}>
          {courses.map((c, i) => (
            <motion.div
              key={c.id ?? c.course_id ?? i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.07, duration: 0.28 }}
              whileHover={{ y: -2 }}
              className={`border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 ${layout === "compact" ? "p-4" : "p-6"}`}
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{formatCourseCode(c.course_code)}</p>
                  <h3 className="font-serif text-lg font-bold text-slate-900 leading-snug">{c.course_title}</h3>
                </div>
                {c.credit_units != null && (
                  <span className="text-xs font-semibold text-slate-500 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-full flex-shrink-0">
                    {c.credit_units} CU
                  </span>
                )}
              </div>
              <div className="space-y-1.5 mb-5">
                {c.schedule?.day && (
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <CalendarCheck size={13} className="text-slate-400 flex-shrink-0" />
                    {c.schedule.day} · {c.schedule.time}
                  </p>
                )}
                {(c.schedule?.venue || c.schedule?.hall) && (
                  <p className="text-sm text-slate-500 flex items-center gap-2">
                    <ClipboardList size={13} className="text-slate-400 flex-shrink-0" />
                    {c.schedule.venue || c.schedule.hall}
                  </p>
                )}
              </div>
              <button
                onClick={() => navigate("/lecturer/students")}
                className="flex items-center gap-1.5 text-sm font-semibold text-slate-900 hover:text-slate-600 transition-colors group"
              >
                View Students
                <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
              </button>
            </motion.div>
          ))}
        </div>
      </div>

      {/* Students Requiring Attention */}
      <div>
        <div className={`flex items-center justify-between ${layout === "compact" ? "mb-3" : "mb-6"}`}>
          <h2 className="font-serif text-2xl font-bold text-slate-900">Students Requiring Attention</h2>
          <button
            onClick={() => navigate("/lecturer/students")}
            className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors group"
          >
            View All <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
          </button>
        </div>

        {atRisk.length === 0 && !loading && (
          <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-xl">
            <Users size={28} className="mx-auto mb-3 opacity-30" />
            <p className="text-sm">No at-risk students at this time.</p>
          </div>
        )}

        <div className="space-y-3">
          {atRisk.slice(0, 8).map((s, i) => {
            const c = riskColors(s.risk_level);
            return (
              <motion.div
                key={s.student_id ?? s.id ?? i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.06, duration: 0.25 }}
                whileHover={{ y: -1 }}
                className={`border border-slate-200 rounded-xl bg-white shadow-sm hover:shadow-md transition-all duration-200 ${layout === "compact" ? "p-3" : "p-5"}`}
              >
                <div className="flex items-center gap-4 flex-wrap">
                  <div
                    className="w-10 h-10 rounded-full bg-primary flex items-center justify-center text-accent font-bold flex-shrink-0"
                    style={{ fontSize: 11 }}
                  >
                    {initials(s.full_name || s.name || "?")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 leading-tight">{s.full_name || s.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{s.matric_number}</p>
                  </div>
                  <Badge variant="risk" level={s.risk_level} />
                  <div className="hidden sm:flex items-center gap-5 text-xs text-slate-500">
                    {s.attendance_rate != null && <span>Attendance: <strong className="text-slate-700">{s.attendance_rate}%</strong></span>}
                    {s.quiz_average    != null && <span>Quiz Avg: <strong className="text-slate-700">{s.quiz_average}%</strong></span>}
                  </div>
                  <span className={`text-sm font-bold ${c.text} flex-shrink-0`}>
                    {Math.round((s.risk_probability ?? 0) * 100)}%
                  </span>
                </div>
                {layout !== "compact" && (
                  <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${(s.risk_probability ?? 0) * 100}%` }}
                      transition={{ duration: 0.7, delay: i * 0.06 + 0.15, ease: "easeOut" }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: c.bar }}
                    />
                  </div>
                )}
                {layout === "detailed" && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs text-slate-500">
                    {s.assignment_completion_rate != null && <span>Assignments: <strong className="text-slate-700">{s.assignment_completion_rate}%</strong></span>}
                    {s.consecutive_absences != null && <span>Consec. Absences: <strong className="text-slate-700">{s.consecutive_absences}</strong></span>}
                    {s.course_code && <span>Course: <strong className="text-slate-700">{formatCourseCode(s.course_code)}</strong></span>}
                    {s.engagement_score != null && <span>Engagement: <strong className="text-slate-700">{s.engagement_score}</strong></span>}
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Office Hours & SOS — Two columns */}
      <div className={`grid grid-cols-1 lg:grid-cols-2 ${layout === "compact" ? "gap-3" : "gap-6"}`}>
        {/* Office Hours */}
        <div className={`border border-slate-200 rounded-xl bg-white shadow-sm ${layout === "compact" ? "p-4" : "p-6"}`}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-serif text-xl font-bold text-slate-900">Office Hours</h2>
            <span className="text-xs font-semibold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
              {slots.length} slot{slots.length !== 1 ? "s" : ""}
            </span>
          </div>
          {slots.length === 0 ? (
            <p className="text-sm text-slate-400 py-4">No office hour slots created yet.</p>
          ) : (
            <div className="space-y-3">
              {slots.map(s => (
                <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl">
                  <div>
                    <p className="text-sm font-medium text-slate-900">{s.day_of_week}</p>
                    <p className="text-xs text-slate-500">{s.start_time}–{s.end_time} · {s.venue || "TBD"}</p>
                  </div>
                  <span className="text-xs font-semibold text-accent">{s.booking_count || 0} bookings</span>
                </div>
              ))}
            </div>
          )}
          {incoming.length > 0 && (
            <div className="mt-5 pt-5 border-t border-slate-200">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Pending Bookings</h3>
              <div className="space-y-2">
                {incoming.filter(b => b.status === "pending").slice(0, 5).map(b => (
                  <div key={b.id} className="flex items-center justify-between p-3 bg-amber-50 rounded-xl">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{b.student_name}</p>
                      <p className="text-xs text-slate-500">{b.book_date} · {b.day_of_week}</p>
                    </div>
                    <span className="text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-lg">{b.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* SOS Requests */}
        <div className={`border border-slate-200 rounded-xl bg-white shadow-sm ${layout === "compact" ? "p-4" : "p-6"}`}>
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-serif text-xl font-bold text-slate-900 flex items-center gap-2">
              <LifeBuoy size={18} className="text-red-500" /> SOS Requests
            </h2>
            {sosReqs.length > 0 && (
              <span className="text-xs font-bold text-white bg-red-500 px-2.5 py-1 rounded-lg">{sosReqs.length} open</span>
            )}
          </div>
          {sosReqs.length === 0 ? (
            <div className="text-center py-8 text-slate-400">
              <LifeBuoy size={28} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">No open SOS requests</p>
            </div>
          ) : (
            <div className="space-y-3">
              {sosReqs.slice(0, 6).map(s => (
                <motion.div key={s.id} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }}
                  className="p-4 border border-red-100 bg-red-50/50 rounded-xl">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{s.student_name}</p>
                      <p className="text-xs text-slate-500">{formatCourseCode(s.course_code)}{s.course_title ? ` · ${s.course_title}` : ""}</p>
                    </div>
                    <span className="text-xs text-red-700 font-semibold bg-red-100 px-2 py-0.5 rounded-lg flex items-center gap-1">
                      <Clock size={10} /> {s.status}
                    </span>
                  </div>
                  {s.message && <p className="text-xs text-slate-600 mt-2">{s.message}</p>}
                  {s.status === "open" && (
                    <button
                      onClick={() => handleAcknowledge(s.id)}
                      disabled={ackingId === s.id}
                      className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
                    >
                      <ShieldCheck size={12} /> {ackingId === s.id ? "Acknowledging..." : "Acknowledge"}
                    </button>
                  )}
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Pre-Lecture Brief */}
      {courses.length > 0 && (
        <div className={`border border-slate-200 rounded-xl bg-white shadow-sm ${layout === "compact" ? "p-4" : "p-6"}`}>
          <h2 className="font-serif text-xl font-bold text-slate-900 mb-4">Pre-Lecture Brief</h2>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <select
              value={briefCourseId}
              onChange={e => setBriefCourseId(e.target.value)}
              className="flex-1 text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-200"
            >
              <option value="">Select a course</option>
              {courses.map(c => (
                <option key={c.id ?? c.course_id} value={c.id ?? c.course_id}>
                  {formatCourseCode(c.course_code)} — {c.course_title}
                </option>
              ))}
            </select>
            <button
              onClick={loadBrief}
              disabled={!briefCourseId || briefLoading}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 transition-colors"
            >
              {briefLoading ? "Loading..." : "Load Brief"}
            </button>
          </div>
          {brief && !brief.error && (
            <div className="bg-slate-50 rounded-xl p-4 space-y-4 text-sm">
              {brief.course_code && (
                <p className="font-semibold text-slate-900">{formatCourseCode(brief.course_code)} — {brief.course_title}</p>
              )}
              {/* Stats grid — gated on enrolled_students (the correct key) */}
              {brief.enrolled_students != null && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div><p className="text-xs text-slate-500">Enrolled</p><p className="font-bold text-slate-900">{brief.enrolled_students}</p></div>
                  <div><p className="text-xs text-slate-500">High Risk</p><p className="font-bold text-red-600">{brief.at_risk_students?.filter(s => s.risk_level === "High").length ?? 0}</p></div>
                  <div><p className="text-xs text-slate-500">Predicted Attendance</p><p className="font-bold text-slate-900">{brief.predicted_attendance_pct != null ? `${Math.round(brief.predicted_attendance_pct)}%` : "N/A"}</p></div>
                  <div><p className="text-xs text-slate-500">At-Risk Students</p><p className="font-bold text-amber-600">{brief.at_risk_students?.length ?? 0}</p></div>
                </div>
              )}
              {/* Weakest topic */}
              {brief.weakest_topic?.topic && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <p className="text-xs font-semibold text-amber-700 mb-0.5">Weakest Quiz Topic</p>
                  <p className="text-slate-800 font-medium">{brief.weakest_topic.topic}</p>
                  {brief.weakest_topic.accuracy != null && (
                    <p className="text-xs text-amber-600">Class accuracy: {Math.round(brief.weakest_topic.accuracy)}%</p>
                  )}
                </div>
              )}
              {/* Top at-risk students */}
              {brief.at_risk_students?.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">Top at-risk students:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {brief.at_risk_students.slice(0, 3).map((s, i) => (
                      <span key={i} className={`text-xs px-2 py-0.5 rounded-lg border font-medium ${s.risk_level === "High" ? "bg-red-50 text-red-700 border-red-200" : "bg-amber-50 text-amber-700 border-amber-200"}`}>
                        {s.full_name || s.matric_number} · {s.risk_level}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {/* Mood distribution */}
              {brief.mood_distribution && Object.keys(brief.mood_distribution).length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-slate-500 mb-1.5">Class mood (recent check-ins):</p>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(brief.mood_distribution).map(([mood, count]) => count > 0 && (
                      <span key={mood} className="text-xs bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-lg capitalize">
                        {mood}: {count}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {brief?.error && (
            <p className="text-sm text-red-600 mt-2">{brief.error}</p>
          )}
        </div>
      )}
    </div>
  );
}
