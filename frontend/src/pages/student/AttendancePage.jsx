/**
 * AttendancePage — Student.
 * Submit session code or scan QR to mark attendance + view per-course summary.
 * QR scanner uses browser camera via getUserMedia + jsQR decoding.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CalendarCheck, CheckCircle, Clock, QrCode, AlertCircle, Camera, X, MapPin, HandMetal, AlertTriangle } from "lucide-react";
import Button from "../../components/ui/Button";

import { SuccessBanner, ErrorBanner } from "../../components/ui/Feedback";
import { formatDate, formatCourseCode } from "../../utils/helpers";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { studentsApi } from "../../services/api";
import { SkeletonCard } from "../../components/ui/Skeleton";

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

export default function AttendancePage() {
  const { token } = useAuth();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");
  const [courses, setCourses] = useState([]);
  const [loadingSummary, setLoadSummary] = useState(true);
  const [expandedCourse, setExpandedCourse] = useState(null);

  // "I'm Lost" confusion signal state
  const [lastSessionId, setLastSessionId] = useState(null);
  const [confusionSent, setConfusionSent] = useState(false);

  // QR scanner state
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const animFrameRef = useRef(null);

  const fetchAttendance = useCallback(() => {
    if (!token) return;
    studentsApi.getMyAttendance(token)
      .then(data => setCourses(Array.isArray(data) ? data : []))
      .catch(() => {})
      .finally(() => setLoadSummary(false));
  }, [token]);

  useEffect(() => { fetchAttendance(); }, [fetchAttendance]);

  // Real-time: refetch when attendance session opens
  const { on } = useRealtime();
  useEffect(() => on("attendance_open", fetchAttendance), [on]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (code.trim().length < 4) {
      setError("Please enter the attendance code your lecturer is displaying.");
      return;
    }
    setLoading(true); setError(""); setSuccess("");
    try {
      const res = await studentsApi.submitAttendanceCode(code.trim(), null, token);
      const label = res.course_code
        ? `${res.course_code} - ${res.course_title}`
        : "";
      setSuccess(label ? `Attendance recorded for ${label}.` : "Attendance recorded successfully.");
      if (res.session_id) { setLastSessionId(res.session_id); setConfusionSent(false); }
      setCode("");
      fetchAttendance();
    } catch (err) {
      setError(err.message || "Invalid or expired code. Please try again.");
    } finally { setLoading(false); }
  };

  // QR Scanner — start camera and decode frames
  const startScanner = async () => {
    setScanError("");
    setScanning(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
        requestAnimationFrame(scanFrame);
      }
    } catch {
      setScanError("Camera access denied. Please allow camera permissions or use the code input instead.");
      setScanning(false);
    }
  };

  const stopScanner = () => {
    setScanning(false);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  };

  const scanFrame = () => {
    if (!videoRef.current || !canvasRef.current || !scanning) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) {
      animFrameRef.current = requestAnimationFrame(scanFrame);
      return;
    }

    const ctx = canvas.getContext("2d");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Try to decode QR from the canvas using jsQR (loaded dynamically)
    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      // Use jsQR if available, otherwise try simple approach
      if (typeof window.jsQR === "function") {
        const qrCode = window.jsQR(imageData.data, imageData.width, imageData.height);
        if (qrCode && qrCode.data) {
          handleQrResult(qrCode.data);
          return;
        }
      }
    } catch {
      // Continue scanning
    }

    animFrameRef.current = requestAnimationFrame(scanFrame);
  };

  const handleQrResult = async (qrData) => {
    stopScanner();
    setLoading(true);
    setError("");
    setSuccess("");

    // Get GPS coordinates as soft check
    let latitude = null;
    let longitude = null;
    try {
      const pos = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
      });
      latitude = pos.coords.latitude;
      longitude = pos.coords.longitude;
    } catch {
      // GPS not available — proceed without it
    }

    try {
      const res = await studentsApi.verifyQrAttendance(qrData, latitude, longitude, token);
      const label = res.course_code
        ? `${res.course_code} - ${res.course_title}`
        : "";
      setSuccess(
        (label ? `Attendance recorded for ${label} via QR scan.` : "Attendance recorded via QR scan.")
        + (res.location_logged ? " Location verified." : "")
      );
      fetchAttendance();
    } catch (err) {
      setError(err.message || "QR verification failed. Try the manual code entry.");
    } finally {
      setLoading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, []);

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="max-w-2xl">
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Attendance</h1>
        <p className="text-lg text-slate-600">Scan the QR code or enter the session code displayed by your lecturer</p>
      </div>

      {/* Main grid */}
      <motion.div
        variants={container} initial="hidden" animate="show"
        className="grid grid-cols-1 lg:grid-cols-12 gap-8"
      >
        {/* Code input + QR scanner */}
        <motion.div variants={item} className="lg:col-span-5">
          <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-6">
            <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Mark Attendance</h2>
            <p className="text-sm text-slate-500 mb-6">Scan QR or enter the 6-character code</p>

            <SuccessBanner message={success} />
            <ErrorBanner message={error} onDismiss={() => setError("")} />

            {/* QR Scanner */}
            <AnimatePresence>
              {scanning && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mb-5"
                >
                  <div className="relative bg-slate-900 rounded-xl overflow-hidden">
                    <video
                      ref={videoRef}
                      className="w-full rounded-xl"
                      playsInline
                      muted
                      style={{ maxHeight: 280 }}
                    />
                    <canvas ref={canvasRef} className="hidden" />
                    <button
                      onClick={stopScanner}
                      className="absolute top-3 right-3 w-8 h-8 bg-white/90 rounded-full flex items-center justify-center shadow-sm hover:bg-white transition-colors"
                    >
                      <X size={14} className="text-slate-700" />
                    </button>
                    <div className="absolute inset-0 pointer-events-none border-2 border-accent/30 rounded-xl" />
                    <div className="absolute bottom-3 left-3 right-3 flex items-center justify-center">
                      <span className="text-xs text-white/80 bg-black/50 px-3 py-1 rounded-full flex items-center gap-1.5">
                        <Camera size={11} />
                        Point camera at QR code
                      </span>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {!scanning && (
              <div className="mb-5">
                <Button
                  onClick={startScanner}
                  variant="outline"
                  fullWidth
                  icon={<QrCode size={16} />}
                >
                  Scan QR Code
                </Button>
                {scanError && (
                  <p className="mt-2 text-xs text-amber-600 flex items-center gap-1">
                    <AlertCircle size={11} />
                    {scanError}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-xs text-slate-400 font-medium">or enter code manually</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label htmlFor="attendance-code" className="block text-sm font-semibold text-slate-900 mb-2">6-character code</label>
                <input
                  id="attendance-code"
                  name="attendance_code"
                  type="text"
                  maxLength={6}
                  value={code}
                  onChange={e => setCode(e.target.value.replace(/[^A-Za-z0-9]/g, "").toUpperCase())}
                  placeholder="ABC123"
                  className="w-full p-4 border border-slate-200 rounded-xl text-center text-2xl font-mono tracking-widest outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
                />
              </div>
              <Button type="submit" loading={loading} fullWidth icon={<CalendarCheck size={16} />}>
                Mark Present
              </Button>
            </form>

            <p className="text-xs text-slate-500 mt-6 pt-5 border-t border-slate-200 flex items-center gap-2">
              <MapPin size={13} className="text-slate-400" />
              Location may be logged as a soft verification signal when scanning QR codes.
            </p>

            {/* "I'm Lost" confusion signal */}
            {lastSessionId && !confusionSent && (
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                whileTap={{ scale: 0.95 }}
                onClick={async () => {
                  try {
                    await studentsApi.signalConfusion(lastSessionId, token);
                    setConfusionSent(true);
                  } catch {}
                }}
                className="mt-4 w-full flex items-center justify-center gap-2 bg-amber-50 border border-amber-200 text-amber-700 text-sm font-semibold px-4 h-10 rounded-xl hover:bg-amber-100 transition-colors"
              >
                <HandMetal size={16} /> I'm Lost Right Now
              </motion.button>
            )}
            {confusionSent && (
              <p className="mt-4 text-xs text-emerald-600 text-center font-medium">
                Signal sent anonymously — your lecturer has been notified.
              </p>
            )}
          </div>
        </motion.div>

        {/* Attendance summary */}
        <motion.div variants={item} className="lg:col-span-7">
          <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-6">
            <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Attendance Summary</h2>
            <p className="text-sm text-slate-500 mb-6">Your record across all courses</p>

            {loadingSummary ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : courses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <CalendarCheck size={28} className="mb-3 opacity-30" />
                <p className="text-sm">No enrolled courses found</p>
              </div>
            ) : (
              <div className="space-y-4">
                {courses.map((c, i) => {
                  const rate = c.rate;
                  const rateColor = rate === null ? "text-slate-400"
                    : rate >= 75 ? "text-emerald-600"
                    : rate >= 50 ? "text-amber-600"
                    : "text-risk-high";
                  const barColor = rate === null ? "#94a3b8"
                    : rate >= 75 ? "#10b981"
                    : rate >= 50 ? "#f59e0b"
                    : "#e11d48";

                  return (
                    <motion.div
                      key={c.course_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.06 }}
                      whileHover={{ y: -1 }}
                      className="p-5 border border-slate-200 rounded-xl bg-white hover:shadow-md transition-all duration-200"
                    >
                      <div className="flex items-start justify-between gap-4 mb-4">
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{formatCourseCode(c.course_code)}</p>
                          <p className="text-base font-bold text-slate-900 leading-tight">{c.course_title}</p>
                        </div>
                        <p className={`font-serif text-3xl font-bold leading-none flex-shrink-0 ${rateColor}`}>
                          {rate !== null ? `${rate}%` : "--"}
                        </p>
                      </div>

                      <div className="mb-3">
                        <div className="flex justify-between text-xs text-slate-500 mb-1.5">
                          <span>Sessions attended</span>
                          <span>{c.attended} of {c.total_sessions}</span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${rate || 0}%` }}
                            transition={{ duration: 0.8, delay: 0.1 + i * 0.06, ease: "easeOut" }}
                            className="h-full rounded-full"
                            style={{ backgroundColor: barColor }}
                          />
                        </div>
                      </div>

                      {/* Consecutive absence counter + Attendance forecast */}
                      {(() => {
                        // Count consecutive absences from most recent
                        const sorted = c.recent_records
                          ? [...c.recent_records].sort((a, b) => new Date(b.lecture_date) - new Date(a.lecture_date))
                          : [];
                        let consecutive = 0;
                        // recent_records only contains attended records, so consecutive absences
                        // = total_sessions - attended if last attendance is old
                        // Better approach: compute from total_sessions and attended
                        const totalHeld = c.total_sessions || 0;
                        const attended = c.attended || 0;
                        const missed = totalHeld - attended;

                        // Attendance forecast — need X more of remaining to stay above 75%
                        const threshold = 0.75;
                        // We don't know total planned classes, so estimate based on a typical 15-week semester × 1 class/week
                        // But we can show: "You've missed X class(es)"
                        const neededFor75 = Math.ceil(totalHeld * threshold);
                        const deficit = neededFor75 - attended;

                        return (
                          <div className="mt-3 space-y-2">
                            {/* Missed classes indicator */}
                            {totalHeld > 0 && missed > 0 && (
                              <div className={[
                                "flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg",
                                missed >= 3 ? "bg-red-50 text-red-700 border border-red-200"
                                  : missed >= 1 ? "bg-amber-50 text-amber-700 border border-amber-200"
                                  : "bg-emerald-50 text-emerald-700 border border-emerald-200",
                              ].join(" ")}>
                                {missed >= 3 ? <AlertTriangle size={12} /> : <AlertCircle size={12} />}
                                {missed >= 3
                                  ? `${missed} classes missed — this significantly affects your risk score`
                                  : `${missed} class${missed > 1 ? "es" : ""} missed`}
                              </div>
                            )}
                            {totalHeld > 0 && missed === 0 && (
                              <div className="flex items-center gap-2 text-xs font-medium px-3 py-2 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200">
                                <CheckCircle size={12} />
                                Perfect attendance — no absences
                              </div>
                            )}
                            {/* Forecast */}
                            {totalHeld > 0 && deficit > 0 && (
                              <p className="text-xs text-amber-600 flex items-center gap-1.5">
                                <Clock size={11} />
                                You need to attend {deficit} more class{deficit > 1 ? "es" : ""} to reach 75% attendance
                              </p>
                            )}
                            {totalHeld > 0 && rate !== null && rate >= 75 && (
                              <p className="text-xs text-emerald-600 flex items-center gap-1.5">
                                <CheckCircle size={11} />
                                You're above the 75% attendance threshold
                              </p>
                            )}
                          </div>
                        );
                      })()}

                      {/* Recent records */}
                      {c.recent_records && c.recent_records.length > 0 && (() => {
                        const sorted = [...c.recent_records].sort((a, b) =>
                          new Date(b.lecture_date) - new Date(a.lecture_date)
                        );
                        const isExpanded = expandedCourse === c.course_id;
                        const visible = isExpanded ? sorted : sorted.slice(0, 5);
                        return (
                          <div className="mt-3 pt-3 border-t border-slate-100">
                            <p className="text-xs font-semibold text-slate-500 mb-2">Recent Classes</p>
                            <div className="space-y-1.5">
                              {visible.map((r, ri) => (
                                <div
                                  key={ri}
                                  className="flex items-center justify-between text-xs bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5"
                                >
                                  <span className="flex items-center gap-1.5 text-emerald-700 font-medium">
                                    <CheckCircle size={10} />
                                    Lecture {r.lecture_number}
                                  </span>
                                  <span className="text-slate-500">
                                    {formatDate(r.lecture_date)}
                                    {r.time && ` · ${new Date(r.time).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: true })}`}
                                  </span>
                                </div>
                              ))}
                            </div>
                            {sorted.length > 5 && (
                              <button
                                onClick={() => setExpandedCourse(isExpanded ? null : c.course_id)}
                                className="mt-2 text-xs font-semibold text-accent hover:underline"
                              >
                                {isExpanded ? "Show Less" : `Show All ${sorted.length} Records`}
                              </button>
                            )}
                          </div>
                        );
                      })()}

                      {c.total_sessions === 0 && (
                        <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-2">
                          <AlertCircle size={11} />
                          No sessions held yet
                        </p>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
