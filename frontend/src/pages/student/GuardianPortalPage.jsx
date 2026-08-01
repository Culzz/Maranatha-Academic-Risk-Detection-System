/**
 * GuardianPortalPage — Student-controlled guardian sharing portal (Idea 20).
 * Students can invite a guardian by email, control exactly which data categories
 * are shared, and revoke access at any time. Guardians cannot request access.
 */
import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, UserPlus, Mail, User, Loader2,
  CheckCircle2, XCircle, ToggleLeft, ToggleRight,
  Trash2, Info, Eye, EyeOff, Clock,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import Badge from "../../components/ui/Badge";
import { guardianApi } from "../../services/api";

/* ── animation variants ─────────────────────────────────── */
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = {
  hidden: { opacity: 0, y: 10 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" } },
};

/* ── permission definitions ─────────────────────────────── */
const PERMISSIONS = [
  { key: "share_attendance",  label: "Attendance Records",  icon: Eye,  desc: "Share your class attendance data" },
  { key: "share_assignments", label: "Assignment Progress", icon: Eye,  desc: "Share assignment submission status" },
  { key: "share_risk_level",  label: "Risk Level",         icon: Eye,  desc: "Share your current academic risk level" },
];

/* ── toggle switch component ────────────────────────────── */
function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      className={[
        "relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 flex-shrink-0",
        disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer",
        checked ? "bg-emerald-500" : "bg-slate-200",
      ].join(" ")}
    >
      <span
        className={[
          "inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform duration-200",
          checked ? "translate-x-6" : "translate-x-1",
        ].join(" ")}
      />
    </button>
  );
}

