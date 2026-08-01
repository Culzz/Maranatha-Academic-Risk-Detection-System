/**
 * WeeklyGrid — renders class timetable as a horizontal grid.
 * Rows = Days (Mon-Fri), Columns = Time slots.
 * Overlapping courses stack vertically with distinct color-coded cards.
 *
 * entries: [{ id, course_code, day_of_week, time_slot, start_time, end_time,
 *             venue, lecturer_name, lecturer_name_raw, entry_type }]
 */
import { motion } from "framer-motion";
import { formatCourseCode } from "../../utils/helpers";

const DAYS = [
  { key: "MON", label: "Monday" },
  { key: "TUE", label: "Tuesday" },
  { key: "WED", label: "Wednesday" },
  { key: "THURS", label: "Thursday" },
  { key: "FRI", label: "Friday" },
];

const SLOTS = [
  { key: "8am-10am", label: "8:00 - 10:00" },
  { key: "10am-12pm", label: "10:00 - 12:00" },
  { key: "12pm-1pm", label: "12:00 - 1:00", isBreak: true },
  { key: "1pm-3pm", label: "1:00 - 3:00" },
  { key: "3pm-5pm", label: "3:00 - 5:00" },
];

/** Color palette for distinguishing overlapping course cards */
const CARD_COLORS = [
  {
    bg: "bg-blue-50",
    border: "border-blue-200",
    hoverBg: "hover:bg-blue-100",
    code: "text-blue-900",
    sub: "text-blue-600",
    muted: "text-blue-500",
  },
  {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    hoverBg: "hover:bg-emerald-100",
    code: "text-emerald-900",
    sub: "text-emerald-600",
    muted: "text-emerald-500",
  },
  {
    bg: "bg-purple-50",
    border: "border-purple-200",
    hoverBg: "hover:bg-purple-100",
    code: "text-purple-900",
    sub: "text-purple-600",
    muted: "text-purple-500",
  },
  {
    bg: "bg-amber-50",
    border: "border-amber-200",
    hoverBg: "hover:bg-amber-100",
    code: "text-amber-900",
    sub: "text-amber-600",
    muted: "text-amber-500",
  },
  {
    bg: "bg-rose-50",
    border: "border-rose-200",
    hoverBg: "hover:bg-rose-100",
    code: "text-rose-900",
    sub: "text-rose-600",
    muted: "text-rose-500",
  },
  {
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    hoverBg: "hover:bg-indigo-100",
    code: "text-indigo-900",
    sub: "text-indigo-600",
    muted: "text-indigo-500",
  },
];

/** Normalize day_of_week values to short keys */
function normDay(d = "") {
  const map = {
    MONDAY: "MON",
    TUESDAY: "TUE",
    WEDNESDAY: "WED",
    THURSDAY: "THURS",
    FRIDAY: "FRI",
    MON: "MON",
    TUE: "TUE",
    WED: "WED",
    THURS: "THURS",
    FRI: "FRI",
  };
  const upper = d.toUpperCase().trim();
  return map[upper] || upper.slice(0, 5);
}

/**
 * Derive a slot key from start_time if time_slot is not present.
 * Handles formats like "08:00", "8:00", "8am", etc.
 */
function deriveSlotKey(entry) {
  if (entry.time_slot) return entry.time_slot;
  const st = entry.start_time;
  if (!st) return null;
  const hour = parseInt(st, 10);
  if (hour === 8) return "8am-10am";
  if (hour === 10) return "10am-12pm";
  if (hour === 12) return "12pm-1pm";
  if (hour === 13 || hour === 1) return "1pm-3pm";
  if (hour === 15 || hour === 3) return "3pm-5pm";
  return null;
}

/** Assign a stable color index per unique course_code */
function buildColorMap(entries) {
  const codes = [...new Set(entries.map((e) => e.course_code))];
  const map = {};
  codes.forEach((code, i) => {
    map[code] = CARD_COLORS[i % CARD_COLORS.length];
  });
  return map;
}

