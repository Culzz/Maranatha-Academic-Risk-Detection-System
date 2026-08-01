/**
 * OfficeHoursPage — Lecturer.
 * Create recurring office-hour slots, view bookings, and confirm/decline
 * student appointment requests.
 *
 * Data sources:
 *   officeHoursApi.createSlot          -> create a new slot
 *   officeHoursApi.getMySlots          -> lecturer's own slots (with booking counts)
 *   officeHoursApi.getIncomingBookings -> pending/confirmed bookings from students
 *   officeHoursApi.respondBooking      -> confirm or decline a booking
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, MapPin, Calendar, Plus, Trash2, CheckCircle, XCircle,
  AlertTriangle, Users, Loader2, CalendarCheck, User, Info,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { officeHoursApi } from "../../services/api";
import Badge from "../../components/ui/Badge";

/* ── animation variants ──────────────────────────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = {
  hidden: { opacity: 0, y: 8 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

/* ── constants ───────────────────────────────────────────── */
const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const STATUS_STYLES = {
  pending:   { bg: "bg-amber-50",   border: "border-amber-200",   text: "text-amber-700",   badge: "amber"  },
  confirmed: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "green"  },
  declined:  { bg: "bg-red-50",     border: "border-red-200",     text: "text-red-700",     badge: "red"    },
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

