/**
 * TimePicker — styled time input matching CustomDropdown and DatePicker.
 * Uses native <input type="time"> under the hood for browser time picker,
 * wrapped in the same Navy/Gold design shell.
 *
 * Props: label, value, onChange, required, disabled, hint, error, className
 */
import { useRef } from "react";
import { Clock } from "lucide-react";

function formatDisplay(val) {
  if (!val) return null;
  try {
    const [h, m] = val.split(":");
    const hour = parseInt(h, 10);
    const ampm = hour >= 12 ? "PM" : "AM";
    const display = hour % 12 || 12;
    return `${display}:${m} ${ampm}`;
  } catch {
    return val;
  }
}

export default function TimePicker({
  label,
  value     = "",
  onChange,
  required  = false,
  disabled  = false,
  hint,
  error,
  className = "",
}) {
  const inputRef = useRef(null);
  const inputId  = label ? `tp-${label.toLowerCase().replace(/\s+/g, "-")}` : undefined;

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="ds-label">
          {label}
          {required && <span className="text-risk-high ml-1">*</span>}
        </label>
      )}

      <div
        role="group"
        aria-label={label || "Time picker"}
        className={[
          "relative w-full h-10 bg-white border rounded-xl flex items-center px-3.5 cursor-pointer transition-all group",
          "hover:border-slate-300",
          error
            ? "border-red-300"
            : "border-slate-200 focus-within:ring-2 focus-within:ring-accent/15 focus-within:border-accent/40",
          disabled ? "opacity-50 cursor-not-allowed bg-slate-50" : "",
        ].join(" ")}
        onClick={() => inputRef.current?.showPicker?.()}
      >
        <Clock
          size={14}
          className="text-slate-400 flex-shrink-0 mr-2.5 group-focus-within:text-accent transition-colors"
        />

        <span className={`flex-1 text-sm select-none ${value ? "text-primary" : "text-slate-400"}`}>
          {value ? formatDisplay(value) : "Select a time"}
        </span>

        <input
          id={inputId}
          ref={inputRef}
          type="time"
          value={value}
          disabled={disabled}
          required={required}
          onChange={e => onChange?.(e.target.value)}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          style={{ colorScheme: "light" }}
        />
      </div>

      {error && <p className="text-xs text-risk-high">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
