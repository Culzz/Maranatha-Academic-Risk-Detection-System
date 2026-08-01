/**
 * ExamCalendar — renders exam timetable as a proper table.
 * Columns: Date/Day, Time Slot, Course Code, Course Title, Exam Hall, Invigilator(s).
 *
 * entries: [{ id, course_code, course_title, exam_date, time_slot, exam_hall,
 *             invigilator_names, invigilator_names_raw, is_community_service, is_break }]
 */
import { format, parseISO, isToday, isPast } from "date-fns";
import { motion } from "framer-motion";

/** Time-slot color badges */
const SLOT_BADGES = {
  "9:00-11:00":  { bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200" },
  "9am-11am":    { bg: "bg-blue-100",    text: "text-blue-700",    border: "border-blue-200" },
  "11:00-13:00": { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  "11am-1pm":    { bg: "bg-emerald-100", text: "text-emerald-700", border: "border-emerald-200" },
  "14:00-16:00": { bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200" },
  "2pm-4pm":     { bg: "bg-amber-100",   text: "text-amber-700",   border: "border-amber-200" },
};

const DEFAULT_BADGE = { bg: "bg-slate-100", text: "text-slate-600", border: "border-slate-200" };

function getSlotBadge(slot) {
  return SLOT_BADGES[slot] || DEFAULT_BADGE;
}

/**
 * Safely parse an exam_date string.
 * Returns a Date object or null.
 */
function safeParse(dateStr) {
  if (!dateStr) return null;
  try {
    return parseISO(dateStr);
  } catch {
    return null;
  }
}

export default function ExamCalendar({ entries = [] }) {
  // Filter out break rows, sort chronologically
  const sortedEntries = [...entries]
    .filter((e) => !e.is_break)
    .sort((a, b) => {
      const dateA = a.exam_date || "";
      const dateB = b.exam_date || "";
      if (dateA !== dateB) return dateA.localeCompare(dateB);
      const slotA = a.time_slot || "";
      const slotB = b.time_slot || "";
      return slotA.localeCompare(slotB);
    });

  if (sortedEntries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <svg
          className="w-10 h-10 mb-3 opacity-40"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-sm">No exam timetable published yet</p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="overflow-x-auto rounded-2xl border border-slate-200 shadow-sm bg-white"
    >
      <table className="w-full min-w-[780px] border-collapse text-sm">
        {/* ── Header ── */}
        <thead>
          <tr className="bg-primary text-white">
            <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-widest border-r border-white/10">
              Date / Day
            </th>
            <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-widest border-r border-white/10">
              Time Slot
            </th>
            <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-widest border-r border-white/10">
              Course Code
            </th>
            <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-widest border-r border-white/10">
              Course Title
            </th>
            <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-widest border-r border-white/10">
              Exam Hall
            </th>
            <th className="py-3 px-4 text-left font-semibold text-xs uppercase tracking-widest">
              Invigilator(s)
            </th>
          </tr>
        </thead>

        {/* ── Body ── */}
        <tbody>
          {sortedEntries.map((entry, idx) => {
            const parsed = safeParse(entry.exam_date);
            const today = parsed ? isToday(parsed) : false;
            const past = parsed ? isPast(parsed) && !today : false;
            const badge = getSlotBadge(entry.time_slot);

            // Community service rows get special treatment
            if (entry.is_community_service) {
              return (
                <tr
                  key={entry.id ?? idx}
                  className={`border-t border-slate-100 bg-purple-50/50 ${
                    past ? "opacity-60" : ""
                  }`}
                >
                  <td className="py-3 px-4 whitespace-nowrap">
                    {parsed ? (
                      <div>
                        <span className="font-semibold text-slate-700">
                          {format(parsed, "EEE, MMM d")}
                        </span>
                        <span className="text-slate-400 text-xs ml-1.5">
                          {format(parsed, "yyyy")}
                        </span>
                      </div>
                    ) : (
                      <span className="text-slate-400">--</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-xs text-purple-600">
                    {entry.time_slot || "--"}
                  </td>
                  <td
                    colSpan={4}
                    className="py-3 px-4 font-semibold text-purple-800 text-xs"
                  >
                    Community Service / Fellowship
                  </td>
                </tr>
              );
            }

            return (
              <motion.tr
                key={entry.id ?? idx}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2, delay: idx * 0.02 }}
                className={`border-t border-slate-100 transition-colors hover:bg-slate-50/80 ${
                  past ? "opacity-60" : ""
                } ${idx % 2 === 0 ? "bg-white" : "bg-slate-50/30"} ${
                  today ? "border-l-[3px] border-l-accent" : ""
                }`}
              >
                {/* Date / Day */}
                <td className="py-3 px-4 whitespace-nowrap">
                  {parsed ? (
                    <div className="flex items-center gap-2">
                      <div>
                        <p className="font-semibold text-slate-700 leading-tight">
                          {format(parsed, "EEE, MMM d")}
                        </p>
                        <p className="text-[10px] text-slate-400">
                          {format(parsed, "yyyy")}
                        </p>
                      </div>
                      {today && (
                        <span className="text-[9px] font-bold uppercase bg-accent/15 text-accent px-1.5 py-0.5 rounded-full">
                          Today
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-slate-400">--</span>
                  )}
                </td>

                {/* Time Slot Badge */}
                <td className="py-3 px-4">
                  {entry.time_slot ? (
                    <span
                      className={`inline-block text-[10px] font-bold px-2.5 py-1 rounded-lg border ${badge.bg} ${badge.text} ${badge.border}`}
                    >
                      {entry.time_slot}
                    </span>
                  ) : (
                    <span className="text-slate-300 text-xs">--</span>
                  )}
                </td>

                {/* Course Code */}
                <td className="py-3 px-4">
                  <span className="font-bold text-primary">
                    {entry.course_code || "--"}
                  </span>
                </td>

                {/* Course Title */}
                <td className="py-3 px-4">
                  <span className="text-slate-600 text-xs">
                    {entry.course_title || "--"}
                  </span>
                </td>

                {/* Exam Hall */}
                <td className="py-3 px-4">
                  <span className="text-slate-600 text-xs font-medium">
                    {entry.exam_hall || "--"}
                  </span>
                </td>

                {/* Invigilator(s) */}
                <td className="py-3 px-4">
                  <span className="text-slate-500 text-xs">
                    {entry.invigilator_names ||
                      entry.invigilator_names_raw ||
                      "--"}
                  </span>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </motion.div>
  );
}
