export default function Input({
  label,
  type           = "text",
  placeholder,
  value,
  onChange,
  icon,
  iconRight,
  error,
  hint,
  disabled       = false,
  required       = false,
  multiline      = false,
  pill           = false,
  rows           = 3,
  className      = "",
  inputClassName = "",
  id,
  ...rest
}) {
  const inputId = id || label?.toLowerCase().replace(/\s+/g, "-");
  const radiusCls = pill ? "rounded-full" : "rounded-xl";

  const baseInputCls = [
    `w-full bg-white border ${radiusCls} text-sm text-primary`,
    "placeholder:text-slate-400 outline-none transition-all duration-150",
    "hover:border-slate-300",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50",
    error
      ? "border-red-300 focus:ring-2 focus:ring-red-100 focus:border-red-400"
      : "border-slate-200 focus:ring-2 focus:ring-accent/15 focus:border-accent/40",
    inputClassName,
  ].join(" ");

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label htmlFor={inputId} className="ds-label">
          {label}{required && <span className="text-risk-high ml-1">*</span>}
        </label>
      )}

      <div className="relative flex items-center">
        {icon && (
          <span className="absolute left-3.5 text-slate-400 pointer-events-none flex items-center z-10">
            {icon}
          </span>
        )}

        {multiline ? (
          <textarea
            id={inputId}
            placeholder={placeholder}
            value={value}
            onChange={e => onChange?.(e.target.value)}
            disabled={disabled}
            required={required}
            rows={rows}
            className={`ds-textarea ${error ? "!border-red-300 focus:!ring-red-100 focus:!border-red-400" : ""} ${inputClassName}`}
            {...rest}
          />
        ) : (
          <input
            id={inputId}
            type={type}
            placeholder={placeholder}
            value={value}
            onChange={e => onChange?.(e.target.value)}
            disabled={disabled}
            required={required}
            className={[
              baseInputCls,
              "h-10",
              icon      ? "pl-9"   : "pl-3.5",
              iconRight ? "pr-9"   : "pr-3.5",
            ].join(" ")}
            {...rest}
          />
        )}

        {iconRight && !multiline && (
          <span className="absolute right-3.5 text-slate-400 flex items-center">
            {iconRight}
          </span>
        )}
      </div>

      {error && <p className="text-xs text-risk-high">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}
