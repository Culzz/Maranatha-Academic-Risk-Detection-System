/**
 * RegisterPage — Maranatha University (Student Registration)
 * Regex matric validation, password strength meter, live confirm match,
 * localStorage draft saving, searchable department dropdown, AbortController
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  User, Mail, Lock, Eye, EyeOff, Hash,
  ArrowLeft, UserPlus,
  AlertCircle, CheckCircle, RefreshCw,
} from "lucide-react";
import CustomDropdown from "../../components/ui/CustomDropdown";
import { BASE_URL, unwrapEnvelope, extractErrorMessage } from "../../services/api";
import crest from "../../assets/maranatha-crest.png";

/* ── Constants ──────────────────────────────────────────── */
// Departments are loaded from the API in RegisterPage — see useEffect below.
const LEVELS = [
  { value: "100", label: "100 Level — Year 1" },
  { value: "200", label: "200 Level — Year 2" },
  { value: "300", label: "300 Level — Year 3" },
  { value: "400", label: "400 Level — Year 4" },
  { value: "500", label: "500 Level — Year 5" },
];

const MATRIC_RE  = /^\d{2}\/[A-Z]{2,4}\/\d{3}$/i;
const DRAFT_KEY  = "register_draft";

/* ── Password strength ──────────────────────────────────── */
function scorePassword(pwd) {
  let score = 0;
  if (pwd.length >= 8)                   score++;
  if (pwd.length >= 12)                  score++;
  if (/[A-Z]/.test(pwd))                 score++;
  if (/[a-z]/.test(pwd))                 score++;
  if (/[0-9]/.test(pwd))                 score++;
  if (/[^A-Za-z0-9]/.test(pwd))         score++;
  return score; // 0–6
}
const STRENGTH_LABELS = ["", "Very Weak", "Weak", "Fair", "Good", "Strong", "Very Strong"];
const STRENGTH_COLORS = ["", "bg-red-500", "bg-red-400", "bg-amber-400", "bg-amber-500", "bg-emerald-400", "bg-emerald-500"];
const STRENGTH_TEXT   = ["", "text-red-600", "text-red-500", "text-amber-600", "text-amber-600", "text-emerald-600", "text-emerald-600"];

function PasswordStrength({ password }) {
  if (!password) return null;
  const score = scorePassword(password);
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex gap-1">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${i < score ? STRENGTH_COLORS[score] : "bg-slate-200"}`} />
        ))}
      </div>
      <p className={`text-xs font-medium ${STRENGTH_TEXT[score]}`}>{STRENGTH_LABELS[score]}</p>
    </div>
  );
}

/* ── Inline field validation ────────────────────────────── */
function FieldHint({ value }) {
  if (!value) return null;
  const valid = MATRIC_RE.test(value.trim());
  return (
    <p className={`text-xs mt-1.5 flex items-center gap-1 ${valid ? "text-emerald-600" : "text-amber-600"}`}>
      {valid
        ? <><CheckCircle size={11} /> Format looks correct</>
        : <><AlertCircle size={11} /> Format should be <span className="font-mono">22/CSC/007</span></>
      }
    </p>
  );
}

const inputCls = [
  "w-full h-10 bg-white border border-slate-200 rounded-xl text-sm text-primary",
  "pl-9 pr-4 outline-none transition-all placeholder:text-slate-400",
  "focus:ring-2 focus:ring-accent/15 focus:border-accent/40 hover:border-slate-300",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50",
].join(" ");