export default function GuardianPortalPage() {
  const { token } = useAuth();

  /* ── shares state ─────────────────────────────────────── */
  const [shares, setShares]     = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");

  /* ── add-guardian form state ───────────────────────────── */
  const [showForm, setShowForm]           = useState(false);
  const [guardianName, setGuardianName]   = useState("");
  const [guardianEmail, setGuardianEmail] = useState("");
  const [permAttendance, setPermAttendance]   = useState(true);
  const [permAssignments, setPermAssignments] = useState(true);
  const [permRiskLevel, setPermRiskLevel]     = useState(false);
  const [submitting, setSubmitting]           = useState(false);

  /* ── busy states for per-share actions ─────────────────── */
  const [updatingId, setUpdatingId] = useState(null);
  const [revokingId, setRevokingId] = useState(null);

  /* ── fetch existing shares ─────────────────────────────── */
  const fetchShares = useCallback(async () => {
    try {
      const data = await guardianApi.getMyShares(token);
      setShares(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e.message || "Failed to load guardian shares.");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { fetchShares(); }, [fetchShares]);

  /* ── flash helpers ──────────────────────────────────────── */
  const flashSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 4000);
  };
  const flashError = (msg) => {
    setError(msg);
    setTimeout(() => setError(""), 5000);
  };

  /* ── create share ───────────────────────────────────────── */
  const handleCreate = async (e) => {
    e.preventDefault();
    if (!guardianName.trim() || !guardianEmail.trim()) return;
    setSubmitting(true);
    setError("");
    try {
      await guardianApi.createShare(
        {
          guardian_name:     guardianName.trim(),
          guardian_email:    guardianEmail.trim(),
          share_attendance:  permAttendance,
          share_assignments: permAssignments,
          share_risk_level:  permRiskLevel,
        },
        token,
      );
      setGuardianName("");
      setGuardianEmail("");
      setPermAttendance(true);
      setPermAssignments(true);
      setPermRiskLevel(false);
      setShowForm(false);
      flashSuccess("Guardian added successfully. They will receive an email with a view link.");
      await fetchShares();
    } catch (e) {
      flashError(e.message || "Failed to add guardian.");
    } finally {
      setSubmitting(false);
    }
  };

  /* ── update share permission ────────────────────────────── */
  const handleTogglePermission = async (share, permKey) => {
    setUpdatingId(share.id);
    try {
      await guardianApi.updateShare(
        share.id,
        { [permKey]: !share[permKey] },
        token,
      );
      await fetchShares();
    } catch (e) {
      flashError(e.message || "Failed to update permission.");
    } finally {
      setUpdatingId(null);
    }
  };

  /* ── revoke share ───────────────────────────────────────── */
  const handleRevoke = async (shareId) => {
    setRevokingId(shareId);
    try {
      await guardianApi.revokeShare(shareId, token);
      flashSuccess("Guardian access has been revoked.");
      await fetchShares();
    } catch (e) {
      flashError(e.message || "Failed to revoke access.");
    } finally {
      setRevokingId(null);
    }
  };

  /* ── derived ────────────────────────────────────────────── */
  const activeShares  = shares.filter((s) => !s.revoked);
  const revokedShares = shares.filter((s) => s.revoked);

  /* ── loading state ─────────────────────────────────────── */
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 size={28} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-8">

      {/* ── Header ──────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 bg-accent/10 border border-accent/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <Shield size={22} className="text-accent" />
          </div>
          <div>
            <h1 className="font-serif text-4xl font-bold text-slate-900 leading-tight">
              Guardian Portal
            </h1>
            <p className="text-lg text-slate-600 mt-1">
              Share selected academic data with a trusted guardian
            </p>
          </div>
        </div>
        <p className="text-sm text-slate-500 leading-relaxed mt-2 ml-[60px]">
          Control exactly what your guardian sees. You can add, update, or revoke
          access at any time. Your guardian cannot request or expand their own access.
        </p>
      </motion.div>

      {/* ── Info Banner ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="bg-blue-50 border border-blue-200 rounded-xl p-4"
      >
        <div className="flex items-start gap-3">
          <Info size={18} className="text-blue-600 mt-0.5 flex-shrink-0" />
          <p className="text-sm text-blue-800 leading-relaxed">
            <span className="font-semibold">You are in full control.</span> Your guardian
            cannot request access — you must initiate sharing. You decide what they see,
            and you can revoke it instantly.
          </p>
        </div>
      </motion.div>

      {/* ── Success / Error Banners ──────────────────────── */}
      <AnimatePresence>
        {success && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3"
          >
            <CheckCircle2 size={18} className="text-emerald-500 flex-shrink-0" />
            <p className="text-sm font-medium text-emerald-700">{success}</p>
          </motion.div>
        )}
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3"
          >
            <XCircle size={18} className="text-red-500 flex-shrink-0" />
            <p className="text-sm font-medium text-red-700">{error}</p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Add Guardian Card ────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
        className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden"
      >
        <div className="flex items-center justify-between p-6 pb-0 mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
              <UserPlus size={16} className="text-white" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-slate-900">Add a Guardian</h2>
              <p className="text-sm text-slate-500">
                Invite a parent or trusted person to view selected data
              </p>
            </div>
          </div>
          {!showForm && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-900 text-white text-sm font-semibold rounded-xl hover:bg-slate-800 transition-colors"
            >
              <UserPlus size={14} />
              Add Guardian
            </motion.button>
          )}
        </div>

        <AnimatePresence>
          {showForm && (
            <motion.form
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              onSubmit={handleCreate}
              className="overflow-hidden"
            >
              <div className="px-6 pb-6 space-y-5">
                {/* Name field */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 tracking-wide mb-2">
                    Guardian Name
                  </label>
                  <div className="relative">
                    <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={guardianName}
                      onChange={(e) => setGuardianName(e.target.value)}
                      placeholder="e.g. Mrs. Adeyemi"
                      required
                      maxLength={100}
                      className="w-full h-11 pl-10 pr-4 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
                    />
                  </div>
                </div>

                {/* Email field */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 tracking-wide mb-2">
                    Guardian Email
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={guardianEmail}
                      onChange={(e) => setGuardianEmail(e.target.value)}
                      placeholder="guardian@email.com"
                      required
                      maxLength={200}
                      className="w-full h-11 pl-10 pr-4 border border-slate-200 rounded-xl text-sm text-slate-900 placeholder-slate-400 outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all"
                    />
                  </div>
                </div>

                {/* Permission checkboxes */}
                <div>
                  <label className="block text-xs font-semibold uppercase text-slate-500 tracking-wide mb-3">
                    What to Share
                  </label>
                  <div className="space-y-3">
                    {[
                      { key: "attendance",  label: "Attendance Records",  checked: permAttendance,  set: setPermAttendance },
                      { key: "assignments", label: "Assignment Progress", checked: permAssignments, set: setPermAssignments },
                      { key: "risk_level",  label: "Risk Level",         checked: permRiskLevel,   set: setPermRiskLevel },
                    ].map((perm) => (
                      <label
                        key={perm.key}
                        className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={perm.checked}
                          onChange={(e) => perm.set(e.target.checked)}
                          className="w-4 h-4 rounded border-slate-300 text-slate-900 focus:ring-slate-200"
                        />
                        <div className="flex items-center gap-2">
                          <Eye size={14} className="text-slate-400" />
                          <span className="text-sm font-medium text-slate-700">{perm.label}</span>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <motion.button
                    type="submit"
                    whileTap={{ scale: 0.97 }}
                    disabled={submitting || !guardianName.trim() || !guardianEmail.trim()}
                    className="flex items-center justify-center gap-2 h-11 px-6 bg-slate-900 text-white font-semibold rounded-xl text-sm hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {submitting ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        Adding...
                      </>
                    ) : (
                      <>
                        <UserPlus size={15} />
                        Add Guardian
                      </>
                    )}
                  </motion.button>
                  <button
                    type="button"
                    onClick={() => setShowForm(false)}
                    className="text-sm text-slate-500 hover:text-slate-700 font-medium transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* Empty state when form is hidden and no shares exist */}
        {!showForm && shares.length === 0 && (
          <div className="px-6 pb-6">
            <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
              <Shield size={28} className="text-slate-300 mx-auto mb-3" />
              <p className="text-sm text-slate-500 font-medium">No guardians added yet</p>
              <p className="text-xs text-slate-400 mt-1">
                Click "Add Guardian" to invite a parent or trusted person.
              </p>
            </div>
          </div>
        )}
      </motion.div>

      {/* ── Active Shares ────────────────────────────────── */}
      {activeShares.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <CheckCircle2 size={16} className="text-emerald-600" />
            </div>
            <div>
              <h2 className="font-serif text-2xl font-bold text-slate-900">Active Shares</h2>
              <p className="text-sm text-slate-500">
                {activeShares.length} guardian{activeShares.length !== 1 ? "s" : ""} currently have access
              </p>
            </div>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-4"
          >
            {activeShares.map((share) => (
              <motion.div
                key={share.id}
                variants={item}
                className="border border-slate-200 rounded-xl bg-white shadow-sm overflow-hidden"
              >
                {/* Share header */}
                <div className="flex items-center justify-between p-5 pb-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center flex-shrink-0">
                      <span className="text-sm font-bold text-emerald-700">
                        {(share.guardian_name || "G").charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-slate-900 truncate">
                        {share.guardian_name}
                      </p>
                      <p className="text-xs text-slate-500 truncate">{share.guardian_email}</p>
                    </div>
                  </div>
                  <Badge variant="status" label="Active" color="green" dot />
                </div>

                {/* Permission toggles */}
                <div className="px-5 pb-4 space-y-3">
                  {PERMISSIONS.map((perm) => {
                    const isOn = !!share[perm.key];
                    const isBusy = updatingId === share.id;
                    return (
                      <div
                        key={perm.key}
                        className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-100"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                            {isOn
                              ? <Eye size={14} className="text-emerald-500" />
                              : <EyeOff size={14} className="text-slate-300" />
                            }
                          </div>
                          <div>
                            <p className="text-sm font-medium text-slate-700">{perm.label}</p>
                            <p className="text-xs text-slate-400">{perm.desc}</p>
                          </div>
                        </div>
                        <Toggle
                          checked={isOn}
                          onChange={() => handleTogglePermission(share, perm.key)}
                          disabled={isBusy}
                        />
                      </div>
                    );
                  })}
                </div>

                {/* Revoke button */}
                <div className="px-5 pb-5">
                  <button
                    onClick={() => handleRevoke(share.id)}
                    disabled={revokingId === share.id}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {revokingId === share.id ? (
                      <>
                        <Loader2 size={14} className="animate-spin" />
                        Revoking...
                      </>
                    ) : (
                      <>
                        <Trash2 size={14} />
                        Revoke Access
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      {/* ── Revoked Shares ───────────────────────────────── */}
      {revokedShares.length > 0 && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center flex-shrink-0">
              <Clock size={16} className="text-slate-400" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-bold text-slate-900">Revoked Shares</h2>
              <p className="text-sm text-slate-500">
                Previously shared access that has been revoked
              </p>
            </div>
          </div>

          <motion.div
            variants={container}
            initial="hidden"
            animate="show"
            className="space-y-3"
          >
            {revokedShares.map((share) => (
              <motion.div
                key={share.id}
                variants={item}
                className="flex items-center justify-between p-4 border border-slate-200 rounded-xl bg-slate-50"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-slate-400">
                      {(share.guardian_name || "G").charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-500 truncate">
                      {share.guardian_name}
                    </p>
                    <p className="text-xs text-slate-400 truncate">{share.guardian_email}</p>
                  </div>
                </div>
                <Badge variant="status" label="Revoked" color="red" dot />
              </motion.div>
            ))}
          </motion.div>
        </div>
      )}

      {/* ── Privacy Note ─────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.3 }}
        className="bg-slate-50 border border-slate-200 rounded-xl p-4"
      >
        <div className="flex items-start gap-3">
          <Shield size={16} className="text-slate-400 mt-0.5 flex-shrink-0" />
          <p className="text-xs text-slate-500 leading-relaxed">
            Guardian access is strictly student-controlled. Guardians receive a read-only
            summary link and cannot modify, request, or expand their access. All sharing
            activity is logged for your records.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
