/**
 * Card — structured content container.
 *
 * Props:
 *   title, subtitle, action     — optional header section
 *   padding                     — "default" | "lg" | "sm" | "xs" | "none"
 *   hover                       — enables .card-lift transform on hover
 *   noPadBody                   — removes body padding (for full-bleed tables/charts)
 *   glass                       — blur backdrop glass effect
 *   premium                     — stronger premium shadow
 *   border, className           — standard overrides
 */
export default function Card({
  children,
  title,
  subtitle,
  action,
  padding   = "default",
  className = "",
  border    = true,
  hover     = false,
  noPadBody = false,
  glass     = false,
  premium   = false,
}) {
  const padMap = { default: "p-6", lg: "p-8", sm: "p-4", xs: "p-3", none: "" };
  const pad    = padMap[padding] ?? "p-6";

  const hasHeader = Boolean(title || action);

  return (
    <div className={[
      "rounded-2xl",
      glass
        ? "bg-white/70 backdrop-blur-md"
        : "bg-white",
      premium ? "shadow-premium" : "shadow-sm",
      border ? "border border-slate-100" : "",
      hover  ? "card-lift cursor-pointer" : "",
      className,
    ].join(" ")}>

      {/* Header */}
      {hasHeader && (
        <div className={[
          "flex items-start justify-between gap-4",
          pad,
          children ? "pb-4 border-b border-slate-100" : "",
        ].join(" ")}>
          <div className="min-w-0">
            {title && (
              <h3 className="font-serif text-lg font-semibold text-primary"
                  style={{ letterSpacing: "-0.018em", lineHeight: 1.3 }}>
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-sm text-slate-400 mt-1 leading-snug">{subtitle}</p>
            )}
          </div>
          {action && (
            <div className="flex-shrink-0 flex items-center gap-2">{action}</div>
          )}
        </div>
      )}

      {/* Body */}
      {children && (
        <div className={noPadBody ? "" : (hasHeader && pad ? `${pad} pt-5` : pad)}>
          {children}
        </div>
      )}
    </div>
  );
}
