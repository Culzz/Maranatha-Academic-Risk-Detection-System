/**
 * ResetPasswordPage — Validates a reset token from the URL and lets
 * the user choose a new password.  POST /api/auth/reset-password
 */
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { motion } from "framer-motion";
import { Lock, Eye, EyeOff, CheckCircle, AlertCircle, ArrowLeft, RefreshCw } from "lucide-react";
import crest from "../../assets/maranatha-crest.png";

const inputCls = [
  "w-full h-10 bg-white border border-slate-200 rounded-xl text-sm text-primary",
  "pl-9 pr-10 outline-none transition-all placeholder:text-slate-400",
  "focus:ring-2 focus:ring-accent/15 focus:border-accent/40 hover:border-slate-300",
].join(" ");

const RULES = [
  { label: "At least 8 characters", test: v => v.length >= 8 },
  { label: "One uppercase letter",  test: v => /[A-Z]/.test(v) },
  { label: "One lowercase letter",  test: v => /[a-z]/.test(v) },
  { label: "One number",            test: v => /\d/.test(v) },
  { label: "One special character", test: v => /[^A-Za-z0-9]/.test(v) },
];

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm,  setConfirm]  = useState("");
  const [showPwd,  setShowPwd]  = useState(false);
  const [showConf, setShowConf] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState("");
  const [done,     setDone]     = useState(false);

  const allValid = RULES.every(r => r.test(password));
  const matched  = password && confirm && password === confirm;

  const submit = async (e) => {
    e.preventDefault();
    if (!allValid)  { setError("Password does not meet all requirements."); return; }
    if (!matched)   { setError("Passwords do not match."); return; }
    if (!token)     { setError("Missing reset token. Please use the link from your email."); return; }

    setLoading(true); setError("");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: password }),
      });
      const data = await res.json();
      const body = data?.data ?? data;
      if (!res.ok) throw new Error(body.detail || "Reset failed.");
      setDone(true);
    } catch (e) {
      setError(e.message || "Could not connect. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-md text-center">
          <AlertCircle size={32} className="text-red-500 mx-auto mb-4" />
          <h2 className="font-serif text-xl font-semibold text-primary mb-2">Invalid Link</h2>
          <p className="text-slate-500 text-sm mb-6">
            This password reset link is missing its token. Please use the link from your email,
            or request a new one from the login page.
          </p>
          <button onClick={() => navigate("/login")}
            className="text-accent hover:text-accent-light font-semibold text-sm transition-colors">
            Back to Sign In
          </button>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6">
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CheckCircle size={28} className="text-emerald-500" />
          </div>
          <h2 className="font-serif text-xl font-semibold text-primary mb-2">Password Updated</h2>
          <p className="text-slate-500 text-sm mb-6">
            Your password has been changed successfully. You can now sign in with your new password.
          </p>
          <button onClick={() => navigate("/login")}
            className="inline-flex items-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold text-sm px-6 py-2.5 rounded-xl transition-all">
            Sign In
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-6 py-12">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36 }} className="w-full max-w-[420px]">

        <button onClick={() => navigate("/login")}
          className="flex items-center gap-1.5 text-slate-500 hover:text-primary text-sm mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to Sign In
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8">
          <div className="flex items-center gap-3 mb-6">
            <img src={crest} alt="" className="w-9 h-9 object-contain" />
            <h1 className="font-serif text-xl font-semibold text-primary">Reset Password</h1>
          </div>

          <p className="text-slate-500 text-sm mb-6">Choose a strong new password for your account.</p>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700 mb-5">
              <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{error}
            </div>
          )}

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="ds-label">New Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type={showPwd ? "text" : "password"} autoComplete="new-password"
                  placeholder="Enter new password" value={password}
                  onChange={e => setPassword(e.target.value)} disabled={loading}
                  className={inputCls} />
                <button type="button" onClick={() => setShowPwd(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            {/* Strength rules */}
            {password && (
              <ul className="space-y-1">
                {RULES.map(r => (
                  <li key={r.label} className={`flex items-center gap-2 text-xs ${r.test(password) ? "text-emerald-600" : "text-slate-400"}`}>
                    <CheckCircle size={11} />{r.label}
                  </li>
                ))}
              </ul>
            )}

            <div>
              <label className="ds-label">Confirm Password</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input type={showConf ? "text" : "password"} autoComplete="new-password"
                  placeholder="Re-enter new password" value={confirm}
                  onChange={e => setConfirm(e.target.value)} disabled={loading}
                  className={inputCls} />
                <button type="button" onClick={() => setShowConf(v => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                  {showConf ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              {confirm && !matched && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match.</p>
              )}
            </div>

            <motion.button whileTap={{ scale: 0.98 }} type="submit"
              disabled={loading || !allValid || !matched}
              className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold text-sm h-11 rounded-xl transition-all disabled:opacity-60 shadow-lg">
              {loading
                ? <><RefreshCw size={14} className="animate-spin" /> Updating...</>
                : "Update Password"
              }
            </motion.button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}
