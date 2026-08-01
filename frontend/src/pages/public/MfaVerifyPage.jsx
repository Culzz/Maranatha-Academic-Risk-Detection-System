/**
 * MfaVerifyPage — shown after login when MFA is required.
 * Accepts a 6-digit TOTP code or an 8-digit recovery code.
 */
import { useState, useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import { Shield, ArrowLeft, RefreshCw, AlertCircle, Key } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";

const DASHBOARD = { student: "/student", lecturer: "/lecturer", admin: "/admin" };

export default function MfaVerifyPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const mfaData = location.state;

  const [mode, setMode] = useState("totp"); // totp | recovery
  const [code, setCode] = useState(["", "", "", "", "", ""]);
  const [recoveryCode, setRecoveryCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (!mfaData?.user_id) navigate("/login", { replace: true });
  }, [mfaData, navigate]);

  const handleChange = (idx, val) => {
    if (!/^\d*$/.test(val)) return;
    const next = [...code];
    next[idx] = val.slice(-1);
    setCode(next);
    if (val && idx < 5) inputRefs.current[idx + 1]?.focus();
  };

  const handleKeyDown = (idx, e) => {
    if (e.key === "Backspace" && !code[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(""));
      inputRefs.current[5]?.focus();
      e.preventDefault();
    }
  };

  const completeLogin = (data) => {
    login(
      { full_name: data.full_name, role: data.role, user_id: data.user_id },
      data.access_token,
      data.refresh_token || "",
      mfaData.remember_me,
    );
    navigate(DASHBOARD[data.role] || "/student", { replace: true });
  };

  const submitTotp = async (e) => {
    e?.preventDefault();
    const codeStr = code.join("");
    if (codeStr.length !== 6) { setError("Please enter all 6 digits."); return; }
    setLoading(true);
    setError("");
    try {
      const data = await api.post("/mfa/verify", {
        user_id: mfaData.user_id, code: codeStr, remember_me: mfaData.remember_me || false,
      });
      completeLogin(data);
    } catch (err) {
      setError(err.message || "Invalid code. Please try again.");
      setCode(["", "", "", "", "", ""]);
      inputRefs.current[0]?.focus();
    } finally {
      setLoading(false);
    }
  };

  const submitRecovery = async (e) => {
    e?.preventDefault();
    const cleaned = recoveryCode.trim();
    if (cleaned.length !== 8) { setError("Recovery codes are 8 digits."); return; }
    setLoading(true);
    setError("");
    try {
      const data = await api.post("/mfa/verify", {
        user_id: mfaData.user_id, code: cleaned, remember_me: mfaData.remember_me || false,
      });
      completeLogin(data);
    } catch (err) {
      setError(err.message || "Invalid recovery code.");
      setRecoveryCode("");
    } finally {
      setLoading(false);
    }
  };

  // Auto-submit TOTP when all 6 digits entered
  useEffect(() => {
    if (mode === "totp" && code.every(d => d !== "")) submitTotp();
  }, [code]);

  if (!mfaData?.user_id) return null;

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-[400px]">

        <button onClick={() => navigate("/login")}
          className="flex items-center gap-1.5 text-slate-500 hover:text-primary text-sm mb-8 transition-colors">
          <ArrowLeft size={14} /> Back to Sign In
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl p-8 text-center">
          <div className="w-14 h-14 bg-accent/10 border border-accent/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            {mode === "totp" ? <Shield size={24} className="text-accent" /> : <Key size={24} className="text-accent" />}
          </div>

          <h1 className="font-serif text-2xl font-semibold text-primary mb-2">
            {mode === "totp" ? "Two-Factor Authentication" : "Recovery Code"}
          </h1>
          <p className="text-slate-500 text-sm mb-8">
            {mode === "totp"
              ? "Enter the 6-digit code from your authenticator app"
              : "Enter one of your 8-digit recovery codes"
            }
          </p>

          {error && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700 mb-6">
              <AlertCircle size={14} className="flex-shrink-0" /> {error}
            </motion.div>
          )}

          {mode === "totp" ? (
            <form onSubmit={submitTotp}>
              <div className="flex justify-center gap-2 mb-8" onPaste={handlePaste}>
                {code.map((digit, i) => (
                  <input
                    key={i}
                    ref={el => inputRefs.current[i] = el}
                    type="text"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    onChange={e => handleChange(i, e.target.value)}
                    onKeyDown={e => handleKeyDown(i, e)}
                    disabled={loading}
                    className="w-11 h-14 text-center text-xl font-mono font-semibold bg-white border border-slate-200 rounded-xl outline-none
                      focus:ring-2 focus:ring-accent/20 focus:border-accent/50 transition-all disabled:opacity-50"
                    autoFocus={i === 0}
                  />
                ))}
              </div>

              <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={loading}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold text-sm h-11 rounded-xl transition-all disabled:opacity-60">
                {loading ? <><RefreshCw size={14} className="animate-spin" /> Verifying...</> : "Verify Code"}
              </motion.button>
            </form>
          ) : (
            <form onSubmit={submitRecovery}>
              <input
                type="text"
                inputMode="numeric"
                maxLength={8}
                value={recoveryCode}
                onChange={e => setRecoveryCode(e.target.value.replace(/\D/g, ""))}
                placeholder="00000000"
                disabled={loading}
                autoFocus
                className="w-full h-14 text-center text-2xl font-mono font-semibold bg-white border border-slate-200 rounded-xl outline-none
                  focus:ring-2 focus:ring-accent/20 focus:border-accent/50 transition-all disabled:opacity-50 mb-8 tracking-[0.3em]"
              />

              <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={loading || recoveryCode.length !== 8}
                className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold text-sm h-11 rounded-xl transition-all disabled:opacity-60">
                {loading ? <><RefreshCw size={14} className="animate-spin" /> Verifying...</> : "Use Recovery Code"}
              </motion.button>
            </form>
          )}

          <button
            onClick={() => { setMode(mode === "totp" ? "recovery" : "totp"); setError(""); }}
            className="mt-6 text-sm text-accent hover:text-accent-light font-medium transition-colors">
            {mode === "totp" ? "Lost your authenticator? Use a recovery code" : "Back to authenticator code"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
