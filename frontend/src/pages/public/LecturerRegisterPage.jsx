/**
 * LecturerRegisterPage — Maranatha University
 * Two-step lecturer registration: email validation, then registration form.
 * Matches the visual style of the student RegisterPage.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  User, Mail, Lock, Eye, EyeOff, Hash,
  ArrowLeft, UserPlus, AlertCircle,
  CheckCircle, RefreshCw, ChevronRight,
} from "lucide-react";
import CustomDropdown from "../../components/ui/CustomDropdown";
import crest from "../../assets/maranatha-crest.png";

/* -- Constants ------------------------------------------------ */
const DESIGNATIONS = [
  { value: "lecturer_1",  label: "Lecturer I" },
  { value: "lecturer_2",  label: "Lecturer II" },
  { value: "senior",      label: "Senior Lecturer" },
  { value: "associate",   label: "Associate Professor" },
  { value: "professor",   label: "Professor" },
  { value: "lab_tech",    label: "Lab Technologist" },
  { value: "admin_staff", label: "Administrative Staff" },
];

/* -- Password strength ---------------------------------------- */
function scorePassword(pwd) {
  let score = 0;
  if (pwd.length >= 8)               score++;
  if (pwd.length >= 12)              score++;
  if (/[A-Z]/.test(pwd))             score++;
  if (/[a-z]/.test(pwd))             score++;
  if (/[0-9]/.test(pwd))             score++;
  if (/[^A-Za-z0-9]/.test(pwd))      score++;
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
          <div
            key={i}
            className={`flex-1 h-1.5 rounded-full transition-all duration-300 ${
              i < score ? STRENGTH_COLORS[score] : "bg-slate-200"
            }`}
          />
        ))}
      </div>
      <p className={`text-xs font-medium ${STRENGTH_TEXT[score]}`}>
        {STRENGTH_LABELS[score]}
      </p>
    </div>
  );
}

/* -- Shared input class --------------------------------------- */
const inputCls = [
  "w-full h-10 bg-white border border-slate-200 rounded-xl text-sm text-primary",
  "pl-9 pr-4 outline-none transition-all placeholder:text-slate-400",
  "focus:ring-2 focus:ring-accent/15 focus:border-accent/40 hover:border-slate-300",
  "disabled:opacity-50 disabled:cursor-not-allowed disabled:bg-slate-50",
].join(" ");

const readOnlyCls = [
  "w-full h-10 bg-slate-50 border border-slate-200 rounded-xl text-sm text-primary",
  "pl-9 pr-4 outline-none cursor-not-allowed",
].join(" ");

