/**
 * AttendanceMgmtPage — Generate codes, HMAC-signed rotating QR display + session stats.
 * Real data: lecturersApi.getCourses, startAttendanceSession, getAttendanceSessions, getQrToken
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, Clock, Users, CheckCircle, XCircle, TrendingUp, QrCode, Shield, BarChart2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import Button from "../../components/ui/Button";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { lecturersApi } from "../../services/api";
import { initials, formatCourseCode } from "../../utils/helpers";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.26 } } };

export default function AttendanceMgmtPage() {
  const { token } = useAuth();
  const [courses,        setCourses]        = useState([]);
  const [courseId,       setCourseId]       = useState("");
  const [levelFilter,   setLevelFilter]    = useState("");
  const [activeSession,  setActiveSession]  = useState(null);
  const [sessions,       setSessions]       = useState([]);
  const [showAllSessions, setShowAllSessions] = useState(false);
  const [generating,     setGenerating]     = useState(false);
  const [showQr,         setShowQr]         = useState(true);
  const [error,          setError]          = useState("");

  // HMAC QR token state
  const [qrToken,        setQrToken]        = useState("");
  const [countdown,      setCountdown]       = useState(0);
  const pollRef = useRef(null);
  const countdownRef = useRef(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [showPollModal, setShowPollModal] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState(["", ""]);
  const [pollSubmitting, setPollSubmitting] = useState(false);
  const { on } = useRealtime();

  useEffect(() => {
    const unsub = on("attendance_confirmed", () => setRefreshTick(t => t + 1));
    return () => unsub();
  }, [on]);

  useEffect(() => {
    if (!token) return;
    lecturersApi.getCourses(token)
      .then(cs => {
        const arr = Array.isArray(cs) ? cs : [];
        setCourses(arr);
        if (arr.length) setCourseId(String(arr[0].id ?? arr[0].course_id ?? ""));
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!courseId || !token) return;
    lecturersApi.getAttendanceSessions(courseId, token)
      .then(data => setSessions(Array.isArray(data) ? data : []))
      .catch(() => setSessions([]));
  }, [courseId, token, refreshTick]);

  // Fetch HMAC QR token for active session and start polling
  const startQrPolling = useCallback((sessionId) => {
    if (pollRef.current) clearInterval(pollRef.current);
    if (countdownRef.current) clearInterval(countdownRef.current);

    const fetchToken = async () => {
      try {
        const res = await lecturersApi.getQrToken(sessionId, token);
        setQrToken(res.token);
        setCountdown(res.expires_in);
      } catch {
        // Session may have expired
        setQrToken("");
        setCountdown(0);
        if (pollRef.current) clearInterval(pollRef.current);
      }
    };

    fetchToken(); // Immediate first fetch
    pollRef.current = setInterval(fetchToken, 85000); // Refresh every 85s (before 90s rotation)

    // Countdown timer
    countdownRef.current = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : 0));
    }, 1000);
  }, [token]);

  // Cleanup polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (countdownRef.current) clearInterval(countdownRef.current);
    };
  }, []);

  const generateCode = async () => {
    if (!courseId) return;
    setGenerating(true);
    setError("");
    try {
      const today = new Date().toISOString().split("T")[0];
      const existingToday = sessions.filter(s =>
        s.lecture_date && s.lecture_date.startsWith(today)
      ).length;
      const res = await lecturersApi.startAttendanceSession(
        Number(courseId),
        today,
        existingToday + 1,
        15,
        token
      );
      setActiveSession(res);
      // Start HMAC QR polling for this session
      if (res.id) startQrPolling(res.id);
      lecturersApi.getAttendanceSessions(courseId, token)
        .then(data => setSessions(Array.isArray(data) ? data : []))
        .catch(() => {});
    } catch (err) {
      setError(err?.message || "Failed to generate code. Is a course selected?");
    } finally {
      setGenerating(false);
    }
  };

  const selectedCourse = courses.find(c => String(c.id ?? c.course_id) === courseId);
  const latestSession  = sessions[0];

  // Extract unique levels from courses
  const levels = [...new Set(courses.map(c => c.level).filter(Boolean))].sort((a, b) => a - b);
  const filteredCourses = levelFilter ? courses.filter(c => String(c.level) === levelFilter) : courses;

  // Stats from latest session
  const stats = latestSession ? [
    { label: "Enrolled",        value: latestSession.total    ?? "—",  icon: Users,       color: "text-slate-900"   },
    { label: "Present",         value: latestSession.present  ?? "—",  icon: CheckCircle, color: "text-emerald-600" },
    { label: "Absent",          value: latestSession.absent   ?? "—",  icon: XCircle,     color: "text-risk-high"   },
    { label: "Attendance Rate", value: latestSession.total
      ? `${Math.round((latestSession.present / latestSession.total) * 100)}%`
      : "—",                                                            icon: TrendingUp,  color: "text-amber-600"   },
  ] : [];

  const records = [...(latestSession?.records ?? [])].sort((a, b) => {
    if (!a.time || !b.time) return 0;
    return new Date(a.time) - new Date(b.time);
  });

  const recentSessions = showAllSessions ? sessions : sessions.slice(0, 5);

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Attendance</h1>
          <p className="text-lg text-slate-600">Generate session codes and review attendance records</p>
        </div>
        {courses.length > 0 && (
          <div className="flex items-end gap-3">
            {levels.length > 1 && (
              <div>
                <label className="ds-label">Level</label>
                <select
                  value={levelFilter}
                  onChange={e => { setLevelFilter(e.target.value); setCourseId(""); }}
                  className="ds-select w-32"
                >
                  <option value="">All Levels</option>
                  {levels.map(l => <option key={l} value={String(l)}>{l} Level</option>)}
                </select>
              </div>
            )}
            <div>
              <label className="ds-label">Course</label>
              <select
                value={courseId}
                onChange={e => setCourseId(e.target.value)}
                className="ds-select w-72"
              >
                {filteredCourses.map(c => (
                  <option key={c.id ?? c.course_id} value={String(c.id ?? c.course_id)}>
                    {formatCourseCode(c.course_code)} — {c.course_title}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
        <button
          onClick={() => setShowPollModal(true)}
          disabled={!courseId}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all disabled:opacity-50"
        >
          <BarChart2 size={14} /> Quick Poll
        </button>
      </div>

      {/* Two-column grid */}
      <motion.div
        variants={container} initial="hidden" animate="show"
        className="grid grid-cols-1 lg:grid-cols-12 gap-6"
      >

        {/* Code generator — HMAC-signed rotating QR */}
        <motion.div variants={item} className="lg:col-span-5">
          <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-6">
            <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Session Code</h2>
            <p className="text-sm text-slate-500 mb-6">Valid for 15 minutes after generation</p>

            <Button onClick={generateCode} loading={generating} fullWidth icon={<RefreshCw size={14} />}>
              Generate New Code
            </Button>

            {error && (
              <p className="mt-3 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                {error}
              </p>
            )}

            {activeSession?.session_code && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="mt-5 bg-primary rounded-xl p-6 text-center"
              >
                <p className="text-slate-400 text-xs uppercase tracking-widest mb-4">Session Code</p>
                <p
                  className="font-serif font-bold text-accent tracking-[0.35em] leading-none"
                  style={{ fontSize: 48 }}
                >
                  {activeSession.session_code}
                </p>
                <p className="text-slate-400 text-xs mt-3 flex items-center justify-center gap-1.5">
                  <Clock size={11} />
                  Expires at {new Date(activeSession.expires_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: true })}
                </p>

                {/* HMAC-signed rotating QR code display */}
                <div className="mt-5 border-t border-white/10 pt-5">
                  <div className="flex items-center justify-center gap-2 mb-4">
                    <Shield size={13} className="text-accent" />
                    <button
                      onClick={() => setShowQr(v => !v)}
                      className="text-xs text-slate-400 hover:text-slate-300 transition-colors font-medium"
                    >
                      {showQr ? "Hide Secure QR" : "Show Secure QR"}
                    </button>
                  </div>
                  {showQr && qrToken && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-col items-center"
                    >
                      <div className="bg-white p-3 rounded-xl shadow-sm">
                        <QRCodeSVG
                          value={qrToken}
                          size={180}
                          bgColor="#ffffff"
                          fgColor="#1e3a8a"
                          level="M"
                        />
                      </div>
                      <div className="mt-3 flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-accent animate-pulse" />
                        <span className="text-xs text-slate-400">
                          Rotates in {countdown}s
                        </span>
                      </div>
                    </motion.div>
                  )}
                  <p className="text-xs text-slate-500 mt-3 flex items-center justify-center gap-1.5">
                    <QrCode size={11} />
                    HMAC-signed · Changes every 90s to prevent sharing
                  </p>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>

        {/* Session stats */}
        <motion.div variants={item} className="lg:col-span-7">
          <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-6 h-full">
            <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Latest Session</h2>
            <p className="text-sm text-slate-500 mb-6">
              {selectedCourse ? `${formatCourseCode(selectedCourse.course_code)} · ${selectedCourse.course_title}` : "No course selected"}
            </p>

            {stats.length > 0 ? (
              <>
              <div className="grid grid-cols-2 gap-4">
                {stats.map(({ label, value, icon: Icon, color }) => (
                  <motion.div
                    key={label}
                    whileHover={{ y: -1 }}
                    className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 hover:shadow-sm transition-all duration-200"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
                      <div className="w-10 h-10 bg-white border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
                        <Icon size={16} className="text-slate-400" />
                      </div>
                    </div>
                    <p className={`font-serif text-3xl font-bold leading-none ${color}`}>{value}</p>
                  </motion.div>
                ))}
              </div>

              {/* Confusion signals */}
              {activeSession && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center mt-4">
                  <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-1">Need Clarification</p>
                  <p className="font-serif text-2xl font-bold text-amber-700">
                    {activeSession.confusion_count || 0}
                  </p>
                  <p className="text-xs text-amber-500 mt-1">students signalled confusion</p>
                </div>
              )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <TrendingUp size={28} className="mb-3 opacity-30" />
                <p className="text-sm">Generate a session code to start tracking attendance</p>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>

      {/* Attendance records */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-serif text-2xl font-bold text-slate-900">Attendance Record</h2>
          {latestSession?.lecture_date && (
            <span className="text-sm text-slate-500">{new Date(latestSession.lecture_date).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short", year: "numeric" })}</span>
          )}
        </div>
        <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden">
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <CheckCircle size={28} className="mb-3 opacity-30" />
              <p className="text-sm">Attendance records will appear here after a session is generated</p>
            </div>
          ) : (
            <>
              <div className="px-6 py-4 border-b border-slate-200">
                <p className="text-sm text-slate-500">Latest session · {formatCourseCode(selectedCourse?.course_code)}</p>
              </div>
              <div className="divide-y divide-slate-100">
                {records.map((r, i) => (
                  <motion.div
                    key={r.id ?? i}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className="flex items-center justify-between gap-4 px-6 py-4 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className="w-9 h-9 rounded-full bg-primary flex items-center justify-center text-accent font-bold flex-shrink-0"
                        style={{ fontSize: 10 }}
                      >
                        {initials(r.full_name || r.name || "?")}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-900 truncate">{r.full_name || r.name}</p>
                        <p className="text-xs text-slate-500 hidden sm:block">{r.matric_number}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4 flex-shrink-0">
                      <span className="text-sm text-slate-500 hidden sm:block">
                        {r.time ? new Date(r.time).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: true }) : "—"}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border ${
                        r.status === "present"
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                          : "bg-red-50 text-red-700 border-red-200"
                      }`}>
                        {r.status === "present" ? <CheckCircle size={10} /> : <XCircle size={10} />}
                        {r.status === "present" ? "Present" : "Absent"}
                      </span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      {/* Session History */}
      {sessions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-serif text-2xl font-bold text-slate-900">Session History</h2>
            {sessions.length > 5 && (
              <button
                onClick={() => setShowAllSessions(v => !v)}
                className="text-sm font-semibold text-accent hover:underline"
              >
                {showAllSessions ? "Show Recent" : `View All ${sessions.length} Sessions`}
              </button>
            )}
          </div>
          <div className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden divide-y divide-slate-100">
            {recentSessions.map((s, i) => (
              <div key={s.id ?? i} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-semibold text-slate-900">
                    Lecture {s.lecture_number ?? i + 1}
                  </span>
                  <span className="text-xs text-slate-500">
                    {s.lecture_date ? new Date(s.lecture_date).toLocaleDateString("en-NG", { weekday: "short", day: "numeric", month: "short" }) : "—"}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-emerald-600 font-medium">{s.present ?? 0} present</span>
                  <span className="text-xs text-slate-400">{s.absent ?? 0} absent</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