export default function WeeklyGrid({
  entries = [],
  onEdit,
  onDelete,
  isAdmin = false,
}) {
  // Build grid: grid[day][slot] = [entries]
  const grid = {};
  DAYS.forEach((d) => {
    grid[d.key] = {};
    SLOTS.forEach((s) => {
      grid[d.key][s.key] = [];
    });
  });

  entries.forEach((e) => {
    const day = normDay(e.day_of_week);
    const slot = deriveSlotKey(e);
    if (slot && grid[day] && grid[day][slot] !== undefined) {
      grid[day][slot].push(e);
    }
  });

  const colorMap = buildColorMap(entries);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white"
    >
      <table className="w-full min-w-[780px] border-collapse text-sm">
        {/* ── Header: Time slots as columns ── */}
        <thead>
          <tr className="bg-primary text-white">
            <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-widest w-28 border-r border-white/10">
              Day
            </th>
            {SLOTS.map((slot, i) => (
              <th
                key={slot.key}
                className={`py-3 px-3 text-center font-semibold text-xs uppercase tracking-widest border-r border-white/10 last:border-0 ${
                  slot.isBreak ? "bg-white/5" : ""
                }`}
              >
                {slot.isBreak ? "Break" : slot.label}
              </th>
            ))}
          </tr>
        </thead>

        {/* ── Body: Days as rows ── */}
        <tbody>
          {DAYS.map((day, di) => (
            <tr
              key={day.key}
              className={`border-t border-slate-100 ${
                di % 2 === 0 ? "bg-white" : "bg-slate-50/40"
              }`}
            >
              {/* Day label */}
              <td className="py-3 px-4 font-semibold text-slate-700 text-xs border-r border-slate-100 whitespace-nowrap align-top">
                <span className="inline-block mt-1">{day.label}</span>
              </td>

              {/* Slot cells */}
              {SLOTS.map((slot) => {
                if (slot.isBreak) {
                  return (
                    <td
                      key={slot.key}
                      className="py-3 px-2 text-center text-xs text-slate-400 font-medium italic border-r border-slate-100 last:border-0 bg-slate-50/60 align-middle"
                    >
                      BREAK
                    </td>
                  );
                }

                const cellEntries = grid[day.key][slot.key];

                return (
                  <td
                    key={slot.key}
                    className="py-2 px-2 border-r border-slate-100 last:border-0 align-top min-w-[140px]"
                  >
                    {cellEntries.length === 0 ? (
                      <span className="text-slate-200 text-xs select-none">
                        --
                      </span>
                    ) : (
                      <div className="space-y-1.5">
                        {cellEntries.map((e, idx) => {
                          const c =
                            colorMap[e.course_code] || CARD_COLORS[0];
                          return (
                            <motion.div
                              key={e.id ?? `${day.key}-${slot.key}-${idx}`}
                              initial={{ opacity: 0, scale: 0.95 }}
                              animate={{ opacity: 1, scale: 1 }}
                              transition={{
                                duration: 0.25,
                                delay: idx * 0.05,
                              }}
                              className={`group relative rounded-lg px-2.5 py-2 border transition-all cursor-default ${c.bg} ${c.border} ${c.hoverBg}`}
                            >
                              <p
                                className={`font-bold text-xs leading-tight ${c.code}`}
                              >
                                {formatCourseCode(e.course_code)}
                              </p>
                              {e.venue && (
                                <p
                                  className={`text-[10px] mt-0.5 ${c.sub}`}
                                >
                                  {e.venue}
                                </p>
                              )}
                              {(e.lecturer_name ||
                                e.lecturer_name_raw) && (
                                <p
                                  className={`text-[10px] truncate ${c.muted}`}
                                >
                                  {e.lecturer_name ||
                                    e.lecturer_name_raw}
                                </p>
                              )}

                              {/* Admin edit/delete controls */}
                              {isAdmin && (
                                <div className="absolute top-1 right-1 hidden group-hover:flex gap-1">
                                  {onEdit && (
                                    <button
                                      onClick={() => onEdit(e)}
                                      className="text-[9px] bg-white border border-slate-200 rounded px-1.5 py-0.5 text-slate-600 hover:text-primary shadow-sm"
                                    >
                                      Edit
                                    </button>
                                  )}
                                  {onDelete && (
                                    <button
                                      onClick={() => onDelete(e.id)}
                                      className="text-[9px] bg-white border border-red-200 rounded px-1.5 py-0.5 text-red-500 hover:text-red-700 shadow-sm"
                                    >
                                      Del
                                    </button>
                                  )}
                                </div>
                              )}
                            </motion.div>
                          );
                        })}
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}