/* ── Main Component ─────────────────────────────────────── */
const BLANK = {
  full_name: "", email: "", identifier: "", password: "", confirm: "",
  department_id: "", level: "",
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const [form,    setForm]    = useState(() => {
    try { const d = JSON.parse(localStorage.getItem(DRAFT_KEY)); return d ? { ...BLANK, ...d, password: "", confirm: "" } : BLANK; }
    catch { return BLANK; }
  });
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState("");
  const [success,  setSuccess]  = useState(false);
  const [autoConfirmed, setAutoConfirmed] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [departments, setDepartments] = useState([]);
  const [matricValidated,  setMatricValidated]  = useState(false);
  const [validatingMatric, setValidatingMatric] = useState(false);
  const [matricMsg,        setMatricMsg]        = useState({ ok: false, text: "" });
  const abortRef = useRef(null);

  // Load departments from API and clear any stale draft that has a non-existent department_id
  useEffect(() => {
    fetch(`${BASE_URL}/auth/departments`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setDepartments(data);
          // If the saved draft has a department_id not in the live list, clear it
          const validIds = new Set(data.map(d => d.value));
          setForm(prev => ({
            ...prev,
            department_id: validIds.has(String(prev.department_id)) ? prev.department_id : "",
          }));
        }
      })
      .catch(() => {}); // silently fallback — form still usable, just no options
  }, []);

  // Reset matric validation whenever the matric field or role changes
  useEffect(() => {
    setMatricValidated(false);
    setMatricMsg({ ok: false, text: "" });
  }, [form.identifier]);

  // Draft saving — exclude passwords
  useEffect(() => {
    const { password, confirm, ...safe } = form;
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify(safe)); } catch {}
  }, [form]);

  const set = (key) => (val) =>
    setForm(p => ({ ...p, [key]: typeof val === "string" ? val : val?.target?.value ?? val }));

  /* ── Matric whitelist pre-validation ────────────────── */
  const validateMatric = async () => {
    if (!form.identifier.trim() || !form.full_name.trim()) {
      setMatricMsg({ ok: false, text: "Enter your full name and matric number first." }); return;
    }
    setValidatingMatric(true); setMatricMsg({ ok: false, text: "" });
    try {
      const res  = await fetch(`${BASE_URL}/auth/validate-matric`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ matric_number: form.identifier.trim(), full_name: form.full_name.trim() }),
      });
      const raw = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(raw, "Matric not found in whitelist."));
      setMatricValidated(true);
      setMatricMsg({ ok: true, text: "Matric number verified in university whitelist." });
    } catch (e) {
      setMatricValidated(false);
      setMatricMsg({ ok: false, text: e.message });
    } finally { setValidatingMatric(false); }
  };

  /* ── Validation ─────────────────────────────────────── */
  const validate = () => {
    if (!form.full_name.trim())    return "Full name is required.";
    if (!MATRIC_RE.test(form.identifier.trim()))
      return "Matric number format is invalid. Use e.g. 22/CSC/007";
    if (!matricValidated)
      return "Please validate your matric number against the university whitelist first.";
    if (!form.email.trim())        return "Email address is required.";
    if (scorePassword(form.password) < 2)
      return "Password is too weak. Add uppercase letters, numbers, and symbols.";
    if (form.password !== form.confirm)
      return "Passwords do not match.";
    return null;
  };

  /* ── Submit ─────────────────────────────────────────── */
  const submit = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true); setError("");

    abortRef.current = new AbortController();
    try {
      const payload = {
        full_name:     form.full_name.trim(),
        email:         form.email.trim(),
        password:      form.password,
        matric_number: form.identifier.trim(),
        department_id: form.department_id ? parseInt(form.department_id) : null,
        level:         form.level ? parseInt(form.level) : null,
      };
      const res  = await fetch(`${BASE_URL}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: abortRef.current.signal,
      });
      const raw = await res.json();
      if (!res.ok) { setError(extractErrorMessage(raw, "Registration failed.")); return; }
      const data = unwrapEnvelope(raw);
      localStorage.removeItem(DRAFT_KEY);
      setSuccess(true);
      if (data.auto_confirmed) {
        setAutoConfirmed(true);
        // Dev mode: account already active — redirect after short delay
        setTimeout(() => navigate("/login"), 2200);
      } else {
        setTimeout(() => navigate("/login"), 2200);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setError("Could not connect to the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  const pwdMatch  = form.confirm.length > 0 && form.confirm === form.password;
  const pwdNoMatch= form.confirm.length > 0 && form.confirm !== form.password;

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex items-start justify-center px-4 py-10">
      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: "easeOut" }} className="w-full max-w-[580px]">

        <button onClick={() => navigate("/login")} className="flex items-center gap-1.5 text-slate-500 hover:text-primary text-sm mb-6 transition-colors">
          <ArrowLeft size={14} /> Back to sign in
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Header */}
          <div className="bg-primary px-8 py-6">
            <div className="flex items-center gap-4">
              <img src={crest} alt="" className="w-12 h-12 object-contain flex-shrink-0" />
              <div>
                <p className="text-accent-light font-serif text-lg font-semibold leading-tight">Maranatha University Lagos</p>
                <p className="text-slate-400 text-xs uppercase tracking-widest mt-1">Academic Portal</p>
              </div>
            </div>
          </div>

          <div className="p-8">
            <h1 className="font-serif font-semibold text-primary mb-1" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>Student Registration</h1>
            <p className="text-slate-500 text-sm mb-7">Create your account to access risk insights, AI tutoring, and real-time engagement tracking</p>

            {/* Draft notice */}
            {Object.values({ ...form, password: "", confirm: "" }).some(v => v) && (
              <div className="flex items-center justify-between bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 mb-5">
                <p className="text-xs text-amber-700 flex items-center gap-1.5">
                  <RefreshCw size={11} /> Draft restored from your last visit
                </p>
                <button type="button" onClick={() => { setForm(BLANK); localStorage.removeItem(DRAFT_KEY); }}
                  className="text-xs text-amber-600 hover:text-amber-800 font-medium transition-colors">Clear</button>
              </div>
            )}

            {/* Errors / Success */}
            <AnimatePresence>
              {error && (
                <motion.div key="err" initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-5">
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />{error}
                </motion.div>
              )}
              {success && (
                <motion.div key="ok" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-800 text-sm font-medium mb-5">
                  <CheckCircle size={18} /> {autoConfirmed
                    ? "Account activated! Redirecting to login..."
                    : "Registration submitted! Please check your email to confirm your account."
                  }
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={submit} noValidate className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Full name */}
                <div className="md:col-span-2">
                  <label className="ds-label">Full Name <span className="text-risk-high">*</span></label>
                  <div className="relative">
                    <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="text" placeholder="As it appears on your university ID"
                      value={form.full_name} onChange={set("full_name")} disabled={loading} className={inputCls} />
                  </div>
                </div>

                {/* Matric Number */}
                <div className="md:col-span-2">
                  <label className="ds-label">Matric Number <span className="text-risk-high">*</span></label>
                  <div className="relative">
                    <Hash size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="text" placeholder="e.g. 22/CSC/007"
                      value={form.identifier} onChange={set("identifier")} disabled={loading} className={inputCls} />
                  </div>
                  <FieldHint value={form.identifier} />
                  <div className="mt-2 flex items-center gap-2 flex-wrap">
                    <motion.button type="button" whileTap={{ scale: 0.97 }}
                      onClick={validateMatric} disabled={validatingMatric || matricValidated}
                      className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl border border-accent/40 text-accent hover:bg-accent/5 transition-all disabled:opacity-50">
                      {validatingMatric
                        ? <><RefreshCw size={10} className="animate-spin" /> Checking...</>
                        : matricValidated
                          ? <><CheckCircle size={10} /> Verified</>
                          : "Validate Matric"
                      }
                    </motion.button>
                    {matricMsg.text && (
                      <p className={`text-xs flex items-center gap-1 ${matricMsg.ok ? "text-emerald-600" : "text-red-500"}`}>
                        {matricMsg.ok ? <CheckCircle size={10} /> : <AlertCircle size={10} />}
                        {matricMsg.text}
                      </p>
                    )}
                  </div>
                </div>

                {/* Email */}
                <div className="md:col-span-2">
                  <label className="ds-label">
                    Email Address <span className="text-risk-high">*</span>
                  </label>
                  <div className="relative">
                    <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="email" placeholder="e.g. yourname@gmail.com"
                      value={form.email} onChange={set("email")} disabled={loading} className={inputCls} />
                  </div>
                </div>

                {/* Department — searchable */}
                <div>
                  <CustomDropdown label="Department" placeholder="Search department..." required
                    value={form.department_id} onChange={set("department_id")}
                    options={departments} searchable disabled={loading} />
                </div>

                {/* Level */}
                <div>
                  <CustomDropdown label="Level" placeholder="Select level" required
                    value={form.level} onChange={set("level")} options={LEVELS} disabled={loading} />
                </div>

                {/* Password + strength meter */}
                <div>
                  <label className="ds-label">Password <span className="text-risk-high">*</span></label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type={showPwd ? "text" : "password"} placeholder="Min. 8 characters"
                      value={form.password} onChange={set("password")} disabled={loading} className={inputCls + " pr-10"} />
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                  <PasswordStrength password={form.password} />
                </div>

                {/* Confirm password — live match */}
                <div>
                  <label className="ds-label">Confirm Password <span className="text-risk-high">*</span></label>
                  <div className="relative">
                    <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input type="password" placeholder="Repeat password"
                      value={form.confirm} onChange={set("confirm")} disabled={loading}
                      className={[
                        inputCls,
                        pwdMatch   ? "border-emerald-400 focus:border-emerald-400 focus:ring-emerald-100" : "",
                        pwdNoMatch ? "border-red-300    focus:border-red-300    focus:ring-red-100"     : "",
                      ].join(" ")} />
                    {pwdMatch && (
                      <CheckCircle size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none" />
                    )}
                  </div>
                  {pwdNoMatch && <p className="text-xs text-red-500 mt-1.5">Passwords don't match</p>}
                  {pwdMatch   && <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1"><CheckCircle size={10} /> Passwords match</p>}
                </div>
              </div>

              <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={loading || success}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 rounded-xl transition-all disabled:opacity-60 shadow-lg text-sm">
                {loading
                  ? <><RefreshCw size={14} className="animate-spin" /> Creating account...</>
                  : <><UserPlus size={15} /> Create Account</>
                }
              </motion.button>
            </form>
          </div>

          <div className="px-8 py-5 border-t border-slate-200 text-center text-sm text-slate-500 bg-slate-50">
            Already have an account?{" "}
            <button onClick={() => navigate("/login")} className="text-accent hover:text-accent-dark font-semibold transition-colors">
              Sign in here
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}