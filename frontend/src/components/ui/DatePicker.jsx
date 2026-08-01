/**
 * DatePicker - custom calendar popover (no native browser date UI).
 *
 * Props: label, value, onChange, required, disabled, min, max, hint, error, className
 * value/min/max use ISO format: YYYY-MM-DD
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

const WEEKDAY_HEADERS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

function parseIsoDate(value) {
  if (!value || typeof value !== "string") return null;
  const parts = value.split("-").map((p) => Number(p));
  if (parts.length !== 3 || parts.some((p) => !Number.isFinite(p))) return null;
  const [year, month, day] = parts;
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year
    || date.getMonth() !== month - 1
    || date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

function toIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function monthLabel(date) {
  return date.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
}

function isSameDate(a, b) {
  return (
    a
    && b
    && a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate()
  );
}

function isBetweenBounds(isoDate, min, max) {
  if (min && isoDate < min) return false;
  if (max && isoDate > max) return false;
  return true;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export default function DatePicker({
  label,
  value = "",
  onChange,
  required = false,
  disabled = false,
  min,
  max,
  hint,
  error,
  className = "",
}) {
  const wrapperRef = useRef(null);
  const selectedDate = parseIsoDate(value);
  const [open, setOpen] = useState(false);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate || new Date()));

  useEffect(() => {
    if (selectedDate) {
      setViewMonth(startOfMonth(selectedDate));
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onPointerDown = (event) => {
      if (!wrapperRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  const inputId = label
    ? `dp-${label.toLowerCase().replace(/\s+/g, "-")}`
    : undefined;

  const borderCls = error
    ? "border-red-300"
    : "border-slate-200 focus-within:ring-2 focus-within:ring-accent/15 focus-within:border-accent/40";

  const displayValue = value
    ? selectedDate?.toLocaleDateString("en-US", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }) || value
    : "";

  const calendarCells = useMemo(() => {
    const first = startOfMonth(viewMonth);
    const firstWeekday = first.getDay();
    const daysInMonth = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    const cells = [];

    for (let i = 0; i < firstWeekday; i += 1) {
      cells.push({ key: `empty-${i}`, empty: true });
    }
    for (let day = 1; day <= daysInMonth; day += 1) {
      const date = new Date(first.getFullYear(), first.getMonth(), day);
      const iso = toIsoDate(date);
      cells.push({
        key: iso,
        empty: false,
        iso,
        date,
        day,
        disabled: !isBetweenBounds(iso, min, max),
      });
    }
    return cells;
  }, [viewMonth, min, max]);

  const clear = (event) => {
    event.stopPropagation();
    if (!disabled) onChange?.("");
  };

  const pickDate = (iso) => {
    onChange?.(iso);
    setOpen(false);
  };

  const prevMonth = () => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setViewMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1));
  };

  return (
    <div ref={wrapperRef} className={`flex flex-col gap-1.5 relative ${className}`}>
      {label && (
        <label htmlFor={inputId} className="ds-label">
          {label}
          {required && <span className="text-risk-high ml-1">*</span>}
        </label>
      )}

      <button
        id={inputId}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={`relative w-full h-10 bg-white border rounded-xl flex items-center px-3.5 text-left transition-all group hover:border-slate-300 ${borderCls} ${disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <Calendar
          size={14}
          className="text-slate-400 flex-shrink-0 mr-2.5 group-focus-within:text-accent transition-colors"
        />
        <span className={`flex-1 text-sm select-none ${value ? "text-primary" : "text-slate-400"}`}>
          {value ? displayValue : "Select a date"}
        </span>
        {value && !disabled && (
          <span
            role="button"
            onClick={clear}
            className="ml-1 p-0.5 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Clear date"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {/* Hidden input keeps HTML form compatibility without native date picker */}
      <input
        type="text"
        value={value}
        onChange={() => {}}
        required={required}
        disabled={disabled}
        readOnly
        tabIndex={-1}
        className="sr-only"
        aria-hidden="true"
      />

      {open && !disabled && (
        <div
          role="dialog"
          aria-label="Calendar"
          className="absolute top-[calc(100%+6px)] z-40 w-[280px] bg-white border border-slate-200 rounded-xl shadow-lg p-3"
        >
          <div className="flex items-center justify-between mb-3">
            <button
              type="button"
              onClick={prevMonth}
              className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Previous month"
            >
              <ChevronLeft size={14} className="mx-auto" />
            </button>
            <p className="text-sm font-semibold text-slate-800">{monthLabel(viewMonth)}</p>
            <button
              type="button"
              onClick={nextMonth}
              className="w-7 h-7 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
              aria-label="Next month"
            >
              <ChevronRight size={14} className="mx-auto" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-1">
            {WEEKDAY_HEADERS.map((w) => (
              <div key={w} className="text-[11px] font-semibold text-slate-400 text-center py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell) => {
              if (cell.empty) {
                return <div key={cell.key} className="h-8" />;
              }
              const isSelected = selectedDate && isSameDate(cell.date, selectedDate);
              const isToday = isSameDate(cell.date, new Date());
              return (
                <button
                  key={cell.key}
                  type="button"
                  disabled={cell.disabled}
                  onClick={() => pickDate(cell.iso)}
                  className={`h-8 rounded-lg text-xs font-medium transition-colors ${
                    isSelected
                      ? "bg-primary text-white"
                      : cell.disabled
                        ? "text-slate-300 cursor-not-allowed"
                        : isToday
                          ? "text-accent bg-accent/10 hover:bg-accent/20"
                          : "text-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {error && <p className="text-xs text-risk-high">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
