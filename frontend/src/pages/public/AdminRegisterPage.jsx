/**
 * AdminRegisterPage — 3-Step Admin Registration
 * Step 1: Registration form (name, email, phone, password, admin level, faculty/dept)
 * Step 2: OTP verification (6-digit code sent to phone)
 * Step 3: Email confirmation notice
 */
import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  User, Mail, Lock, Eye, EyeOff, Phone,
  ArrowLeft, Shield, AlertCircle, CheckCircle,
  RefreshCw, ChevronRight,
} from "lucide-react";
import CustomDropdown from "../../components/ui/CustomDropdown";
import { BASE_URL } from "../../services/api";
import crest from "../../assets/maranatha-crest.png";

/* ── Constants ──────────────────────────────────────────── */
const ADMIN_LEVELS = [
  { value: "dap",  label: "Director of Academic Planning (DAP)" },
  { value: "dean", label: "Dean of Faculty" },
  { value: "hod",  label: "Head of Department (HOD)" },
];

/* ── Password strength ──────────────────────────────────── */
function scorePassword(pwd) {
  let score = 0;
  if (pwd.length >= 8)              score++;
  if (pwd.length >= 12)             score++;
  if (/[A-Z]/.test(pwd))            score++;
  if (/[a-z]/.test(pwd))            score++;
  if (/[0-9]/.test(pwd))            score++;
  if (/[^A-Za-z0-9]/.test(pwd))     score++;
  return score; // 0-6
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

/* ── Shared styles ──────────────────────────────────────── */
const inputCls = [
  "w-full h-10 bg-white border border-slate-200 rounded-xl text-sm text-primary",
  "pl-9 pr-4 outline-none transition-all placeholder:text-slate-400",
  "focus:ring-2 focus:ring-accent/15 focus:border-accent/40 hover:border-slate-300",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50",
].join(" ");

/* ── Step Indicator ─────────────────────────────────────── */
function StepIndicator({ current }) {
  const steps = ["Registration", "Verification", "Confirmation"];
  return (
    <div className="flex items-center justify-center gap-0 mb-8">
      {steps.map((label, i) => {
        const stepNum = i + 1;
        const isCompleted = stepNum < current;
        const isCurrent   = stepNum === current;
        return (
          <div key={i} className="flex items-center">
            {/* Circle */}
            <div className="flex flex-col items-center">
              <div
                className={[
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300",
                  isCompleted
                    ? "bg-accent text-white"
                    : isCurrent
                      ? "bg-accent text-white ring-4 ring-accent/20"
                      : "bg-slate-200 text-slate-400",
                ].join(" ")}
              >
                {isCompleted ? <CheckCircle size={16} /> : stepNum}
              </div>
              <span className={`text-xs mt-1.5 font-medium ${isCurrent ? "text-accent" : isCompleted ? "text-emerald-600" : "text-slate-400"}`}>
                {label}
              </span>
            </div>
            {/* Connector line */}
            {i < steps.length - 1 && (
              <div className={`w-16 h-0.5 mx-2 mb-5 transition-all duration-300 ${isCompleted ? "bg-accent" : "bg-slate-200"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── Main Component ─────────────────────────────────────── */
export default function AdminRegisterPage() {
  const navigate = useNavigate();

  /* ── State ────────────────────────────────────────────── */
  const [step, setStep] = useState(1);

  // Step 1 — form fields
  const [form, setForm] = useState({
    staff_id: "",
    full_name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    admin_level: "",
    faculty_id: "",
    department_id: "",
  });
  const [showPwd, setShowPwd]   = useState(false);
  const [error, setError]       = useState("");
  const [loading, setLoading]   = useState(false);

  // Dynamic options
  const [faculties, setFaculties]     = useState([]);
  const [departments, setDepartments] = useState([]);

  // Step 2 — OTP
  const [otp, setOtp]                 = useState(["", "", "", "", "", ""]);
  const [otpError, setOtpError]       = useState("");
  const [otpLoading, setOtpLoading]   = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [canResend, setCanResend]     = useState(false);
  const resendIntervalRef = useRef(null);

  // Dev mode helpers
  const [devOtp, setDevOtp]       = useState(null);
  const [devLink, setDevLink]     = useState(null);
  const [staffId, setStaffId]     = useState(null);

  /* ── Load faculties ───────────────────────────────────── */
  useEffect(() => {
    fetch(`${BASE_URL}/auth/admin/faculties`)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data))
          setFaculties(data.map(f => ({ value: String(f.id), label: f.name })));
      })
      .catch(() => {});
  }, []);

  /* ── Load departments (filtered by faculty when selected) ── */
  useEffect(() => {
    const url = form.faculty_id
      ? `${BASE_URL}/auth/departments?faculty_id=${form.faculty_id}`
      : `${BASE_URL}/auth/departments`;
    fetch(url)
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) setDepartments(data);
      })
      .catch(() => {});
  }, [form.faculty_id]);

  /* ── Resend countdown timer ───────────────────────────── */
  useEffect(() => {
    if (step !== 2) return;
    setResendTimer(60);
    setCanResend(false);
    const interval = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          clearInterval(interval);
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [step]);

  /* ── Helpers ──────────────────────────────────────────── */
  const set = (key) => (val) => {
    const v = typeof val === "string" ? val : val?.target?.value ?? val;
    setForm(p => {
      const next = { ...p, [key]: v };
      // Clear department when faculty changes (cascading dropdown)
      if (key === "faculty_id") next.department_id = "";
      return next;
    });
  };

  const showFaculty    = form.admin_level === "dean" || form.admin_level === "hod";
  const showDepartment = form.admin_level === "hod";

  const phoneLast4 = form.phone.length >= 4
    ? form.phone.slice(-4)
    : form.phone;

  const pwdMatch   = form.confirm.length > 0 && form.confirm === form.password;
  const pwdNoMatch = form.confirm.length > 0 && form.confirm !== form.password;

  /* ── Validate Step 1 ──────────────────────────────────── */
  const validate = () => {
    if (!form.staff_id.trim())        return "Staff ID is required.";
    if (!form.full_name.trim())      return "Full name is required.";
    if (!form.email.trim())          return "Email address is required.";
    if (!form.phone.trim())          return "Phone number is required.";
    if (scorePassword(form.password) < 2)
      return "Password is too weak. Add uppercase letters, numbers, and symbols.";
    if (form.password !== form.confirm)
      return "Passwords do not match.";
    if (!form.admin_level)           return "Please select an admin level.";
    if (showFaculty && !form.faculty_id)
      return "Please select a faculty.";
    if (showDepartment && !form.department_id)
      return "Please select a department.";
    return null;
  };

  /* ── Submit Step 1 ────────────────────────────────────── */
  const submitRegistration = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) { setError(err); return; }
    setLoading(true);
    setError("");

    try {
      const payload = {
        staff_id:      form.staff_id.trim(),
        full_name:     form.full_name.trim(),
        email:         form.email.trim(),
        phone:         form.phone.trim(),
        password:      form.password,
        admin_level:   form.admin_level,
        faculty_id:    showFaculty ? parseInt(form.faculty_id) : null,
        department_id: showDepartment ? parseInt(form.department_id) : null,
      };
      const res  = await fetch(`${BASE_URL}/auth/admin/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.detail || "Registration failed."); return; }
      if (data.dev_otp) setDevOtp(data.dev_otp);
      setStep(2);
    } catch {
      setError("Could not connect to the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  /* ── OTP input handling ───────────────────────────────── */
  const handleOtpChange = (index, value) => {
    if (value.length > 1) return;
    if (value && !/^\d$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value;
    setOtp(newOtp);
    setOtpError("");

    // Auto-focus next input
    if (value && index < 5) {
      const nextInput = document.getElementById(`otp-${index + 1}`);
      if (nextInput) nextInput.focus();
    }

    // Auto-submit when all 6 digits filled
    if (value && index === 5 && newOtp.every(d => d !== "")) {
      submitOtp(newOtp.join(""));
    }
  };

  const handleOtpKeyDown = (index, e) => {
    if (e.key === "Backspace" && !otp[index] && index > 0) {
      const prevInput = document.getElementById(`otp-${index - 1}`);
      if (prevInput) prevInput.focus();
    }
  };

  const handleOtpPaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (!pasted) return;
    const newOtp = [...otp];
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    setOtp(newOtp);
    if (pasted.length === 6) {
      submitOtp(pasted);
    } else {
      const nextInput = document.getElementById(`otp-${pasted.length}`);
      if (nextInput) nextInput.focus();
    }
  };

  /* ── Submit OTP ───────────────────────────────────────── */
  const submitOtp = async (code) => {
    const otpCode = code || otp.join("");
    if (otpCode.length !== 6) {
      setOtpError("Please enter all 6 digits.");
      return;
    }
    setOtpLoading(true);
    setOtpError("");

    try {
      const res = await fetch(`${BASE_URL}/auth/admin/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim(), otp: otpCode }),
      });
      const data = await res.json();
      if (!res.ok) { setOtpError(data.detail || "Verification failed. Please try again."); return; }
      if (data.staff_id) setStaffId(data.staff_id);
      if (data.auto_confirmed) {
        setStep(4); // Skip email confirmation — account already active
      } else {
        if (data.dev_link) setDevLink(data.dev_link);
        setStep(3);
      }
    } catch {
      setOtpError("Could not connect to the server. Please try again.");
    } finally {
      setOtpLoading(false);
    }
  };

  /* ── Resend OTP ───────────────────────────────────────── */
  const resendOtp = async () => {
    if (!canResend) return;
    setCanResend(false);
    setResendTimer(60);
    setOtpError("");
    setOtp(["", "", "", "", "", ""]);

    // Restart countdown
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
    resendIntervalRef.current = setInterval(() => {
      setResendTimer(prev => {
        if (prev <= 1) {
          clearInterval(resendIntervalRef.current);
          resendIntervalRef.current = null;
          setCanResend(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    try {
      const res = await fetch(`${BASE_URL}/auth/admin/resend-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim() }),
      });
      const data = await res.json();
      if (data.dev_otp) setDevOtp(data.dev_otp);
    } catch {
      // Silently handle — user can try again
    }
  };

  // Cleanup resend interval on unmount
  useEffect(() => () => {
    if (resendIntervalRef.current) clearInterval(resendIntervalRef.current);
  }, []);

  /* ── Render ───────────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-slate-50 font-sans flex items-start justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: "easeOut" }}
        className="w-full max-w-[580px]"
      >
        {/* Back to home */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-slate-500 hover:text-primary text-sm mb-6 transition-colors"
        >
          <ArrowLeft size={14} /> Back to home
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          {/* ── Navy Header ──────────────────────────────── */}
          <div className="bg-primary px-8 py-6">
            <div className="flex items-center gap-4">
              <img src={crest} alt="" className="w-12 h-12 object-contain flex-shrink-0" />
              <div>
                <p className="text-accent-light font-serif text-lg font-semibold leading-tight">
                  Maranatha University Lagos
                </p>
                <p className="text-slate-400 text-xs uppercase tracking-widest mt-1">
                  Administrator Registration
                </p>
              </div>
            </div>
          </div>

          <div className="p-8">
            {/* ── Step Indicator ──────────────────────────── */}
            <StepIndicator current={step} />

            {/* ============================================= */}
            {/* STEP 1 — Registration Form                    */}
            {/* ============================================= */}
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <h1 className="font-serif font-semibold text-primary mb-1" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>
                    Create Admin Account
                  </h1>
                  <p className="text-slate-500 text-sm mb-7">
                    Register as Dean or HOD to access institution-wide risk oversight and analytics
                  </p>

                  {/* Error banner */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        key="err"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-5"
                      >
                        <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                        {error}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <form onSubmit={submitRegistration} noValidate className="space-y-4">
                    {/* Staff ID */}
                    <div>
                      <label className="ds-label">Staff ID <span className="text-risk-high">*</span></label>
                      <div className="relative">
                        <Shield size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Enter your whitelisted staff ID"
                          value={form.staff_id}
                          onChange={set("staff_id")}
                          disabled={loading}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {/* Full Name */}
                    <div>
                      <label className="ds-label">Full Name <span className="text-risk-high">*</span></label>
                      <div className="relative">
                        <User size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Enter your full name"
                          value={form.full_name}
                          onChange={set("full_name")}
                          disabled={loading}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {/* Email */}
                    <div>
                      <label className="ds-label">Email Address <span className="text-risk-high">*</span></label>
                      <div className="relative">
                        <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="email"
                          placeholder="e.g. admin@maranatha.edu.ng"
                          value={form.email}
                          onChange={set("email")}
                          disabled={loading}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="ds-label">Phone Number <span className="text-risk-high">*</span></label>
                      <div className="relative">
                        <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                          type="tel"
                          placeholder="e.g. 08012345678"
                          value={form.phone}
                          onChange={set("phone")}
                          disabled={loading}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    {/* Password */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="ds-label">Password <span className="text-risk-high">*</span></label>
                        <div className="relative">
                          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            type={showPwd ? "text" : "password"}
                            placeholder="Min. 8 characters"
                            value={form.password}
                            onChange={set("password")}
                            disabled={loading}
                            className={inputCls + " pr-10"}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPwd(v => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <PasswordStrength password={form.password} />
                      </div>

                      {/* Confirm Password */}
                      <div>
                        <label className="ds-label">Confirm Password <span className="text-risk-high">*</span></label>
                        <div className="relative">
                          <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                          <input
                            type="password"
                            placeholder="Repeat password"
                            value={form.confirm}
                            onChange={set("confirm")}
                            disabled={loading}
                            className={[
                              inputCls,
                              pwdMatch   ? "border-emerald-400 focus:border-emerald-400 focus:ring-emerald-100" : "",
                              pwdNoMatch ? "border-red-300 focus:border-red-300 focus:ring-red-100" : "",
                            ].join(" ")}
                          />
                          {pwdMatch && (
                            <CheckCircle size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none" />
                          )}
                        </div>
                        {pwdNoMatch && <p className="text-xs text-red-500 mt-1.5">Passwords don't match</p>}
                        {pwdMatch   && <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1"><CheckCircle size={10} /> Passwords match</p>}
                      </div>
                    </div>

                    {/* Admin Level */}
                    <div>
                      <CustomDropdown
                        label="Admin Level"
                        placeholder="Select admin level"
                        required
                        value={form.admin_level}
                        onChange={set("admin_level")}
                        options={ADMIN_LEVELS}
                        disabled={loading}
                      />
                    </div>

                    {/* Faculty — visible for dean and hod */}
                    {showFaculty && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CustomDropdown
                          label="Faculty"
                          placeholder="Select faculty"
                          required
                          value={form.faculty_id}
                          onChange={set("faculty_id")}
                          options={faculties}
                          searchable
                          disabled={loading}
                        />
                      </motion.div>
                    )}

                    {/* Department — visible for hod only */}
                    {showDepartment && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CustomDropdown
                          label="Department"
                          placeholder="Search department..."
                          required
                          value={form.department_id}
                          onChange={set("department_id")}
                          options={departments}
                          searchable
                          disabled={loading}
                        />
                      </motion.div>
                    )}

                    {/* Submit */}
                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={loading}
                      className="w-full mt-2 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 rounded-xl transition-all disabled:opacity-60 shadow-lg text-sm"
                    >
                      {loading ? (
                        <><RefreshCw size={14} className="animate-spin" /> Creating account...</>
                      ) : (
                        <><Shield size={15} /> Continue <ChevronRight size={14} /></>
                      )}
                    </motion.button>
                  </form>
                </motion.div>
              )}

              {/* ============================================= */}
              {/* STEP 2 — OTP Verification                     */}
              {/* ============================================= */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-5">
                    <Phone size={28} className="text-accent" />
                  </div>

                  <h1 className="font-serif font-semibold text-primary mb-2" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>
                    Verify Your Phone
                  </h1>
                  <p className="text-slate-500 text-sm mb-8">
                    A verification code has been sent to your phone number ending in{" "}
                    <span className="font-semibold text-primary">****{phoneLast4}</span>
                  </p>

                  {/* Dev mode: show OTP for testing */}
                  {devOtp && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm mb-5">
                      <p className="text-amber-800 font-medium">Dev Mode — Your OTP code:</p>
                      <p className="text-amber-900 font-mono text-2xl font-bold tracking-widest mt-1">{devOtp}</p>
                    </div>
                  )}

                  {/* Error banner */}
                  <AnimatePresence>
                    {otpError && (
                      <motion.div
                        key="otp-err"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-5 text-left"
                      >
                        <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                        {otpError}
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* OTP Input Boxes */}
                  <div className="flex justify-center gap-3 mb-6" onPaste={handleOtpPaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        disabled={otpLoading}
                        className={[
                          "w-12 h-14 text-center text-xl font-bold border-2 border-slate-200 rounded-xl",
                          "outline-none transition-all",
                          "focus:border-accent focus:ring-2 focus:ring-accent/20",
                          "disabled:opacity-50 disabled:cursor-not-allowed",
                        ].join(" ")}
                      />
                    ))}
                  </div>

                  {/* Verify button */}
                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => submitOtp()}
                    disabled={otpLoading || otp.some(d => d === "")}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 rounded-xl transition-all disabled:opacity-60 shadow-lg text-sm mb-4"
                  >
                    {otpLoading ? (
                      <><RefreshCw size={14} className="animate-spin" /> Verifying...</>
                    ) : (
                      <><Shield size={15} /> Verify</>
                    )}
                  </motion.button>

                  {/* Resend code */}
                  <div className="text-sm text-slate-500">
                    Didn't receive the code?{" "}
                    {canResend ? (
                      <button
                        type="button"
                        onClick={resendOtp}
                        className="text-accent hover:text-accent-dark font-semibold transition-colors"
                      >
                        Resend Code
                      </button>
                    ) : (
                      <span className="text-slate-400">
                        Resend in <span className="font-semibold text-primary">{resendTimer}s</span>
                      </span>
                    )}
                  </div>
                </motion.div>
              )}

              {/* ============================================= */}
              {/* STEP 3 — Email Confirmation Notice             */}
              {/* ============================================= */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
                    <Mail size={28} className="text-emerald-500" />
                  </div>

                  <h1 className="font-serif font-semibold text-primary mb-2" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>
                    Almost there!
                  </h1>
                  <p className="text-slate-500 text-sm mb-4">
                    We've sent a confirmation link to your email address.
                  </p>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 mb-6">
                    <div className="flex items-center justify-center gap-2 text-primary font-semibold">
                      <Mail size={16} className="text-accent" />
                      {form.email}
                    </div>
                  </div>

                  <p className="text-slate-500 text-sm mb-8">
                    Check your inbox and click the confirmation link to activate your account.
                  </p>

                  {/* Dev mode: show confirmation link for testing */}
                  {devLink && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm mb-5">
                      <p className="text-amber-800 font-medium mb-1">Dev Mode — Confirmation link:</p>
                      <a href={devLink} className="text-accent hover:text-accent-dark font-semibold break-all text-xs">
                        {devLink}
                      </a>
                    </div>
                  )}

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => navigate("/login")}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 rounded-xl transition-all shadow-lg text-sm mb-4"
                  >
                    <CheckCircle size={15} /> Go to Login
                  </motion.button>

                  <p className="text-xs text-slate-400">
                    Didn't receive the email? Check your spam folder.
                  </p>
                </motion.div>
              )}

              {/* ============================================= */}
              {/* STEP 4 — Account Activated (dev auto-confirm)  */}
              {/* ============================================= */}
              {step === 4 && (
                <motion.div
                  key="step4"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                  className="text-center"
                >
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-5">
                    <CheckCircle size={28} className="text-emerald-500" />
                  </div>

                  <h1 className="font-serif font-semibold text-primary mb-2" style={{ fontSize: 24, letterSpacing: "-0.02em" }}>
                    Account Activated!
                  </h1>
                  <p className="text-slate-500 text-sm mb-6">
                    Your administrator account has been created and is ready to use.
                  </p>

                  {staffId && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-4 mb-6">
                      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">Your Staff ID</p>
                      <p className="text-2xl font-bold text-primary font-mono tracking-wider">{staffId}</p>
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-5 py-3 mb-6">
                    <div className="flex items-center justify-center gap-2 text-primary font-semibold text-sm">
                      <Mail size={16} className="text-accent" />
                      {form.email}
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    type="button"
                    onClick={() => navigate("/login")}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 rounded-xl transition-all shadow-lg text-sm"
                  >
                    <CheckCircle size={15} /> Go to Login
                  </motion.button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Footer */}
          <div className="px-8 py-5 border-t border-slate-200 text-center text-sm text-slate-500 bg-slate-50">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/login")}
              className="text-accent hover:text-accent-dark font-semibold transition-colors"
            >
              Sign in here
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
