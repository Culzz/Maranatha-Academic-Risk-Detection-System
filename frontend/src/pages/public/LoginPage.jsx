/**
 * LoginPage — Maranatha University
 * Forgot password flow, Remember Me, attempt counter + lockout UI,
 * adaptive error messages (not found vs wrong password vs locked)
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Hash, Lock, LogIn, ArrowLeft, Eye, EyeOff, AlertCircle,
  Mail, CheckCircle, RefreshCw, Shield,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { BASE_URL } from "../../services/api";
import crest from "../../assets/maranatha-crest.png";

const MAX_ATTEMPTS = 5;

// Adaptive error classification
function classifyError(detail = "") {
  const d = detail.toLowerCase();
  if (d.includes("not activated"))  return "Account not activated. Please check your email for the confirmation link.";
  if (d.includes("not confirmed"))  return "Email not confirmed. Please check your email for the confirmation link.";
  if (d.includes("locked") || d.includes("disabled")) return "Your account has been locked. Contact IT support.";
  return "Incorrect credentials. Please check your Matric Number / Staff ID and password.";
}

const inputCls = [
  "w-full h-10 bg-white border border-slate-200 rounded-xl text-sm text-primary",
  "pl-9 pr-4 outline-none transition-all placeholder:text-slate-400",
  "focus:ring-2 focus:ring-accent/15 focus:border-accent/40 hover:border-slate-300",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50",
].join(" ");

// ── Sub-view: Forgot Password ────────────────────────────
function ForgotView({ onBack }) {
  const [step,    setStep]    = useState("form"); // form | sent
  const [idVal,   setIdVal]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  const submit = async () => {
    if (!idVal.trim()) { setError("Please enter your Matric Number or Staff ID."); return; }
    setLoading(true); setError("");
    try {
      const res  = await fetch(`${BASE_URL}/auth/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: idVal.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Request failed.");
      setStep("sent");
    } catch (e) {
      setError(e.message || "Could not connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (step === "sent") return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center text-center py-6 gap-4">
      <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center">
        <CheckCircle size={28} className="text-emerald-500" />
      </div>
      <div>
        <h3 className="font-serif text-xl font-semibold text-primary mb-2">Check your email</h3>
        <p className="text-slate-500 text-sm leading-relaxed max-w-xs mx-auto">
          If an account matching <span className="font-mono font-semibold text-primary">{idVal}</span> exists,
          a password reset link has been sent to the registered university email.
          The link expires in <strong>15 minutes</strong>.
        </p>
      </div>
      <p className="text-xs text-slate-400">Didn't receive it? Check your spam folder or contact IT support.</p>
      <button onClick={onBack} className="text-accent hover:text-accent-light text-sm font-semibold transition-colors">
        Back to Sign In
      </button>
    </motion.div>
  );

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
      <div>
        <h3 className="font-serif text-xl font-semibold text-primary mb-1">Reset Password</h3>
        <p className="text-slate-500 text-sm">Enter your ID and we'll send a reset link to your university email.</p>
      </div>
      {error && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
          <AlertCircle size={14} className="mt-0.5 flex-shrink-0" />{error}
        </div>
      )}
      <div>
        <label className="ds-label">Matric Number or Staff ID</label>
        <div className="relative">
          <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input type="text" placeholder="e.g. 22/CSC/007" value={idVal}
            onChange={e => setIdVal(e.target.value)} disabled={loading} className={inputCls} />
        </div>
      </div>
      <motion.button whileTap={{ scale: 0.98 }} onClick={submit} disabled={loading}
        className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold text-sm h-11 rounded-xl transition-all disabled:opacity-60">
        {loading ? <><RefreshCw size={14} className="animate-spin" /> Sending...</> : <><Mail size={14} /> Send Reset Link</>}
      </motion.button>
      <button onClick={onBack} className="w-full text-center text-slate-500 hover:text-primary text-sm transition-colors flex items-center justify-center gap-1.5">
        <ArrowLeft size={12} /> Back to Sign In
      </button>
    </motion.div>
  );
}

// ── Main LoginPage ───────────────────────────────────────
const DASHBOARD = { student: "/student", lecturer: "/lecturer", admin: "/admin" };

export default function LoginPage() {
  const { login }                    = useAuth();
  const navigate                     = useNavigate();
  const location                     = useLocation();
  const from                         = location.state?.from;
  const [view,       setView]       = useState("login"); // login | forgot
  const [id,         setId]         = useState("");
  const [pwd,        setPwd]        = useState("");
  const [showPwd,    setShowPwd]    = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error,      setError]      = useState("");
  const [loading,    setLoading]    = useState(false);
  const [attempts,   setAttempts]   = useState(0);
  const locked = attempts >= MAX_ATTEMPTS;

  const submit = async (e) => {
    e.preventDefault();
    if (locked) return;
    if (!id.trim() || !pwd) { setError("Please enter your ID and password."); return; }
    setLoading(true); setError("");

    try {
      const form = new FormData();
      form.append("username", id.trim());
      form.append("password", pwd);
      const url = rememberMe ? `${BASE_URL}/auth/login?remember_me=true` : `${BASE_URL}/auth/login`;
      const res  = await fetch(url, { method: "POST", body: form });
      const data = await res.json();
      const payload = (data && data.success && data.data) ? data.data : data;
      if (!res.ok) {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        setError(
          newAttempts >= MAX_ATTEMPTS
            ? `Account locked after ${MAX_ATTEMPTS} failed attempts. Contact IT support.`
            : classifyError(data.detail || data.error) + ` (${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? "" : "s"} remaining)`
        );
        return;
      }

      // MFA required — redirect to TOTP verification page
      if (payload.mfa_required) {
        navigate("/mfa-verify", {
          state: { user_id: payload.user_id, role: payload.role, full_name: payload.full_name, remember_me: rememberMe },
          replace: true,
        });
        return;
      }

      login(
        { full_name: payload.full_name, role: payload.role, user_id: payload.user_id, admin_level: payload.admin_level || "" },
        payload.access_token,
        payload.refresh_token || "",
        rememberMe,
      );
      navigate(from || DASHBOARD[payload.role] || "/student", { replace: true });
    } catch {
      setError("Could not connect to the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans bg-slate-50">

      {/* ── Brand Panel ────────────────────────────────────── */}
      <div className="hidden lg:flex w-[420px] flex-shrink-0 bg-primary flex-col items-center justify-center px-12 text-center border-r border-white/[0.04]">
        <img src={crest} alt="Maranatha University" className="w-20 h-20 object-contain mb-8 opacity-90" />
        <div className="w-10 h-px bg-accent mx-auto mb-8" />
        <h2 className="font-serif text-2xl font-semibold text-white leading-snug mb-6">Academic Risk Detection System</h2>
        <p className="text-slate-300 text-base leading-relaxed max-w-[280px] mb-10">
          Identifying at-risk students early, explaining why with SHAP, and guiding them to success — powered by machine learning and AI.
        </p>
        <ul className="text-left space-y-4 max-w-[280px] text-sm">
          {[
            "24-feature ML risk model with SHAP explanations",
            "AI tutor grounded in your course materials",
            "Real-time engagement tracking and notifications",
            "Personalised intervention recommendations",
            "QR-based attendance and smart to-do lists",
          ].map((pt, i) => (
            <li key={i} className="flex items-start gap-3 text-slate-300">
              <div className="w-2 h-2 bg-accent rounded-full mt-2 flex-shrink-0" />
              {pt}
            </li>
          ))}
        </ul>
        <div className="mt-10 flex items-center gap-2 text-slate-500 text-xs">
          <Shield size={11} /> NDPR Compliant · Secure Access
        </div>
      </div>

      {/* ── Form Panel ─────────────────────────────────────── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.36, ease: "easeOut" }} className="w-full max-w-[400px]">

          <button onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-slate-500 hover:text-primary text-sm mb-8 transition-colors">
            <ArrowLeft size={14} /> Back to home
          </button>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8">
            {/* Mobile crest */}
            <div className="flex items-center gap-3 mb-8 lg:hidden">
              <img src={crest} alt="" className="w-10 h-10 object-contain" />
              <h1 className="font-serif text-xl font-semibold text-primary">Maranatha University</h1>
            </div>

            <AnimatePresence mode="wait">
              {view === "forgot" ? (
                <motion.div key="forgot" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
                  <ForgotView onBack={() => { setView("login"); setError(""); }} />
                </motion.div>
              ) : (
                <motion.div key="login" initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 20 }}>
                  <h1 className="font-serif text-2xl font-semibold text-primary mb-2" style={{ letterSpacing: "-0.022em" }}>Sign In</h1>
                  <p className="text-slate-500 text-sm mb-8">Enter your student or staff credentials</p>

                  {/* Lockout banner */}
                  {locked && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-2.5 bg-red-50 border border-red-300 rounded-xl px-4 py-3 text-sm text-red-800 mb-6">
                      <Shield size={16} className="flex-shrink-0 mt-0.5 text-red-600" />
                      <div>
                        <p className="font-semibold">Account Locked</p>
                        <p className="text-red-700 mt-0.5">Too many failed attempts. Contact IT support at itsupport@maranatha.edu.ng</p>
                      </div>
                    </motion.div>
                  )}

                  {/* Error */}
                  {error && !locked && (
                    <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
                      className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-6">
                      <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />{error}
                    </motion.div>
                  )}

                  {/* Attempt progress dots */}
                  {attempts > 0 && !locked && (
                    <div className="flex items-center gap-1.5 mb-4">
                      <span className="text-xs text-slate-400 mr-1">Attempts:</span>
                      {Array.from({ length: MAX_ATTEMPTS }).map((_, i) => (
                        <div key={i}
                          className={`w-2 h-2 rounded-full transition-colors ${i < attempts ? "bg-red-400" : "bg-slate-200"}`} />
                      ))}
                    </div>
                  )}

                  <form onSubmit={submit} noValidate className="space-y-5">
                    <div>
                      <label className="ds-label">Matric Number or Staff ID</label>
                      <div className="relative">
                        <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type="text" autoComplete="username" placeholder="e.g. 22/CSC/007 or STAFF/001"
                          value={id} onChange={e => setId(e.target.value)} disabled={loading || locked} className={inputCls} />
                      </div>
                    </div>

                    <div>
                      <label className="ds-label">Password</label>
                      <div className="relative">
                        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input type={showPwd ? "text" : "password"} autoComplete="current-password"
                          placeholder="Enter your password" value={pwd}
                          onChange={e => setPwd(e.target.value)} disabled={loading || locked}
                          className={inputCls + " pr-10"} />
                        <button type="button" onClick={() => setShowPwd(v => !v)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                          aria-label={showPwd ? "Hide password" : "Show password"}>
                          {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      </div>
                    </div>

                    {/* Remember Me + Forgot Password */}
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2.5 cursor-pointer select-none">
                        <input type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                          className="w-4 h-4 rounded accent-accent" />
                        <span className="text-sm text-slate-600">Remember me</span>
                      </label>
                      <button type="button" onClick={() => setView("forgot")}
                        className="text-xs text-accent hover:text-accent-light transition-colors font-medium">
                        Forgot password?
                      </button>
                    </div>

                    <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={loading || locked}
                      className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold text-sm h-11 rounded-xl transition-all disabled:opacity-60 shadow-lg hover:shadow-xl">
                      {loading
                        ? <><RefreshCw size={14} className="animate-spin" /> Signing in...</>
                        : <><LogIn size={16} /> Sign In</>
                      }
                    </motion.button>
                  </form>

                  <p className="text-center text-sm text-slate-500 mt-6">
                    No account yet?{" "}
                    <button onClick={() => navigate("/register")} className="text-accent hover:text-accent-light font-semibold transition-colors">
                      Register here
                    </button>
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
