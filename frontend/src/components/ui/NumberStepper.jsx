/**
 * NumberStepper — styled numeric input with +/- buttons.
 * Matches the Navy/Gold design system (CustomDropdown / DatePicker).
 *
 * Props: label, value, onChange, min, max, step, unit, required, disabled, hint, error, className
 */
import { Minus, Plus } from "lucide-react";

export default function NumberStepper({
  label,
  value = 0,
  onChange,
  min = 0,
  max = 999,
  step = 1,
  unit = "",
  required = false,
  disabled = false,
  hint,
  error,
  className = "",
}) {
  const num = parseInt(value, 10) || 0;
  const atMin = num <= min;
  const atMax = num >= max;

  const emit = (n) => onChange?.(String(n));

  const decrement = () => {
    if (!atMin) emit(Math.max(min, num - step));
  };

  const increment = () => {
    if (!atMax) emit(Math.min(max, num + step));
  };

  const handleInput = (e) => {
    const raw = e.target.value.replace(/[^\d]/g, "");
    if (raw === "") {
      onChange?.("");
      return;
    }
    // Allow typing freely — only clamp on blur
    onChange?.(raw);
  };

  const handleBlur = () => {
    const n = parseInt(value, 10);
    if (isNaN(n) || value === "") {
      emit(min);
      return;
    }
    emit(Math.min(max, Math.max(min, n)));
  };

  const inputId = label
    ? `stepper-${label.toLowerCase().replace(/\s+/g, "-")}`
    : undefined;

  const borderCls = error
    ? "border-red-300"
    : "border-slate-200 focus-within:ring-2 focus-within:ring-accent/15 focus-within:border-accent/40";

  const btnBase =
    "w-8 h-8 flex items-center justify-center rounded-lg flex-shrink-0 transition-all border border-slate-200 bg-slate-50 text-slate-500 hover:bg-accent/10 hover:border-accent/30 hover:text-accent active:scale-95";

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="ds-label">
          {label}
          {required && <span className="text-risk-high ml-1">*</span>}
        </label>
      )}

      <div
        className={`flex items-center gap-2 h-10 bg-white border rounded-xl px-2 transition-all hover:border-slate-300 ${borderCls} ${disabled ? "opacity-50 bg-slate-50" : ""}`}
      >
        <button
          type="button"
          onClick={decrement}
          disabled={disabled || atMin}
          className={`${btnBase} ${disabled || atMin ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
          aria-label="Decrease"
        >
          <Minus size={12} />
        </button>

        <div className="flex-1 flex items-center justify-center gap-1.5">
          <input
            id={inputId}
            type="text"
            inputMode="numeric"
            value={value}
            onChange={handleInput}
            onBlur={handleBlur}
            disabled={disabled}
            className="w-14 text-center bg-transparent outline-none text-sm font-semibold text-primary disabled:cursor-not-allowed"
          />
          {unit && (
            <span className="text-xs text-slate-400 font-medium whitespace-nowrap">
              {unit}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={increment}
          disabled={disabled || atMax}
          className={`${btnBase} ${disabled || atMax ? "opacity-40 cursor-not-allowed pointer-events-none" : "cursor-pointer"}`}
          aria-label="Increase"
        >
          <Plus size={12} />
        </button>
      </div>

      {error && <p className="text-xs text-risk-high">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
