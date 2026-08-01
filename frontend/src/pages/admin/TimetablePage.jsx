/**
 * Admin TimetablePage — Tabbed UI for managing:
 *  1. Class Timetable (DOCX upload + grid view)
 *  2. Exam Timetable (DOCX upload + table view)
 *  3. Academic Calendar (upload + event list)
 *  4. Results Upload (XLSX upload + summary)
 *  5. Manual Schedule (existing functionality)
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Clock, Calendar, Plus, Trash2, AlertCircle, BookOpen, MapPin,
  Upload, FileText, GraduationCap, CalendarDays, ChevronRight,
  Loader2, CheckCircle, X,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi, scheduleApi, timetableApi, resultsApi } from "../../services/api";
import CustomDropdown from "../../components/ui/CustomDropdown";
import DatePicker from "../../components/ui/DatePicker";
import TimePicker from "../../components/ui/TimePicker";
import WeeklyGrid from "../../components/timetable/WeeklyGrid";
import ExamCalendar from "../../components/timetable/ExamCalendar";
import AcademicCalendarView from "../../components/calendar/AcademicCalendarView";
import UploadConfirmModal from "../../components/shared/UploadConfirmModal";
import useUploadConfirm from "../../hooks/useUploadConfirm";

const TABS = [
  { key: "class", label: "Class Timetable", icon: CalendarDays },
  { key: "exam", label: "Exam Timetable", icon: FileText },
  { key: "calendar", label: "Academic Calendar", icon: Calendar },
  { key: "results", label: "Results Upload", icon: GraduationCap },
  { key: "manual", label: "Manual Schedule", icon: Clock },
];

const DAYS_ORDER = ["MON", "TUE", "WED", "THURS", "FRI"];
const DAYS_FULL = { MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THURS: "Thursday", FRI: "Friday" };

const DAY_COLORS = {
  MON: "bg-blue-50 text-blue-700 border-blue-200",
  TUE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  WED: "bg-amber-50 text-amber-700 border-amber-200",
  THURS: "bg-purple-50 text-purple-700 border-purple-200",
  FRI: "bg-rose-50 text-rose-700 border-rose-200",
};

const inputCls =
  "w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none " +
  "focus:ring-2 focus:ring-accent/15 focus:border-accent/40 placeholder:text-slate-400";

export default function TimetablePage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState("class");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">
          Timetable & Results Management
        </h1>
        <p className="text-base text-slate-500">
          Upload timetables, manage the academic calendar, and publish student results
        </p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white border border-slate-200 rounded-xl p-1 overflow-x-auto">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setError(""); setSuccess(""); }}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
                isActive
                  ? "bg-accent text-white shadow-sm"
                  : "text-slate-500 hover:text-slate-700 hover:bg-slate-50"
              }`}
            >
              <Icon size={15} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Feedback */}
      <AnimatePresence>
        {success && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
            <CheckCircle size={14} /> {success}
            <button onClick={() => setSuccess("")} className="ml-auto"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
            <AlertCircle size={14} /> {error}
            <button onClick={() => setError("")} className="ml-auto"><X size={14} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tab Content */}
      {activeTab === "class" && <ClassTimetableTab token={token} setError={setError} setSuccess={setSuccess} />}
      {activeTab === "exam" && <ExamTimetableTab token={token} setError={setError} setSuccess={setSuccess} />}
      {activeTab === "calendar" && <CalendarTab token={token} setError={setError} setSuccess={setSuccess} />}
      {activeTab === "results" && <ResultsTab token={token} setError={setError} setSuccess={setSuccess} />}
      {activeTab === "manual" && <ManualScheduleTab token={token} setError={setError} setSuccess={setSuccess} />}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CLASS TIMETABLE TAB
   ═══════════════════════════════════════════════════════════ */
