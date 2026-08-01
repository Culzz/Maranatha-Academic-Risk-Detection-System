/**
 * Shared chat utility functions.
 */

/** Format a timestamp for display in chat (today → time only, else → date + time). */
export function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const timeOpts = { hour: "2-digit", minute: "2-digit", hour12: true };
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("en-NG", timeOpts);
  return (
    d.toLocaleDateString("en-NG", { month: "short", day: "numeric" }) +
    " " +
    d.toLocaleTimeString("en-NG", timeOpts)
  );
}