/* -- Main Component ------------------------------------------- */
export default function LecturerRegisterPage() {
  const navigate = useNavigate();

  // Step management: 1 = email validation, 2 = registration form, 3 = account activated
  const [step, setStep] = useState(1);

  // Step 1 state
  const [email, setEmail]               = useState("");
  const [validating, setValidating]     = useState(false);
  const [validationError, setValidationError] = useState("");

  // Step 2 pre-filled from validation
  const [staffId, setStaffId]     = useState("");
  const [fullName, setFullName]   = useState("");

  // Step 2 editable fields
  const [password, setPassword]       = useState("");
  const [confirm, setConfirm]         = useState("");
  const [showPwd, setShowPwd]         = useState(false);
  const [phone, setPhone]               = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [designation, setDesignation] = useState("");

  // Shared state
  const [departments, setDepartments] = useState([]);
  const [error, setError]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [success, setSuccess]         = useState(false);

  // Load departments from API
  useEffect(() => {
    fetch("/api/auth/departments")
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data)) setDepartments(data);
      })
      .catch(() => {});
  }, []);

  /* -- Step 1: Email Validation ------------------------------ */
  const handleValidateEmail = async (e) => {
    e.preventDefault();
    if (!email.trim()) {
      setValidationError("Please enter your university email address.");
      return;
    }
    setValidating(true);
    setValidationError("");

    try {
      const res = await fetch("/api/auth/lecturer/validate-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Email not found in lecturer whitelist.");
      }
      // Successful validation — auto-fill and advance
      setStaffId(data.staff_id || "");
      setFullName(data.full_name || "");
      setStep(2);
    } catch (err) {
      setValidationError(err.message);
    } finally {
      setValidating(false);
    }
  };

  /* -- Step 2: Validation ------------------------------------ */
  const validate = () => {
    if (!fullName.trim()) return "Full name is required.";
    if (!staffId.trim()) return "Staff ID is required.";
    if (scorePassword(password) < 2)
      return "Password is too weak. Add uppercase letters, numbers, and symbols.";
    if (password !== confirm) return "Passwords do not match.";
    if (!departmentId) return "Please select a department.";
    if (!designation) return "Please select a designation.";
    return null;
  };

  /* -- Step 2: Submit ---------------------------------------- */
  const handleRegister = async (e) => {
    e.preventDefault();
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setLoading(true);
    setError("");

    try {
      const payload = {
        staff_id: staffId.trim(),
        email: email.trim(),
        full_name: fullName.trim(),
        password,
        phone: phone.trim() || undefined,
        department_id: parseInt(departmentId),
        designation,
      };
      const res = await fetch("/api/auth/lecturer/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || "Registration failed.");
        return;
      }
      if (data.auto_confirmed) {
        // Dev mode: account already active — show success with staff ID
        setStaffId(data.staff_id || staffId);
        setStep(3);
      } else {
        setSuccess(true);
        setTimeout(() => navigate("/login"), 2500);
      }
    } catch (err) {
      if (err.name === "AbortError") return;
      setError("Could not connect to the server. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const pwdMatch   = confirm.length > 0 && confirm === password;
  const pwdNoMatch = confirm.length > 0 && confirm !== password;

  return (
    <div className="min-h-screen bg-slate-50 font-sans flex items-start justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.36, ease: "easeOut" }}
        className="w-full max-w-[580px]"
      >
        {/* Back link */}
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 text-slate-500 hover:text-primary text-sm mb-6 transition-colors"
        >
          <ArrowLeft size={14} /> Back to home
        </button>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
          {/* Navy header */}
          <div className="bg-primary px-8 py-6">
            <div className="flex items-center gap-4">
              <img
                src={crest}
                alt=""
                className="w-12 h-12 object-contain flex-shrink-0"
              />
              <div>
                <p className="text-accent-light font-serif text-lg font-semibold leading-tight">
                  Maranatha University Lagos
                </p>
                <p className="text-slate-400 text-xs uppercase tracking-widest mt-1">
                  Lecturer Registration
                </p>
              </div>
            </div>
          </div>

          <div className="p-8">
            {/* Step indicator */}
            <div className="flex items-center gap-3 mb-6">
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  step === 1
                    ? "bg-primary text-white"
                    : "bg-emerald-100 text-emerald-700"
                }`}
              >
                {step > 1 ? (
                  <CheckCircle size={12} />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                    1
                  </span>
                )}
                Email Validation
              </div>
              <ChevronRight size={14} className="text-slate-300" />
              <div
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${
                  step === 2
                    ? "bg-primary text-white"
                    : "bg-slate-100 text-slate-400"
                }`}
              >
                <span className="w-4 h-4 rounded-full bg-white/20 flex items-center justify-center text-[10px]">
                  2
                </span>
                Registration
              </div>
              <span className="ml-auto text-xs text-slate-400">
                {step < 3 ? `Step ${step} of 2` : "Complete"}
              </span>
            </div>

            {/* Errors / Success */}
            <AnimatePresence>
              {(error || validationError) && (
                <motion.div
                  key="err"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-start gap-2.5 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-800 mb-5"
                >
                  <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
                  {error || validationError}
                </motion.div>
              )}
              {success && (
                <motion.div
                  key="ok"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex items-center gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-emerald-800 text-sm font-medium mb-5"
                >
                  <CheckCircle size={18} /> Registration submitted. Please check
                  your email to confirm your account.
                </motion.div>
              )}
            </AnimatePresence>

            {/* ========== STEP 1: Email Validation ========== */}
            <AnimatePresence mode="wait">
              {step === 1 && (
                <motion.div
                  key="step1"
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -20 }}
                  transition={{ duration: 0.25 }}
                >
                  <h1
                    className="font-serif font-semibold text-primary mb-1"
                    style={{ fontSize: 24, letterSpacing: "-0.02em" }}
                  >
                    Verify Your Identity
                  </h1>
                  <p className="text-slate-500 text-sm mb-7">
                    Enter the email address your department registered you with
                  </p>

                  <form onSubmit={handleValidateEmail} noValidate className="space-y-4">
                    <div>
                      <label className="ds-label">
                        Registered Email Address{" "}
                        <span className="text-risk-high">*</span>
                      </label>
                      <div className="relative">
                        <Mail
                          size={14}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                        />
                        <input
                          type="email"
                          placeholder="e.g. yourname@email.com"
                          value={email}
                          onChange={(e) => {
                            setEmail(e.target.value);
                            setValidationError("");
                          }}
                          disabled={validating}
                          className={inputCls}
                        />
                      </div>
                    </div>

                    <motion.button
                      whileTap={{ scale: 0.98 }}
                      type="submit"
                      disabled={validating}
                      className="w-full mt-2 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 rounded-xl transition-all disabled:opacity-60 shadow-lg text-sm"
                    >
                      {validating ? (
                        <>
                          <RefreshCw size={14} className="animate-spin" />{" "}
                          Validating...
                        </>
                      ) : (
                        <>
                          <Mail size={15} /> Validate Email
                        </>
                      )}
                    </motion.button>
                  </form>
                </motion.div>
              )}

              {/* ========== STEP 2: Registration Form ========== */}
              {step === 2 && (
                <motion.div
                  key="step2"
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20 }}
                  transition={{ duration: 0.25 }}
                >
                  <h1
                    className="font-serif font-semibold text-primary mb-1"
                    style={{ fontSize: 24, letterSpacing: "-0.02em" }}
                  >
                    Complete Registration
                  </h1>
                  <p className="text-slate-500 text-sm mb-7">
                    Set your password and complete your profile to access student risk analytics
                  </p>

                  <form onSubmit={handleRegister} noValidate className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Full Name (read-only) */}
                      <div className="md:col-span-2">
                        <label className="ds-label">Full Name</label>
                        <div className="relative">
                          <User
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          />
                          <input
                            type="text"
                            value={fullName}
                            readOnly
                            className={readOnlyCls}
                          />
                        </div>
                      </div>

                      {/* Staff ID (read-only) */}
                      <div>
                        <label className="ds-label">Staff ID</label>
                        <div className="relative">
                          <Hash
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          />
                          <input
                            type="text"
                            value={staffId}
                            readOnly
                            className={readOnlyCls}
                          />
                        </div>
                      </div>

                      {/* Email (read-only) */}
                      <div>
                        <label className="ds-label">Email Address</label>
                        <div className="relative">
                          <Mail
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          />
                          <input
                            type="email"
                            value={email}
                            readOnly
                            className={readOnlyCls}
                          />
                        </div>
                      </div>

                      {/* Password + strength meter */}
                      <div>
                        <label className="ds-label">
                          Password <span className="text-risk-high">*</span>
                        </label>
                        <div className="relative">
                          <Lock
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          />
                          <input
                            type={showPwd ? "text" : "password"}
                            placeholder="Min. 8 characters"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            disabled={loading || success}
                            className={inputCls + " pr-10"}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPwd((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                          >
                            {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                          </button>
                        </div>
                        <PasswordStrength password={password} />
                      </div>

                      {/* Confirm Password */}
                      <div>
                        <label className="ds-label">
                          Confirm Password{" "}
                          <span className="text-risk-high">*</span>
                        </label>
                        <div className="relative">
                          <Lock
                            size={14}
                            className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          />
                          <input
                            type="password"
                            placeholder="Repeat password"
                            value={confirm}
                            onChange={(e) => setConfirm(e.target.value)}
                            disabled={loading || success}
                            className={[
                              inputCls,
                              pwdMatch
                                ? "border-emerald-400 focus:border-emerald-400 focus:ring-emerald-100"
                                : "",
                              pwdNoMatch
                                ? "border-red-300 focus:border-red-300 focus:ring-red-100"
                                : "",
                            ].join(" ")}
                          />
                          {pwdMatch && (
                            <CheckCircle
                              size={14}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-emerald-500 pointer-events-none"
                            />
                          )}
                        </div>
                        {pwdNoMatch && (
                          <p className="text-xs text-red-500 mt-1.5">
                            Passwords don't match
                          </p>
                        )}
                        {pwdMatch && (
                          <p className="text-xs text-emerald-600 mt-1.5 flex items-center gap-1">
                            <CheckCircle size={10} /> Passwords match
                          </p>
                        )}
                      </div>

                      {/* Department */}
                      <div>
                        <CustomDropdown
                          label="Department"
                          placeholder="Search department..."
                          required
                          value={departmentId}
                          onChange={(val) => setDepartmentId(val)}
                          options={departments}
                          searchable
                          disabled={loading || success}
                        />
                      </div>

                      {/* Designation */}
                      <div>
                        <CustomDropdown
                          label="Designation"
                          placeholder="Select designation"
                          required
                          value={designation}
                          onChange={(val) => setDesignation(val)}
                          options={DESIGNATIONS}
                          disabled={loading || success}
                        />
                      </div>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center gap-3 mt-2">
                      <button
                        type="button"
                        onClick={() => {
                          setStep(1);
                          setError("");
                          setPassword("");
                          setConfirm("");
                          setDepartmentId("");
                          setDesignation("");
                        }}
                        disabled={loading || success}
                        className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary font-medium transition-colors disabled:opacity-50"
                      >
                        <ArrowLeft size={14} /> Back
                      </button>

                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="submit"
                        disabled={loading || success}
                        className="flex-1 flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 rounded-xl transition-all disabled:opacity-60 shadow-lg text-sm"
                      >
                        {loading ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />{" "}
                            Creating account...
                          </>
                        ) : (
                          <>
                            <UserPlus size={15} /> Create Account
                          </>
                        )}
                      </motion.button>
                    </div>
                  </form>
                </motion.div>
              )}

              {/* ========== STEP 3: Account Activated (dev auto-confirm) ========== */}
              {step === 3 && (
                <motion.div
                  key="step3"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="text-center space-y-5"
                >
                  <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                      <CheckCircle size={28} className="text-emerald-500" />
                    </div>
                  </div>

                  <div>
                    <h1
                      className="font-serif font-semibold text-primary mb-1"
                      style={{ fontSize: 24, letterSpacing: "-0.02em" }}
                    >
                      Account Activated!
                    </h1>
                    <p className="text-slate-500 text-sm">
                      Your lecturer account has been created and is ready to use.
                    </p>
                  </div>

                  {staffId && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 inline-block">
                      <p className="text-xs text-slate-500 mb-1">Your Staff ID</p>
                      <p className="text-2xl font-bold text-primary font-mono">{staffId}</p>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-2 text-sm text-slate-500">
                    <Mail size={16} />
                    <span>{email}</span>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.98 }}
                    onClick={() => navigate("/login")}
                    className="w-full flex items-center justify-center gap-2 bg-primary hover:bg-primary-dark text-white font-semibold h-12 rounded-xl transition-all shadow-lg text-sm"
                  >
                    Go to Login
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
