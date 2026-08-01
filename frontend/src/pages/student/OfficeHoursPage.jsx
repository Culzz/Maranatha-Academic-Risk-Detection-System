/**
 * OfficeHoursPage — Student.
 * Browse available lecturer office-hour slots, book appointments,
 * and track booking status (pending / confirmed / declined).
 *
 * Data sources:
 *   studentsApi.getMyCourses       -> enrolled courses (to discover lecturer IDs)
 *   officeHoursApi.getLecturerSlots -> available slots per lecturer (Medium/High risk only)
 *   officeHoursApi.bookSlot        -> create a booking
 *   officeHoursApi.getMyBookings   -> student's own booking history
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, MapPin, Calendar, CalendarCheck, AlertTriangle,
  User, Send, CheckCircle, XCircle, Loader2, Info,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { officeHoursApi, studentsApi } from "../../services/api";
import Badge from "../../components/ui/Badge";
import DatePicker from "../../components/ui/DatePicker";

/* ── animation variants ──────────────────────────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/* ── status helpers ──────────────────────────────────────── */
const STATUS_STYLES = {
  pending:   { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   icon: Clock,       badge: "amber"  },
  confirmed: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", icon: CheckCircle, badge: "green"  },
  declined:  { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     icon: XCircle,     badge: "red"    },
};

function statusStyle(status) {
  return STATUS_STYLES[status] || STATUS_STYLES.pending;
}

/* ── skeleton helpers ────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="animate-pulse border border-slate-200 rounded-2xl bg-white p-5">
      <div className="h-3 bg-slate-200 rounded w-1/3 mb-3" />
      <div className="h-4 bg-slate-100 rounded w-2/3 mb-4" />
      <div className="h-3 bg-slate-100 rounded w-1/2" />
    </div>
  );
}

/* ── sub-components ──────────────────────────────────────── */

