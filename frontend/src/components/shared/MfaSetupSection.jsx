/**
 * MfaSetupSection — embedded in ProfilePage for MFA enrollment/management.
 * Allows users to enable/disable TOTP-based two-factor authentication.
 * Shows one-time recovery codes after setup for account recovery.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ShieldCheck, ShieldOff, Copy, Check, AlertCircle, RefreshCw, Download, Key } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";

export default function MfaSetupSection() {
  const { token } = useAuth();
  const [mfaStatus, setMfaStatus] = useState(null); // null = loading, { mfa_enabled, recovery_codes_remaining }
  const [setupData, setSetupData] = useState(null);
  const [recoveryCodes, setRecoveryCodes] = useState(null); // shown once after setup
  const [code, setCode] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [copied, setCopied] = useState(false);
  const [step, setStep] = useState("idle"); // idle | setup | recovery | disable | regen

  useEffect(() => {
    if (!token) return;
    api.get("/mfa/status", { token })
      .then(d => setMfaStatus(d || { mfa_enabled: false, recovery_codes_remaining: 0 }))
      .catch(() => setMfaStatus({ mfa_enabled: false, recovery_codes_remaining: 0 }));
  }, [token]);

  const enabled = mfaStatus?.mfa_enabled;

  const startSetup = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await api.post("/mfa/setup", undefined, { token });
      setSetupData(data);
      setStep("setup");
    } catch (err) {
      setError(err.message || "Failed to start MFA setup.");
    } finally {
      setLoading(false);
    }
  };

  const confirmSetup = async () => {
    if (code.length !== 6) { setError("Enter the 6-digit code from your authenticator app."); return; }
    setLoading(true);
    setError("");
    try {
      const data = await api.post("/mfa/confirm-setup", { code }, { token });
      setRecoveryCodes(data.recovery_codes);
      setMfaStatus({ mfa_enabled: true, recovery_codes_remaining: data.recovery_codes.length });
      setStep("recovery");
      setSetupData(null);
      setCode("");
    } catch (err) {
      setError(err.message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  const disableMfa = async () => {
    if (disableCode.length < 6) { setError("Enter a valid code."); return; }
    setLoading(true);
    setError("");
    try {
      await api.post("/mfa/disable", { code: disableCode }, { token });
      setMfaStatus({ mfa_enabled: false, recovery_codes_remaining: 0 });
      setStep("idle");
      setDisableCode("");
      setSuccess("Two-factor authentication disabled.");
      setTimeout(() => setSuccess(""), 5000);
    } catch (err) {
      setError(err.message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  const regenerateCodes = async () => {
    if (code.length !== 6) { setError("Enter a 6-digit code to confirm."); return; }
    setLoading(true);
    setError("");
    try {
      const data = await api.post("/mfa/regenerate-recovery-codes", { code }, { token });
      setRecoveryCodes(data.recovery_codes);
      setMfaStatus(prev => ({ ...prev, recovery_codes_remaining: data.recovery_codes.length }));
      setStep("recovery");
      setCode("");
    } catch (err) {
      setError(err.message || "Invalid code.");
    } finally {
      setLoading(false);
    }
  };

  const copySecret = () => {
    if (setupData?.secret) {
      navigator.clipboard.writeText(setupData.secret);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const text = "Maranatha University — MFA Recovery Codes\n"
      + "Save these codes in a safe place.\n"
      + "Each code can only be used once.\n\n"
      + recoveryCodes.map((c, i) => `${i + 1}. ${c}`).join("\n");
    const blob = new Blob([text], { type: "text/plain" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "maranatha-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const copyCodes = () => {
    if (!recoveryCodes) return;
    navigator.clipboard.writeText(recoveryCodes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (mfaStatus === null) return null;

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${enabled ? "bg-emerald-50 border border-emerald-200" : "bg-slate-50 border border-slate-200"}`}>
          {enabled ? <ShieldCheck size={20} className="text-emerald-600" /> : <Shield size={20} className="text-slate-400" />}
        </div>
        <div>
          <h3 className="font-semibold text-primary">Two-Factor Authentication</h3>
          <p className="text-xs text-slate-500">
            {enabled
              ? `Enabled — ${mfaStatus.recovery_codes_remaining} recovery code${mfaStatus.recovery_codes_remaining === 1 ? "" : "s"} remaining`
              : "Not enabled — add an extra layer of security"}
          </p>
        </div>
      </div>

      {success && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 text-sm text-emerald-700 mb-4">
          <Check size={14} /> {success}
        </motion.div>
      )}

      {error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5 text-sm text-red-700 mb-4">
          <AlertCircle size={14} /> {error}
        </motion.div>
      )}

      {/* Low recovery codes warning */}
      {enabled && step === "idle" && mfaStatus.recovery_codes_remaining > 0 && mfaStatus.recovery_codes_remaining <= 2 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 text-sm text-amber-700 mb-4">
          <AlertCircle size={14} /> Only {mfaStatus.recovery_codes_remaining} recovery code{mfaStatus.recovery_codes_remaining === 1 ? "" : "s"} left. Consider regenerating.
        </div>
      )}

      <AnimatePresence mode="wait">
        {/* ── Not enabled, start setup ─────────────────────── */}
        {step === "idle" && !enabled && (
          <motion.div key="enable" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="text-sm text-slate-500 mb-4">
              Use an authenticator app like Google Authenticator or Authy to generate login codes.
            </p>
            <button onClick={startSetup} disabled={loading}
              className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-60">
              {loading ? <RefreshCw size={14} className="animate-spin" /> : <Shield size={14} />}
              Enable Two-Factor
            </button>
          </motion.div>
        )}

        {/* ── QR code scanning step ────────────────────────── */}
        {step === "setup" && setupData && (
          <motion.div key="setup" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-4">
            <p className="text-sm text-slate-600">
              <strong>Step 1:</strong> Scan this QR code with your authenticator app.
            </p>
            <div className="flex justify-center">
              <img src={setupData.qr_code_base64} alt="MFA QR Code" loading="lazy" className="w-48 h-48 rounded-xl border border-slate-200" />
            </div>
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5">
              <code className="text-xs font-mono text-slate-700 flex-1 break-all">{setupData.secret}</code>
              <button onClick={copySecret} className="text-slate-400 hover:text-primary transition-colors p-1">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>
            <p className="text-xs text-slate-400">Can't scan? Enter the code above manually in your authenticator app.</p>
            <p className="text-sm text-slate-600 mt-2">
              <strong>Step 2:</strong> Enter the 6-digit code from your app to verify.
            </p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="flex-1 h-11 bg-white border border-slate-200 rounded-xl text-center text-lg font-mono tracking-[0.3em]
                  outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50"
              />
              <button onClick={confirmSetup} disabled={loading || code.length !== 6}
                className="bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-60">
                {loading ? <RefreshCw size={14} className="animate-spin" /> : "Verify"}
              </button>
            </div>
            <button onClick={() => { setStep("idle"); setSetupData(null); setCode(""); setError(""); }}
              className="text-sm text-slate-500 hover:text-primary transition-colors">
              Cancel setup
            </button>
          </motion.div>
        )}

        {/* ── Recovery codes display ───────────────────────── */}
        {step === "recovery" && recoveryCodes && (
          <motion.div key="recovery" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-4">
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
              <p className="font-semibold mb-1">Save your recovery codes</p>
              <p>If you lose access to your authenticator app, you can use one of these codes to sign in. Each code can only be used once. <strong>They will not be shown again.</strong></p>
            </div>
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 grid grid-cols-2 gap-2">
              {recoveryCodes.map((c, i) => (
                <code key={i} className="text-sm font-mono text-slate-700 bg-white rounded-lg px-3 py-1.5 text-center border border-slate-100">
                  {c}
                </code>
              ))}
            </div>
            <div className="flex gap-2">
              <button onClick={downloadCodes}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-dark transition-colors px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50">
                <Download size={14} /> Download
              </button>
              <button onClick={copyCodes}
                className="flex items-center gap-1.5 text-sm font-medium text-primary hover:text-primary-dark transition-colors px-3 py-2 border border-slate-200 rounded-xl hover:bg-slate-50">
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />} Copy
              </button>
            </div>
            <button onClick={() => { setStep("idle"); setRecoveryCodes(null); setSuccess("Two-factor authentication enabled!"); setTimeout(() => setSuccess(""), 5000); }}
              className="w-full bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all">
              I've saved my codes
            </button>
          </motion.div>
        )}

        {/* ── Enabled — actions ────────────────────────────── */}
        {step === "idle" && enabled && (
          <motion.div key="enabled" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-wrap gap-2">
            <button onClick={() => { setStep("regen"); setCode(""); setError(""); }}
              className="flex items-center gap-2 text-primary border border-slate-200 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all hover:bg-slate-50">
              <Key size={14} /> Regenerate Recovery Codes
            </button>
            <button onClick={() => { setStep("disable"); setDisableCode(""); setError(""); }}
              className="flex items-center gap-2 text-red-600 hover:text-red-700 border border-red-200 text-sm font-semibold px-5 py-2.5 rounded-xl transition-all hover:bg-red-50">
              <ShieldOff size={14} /> Disable
            </button>
          </motion.div>
        )}

        {/* ── Regenerate recovery codes ────────────────────── */}
        {step === "regen" && (
          <motion.div key="regen" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-3">
            <p className="text-sm text-slate-600">Enter a code from your authenticator app to generate new recovery codes. Previous codes will be invalidated.</p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={6} value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="flex-1 h-11 bg-white border border-slate-200 rounded-xl text-center text-lg font-mono tracking-[0.3em]
                  outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50"
              />
              <button onClick={regenerateCodes} disabled={loading || code.length !== 6}
                className="bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-60">
                {loading ? <RefreshCw size={14} className="animate-spin" /> : "Regenerate"}
              </button>
            </div>
            <button onClick={() => { setStep("idle"); setCode(""); setError(""); }}
              className="text-sm text-slate-500 hover:text-primary transition-colors">
              Cancel
            </button>
          </motion.div>
        )}

        {/* ── Disable MFA ──────────────────────────────────── */}
        {step === "disable" && (
          <motion.div key="disable" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="space-y-3">
            <p className="text-sm text-slate-600">Enter a code from your authenticator app or a recovery code to confirm.</p>
            <div className="flex gap-2">
              <input type="text" inputMode="numeric" maxLength={8} value={disableCode}
                onChange={e => setDisableCode(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit or 8-digit code"
                className="flex-1 h-11 bg-white border border-slate-200 rounded-xl text-center text-lg font-mono tracking-[0.3em]
                  outline-none focus:ring-2 focus:ring-accent/20 focus:border-accent/50"
              />
              <button onClick={disableMfa} disabled={loading || disableCode.length < 6}
                className="bg-red-600 hover:bg-red-700 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-all disabled:opacity-60">
                {loading ? <RefreshCw size={14} className="animate-spin" /> : "Confirm"}
              </button>
            </div>
            <button onClick={() => { setStep("idle"); setDisableCode(""); setError(""); }}
              className="text-sm text-slate-500 hover:text-primary transition-colors">
              Cancel
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
