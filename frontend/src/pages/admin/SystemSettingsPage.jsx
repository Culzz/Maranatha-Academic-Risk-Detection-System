/**
 * SystemSettingsPage — Admin system-wide configuration
 * Manage global settings like maintenance mode, risk thresholds, AI features.
 * API: GET /admin/settings, PATCH /admin/settings/{key}
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Settings, Save, AlertTriangle, RefreshCw, CheckCircle,
  AlertCircle, ToggleLeft, ToggleRight,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";
import DatePicker from "../../components/ui/DatePicker";

// ── Helpers ──────────────────────────────────────────────────
function toTitleCase(str) {
  return str
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const BOOLEAN_KEYS = new Set([
  "maintenance_mode", "enable_ai_explanations",
  "email_notifications_enabled", "sms_notifications_enabled", "push_notifications_enabled",
  "ai_quiz_generation_enabled", "ai_assignment_review_enabled",
  "allow_student_self_study", "guardian_portal_enabled",
]);
const NUMBER_KEYS  = new Set([
  "risk_threshold_high", "risk_threshold_medium", "max_sos_per_day",
  "default_expiry_minutes", "max_file_upload_mb",
]);
const DATE_KEYS    = new Set(["semester_start_date"]);

function inputTypeFor(key) {
  if (BOOLEAN_KEYS.has(key)) return "toggle";
  if (NUMBER_KEYS.has(key))  return "number";
  if (DATE_KEYS.has(key))    return "date";
  return "text";
}

function isBooleanTrue(val) {
  return val === true || val === "true" || val === "1";
}

// ── Animation variants ──────────────────────────────────────
const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item      = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

// ── Setting groups for organized display ────────────────────
const SETTING_GROUPS = [
  {
    label: "Risk Engine",
    keys: ["risk_threshold_high", "risk_threshold_medium", "risk_compute_day"],
  },
  {
    label: "Notifications",
    keys: ["email_notifications_enabled", "sms_notifications_enabled", "push_notifications_enabled"],
  },
  {
    label: "AI Features",
    keys: ["enable_ai_explanations", "ai_quiz_generation_enabled", "ai_assignment_review_enabled"],
  },
  {
    label: "Academic Calendar",
    keys: ["semester_start_date", "default_expiry_minutes", "max_sos_per_day"],
  },
  {
    label: "Platform",
    keys: ["maintenance_mode", "max_file_upload_mb", "allow_student_self_study", "guardian_portal_enabled"],
  },
];

// ── Skeleton Card ───────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm animate-pulse space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-slate-200 rounded-lg w-1/3" />
          <div className="h-3 bg-slate-100 rounded-lg w-2/3" />
        </div>
        <div className="h-9 w-20 bg-slate-200 rounded-xl" />
      </div>
      <div className="h-10 bg-slate-100 rounded-xl w-full" />
    </div>
  );
}

// ── Toggle Switch ───────────────────────────────────────────
function ToggleSwitch({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={[
        "relative inline-flex h-7 w-12 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-accent/20",
        checked ? "bg-emerald-500" : "bg-slate-300",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

// ── Setting Card ────────────────────────────────────────────
function SettingCard({ setting, onSaved }) {
  const { token }                = useAuth();
  const [value,   setValue]      = useState(setting.value);
  const [saving,  setSaving]     = useState(false);
  const [feedback, setFeedback]  = useState(null); // { type: "success" | "error", message }

  // Sync local value when settings are re-fetched
  useEffect(() => {
    setValue(setting.value);
  }, [setting.value]);

  const type     = inputTypeFor(setting.key);
  const isDirty  = String(value) !== String(setting.value);

  const handleSave = async () => {
    setSaving(true);
    setFeedback(null);
    try {
      await adminApi.updateSetting(setting.key, String(value), token);
      setFeedback({ type: "success", message: "Setting saved successfully." });
      onSaved?.(setting.key, String(value));
    } catch (e) {
      setFeedback({ type: "error", message: e.message || "Failed to save setting." });
    } finally {
      setSaving(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  const inputCls =
    "w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none " +
    "focus:ring-2 focus:ring-accent/15 focus:border-accent/40 hover:border-slate-300 " +
    "placeholder:text-slate-400 transition-all";

  return (
    <motion.div variants={item} className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm space-y-4">
      {/* Header row */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="font-serif text-lg font-bold text-slate-900 leading-snug">
            {toTitleCase(setting.key)}
          </h3>
          {setting.description && (
            <p className="text-sm text-slate-400 mt-1">{setting.description}</p>
          )}
          <p className="text-xs text-slate-300 font-mono mt-1.5">{setting.key}</p>
        </div>

        {/* Save button */}
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={handleSave}
          disabled={saving || !isDirty}
          className={[
            "flex items-center gap-2 text-sm font-semibold px-4 h-9 rounded-xl transition-all flex-shrink-0",
            isDirty
              ? "bg-primary text-white hover:bg-primary/90"
              : "bg-slate-100 text-slate-400 cursor-not-allowed",
            "disabled:opacity-50",
          ].join(" ")}
        >
          {saving
            ? <><RefreshCw size={13} className="animate-spin" /> Saving...</>
            : <><Save size={13} /> Save</>
          }
        </motion.button>
      </div>

      {/* Input */}
      {type === "toggle" ? (
        <div className="flex items-center gap-3">
          <ToggleSwitch
            checked={isBooleanTrue(value)}
            onChange={(checked) => setValue(checked ? "true" : "false")}
            disabled={saving}
          />
          <span className={[
            "text-sm font-semibold",
            isBooleanTrue(value) ? "text-emerald-600" : "text-slate-400",
          ].join(" ")}>
            {isBooleanTrue(value) ? "Enabled" : "Disabled"}
          </span>
        </div>
      ) : type === "number" ? (
        <input
          type="number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={saving}
          className={inputCls}
        />
      ) : type === "date" ? (
        <DatePicker
          value={value}
          onChange={(val) => setValue(val)}
          disabled={saving}
        />
      ) : (
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          disabled={saving}
          placeholder="Enter value..."
          className={inputCls}
        />
      )}

      {/* Feedback */}
      <AnimatePresence>
        {feedback && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className={[
              "flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm border",
              feedback.type === "success"
                ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                : "bg-red-50 border-red-200 text-red-700",
            ].join(" ")}
          >
            {feedback.type === "success"
              ? <CheckCircle size={14} />
              : <AlertCircle size={14} />
            }
            {feedback.message}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Page ───────────────────────────────────────────────
export default function SystemSettingsPage() {
  const { token }                = useAuth();
  const [settings, setSettings]  = useState([]);
  const [loading,  setLoading]   = useState(true);
  const [error,    setError]     = useState("");

  const fetchSettings = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await adminApi.getSettings(token);
      setSettings(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, [token]);

  // Optimistically update local state after a successful save
  const handleSaved = (key, newValue) => {
    setSettings((prev) =>
      prev.map((s) => (s.key === key ? { ...s, value: newValue } : s))
    );
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">
            System Settings
          </h1>
          <p className="text-lg text-slate-500">
            Configure global platform settings and feature flags
          </p>
        </div>
        <motion.button
          whileTap={{ scale: 0.96 }}
          onClick={fetchSettings}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all"
        >
          <RefreshCw size={13} /> Refresh
        </motion.button>
      </div>

      {/* Warning banner */}
      <div className="flex items-start gap-4 bg-amber-50 border border-amber-200 rounded-xl p-5">
        <div className="w-10 h-10 bg-amber-100 border border-amber-300 rounded-xl flex items-center justify-center flex-shrink-0">
          <AlertTriangle size={18} className="text-amber-600" />
        </div>
        <div>
          <p className="font-semibold text-amber-900 text-sm mb-1">
            Caution: System-wide impact
          </p>
          <p className="text-amber-700 text-sm">
            Changes to these settings take effect immediately and affect all users across the platform.
            Please review each change carefully before saving. Enabling maintenance mode will prevent
            all non-admin users from accessing the system.
          </p>
        </div>
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            key="err"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Settings list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(5)].map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : settings.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-white border border-slate-200 rounded-xl text-slate-400">
          <Settings size={28} className="mb-3 opacity-30" />
          <p className="text-sm">No settings found</p>
        </div>
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="space-y-8"
        >
          {SETTING_GROUPS.map(group => {
            const groupSettings = group.keys
              .map(k => settings.find(s => s.key === k))
              .filter(Boolean);
            if (groupSettings.length === 0) return null;
            return (
              <div key={group.label}>
                <h2 className="font-serif text-xl font-bold text-slate-900 mb-4">{group.label}</h2>
                <div className="space-y-4">
                  {groupSettings.map(s => (
                    <SettingCard key={s.key} setting={s} onSaved={handleSaved} />
                  ))}
                </div>
              </div>
            );
          })}
          {/* Uncategorized settings */}
          {(() => {
            const allGroupedKeys = new Set(SETTING_GROUPS.flatMap(g => g.keys));
            const uncategorized = settings.filter(s => !allGroupedKeys.has(s.key));
            if (uncategorized.length === 0) return null;
            return (
              <div>
                <h2 className="font-serif text-xl font-bold text-slate-900 mb-4">Other</h2>
                <div className="space-y-4">
                  {uncategorized.map(s => (
                    <SettingCard key={s.key} setting={s} onSaved={handleSaved} />
                  ))}
                </div>
              </div>
            );
          })()}
        </motion.div>
      )}

      <p className="text-xs text-slate-400 text-center">
        {settings.length} setting{settings.length !== 1 ? "s" : ""} loaded
      </p>
    </div>
  );
}