function ClassTimetableTab({ token, setError, setSuccess }) {
  const uc = useUploadConfirm();
  const [uploadResult, setUploadResult] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    adminApi.getAcademicSessions(token).then(s => {
      setSessions(Array.isArray(s) ? s : []);
      const active = (Array.isArray(s) ? s : []).find(x => x.is_active);
      if (active) setSessionId(String(active.id));
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    setLoading(true);
    timetableApi.getAdminClassTimetable(token).then(data => {
      setEntries(Array.isArray(data) ? data : []);
    }).catch(() => setEntries([])).finally(() => setLoading(false));
  }, [token]);

  const handleConfirm = () => {
    if (!sessionId) { setError("Select an academic session first."); uc.cancelUpload(); return; }
    uc.confirmUpload(async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("session_id", sessionId);
      const result = await timetableApi.uploadClassTimetable(fd, token);
      setUploadResult(result);
      setSuccess(`${result.inserted} timetable entries created.`);
      const data = await timetableApi.getAdminClassTimetable(token);
      setEntries(Array.isArray(data) ? data : []);
    }).catch(err => setError(err.message));
  };

  const handleDelete = async (id) => {
    try {
      await timetableApi.deleteClassEntry(id, token);
      setEntries(prev => prev.filter(e => e.id !== id));
      setSuccess("Entry deleted.");
    } catch (err) { setError(err.message); }
  };

  // Group entries by day
  const grouped = {};
  for (const day of DAYS_ORDER) grouped[day] = [];
  entries.forEach(e => {
    if (grouped[e.day_of_week]) grouped[e.day_of_week].push(e);
    else grouped[e.day_of_week] = [e];
  });

  return (
    <div className="space-y-6">
      {/* Upload Card */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Upload Class Timetable</h2>
        <p className="text-sm text-slate-400 mb-4">Upload a DOCX file containing the lecture timetable</p>
        <div className="flex items-center gap-4 flex-wrap">
          {sessions.length > 0 && (
            <CustomDropdown
              label="Academic Session"
              value={sessionId}
              onChange={setSessionId}
              options={sessions.map(s => ({ value: String(s.id), label: s.session_label }))}
              placeholder="Select session"
            />
          )}
          <label className={`inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-accent text-white hover:opacity-90`}>
            <Upload size={15} />
            Choose DOCX File
            <input type="file" accept=".docx,.doc" className="hidden" onChange={uc.selectFile} />
          </label>
        </div>
        {uploadResult && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg text-sm space-y-1">
            <p><strong>{uploadResult.inserted}</strong> entries inserted</p>
            {uploadResult.unmatched_courses?.length > 0 && (
              <p className="text-amber-600">Unmatched courses: {uploadResult.unmatched_courses.join(", ")}</p>
            )}
            {uploadResult.unmatched_lecturers?.length > 0 && (
              <p className="text-amber-600">Unmatched lecturers: {uploadResult.unmatched_lecturers.join(", ")}</p>
            )}
          </div>
        )}
      </div>

      {/* Timetable Grid */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-serif text-lg font-bold text-slate-900">Class Timetable Grid</h2>
          <p className="text-sm text-slate-400">{entries.length} entries total</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-accent" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <CalendarDays size={24} className="mb-2 opacity-40" />
            <p className="text-sm">No class timetable entries yet</p>
          </div>
        ) : (
          <div className="p-4">
            <WeeklyGrid entries={entries} isAdmin onDelete={handleDelete} />
          </div>
        )}
      </div>
      {uc.pendingFile && (
        <UploadConfirmModal file={uc.pendingFile} onConfirm={handleConfirm} onCancel={uc.cancelUpload}
          uploading={uc.uploading} progress={uc.progress} title="Upload Class Timetable"
          description="This DOCX file will be parsed to create timetable entries." />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   EXAM TIMETABLE TAB
   ═══════════════════════════════════════════════════════════ */
function ExamTimetableTab({ token, setError, setSuccess }) {
  const uc = useUploadConfirm();
  const [uploadResult, setUploadResult] = useState(null);
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");

  useEffect(() => {
    adminApi.getAcademicSessions(token).then(s => {
      setSessions(Array.isArray(s) ? s : []);
      const active = (Array.isArray(s) ? s : []).find(x => x.is_active);
      if (active) setSessionId(String(active.id));
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    setLoading(true);
    timetableApi.getMyExamTimetable(token).then(data => {
      setEntries(Array.isArray(data) ? data : []);
    }).catch(() => setEntries([])).finally(() => setLoading(false));
  }, [token]);

  const handleConfirm = () => {
    if (!sessionId) { setError("Select an academic session first."); uc.cancelUpload(); return; }
    uc.confirmUpload(async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("session_id", sessionId);
      const result = await timetableApi.uploadExamTimetable(fd, token);
      setUploadResult(result);
      setSuccess(`${result.inserted} exam timetable entries created.`);
      const data = await timetableApi.getMyExamTimetable(token);
      setEntries(Array.isArray(data) ? data : []);
    }).catch(err => setError(err.message));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Upload Exam Timetable</h2>
        <p className="text-sm text-slate-400 mb-4">Upload a DOCX file with the exam schedule</p>
        <div className="flex items-center gap-4 flex-wrap">
          {sessions.length > 0 && (
            <CustomDropdown label="Academic Session" value={sessionId} onChange={setSessionId}
              options={sessions.map(s => ({ value: String(s.id), label: s.session_label }))} />
          )}
          <label className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-accent text-white hover:opacity-90">
            <Upload size={15} />
            Choose DOCX File
            <input type="file" accept=".docx,.doc" className="hidden" onChange={uc.selectFile} />
          </label>
        </div>
        {uploadResult && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg text-sm">
            <p><strong>{uploadResult.inserted}</strong> exam entries inserted</p>
          </div>
        )}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200">
          <h2 className="font-serif text-lg font-bold text-slate-900">Exam Timetable</h2>
        </div>
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <Loader2 size={20} className="animate-spin text-accent" />
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <FileText size={24} className="mb-2 opacity-40" />
            <p className="text-sm">No exam timetable entries yet</p>
          </div>
        ) : (
          <div className="p-4">
            <ExamCalendar entries={entries} />
          </div>
        )}
      </div>
      {uc.pendingFile && (
        <UploadConfirmModal file={uc.pendingFile} onConfirm={handleConfirm} onCancel={uc.cancelUpload}
          uploading={uc.uploading} progress={uc.progress} title="Upload Exam Timetable"
          description="This DOCX file will be parsed to create exam schedule entries." />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ACADEMIC CALENDAR TAB
   ═══════════════════════════════════════════════════════════ */
function CalendarTab({ token, setError, setSuccess }) {
  const uc = useUploadConfirm();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [calendarText, setCalendarText] = useState("");
  const [textUploading, setTextUploading] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const [newEvent, setNewEvent] = useState({ event_label: "", event_type: "other", event_date: "", semester: "FIRST" });

  useEffect(() => {
    adminApi.getAcademicSessions(token).then(s => {
      setSessions(Array.isArray(s) ? s : []);
      const active = (Array.isArray(s) ? s : []).find(x => x.is_active);
      if (active) setSessionId(String(active.id));
    }).catch(() => {});
  }, [token]);

  const loadEvents = () => {
    setLoading(true);
    timetableApi.getCalendarEvents(token).then(data => {
      setEvents(Array.isArray(data) ? data : []);
    }).catch(() => setEvents([])).finally(() => setLoading(false));
  };

  useEffect(loadEvents, [token]);

  const handleConfirmCalendar = () => {
    if (!sessionId) { setError("Select an academic session first."); uc.cancelUpload(); return; }
    uc.confirmUpload(async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("session_id", sessionId);
      if (calendarText) fd.append("calendar_text", calendarText);
      const result = await timetableApi.uploadCalendar(fd, token);
      let msg = `${result.inserted} calendar events extracted.`;
      if (result.sessions_created?.length) {
        const labels = result.sessions_created.map(s => `Semester ${s.semester} (${s.start} to ${s.end})`).join(", ");
        msg += ` Sessions auto-created: ${labels}.`;
        // Refresh sessions list
        adminApi.getAcademicSessions(token).then(s => {
          setSessions(Array.isArray(s) ? s : []);
          const active = (Array.isArray(s) ? s : []).find(x => x.is_active);
          if (active) setSessionId(String(active.id));
        }).catch(() => {});
      }
      setSuccess(msg);
      loadEvents();
    }).catch(err => setError(err.message));
  };

  const handleTextUpload = async () => {
    if (!calendarText.trim()) { setError("Enter calendar text."); return; }
    if (!sessionId) { setError("Select a session."); return; }
    setTextUploading(true);
    try {
      const fd = new FormData();
      fd.append("session_id", sessionId);
      fd.append("calendar_text", calendarText);
      const result = await timetableApi.uploadCalendar(fd, token);
      let msg = `${result.inserted} calendar events extracted.`;
      if (result.sessions_created?.length) {
        const labels = result.sessions_created.map(s => `Semester ${s.semester} (${s.start} to ${s.end})`).join(", ");
        msg += ` Sessions auto-created: ${labels}.`;
        adminApi.getAcademicSessions(token).then(s => {
          setSessions(Array.isArray(s) ? s : []);
          const active = (Array.isArray(s) ? s : []).find(x => x.is_active);
          if (active) setSessionId(String(active.id));
        }).catch(() => {});
      }
      setSuccess(msg);
      setCalendarText("");
      loadEvents();
    } catch (err) { setError(err.message); }
    finally { setTextUploading(false); }
  };

  const handleAddEvent = async () => {
    try {
      await timetableApi.addCalendarEvent(newEvent, token);
      setSuccess("Event added.");
      setNewEvent({ event_label: "", event_type: "other", event_date: "", semester: "FIRST" });
      setAddingEvent(false);
      loadEvents();
    } catch (err) { setError(err.message); }
  };

  const handleDeleteEvent = async (id) => {
    try {
      await timetableApi.deleteCalendarEvent(id, token);
      setEvents(prev => prev.filter(e => e.id !== id));
      setSuccess("Event deleted.");
    } catch (err) { setError(err.message); }
  };

  const TYPE_COLORS = {
    resumption: "bg-green-100 text-green-700",
    exam: "bg-red-100 text-red-700",
    break: "bg-orange-100 text-orange-700",
    service: "bg-purple-100 text-purple-700",
    lectures: "bg-blue-100 text-blue-700",
    other: "bg-slate-100 text-slate-600",
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
        <h2 className="font-serif text-xl font-bold text-slate-900">Upload Academic Calendar</h2>
        <p className="text-sm text-slate-400">Upload a PDF or paste the calendar text</p>
        <div className="flex items-center gap-4 flex-wrap">
          {sessions.length > 0 && (
            <CustomDropdown label="Academic Session" value={sessionId} onChange={setSessionId}
              options={sessions.map(s => ({ value: String(s.id), label: s.session_label }))} />
          )}
          <label className={`inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold cursor-pointer transition-all ${
            "bg-accent text-white hover:opacity-90"}`}>
            <Upload size={15} />
            Upload Calendar
            <input type="file" accept=".pdf,.docx,.txt,.jpg,.jpeg,.png,.webp" className="hidden" onChange={uc.selectFile} />
          </label>
        </div>
        <div>
          <label className="block text-xs font-semibold text-slate-600 mb-1.5">Or Paste Calendar Text</label>
          <textarea value={calendarText} onChange={e => setCalendarText(e.target.value)}
            className="w-full h-32 bg-white border border-slate-200 rounded-xl text-sm p-3 outline-none focus:ring-2 focus:ring-accent/15 resize-none"
            placeholder="September: Saturday 5th — Resumption of fresh students&#10;October: Monday 7th — Commencement of lectures..." />
          <button onClick={handleTextUpload} disabled={textUploading || !calendarText.trim()}
            className="mt-2 inline-flex items-center gap-2 h-9 px-4 bg-accent text-white text-sm font-semibold rounded-xl disabled:opacity-50">
            {textUploading ? <Loader2 size={15} className="animate-spin" /> : null}
            Parse Text
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-bold text-slate-900">Calendar Events</h2>
            <p className="text-sm text-slate-400">{events.length} events</p>
          </div>
          <button onClick={() => setAddingEvent(true)}
            className="inline-flex items-center gap-1.5 h-8 px-3 bg-accent text-white text-xs font-semibold rounded-lg">
            <Plus size={13} /> Add Event
          </button>
        </div>

        {addingEvent && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100 space-y-3">
            <input value={newEvent.event_label} onChange={e => setNewEvent(p => ({ ...p, event_label: e.target.value }))}
              placeholder="Event description" className={inputCls} />
            <div className="flex gap-3 flex-wrap">
              <DatePicker
                label="Event Date"
                value={newEvent.event_date}
                onChange={(val) => setNewEvent(p => ({ ...p, event_date: val }))}
                className="max-w-[220px]"
              />
              <select value={newEvent.event_type} onChange={e => setNewEvent(p => ({ ...p, event_type: e.target.value }))}
                className={inputCls + " max-w-[150px]"}>
                <option value="resumption">Resumption</option>
                <option value="lectures">Lectures</option>
                <option value="exam">Exam</option>
                <option value="break">Break</option>
                <option value="service">Service</option>
                <option value="other">Other</option>
              </select>
              <select value={newEvent.semester} onChange={e => setNewEvent(p => ({ ...p, semester: e.target.value }))}
                className={inputCls + " max-w-[150px]"}>
                <option value="FIRST">First Semester</option>
                <option value="SECOND">Second Semester</option>
              </select>
            </div>
            <div className="flex gap-2">
              <button onClick={handleAddEvent} className="h-8 px-4 bg-accent text-white text-xs font-semibold rounded-lg">Save</button>
              <button onClick={() => setAddingEvent(false)} className="h-8 px-4 bg-slate-200 text-slate-600 text-xs font-semibold rounded-lg">Cancel</button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center h-40"><Loader2 size={20} className="animate-spin text-accent" /></div>
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-slate-400">
            <Calendar size={24} className="mb-2 opacity-40" />
            <p className="text-sm">No calendar events yet</p>
          </div>
        ) : (
          <div className="p-4">
            <AcademicCalendarView events={events} />
          </div>
        )}
      </div>
      {uc.pendingFile && (
        <UploadConfirmModal file={uc.pendingFile} onConfirm={handleConfirmCalendar} onCancel={uc.cancelUpload}
          uploading={uc.uploading} progress={uc.progress} title="Upload Academic Calendar"
          description="This file will be parsed to extract calendar events." />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   RESULTS UPLOAD TAB
   ═══════════════════════════════════════════════════════════ */
function ResultsTab({ token, setError, setSuccess }) {
  const uc = useUploadConfirm();
  const [uploadResult, setUploadResult] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionId, setSessionId] = useState("");
  const [semester, setSemester] = useState("1ST");
  const [summary, setSummary] = useState(null);

  useEffect(() => {
    adminApi.getAcademicSessions(token).then(s => {
      setSessions(Array.isArray(s) ? s : []);
      const active = (Array.isArray(s) ? s : []).find(x => x.is_active);
      if (active) setSessionId(String(active.id));
    }).catch(() => {});
  }, [token]);

  useEffect(() => {
    resultsApi.getResultsSummary(token).then(setSummary).catch(() => {});
  }, [token, uploadResult]);

  const handleConfirm = () => {
    if (!sessionId) { setError("Select an academic session."); uc.cancelUpload(); return; }
    uc.confirmUpload(async (file) => {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("session_id", sessionId);
      fd.append("semester", semester);
      const result = await resultsApi.uploadResults(fd, token);
      setUploadResult(result);
      setSuccess(result.message);
    }).catch(err => setError(err.message));
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Upload Student Results</h2>
        <p className="text-sm text-slate-400 mb-4">Upload an XLSX file with student scores. The system will compute grades, SGPA, and CGPA automatically.</p>
        <div className="flex items-center gap-4 flex-wrap">
          {sessions.length > 0 && (
            <CustomDropdown label="Academic Session" value={sessionId} onChange={setSessionId}
              options={sessions.map(s => ({ value: String(s.id), label: s.session_label }))} />
          )}
          <CustomDropdown label="Semester" value={semester} onChange={setSemester}
            options={[{ value: "1ST", label: "1st Semester" }, { value: "2ND", label: "2nd Semester" }]} />
          <label className="inline-flex items-center gap-2 h-10 px-5 rounded-xl text-sm font-semibold cursor-pointer transition-all bg-accent text-white hover:opacity-90">
            <Upload size={15} />
            Upload XLSX
            <input type="file" accept=".xlsx,.xls" className="hidden" onChange={uc.selectFile} />
          </label>
        </div>

        {uploadResult && (
          <div className="mt-4 p-4 bg-slate-50 rounded-lg text-sm space-y-2">
            <p><strong>{uploadResult.matched}</strong> of <strong>{uploadResult.processed}</strong> students matched</p>
            {uploadResult.courses_found?.length > 0 && (
              <p>Courses found: {uploadResult.courses_found.join(", ")}</p>
            )}
            {uploadResult.unmatched_matric?.length > 0 && (
              <div>
                <p className="text-amber-600 font-medium">Unmatched matric numbers:</p>
                <p className="text-amber-600">{uploadResult.unmatched_matric.join(", ")}</p>
              </div>
            )}
          </div>
        )}
      </div>

      {summary && (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
          <h2 className="font-serif text-lg font-bold text-slate-900 mb-4">Results Summary</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-4">
            <div className="bg-slate-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-slate-900">{summary.total_students}</p>
              <p className="text-xs text-slate-500">Total Students</p>
            </div>
            <div className="bg-green-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-green-700">{summary.gs_count}</p>
              <p className="text-xs text-green-600">Good Standing</p>
            </div>
            <div className="bg-red-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-red-700">{summary.ngs_count}</p>
              <p className="text-xs text-red-600">Not in Good Standing</p>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold text-blue-700">{summary.departments?.length || 0}</p>
              <p className="text-xs text-blue-600">Departments</p>
            </div>
          </div>
          {summary.departments?.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Department</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Students</th>
                    <th className="text-left px-3 py-2 font-semibold text-slate-600">Avg CGPA</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {summary.departments.map((d, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">{d.department}</td>
                      <td className="px-3 py-2">{d.total_students}</td>
                      <td className="px-3 py-2 font-semibold">{d.avg_cgpa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {uc.pendingFile && (
        <UploadConfirmModal file={uc.pendingFile} onConfirm={handleConfirm} onCancel={uc.cancelUpload}
          uploading={uc.uploading} progress={uc.progress} title="Upload Student Results"
          description="This spreadsheet will be processed to compute grades, SGPA, and CGPA." />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MANUAL SCHEDULE TAB (preserved from old TimetablePage)
   ═══════════════════════════════════════════════════════════ */
function ManualScheduleTab({ token, setError, setSuccess }) {
  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
  const ENTRY_TYPES = ["lecture", "lab", "tutorial", "exam"];

  const [courses, setCourses] = useState([]);
  const [coursesLoading, setCoursesLoading] = useState(true);
  const [selectedCourse, setSelectedCourse] = useState("");
  const [entries, setEntries] = useState([]);
  const [entriesLoading, setEntriesLoading] = useState(false);
  const [form, setForm] = useState({ day_of_week: "Monday", start_time: "", end_time: "", venue: "", entry_type: "lecture", exam_date: "" });
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    setCoursesLoading(true);
    adminApi.getCourses(token).then(data => setCourses(Array.isArray(data) ? data : []))
      .catch(() => setCourses([])).finally(() => setCoursesLoading(false));
  }, [token]);

  useEffect(() => {
    if (!selectedCourse) { setEntries([]); return; }
    setEntriesLoading(true);
    scheduleApi.getCourseSchedule(selectedCourse, token).then(data => {
      setEntries(Array.isArray(data) ? data : data?.entries || []);
    }).catch(() => setEntries([])).finally(() => setEntriesLoading(false));
  }, [selectedCourse, token]);

  const handleAdd = async () => {
    if (!selectedCourse) { setError("Select a course first."); return; }
    if (!form.start_time || !form.end_time) { setError("Start/end times required."); return; }
    setSubmitting(true);
    try {
      const payload = {
        course_id: selectedCourse,
        day_of_week: form.day_of_week,
        start_time: form.start_time,
        end_time: form.end_time,
        venue: form.venue.trim(),
        schedule_type: form.entry_type,
        entry_type: form.entry_type,
      };
      if (form.entry_type === "exam" && form.exam_date) payload.exam_date = form.exam_date;
      const created = await scheduleApi.createEntry(payload, token);
      setEntries(prev => [...prev, created]);
      setSuccess("Schedule entry added.");
      setForm({ day_of_week: "Monday", start_time: "", end_time: "", venue: "", entry_type: "lecture", exam_date: "" });
    } catch (e) { setError(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id) => {
    setDeleting(id);
    try { await scheduleApi.deleteEntry(id, token); setEntries(prev => prev.filter(e => e.id !== id)); setSuccess("Deleted."); }
    catch (e) { setError(e.message); }
    finally { setDeleting(null); }
  };

  const updateForm = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
        <label className="block text-sm font-semibold text-slate-700 mb-2">Select Course</label>
        {coursesLoading ? (
          <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={14} className="animate-spin" /> Loading...</div>
        ) : (
          <CustomDropdown label="Select Course" value={selectedCourse} onChange={val => { setSelectedCourse(val); }}
            options={courses.map(c => ({ value: String(c.id), label: `${c.course_code} — ${c.course_title}` }))} placeholder="-- Choose --" />
        )}
      </div>

      {selectedCourse && (
        <>
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200">
              <h2 className="font-serif text-lg font-bold text-slate-900">Current Schedule</h2>
            </div>
            {entriesLoading ? (
              <div className="flex items-center justify-center h-32"><Loader2 size={20} className="animate-spin text-accent" /></div>
            ) : entries.length === 0 ? (
              <div className="flex items-center justify-center h-32 text-slate-400 text-sm">No entries yet</div>
            ) : (
              <div className="divide-y divide-slate-100">
                {entries.map(e => (
                  <div key={e.id} className="px-6 py-3 flex items-center justify-between hover:bg-slate-50">
                    <div className="flex items-center gap-3 text-sm">
                      <span className="font-semibold text-slate-700">{e.day_of_week}</span>
                      <span className="text-slate-500">{e.start_time} – {e.end_time}</span>
                      {e.venue && <span className="text-slate-400">{e.venue}</span>}
                    </div>
                    <button onClick={() => handleDelete(e.id)} disabled={deleting === e.id}
                      className="text-slate-400 hover:text-red-500 p-1"><Trash2 size={14} /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
            <h2 className="font-serif text-lg font-bold text-slate-900">Add Entry</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <CustomDropdown label="Day" value={form.day_of_week} onChange={v => updateForm("day_of_week", v)}
                options={DAYS.map(d => ({ value: d, label: d }))} />
              <TimePicker label="Start Time" value={form.start_time} onChange={v => updateForm("start_time", v)} />
              <TimePicker label="End Time" value={form.end_time} onChange={v => updateForm("end_time", v)} />
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1.5">Venue</label>
                <input type="text" value={form.venue} onChange={e => updateForm("venue", e.target.value)} placeholder="e.g. LT 201" className={inputCls} />
              </div>
              <CustomDropdown label="Type" value={form.entry_type} onChange={v => updateForm("entry_type", v)}
                options={ENTRY_TYPES.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))} />
              {form.entry_type === "exam" && <DatePicker label="Exam Date" value={form.exam_date} onChange={v => updateForm("exam_date", v)} />}
            </div>
            <button onClick={handleAdd} disabled={submitting}
              className="inline-flex items-center gap-2 h-10 px-5 bg-accent text-white text-sm font-semibold rounded-xl disabled:opacity-50">
              {submitting ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              {submitting ? "Adding..." : "Add Entry"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
