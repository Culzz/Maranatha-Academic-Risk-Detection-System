/**
 * Pure utility functions.
 * No React imports, no side effects — just data transformations.
 */

/** Get initials from a full name */
export const initials = (name = "") =>
  name.split(" ").slice(0, 2).map((w) => w[0] || "").join("").toUpperCase();

/** Format ISO date string to readable format (WAT — Africa/Lagos) */
export const formatDate = (str) =>
  str
    ? new Date(str).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
        timeZone: "Africa/Lagos",
      })
    : "—";

/** Format ISO datetime to time string (12-hour WAT — Africa/Lagos) */
export const formatTime = (str) =>
  str
    ? new Date(str).toLocaleTimeString("en-NG", {
        hour: "2-digit", minute: "2-digit", hour12: true,
        timeZone: "Africa/Lagos",
      })
    : "—";

/** Insert space between letter prefix and number in course codes: "CSC201" → "CSC 201" */
export const formatCourseCode = (code) => {
  if (!code) return "";
  return code.replace(/^([A-Z]+)(\d)/, "$1 $2");
};

/** Format relative time — "2 minutes ago", "3 days ago" */
export const timeAgo = (str) => {
  if (!str) return "—";
  const diff = Date.now() - new Date(str).getTime();
  const mins  = Math.floor(diff / 60000);
  if (mins < 1)   return "just now";
  if (mins < 60)  return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)   return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
};

// Risk level color constants — hex values + Tailwind classes
export const RISK_COLORS = {
  high:   { bg: "#fecaca", text: "#dc2626", badge: "bg-red-100 text-red-700",   dot: "bg-red-500"   },
  medium: { bg: "#fef3c7", text: "#d97706", badge: "bg-amber-100 text-amber-700", dot: "bg-amber-500" },
  low:    { bg: "#dcfce7", text: "#16a34a", badge: "bg-green-100 text-green-700", dot: "bg-green-500" },
};

// Chart-friendly hex lookup keyed by capitalised level (for Recharts Cell fills, etc.)
export const RISK_HEX = { High: "#dc2626", Medium: "#d97706", Low: "#10b981" };

// Get risk color set from a score (0-100) or level string
export function getRiskColor(input) {
  if (typeof input === "string") {
    const level = input.toLowerCase();
    return RISK_COLORS[level] || RISK_COLORS.low;
  }
  if (input >= 70) return RISK_COLORS.high;
  if (input >= 40) return RISK_COLORS.medium;
  return RISK_COLORS.low;
}

/** Returns Tailwind colour classes for a risk level */
export const riskColors = (level = "") => ({
  High: {
    text:   "text-risk-high",
    bg:     "bg-red-50",
    border: "border-red-200",
    dot:    "bg-risk-high",
    bar:    "#e11d48",
  },
  Medium: {
    text:   "text-amber-600",
    bg:     "bg-amber-50",
    border: "border-amber-200",
    dot:    "bg-amber-500",
    bar:    "#f59e0b",
  },
  Low: {
    text:   "text-risk-low",
    bg:     "bg-emerald-50",
    border: "border-emerald-200",
    dot:    "bg-risk-low",
    bar:    "#10b981",
  },
}[level] || {
  text: "text-slate-500", bg: "bg-slate-50",
  border: "border-slate-200", dot: "bg-slate-400", bar: "#94a3b8",
});

/** Returns Tailwind colour classes for a notification type */
export const notifColors = (type = "") => ({
  risk:         { icon: "text-risk-high",   bg: "bg-red-50"     },
  intervention: { icon: "text-accent",      bg: "bg-amber-50"   },
  quiz:         { icon: "text-blue-500",    bg: "bg-blue-50"    },
  assignment:   { icon: "text-purple-500",  bg: "bg-purple-50"  },
  attendance:   { icon: "text-risk-low",    bg: "bg-emerald-50" },
  system:       { icon: "text-slate-500",   bg: "bg-slate-50"   },
}[type] || { icon: "text-slate-400", bg: "bg-slate-50" });

/** Checks if a due date is within 48 hours */
export const isDueSoon = (dateStr) => {
  const diff = new Date(dateStr) - new Date();
  return diff > 0 && diff < 48 * 60 * 60 * 1000;
};

/** Compute progress bar colour class based on percentage */
export const progressColor = (pct) => {
  if (pct >= 70) return "bg-risk-low";
  if (pct >= 45) return "bg-amber-400";
  return "bg-risk-high";
};

/** Fuzzy name match — returns similarity 0–1 */
export const nameSimilarity = (a = "", b = "") => {
  const norm = (s) => s.toLowerCase().replace(/[^a-z\s]/g, "").trim();
  const wordsA = norm(a).split(/\s+/);
  const wordsB = norm(b).split(/\s+/);
  const matches = wordsA.filter((w) => wordsB.includes(w)).length;
  return matches / Math.max(wordsA.length, wordsB.length);
};

/** SHAP impact label */
export const shapImpact = (value) => {
  const abs = Math.abs(value);
  if (abs >= 0.25) return "Strong";
  if (abs >= 0.12) return "Moderate";
  return "Minor";
};

export const formatFileSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
};
