/**
 * AcademicCalendarView — full monthly wall-calendar grid with event dots.
 * events: [{ event_date, event_date_end?, event_label, event_type, semester }]
 * event_type: resumption | lectures | exam | break | service | other
 */
import { useState, useMemo } from "react";
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  eachDayOfInterval, format, isSameMonth, isToday,
  isSameDay, parseISO, addMonths, subMonths, setMonth, setYear,
} from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";

const TYPE_STYLES = {
  resumption: { dot: "bg-green-500",  badge: "bg-green-50 border-green-200 text-green-800",   icon: "🏫" },
  lectures:   { dot: "bg-blue-500",   badge: "bg-blue-50 border-blue-200 text-blue-800",      icon: "📚" },
  exam:       { dot: "bg-red-500",    badge: "bg-red-50 border-red-200 text-red-800",          icon: "📝" },
  break:      { dot: "bg-orange-400", badge: "bg-orange-50 border-orange-200 text-orange-800", icon: "🌴" },
  service:    { dot: "bg-purple-500", badge: "bg-purple-50 border-purple-200 text-purple-800", icon: "⛪" },
  other:      { dot: "bg-slate-400",  badge: "bg-slate-50 border-slate-200 text-slate-700",    icon: "📌" },
};

export default function AcademicCalendarView({ events = [] }) {
  const [current, setCurrent] = useState(new Date());
  const [selected, setSelected] = useState(null);

  const MONTHS = useMemo(() => [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ], []);

  const currentYear = current.getFullYear();
  const yearRange = useMemo(() => {
    const years = [];
    for (let y = currentYear - 5; y <= currentYear + 5; y++) years.push(y);
    return years;
  }, [currentYear]);

  const monthStart = startOfMonth(current);
  const monthEnd   = endOfMonth(current);
  const gridStart  = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd    = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days       = eachDayOfInterval({ start: gridStart, end: gridEnd });

  function eventsForDay(day) {
    return events.filter(e => {
      if (!e.event_date) return false;
      try { return isSameDay(parseISO(e.event_date), day); } catch { return false; }
    });
  }

  const selectedEvents = selected ? eventsForDay(selected) : [];

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Month nav */}
      <div className="flex items-center justify-between px-4 sm:px-6 py-4 border-b border-slate-100 bg-primary gap-2">
        <button
          onClick={() => setCurrent(subMonths(current, 1))}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
        >
          <ChevronLeft size={16} />
        </button>
        <div className="flex items-center gap-2">
          <select
            value={current.getMonth()}
            onChange={(e) => setCurrent(setMonth(current, Number(e.target.value)))}
            className="bg-white/10 text-white font-serif font-bold text-sm sm:text-base rounded-xl px-3 py-2 border border-white/20 outline-none hover:bg-white/20 transition-colors cursor-pointer appearance-none"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i} className="text-slate-900 bg-white">{m}</option>
            ))}
          </select>
          <select
            value={current.getFullYear()}
            onChange={(e) => setCurrent(setYear(current, Number(e.target.value)))}
            className="bg-white/10 text-white font-serif font-bold text-sm sm:text-base rounded-xl px-3 py-2 border border-white/20 outline-none hover:bg-white/20 transition-colors cursor-pointer appearance-none"
          >
            {yearRange.map((y) => (
              <option key={y} value={y} className="text-slate-900 bg-white">{y}</option>
            ))}
          </select>
        </div>
        <button
          onClick={() => setCurrent(addMonths(current, 1))}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 text-white transition-colors flex-shrink-0"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(d => (
          <div key={d} className="py-2 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const dayEvents  = eventsForDay(day);
          const isCurrentM = isSameMonth(day, current);
          const isTodayDay = isToday(day);
          const isSelected = selected && isSameDay(day, selected);
          return (
            <button
              key={i}
              onClick={() => setSelected(isSelected ? null : day)}
              className={[
                "min-h-[72px] p-2 border-r border-b border-slate-100 text-left transition-colors",
                "flex flex-col gap-1 hover:bg-slate-50 focus:outline-none",
                !isCurrentM ? "bg-slate-50/50" : "",
                isSelected ? "bg-accent/5 ring-1 ring-inset ring-accent/20" : "",
              ].join(" ")}
            >
              <span className={[
                "w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold self-start",
                isTodayDay  ? "bg-accent text-white" : "",
                !isCurrentM ? "text-slate-300" : "text-slate-700",
              ].join(" ")}>
                {format(day, "d")}
              </span>
              <div className="flex flex-wrap gap-0.5">
                {dayEvents.slice(0, 3).map((e, ei) => {
                  const style = TYPE_STYLES[e.event_type] || TYPE_STYLES.other;
                  return (
                    <span key={ei} className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} title={e.event_label} />
                  );
                })}
                {dayEvents.length > 3 && (
                  <span className="text-[9px] text-slate-400 font-bold">+{dayEvents.length - 3}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day event panel */}
      {selected && (
        <div className="border-t border-slate-100 bg-slate-50 px-6 py-4">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">
            {format(selected, "EEEE, d MMMM yyyy")}
          </p>
          {selectedEvents.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No events</p>
          ) : (
            <div className="space-y-2">
              {selectedEvents.map((e, i) => {
                const style = TYPE_STYLES[e.event_type] || TYPE_STYLES.other;
                return (
                  <div key={i} className={`flex items-start gap-3 px-3 py-2.5 rounded-xl border ${style.badge}`}>
                    <span className="text-base flex-shrink-0">{style.icon}</span>
                    <div>
                      <p className="text-sm font-semibold leading-tight">{e.event_label}</p>
                      {e.semester && <p className="text-xs opacity-70 mt-0.5">{e.semester} Semester</p>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className="border-t border-slate-100 px-6 py-3 flex flex-wrap gap-4">
        {Object.entries(TYPE_STYLES).map(([type, style]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
            <span className="text-xs text-slate-500 capitalize">{type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