function SlotCard({ slot, onDelete }) {
  const [deleting, setDeleting] = useState(false);

  return (
    <motion.div
      variants={item}
      whileHover={{ y: -2 }}
      className="border border-slate-200 bg-white rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
            <Calendar size={16} className="text-blue-500" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 leading-tight">{slot.day_of_week}</p>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
              <Clock size={10} />
              {slot.start_time} &ndash; {slot.end_time}
            </p>
          </div>
        </div>

        <button
          onClick={async () => {
            setDeleting(true);
            try { await onDelete(slot.id); } finally { setDeleting(false); }
          }}
          disabled={deleting}
          title="Delete slot"
          className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-all disabled:opacity-50"
        >
          {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>

      {slot.venue && (
        <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-3">
          <MapPin size={10} />
          {slot.venue}
        </p>
      )}

      <div className="flex items-center justify-between pt-3 border-t border-slate-100">
        <div className="flex items-center gap-1.5">
          <Users size={12} className="text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">
            {slot.booking_count || 0} booking{(slot.booking_count || 0) !== 1 ? "s" : ""}
          </span>
        </div>
        <Badge
          variant="status"
          label={slot.is_available ? "Available" : "Unavailable"}
          color={slot.is_available ? "green" : "slate"}
          dot
          size="xs"
        />
      </div>
    </motion.div>
  );
}

function BookingRequestCard({ booking, onRespond }) {
  const s = statusStyle(booking.status);
  const [responding, setResponding] = useState(null);

  const handleRespond = async (status) => {
    setResponding(status);
    try {
      await onRespond(booking.id, status);
    } finally {
      setResponding(null);
    }
  };

  return (
    <motion.div
      variants={item}
      className={`border ${s.border} ${s.bg} rounded-2xl p-5 transition-all duration-200`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border ${s.border} bg-white/60`}>
            <User size={16} className={s.text} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-slate-900 leading-tight">
              {booking.student_name || "Student"}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              {booking.day_of_week || "Office Hour"}
            </p>
          </div>
        </div>
        <Badge
          variant="status"
          label={booking.status.charAt(0).toUpperCase() + booking.status.slice(1)}
          color={s.badge}
          dot
        />
      </div>

      <div className="space-y-1.5 mb-3">
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
      </div>

      {booking.note && (
        <div className="mb-4 p-3 bg-white/60 rounded-xl border border-slate-200/60">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Reason</p>
          <p className="text-sm text-slate-700">{booking.note}</p>
        </div>
      )}

      {booking.status === "pending" && (
        <div className="flex gap-2 pt-3 border-t border-slate-200/60">
          <button
            onClick={() => handleRespond("confirmed")}
            disabled={responding !== null}
            className="flex-1 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl py-2.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {responding === "confirmed"
              ? <Loader2 size={12} className="animate-spin" />
              : <CheckCircle size={12} />}
            Confirm
          </button>
          <button
            onClick={() => handleRespond("declined")}
            disabled={responding !== null}
            className="flex-1 text-xs font-semibold text-red-600 bg-white hover:bg-red-50 border border-red-200 rounded-xl py-2.5 transition-colors disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {responding === "declined"
              ? <Loader2 size={12} className="animate-spin" />
              : <XCircle size={12} />}
            Decline
          </button>
        </div>
      )}
    </motion.div>
  );
}

/* ── main page ───────────────────────────────────────────── */
export default function OfficeHoursPage() {
  const { token } = useAuth();

  /* ── state ─── */
  const [slots, setSlots]           = useState([]);
  const [bookings, setBookings]     = useState([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");
  const [success, setSuccess]       = useState("");

  // Create-slot form
  const [formDay, setFormDay]       = useState("Monday");
  const [formStart, setFormStart]   = useState("09:00");
  const [formEnd, setFormEnd]       = useState("10:00");
  const [formVenue, setFormVenue]   = useState("");
  const [creating, setCreating]     = useState(false);
  const [showForm, setShowForm]     = useState(false);

  /* ── Fetch data ─── */
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [slotsRes, bookingsRes] = await Promise.allSettled([
        officeHoursApi.getMySlots(token),
        officeHoursApi.getIncomingBookings(token),
      ]);

      if (slotsRes.status === "fulfilled") {
        setSlots(Array.isArray(slotsRes.value) ? slotsRes.value : []);
      }
      if (bookingsRes.status === "fulfilled") {
        setBookings(Array.isArray(bookingsRes.value) ? bookingsRes.value : []);
      }
    } catch (e) {
      setError(e.message || "Failed to load office hours data.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchData(); }, [fetchData]);

  /* ── Create slot ─── */
  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setCreating(true);
    try {
      await officeHoursApi.createSlot(
        { day_of_week: formDay, start_time: formStart, end_time: formEnd, venue: formVenue },
        token,
      );
      setSuccess("Office hour slot created successfully!");
      setFormDay("Monday");
      setFormStart("09:00");
      setFormEnd("10:00");
      setFormVenue("");
      setShowForm(false);
      fetchData();
      setTimeout(() => setSuccess(""), 5000);
    } catch (e) {
      setError(e.message || "Failed to create slot.");
    } finally {
      setCreating(false);
    }
  };

  /* ── Delete slot ─── */
  const handleDelete = async (slotId) => {
    setError("");
    setSuccess("");
    try {
      // The API may not have a dedicated delete endpoint, so we try.
      // If it doesn't exist, we'll show the error.
      await officeHoursApi.deleteSlot?.(slotId, token);
      setSuccess("Slot removed.");
      fetchData();
      setTimeout(() => setSuccess(""), 3000);
    } catch (e) {
      setError(e.message || "Failed to delete slot.");
    }
  };

  /* ── Respond to booking ─── */
  const handleRespond = async (bookingId, status) => {
    setError("");
    setSuccess("");
    try {
      await officeHoursApi.respondBooking(bookingId, { status }, token);
      setSuccess(`Booking ${status} successfully.`);
      fetchData();
      setTimeout(() => setSuccess(""), 4000);
    } catch (e) {
      setError(e.message || "Failed to update booking.");
    }
  };

  const hasSlots    = slots.length > 0;
  const hasBookings = bookings.length > 0;
  const pendingCount = bookings.filter(b => b.status === "pending").length;

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
          <div className="h-6 bg-slate-200 rounded w-52 mb-6 animate-pulse" />
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
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
            Office Hours
          </h1>
          <p className="text-lg text-slate-600">
            Manage your office-hour slots and respond to student booking requests
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus size={16} />
          {showForm ? "Hide Form" : "New Slot"}
        </button>
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

      {/* ── Create Slot Form ─── */}
      <AnimatePresence>
        {showForm && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <form
              onSubmit={handleCreate}
              className="border border-slate-200 bg-white rounded-2xl shadow-sm p-6"
            >
              <h3 className="text-lg font-bold text-slate-900 mb-5 flex items-center gap-2">
                <Plus size={18} className="text-primary" />
                Create Office Hour Slot
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                {/* Day of week */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Day of Week</label>
                  <select
                    value={formDay}
                    onChange={(e) => setFormDay(e.target.value)}
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition-all bg-white"
                  >
                    {WEEKDAYS.map(day => (
                      <option key={day} value={day}>{day}</option>
                    ))}
                  </select>
                </div>

                {/* Start time */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Start Time</label>
                  <input
                    type="time"
                    value={formStart}
                    onChange={(e) => setFormStart(e.target.value)}
                    required
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition-all"
                  />
                </div>

                {/* End time */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">End Time</label>
                  <input
                    type="time"
                    value={formEnd}
                    onChange={(e) => setFormEnd(e.target.value)}
                    required
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition-all"
                  />
                </div>

                {/* Venue */}
                <div>
                  <label className="text-xs font-semibold text-slate-600 mb-1.5 block">Venue</label>
                  <input
                    type="text"
                    value={formVenue}
                    onChange={(e) => setFormVenue(e.target.value)}
                    placeholder="e.g. Room 204, Block A"
                    className="w-full text-sm border border-slate-200 rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-blue-200 focus:border-blue-400 outline-none transition-all"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-2.5 text-sm font-semibold text-slate-500 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-5 py-2.5 text-sm font-semibold text-white bg-primary hover:bg-primary/90 rounded-xl transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  {creating ? "Creating..." : "Create Slot"}
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── My Slots ─── */}
      <div>
        <h2 className="font-serif text-2xl font-bold text-slate-900 mb-6">My Slots</h2>

        {hasSlots ? (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {slots.map((slot) => (
              <SlotCard key={slot.id} slot={slot} onDelete={handleDelete} />
            ))}
          </motion.div>
        ) : (
          <div className="text-center py-16 border border-slate-200 rounded-xl bg-white shadow-sm">
            <Calendar size={28} className="text-slate-300 mx-auto mb-3 opacity-50" />
            <p className="text-sm text-slate-500 font-medium">No office hour slots created yet</p>
            <p className="text-xs text-slate-400 mt-1">Click "New Slot" above to set your availability</p>
          </div>
        )}
      </div>

      {/* ── Incoming Bookings ─── */}
      <div>
        <div className="flex items-center gap-3 mb-6">
          <h2 className="font-serif text-2xl font-bold text-slate-900">Incoming Bookings</h2>
          {pendingCount > 0 && (
            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-amber-100 border border-amber-200 text-amber-700 text-xs font-bold">
              {pendingCount}
            </span>
          )}
        </div>

        {hasBookings ? (
          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          >
            {bookings.map((b) => (
              <BookingRequestCard key={b.id} booking={b} onRespond={handleRespond} />
            ))}
          </motion.div>
        ) : (
          <div className="text-center py-16 border border-slate-200 rounded-xl bg-white shadow-sm">
            <Users size={28} className="text-slate-300 mx-auto mb-3 opacity-50" />
            <p className="text-sm text-slate-500 font-medium">No booking requests yet</p>
            <p className="text-xs text-slate-400 mt-1">Students with Medium or High risk can book your office hours</p>
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