function SlotCard({ slot, lecturerName, onBook }) {
  const [reason, setReason]   = useState("");
  const [date, setDate]       = useState("");
  const [expanded, setExpanded] = useState(false);
  const [booking, setBooking] = useState(false);

  const handleBook = async () => {
    if (!date) return;
    setBooking(true);
    try {
      await onBook(slot.id, date, reason);
      setExpanded(false);
      setReason("");
      setDate("");
    } finally {
      setBooking(false);
    }
  };

  return (
    <motion.div
      variants={item}
      whileHover={{ y: -2 }}
      className="border border-slate-200 bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start gap-3 mb-3">
        <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
          <Calendar size={16} className="text-blue-500" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-slate-900 leading-tight">{slot.day_of_week}</p>
          {lecturerName && (
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
              <User size={10} /> {lecturerName}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-1.5 mb-4">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <Clock size={10} />
          {slot.start_time} &ndash; {slot.end_time}
        </p>
        {slot.venue && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <MapPin size={10} />
            {slot.venue}
          </p>
        )}
      </div>

      {!expanded ? (
        <button
          onClick={() => setExpanded(true)}
          className="w-full text-center text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-xl py-2 transition-colors"
        >
          Book This Slot
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-3 pt-2 border-t border-slate-100"
        >
          <div>
            <DatePicker
              label="Preferred Date"
              value={date}
              onChange={(val) => setDate(val)}
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1 block">Reason (optional)</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Briefly describe why you need this session..."
              rows={2}
              className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2 resize-none focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => { setExpanded(false); setReason(""); setDate(""); }}
              className="flex-1 text-xs font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl py-2 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleBook}
              disabled={!date || booking}
              className="flex-1 text-xs font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl py-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {booking ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
              {booking ? "Booking..." : "Confirm Booking"}
            </button>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function BookingCard({ booking }) {
  const s = statusStyle(booking.status);
  const StatusIcon = s.icon;

  return (
    <motion.div
      variants={item}
      className={`border ${s.border} ${s.bg} rounded-2xl p-5 transition-all duration-200`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${s.border} bg-white/60`}>
            <StatusIcon size={16} className={s.text} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 leading-tight">
              {booking.day_of_week || "Office Hour"}
            </p>
            {booking.lecturer_name && (
              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                <User size={10} /> {booking.lecturer_name}
              </p>
            )}
          </div>
        </div>
        <Badge
          variant="status"
          label={booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
          color={s.badge}
          dot
        />
      </div>

      <div className="space-y-1.5 mb-2">
        <p className="text-xs text-slate-500 flex items-center gap-1.5">
          <CalendarCheck size={10} />
          {booking.book_date}
        </p>
        {(booking.start_time || booking.end_time) && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <Clock size={10} />
            {booking.start_time} &ndash; {booking.end_time}
          </p>
        )}
        {booking.venue && (
          <p className="text-xs text-slate-500 flex items-center gap-1.5">
            <MapPin size={10} />
            {booking.venue}
          </p>
        )}
      </div>

      {booking.note && (
        <div className="mt-3 pt-3 border-t border-slate-200/60">
          <p className="text-xs text-slate-500 italic">"{booking.note}"</p>
        </div>
      )}
    </motion.div>
  );
}

/* ── main page ───────────────────────────────────────────── */
export default function OfficeHoursPage() {
  const { token } = useAuth();

  const [slots, setSlots]       = useState([]);
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const [slotsError, setSlotsError] = useState("");

  /* ── Fetch data ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    setSlotsError("");

    try {
      // Fetch bookings — always available
      const bookingsRes = await officeHoursApi.getMyBookings(token);
      setBookings(Array.isArray(bookingsRes) ? bookingsRes : []);

      // Fetch enrolled courses to discover lecturer IDs
      try {
        const courses = await studentsApi.getMyCourses(token);
        const courseList = Array.isArray(courses) ? courses : [];

        // Deduplicate lecturer IDs
        const lecturerIds = [...new Set(
          courseList
            .map(c => c.lecturer_id)
            .filter(Boolean)
        )];

        // Fetch slots for each lecturer (may fail if student not medium/high risk)
        const allSlots = [];
        const lecturerNames = {};
        courseList.forEach(c => {
          if (c.lecturer_id && c.lecturer_name) {
            lecturerNames[c.lecturer_id] = c.lecturer_name;
          }
        });

        const slotResults = await Promise.allSettled(
          lecturerIds.map(id => officeHoursApi.getLecturerSlots(id, token))
        );

        slotResults.forEach((result, idx) => {
          if (result.status === "fulfilled" && Array.isArray(result.value)) {
            const lecId = lecturerIds[idx];
            result.value.forEach(s => {
              allSlots.push({
                ...s,
                lecturer_id: lecId,
                lecturer_name: lecturerNames[lecId] || "Lecturer",
              });
            });
          }
        });

        setSlots(allSlots);

        if (allSlots.length === 0 && lecturerIds.length > 0) {
          setSlotsError("Office hours are available for students with Medium or High risk levels. Keep working on your academics!");
        }
      } catch {
        setSlotsError("Could not load available slots.");
      }
    } catch (e) {
      setError(e.message || "Failed to load office hours data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Real-time: refetch on office hour updates
  const { on } = useRealtime();
  useEffect(() => on("office_hour_response", fetchData), [on]);

  /* ── Book a slot ─── */
  const handleBook = async (slotId, bookDate, note) => {
    setError("");
    setSuccess("");
    try {
      await officeHoursApi.bookSlot({ slot_id: slotId, book_date: bookDate, note }, token);
      setSuccess("Booking submitted successfully! The lecturer will confirm shortly.");
      fetchData();
      setTimeout(() => setSuccess(""), 5000);
    } catch (e) {
      setError(e.message || "Failed to book slot.");
    }
  };

  const hasSlots    = slots.length > 0;
  const hasBookings = bookings.length > 0;

  /* ── Loading skeleton ─── */
  if (loading) {
    return (
      <div className="space-y-8">
        <div className="max-w-2xl">
          <div className="h-10 bg-slate-200 rounded w-56 mb-3 animate-pulse" />
          <div className="h-5 bg-slate-100 rounded w-80 animate-pulse" />
        </div>
        <div>
          <div className="h-6 bg-slate-200 rounded w-44 mb-6 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
        <div>
          <div className="h-6 bg-slate-200 rounded w-44 mb-6 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[1, 2].map(i => <SkeletonCard key={i} />)}
          </div>
        </div>
      </div>
    );
  }

  /* ── Main render ─── */
  return (
    <div className="space-y-8">

      {/* ── Header ─── */}
      <div className="max-w-2xl">
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
          Office Hours
        </h1>
        <p className="text-lg text-slate-600">
          Book one-on-one sessions with your lecturers for academic support
        </p>
      </div>

      {/* ── Error banner ─── */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl p-4"
          >
            <AlertTriangle size={16} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Success banner ─── */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-4"
          >
            <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
            <p className="text-sm text-emerald-700">{success}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Available Slots ─── */}
      <div>
        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">Available Slots</h2>

        {slotsError && !hasSlots && (
          <div className="flex items-start gap-4 bg-blue-50 border border-blue-200 rounded-xl p-5 mb-6">
            <div className="w-10 h-10 bg-blue-100 border border-blue-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <Info size={18} className="text-blue-600" />
            </div>
            <div>
              <p className="font-semibold text-blue-800 mb-1">No Slots Available</p>
              <p className="text-sm text-blue-700">{slotsError}</p>
            </div>
          </div>
        )}

        {hasSlots ? (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {slots.map((slot) => (
              <SlotCard
                key={`${slot.id}-${slot.lecturer_id}`}
                slot={slot}
                lecturerName={slot.lecturer_name}
                onBook={handleBook}
              />
            ))}
          </motion.div>
        ) : !slotsError ? (
          <div className="text-center py-16 border border-slate-200 rounded-xl bg-white shadow-sm">
            <Calendar size={28} className="text-slate-300 mx-auto mb-3 opacity-50" />
            <p className="text-sm text-slate-500 font-medium">No office hour slots available at this time</p>
            <p className="text-xs text-slate-400 mt-1">Check back later or contact your lecturer directly</p>
          </div>
        ) : null}
      </div>

      {/* ── My Bookings ─── */}
      <div>
        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">My Bookings</h2>

        {hasBookings ? (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {bookings.map((b) => (
              <BookingCard key={b.id} booking={b} />
            ))}
          </motion.div>
        ) : (
          <div className="text-center py-16 border border-slate-200 rounded-xl bg-white shadow-sm">
            <CalendarCheck size={28} className="text-slate-300 mx-auto mb-3 opacity-50" />
            <p className="text-sm text-slate-500 font-medium">No bookings yet</p>
            <p className="text-xs text-slate-400 mt-1">Book an available slot above to get started</p>
          </div>
        )}
      </div>

      {/* ── Legend ─── */}
      <div className="border border-slate-200 rounded-xl bg-white shadow-sm p-5">
        <div className="flex flex-wrap items-center gap-6">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Status Guide</p>
          {[
            { label: "Pending",   color: "bg-amber-500"   },
            { label: "Confirmed", color: "bg-emerald-500" },
            { label: "Declined",  color: "bg-red-500"     },
          ].map(({ label, color }) => (
            <div key={label} className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full ${color}`} />
              <span className="text-xs text-slate-600 font-medium">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
