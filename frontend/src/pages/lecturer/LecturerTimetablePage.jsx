/**
 * LecturerTimetablePage — View class timetable (own courses),
 * exam timetable (invigilator assignments), and academic calendar.
 */
import { useEffect, useState } from "react";
import {
  CalendarDays, Loader2, AlertCircle, FileText, Calendar,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { timetableApi } from "../../services/api";
import WeeklyGrid from "../../components/timetable/WeeklyGrid";
import ExamCalendar from "../../components/timetable/ExamCalendar";
import AcademicCalendarView from "../../components/calendar/AcademicCalendarView";

export default function LecturerTimetablePage() {
  const { token } = useAuth();
  const [classEntries, setClassEntries] = useState([]);
  const [examEntries, setExamEntries] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      timetableApi.getMyClassTimetable(token).catch(() => []),
      timetableApi.getMyExamTimetable(token).catch(() => []),
      timetableApi.getCalendarEvents(token).catch(() => []),
    ]).then(([cls, exam, cal]) => {
      if (cancelled) return;
      setClassEntries(Array.isArray(cls) ? cls : []);
      setExamEntries(Array.isArray(exam) ? exam : []);
      setCalendarEvents(Array.isArray(cal) ? cal : []);
    }).catch(e => {
      if (!cancelled) setError(e.message);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={24} className="animate-spin text-accent" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">My Timetable</h1>
        <p className="text-base text-slate-500">Your teaching schedule, exam invigilation, and academic calendar</p>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Teaching Schedule */}
      <section>
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <CalendarDays size={20} className="text-accent" />
          Teaching Schedule
        </h2>
        {classEntries.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <CalendarDays size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">No teaching schedule has been published yet</p>
          </div>
        ) : (
          <WeeklyGrid entries={classEntries} isAdmin={false} />
        )}
      </section>

      {/* Exam Invigilation */}
      <section>
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <FileText size={20} className="text-accent" />
          Exam Invigilation
        </h2>
        {examEntries.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <FileText size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">No exam invigilation assignments yet</p>
          </div>
        ) : (
          <ExamCalendar entries={examEntries} />
        )}
      </section>

      {/* Academic Calendar */}
      <section>
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-4 flex items-center gap-2">
          <Calendar size={20} className="text-accent" />
          Academic Calendar
        </h2>
        {calendarEvents.length === 0 ? (
          <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
            <Calendar size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-slate-500">No academic calendar events published yet</p>
          </div>
        ) : (
          <AcademicCalendarView events={calendarEvents} />
        )}
      </section>
    </div>
  );
}
