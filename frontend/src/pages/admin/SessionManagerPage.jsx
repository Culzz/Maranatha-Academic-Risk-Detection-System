/**
 * SessionManagerPage — Academic session management
 * G7: Create + activate academic sessions for the university calendar.
 * API: GET/POST /admin/academic-sessions, PATCH /admin/academic-sessions/{id}/activate
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar, Plus, CheckCircle, RefreshCw, AlertCircle, Zap, AlertTriangle,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api, timetableApi } from "../../services/api";
import DatePicker from "../../components/ui/DatePicker";
import CustomDropdown from "../../components/ui/CustomDropdown";

function formatDate(dt) {
  if (!dt) return "—";
  try { return new Date(dt).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return dt; }
}

export default function SessionManagerPage() {
  const { token } = useAuth();
  const [sessions,  setSessions]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState("");
  const [success,   setSuccess]   = useState("");
  const [activating, setActivating] = useState(null);
  const [showForm,  setShowForm]  = useState(false);
  const [creating,  setCreating]  = useState(false);
  const [form, setForm] = useState({ session_label: "", semester: 1, start_date: "", end_date: "" });
  const [importingHolidays, setImportingHolidays] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleImportHolidays = async (sessionId) => {
    setImportingHolidays(true); setError(""); setSuccess("");
    try {
      const result = await timetableApi.importPublicHolidays(sessionId, token);
      setSuccess(result.message || `Imported ${result.inserted} holidays.`);
    } catch (err) {
      setError(err.message || "Failed to import holidays.");
    } finally {
      setImportingHolidays(false);
    }
  };

  const fetchSessions = async () => {
    setLoading(true); setError("");
    try {
      const data = await api.get("/admin/academic-sessions", { token });
      setSessions(Array.isArray(data) ? data : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchSessions(); }, [token]);

  const createSession = async () => {
    if (!form.session_label.trim() || !form.start_date || !form.end_date) {
      setError("All fields are required."); return;
    }
    setCreating(true); setError(""); setSuccess("");
    try {
      await api.post("/admin/academic-sessions", {
        session_label: form.session_label.trim(),
        semester:      Number(form.semester),
        start_date:    form.start_date,
        end_date:      form.end_date,
      }, { token });
      setSuccess("Session created.");
      setForm({ session_label: "", semester: 1, start_date: "", end_date: "" });
      setShowForm(false);
      fetchSessions();
    } catch (e) { setError(e.message); }
    finally { setCreating(false); }
  };

  const activateSession = async (id) => {
    setActivating(id); setError(""); setSuccess("");
    try {
      await api.patch(`/admin/academic-sessions/${id}/activate`, {}, { token });
      setSuccess("Session activated.");
      fetchSessions();
    } catch (e) { setError(e.message); }
    finally { setActivating(null); }
  };

  const inputCls = "w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:ring-2 focus:ring-accent/15 focus:border-accent/40 placeholder:text-slate-400";

  const clearAllSessions = async () => {
    if (!window.confirm("Delete ALL academic sessions? This cannot be undone.")) return;
    setClearing(true); setError(""); setSuccess("");
    try {
      const result = await api.delete("/admin/academic-sessions/clear", { token });
      setSuccess(result.message || "All sessions cleared.");
      fetchSessions();
    } catch (e) { setError(e.message); }
    finally { setClearing(false); }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Academic Sessions</h1>
          <p className="text-lg text-slate-500">Manage and activate university academic sessions</p>
        </div>
        <div className="flex items-center gap-2">
          <motion.button whileTap={{ scale: 0.96 }}
            onClick={clearAllSessions}
            disabled={clearing}
            className="flex items-center gap-2 bg-red-500 text-white text-sm font-semibold px-4 h-10 rounded-xl transition-all hover:bg-red-600 disabled:opacity-50">
            {clearing ? <RefreshCw size={14} className="animate-spin" /> : <AlertTriangle size={14} />} Clear All
          </motion.button>
          <motion.button whileTap={{ scale: 0.96 }}
            onClick={() => setShowForm(v => !v)}
            className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-4 h-10 rounded-xl transition-all hover:bg-primary/90">
            <Plus size={14} /> New Session
          </motion.button>
        </div>
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {error && (
          <motion.div key="err" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
        {success && (
          <motion.div key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
            <CheckCircle size={14} /> {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create form */}
      <AnimatePresence>
        {showForm && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
            <h2 className="font-serif text-xl font-bold text-slate-900">Create New Session</h2>
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div className="sm:col-span-2">
                <label htmlFor="session-label" className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wide">Session Label</label>
                <input id="session-label" name="session_label" placeholder="e.g. 2025/2026 Semester 1"
                  value={form.session_label} onChange={e => setForm(p => ({ ...p, session_label: e.target.value }))}
                  className={inputCls} />
              </div>
              <div>
                <CustomDropdown
                  label="Semester"
                  value={form.semester}
                  onChange={(val) => setForm(p => ({ ...p, semester: val }))}
                  options={[
                    { value: 1, label: "Semester 1" },
                    { value: 2, label: "Semester 2" },
                  ]}
                />
              </div>
              <div>
                <DatePicker
                  label="Start Date"
                  value={form.start_date}
                  onChange={(val) => setForm(p => ({ ...p, start_date: val }))}
                />
              </div>
              <div>
                <DatePicker
                  label="End Date"
                  value={form.end_date}
                  onChange={(val) => setForm(p => ({ ...p, end_date: val }))}
                />
              </div>
            </div>
            <div className="flex gap-3">
              <motion.button whileTap={{ scale: 0.97 }} onClick={createSession} disabled={creating}
                className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 h-9 rounded-xl disabled:opacity-50">
                {creating ? <RefreshCw size={13} className="animate-spin" /> : <Plus size={13} />}
                Create
              </motion.button>
              <button onClick={() => setShowForm(false)}
                className="text-sm text-slate-500 px-4 h-9 rounded-xl hover:bg-slate-100 transition-all">
                Cancel
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Sessions list */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : sessions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Calendar size={28} className="mb-3 opacity-30" />
            <p className="text-sm">No academic sessions created yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="ds-table w-full">
              <thead>
                <tr>
                  <th className="text-left">Session</th>
                  <th className="text-left hidden sm:table-cell">Start</th>
                  <th className="text-left hidden sm:table-cell">End</th>
                  <th className="text-left hidden md:table-cell">Calendar</th>
                  <th className="text-center">Status</th>
                  <th className="text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map(s => (
                  <tr key={s.id}>
                    <td className="font-semibold text-slate-900">{s.session_label}</td>
                    <td className="text-slate-500 text-sm hidden sm:table-cell">{formatDate(s.start_date)}</td>
                    <td className="text-slate-500 text-sm hidden sm:table-cell">{formatDate(s.end_date)}</td>
                    <td className="hidden md:table-cell">
                      {s.calendar_coherent === null ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                          <Calendar size={11} /> No calendar
                        </span>
                      ) : s.calendar_coherent ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                          <CheckCircle size={11} /> Aligned
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-semibold"
                          title={`Calendar resumption: ${formatDate(s.resumption_event_date)}`}>
                          <AlertTriangle size={11} />
                          Mismatch — calendar says {formatDate(s.resumption_event_date)}
                        </span>
                      )}
                    </td>
                    <td className="text-center">
                      {s.is_active
                        ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                            <CheckCircle size={12} /> Active
                          </span>
                        : <span className="text-xs text-slate-400 font-semibold">Inactive</span>
                      }
                    </td>
                    <td className="text-right">
                      {!s.is_active && (
                        <motion.button whileTap={{ scale: 0.95 }}
                          onClick={() => activateSession(s.id)}
                          disabled={activating === s.id}
                          className="flex items-center gap-1.5 ml-auto text-xs font-semibold px-3 py-1.5 rounded-lg border border-emerald-200 text-emerald-700 hover:bg-emerald-50 transition-all disabled:opacity-40">
                          {activating === s.id
                            ? <RefreshCw size={11} className="animate-spin" />
                            : <Zap size={11} />}
                          Activate
                        </motion.button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Calendar coherence guide */}
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-5 py-4 text-sm text-amber-800 space-y-1">
        <p className="font-semibold flex items-center gap-2"><AlertTriangle size={13} /> Calendar Alignment Guide</p>
        <p>Upload the academic calendar in <strong>Timetable → Academic Calendar</strong> first, then set the session start date to match the resumption date shown in the calendar. The system will flag any mismatch above.</p>
        <p className="text-xs text-amber-600">Week 1 begins on the session start date. Break and holiday periods are automatically excluded from week counts.</p>
      </div>

      {/* Import public holidays */}
      {sessions.find(s => s.is_active) && (
        <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-5 py-3">
          <Calendar size={15} className="text-slate-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-700">Nigerian Public Holidays</p>
            <p className="text-xs text-slate-400">Auto-import from Nager.Date API into the active session calendar</p>
          </div>
          <button
            onClick={() => handleImportHolidays(sessions.find(s => s.is_active)?.id)}
            disabled={importingHolidays}
            className="px-4 py-1.5 bg-primary text-white text-xs font-semibold rounded-lg hover:opacity-90 transition disabled:opacity-50"
          >
            {importingHolidays ? "Importing..." : "Import Holidays"}
          </button>
        </div>
      )}
    </div>
  );
}
