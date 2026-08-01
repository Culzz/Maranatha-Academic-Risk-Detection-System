/**
 * Select
 * Styled dropdown that matches Input.jsx exactly.
 * Replaces every raw <select> in the codebase.
 *
 * Usage:
 *   <Select label="Course" value={courseId} onChange={setCourseId}>
 *     {courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
 *   </Select>
 */

export default function Select({
  label,
  value,
  onChange,
  disabled  = false,
  required  = false,
  error,
  hint,
  className = "",
  id,
  children,
}) {
  const selectId = id || label?.toLowerCase().replace(/\s+/g, "-");

  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {label && (
        <label
          htmlFor={selectId}
          className="ds-label"
        >
          {label}
          {required && <span className="text-risk-high ml-1">*</span>}
        </label>
      )}

      <select
        id={selectId}
        value={value}
        onChange={(e) => onChange?.(e.target.value, e)}
        disabled={disabled}
        required={required}
        className={`ds-select ${error ? "!border-red-300 focus:!ring-red-100 focus:!border-red-400" : ""}`}
      >
        {children}
      </select>

      {error && <p className="text-xs text-risk-high">{error}</p>}
      {hint && !error && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}