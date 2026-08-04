/**
 * UserManagementPage — Admin user account management
 * Real API: GET /admin/users, PATCH /admin/users/{id}/toggle-active
 */
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Users, GraduationCap, BookOpen, Shield,
  CheckCircle, XCircle, RefreshCw, AlertCircle,
  Upload, FileText, ShieldCheck, ChevronDown,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api, BASE_URL, unwrapEnvelope, extractErrorMessage } from "../../services/api";
import { formatDate } from "../../utils/helpers";
import VirtualizedTable from "../../components/shared/VirtualizedTable";

const ROLE_META = {
  student:  { label: "Student",  icon: GraduationCap, color: "text-primary    bg-primary/10    border-primary/20"    },
  lecturer: { label: "Lecturer", icon: BookOpen,      color: "text-blue-600  bg-blue-50       border-blue-200"      },
  admin:    { label: "Admin",    icon: Shield,        color: "text-amber-600 bg-amber-50      border-amber-200"     },
};

const c  = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const it = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } };

// ── Whitelist Upload ──────────────────────────────────────
function WhitelistSection({ token }) {
  const [file,      setFile]      = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
  const inputRef = useRef(null);

  const ACCEPT_EXTS = [".csv", ".pdf", ".docx", ".doc", ".jpg", ".jpeg", ".png", ".webp"];

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPT_EXTS.includes(ext)) {
      setError("Unsupported file type. Accepted: CSV, PDF, DOCX, JPG, PNG, WEBP");
      return;
    }
    setFile(f); setResult(null); setError("");
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE_URL}/admin/students/whitelist`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const raw = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(raw, "Upload failed"));
      setResult(unwrapEnvelope(raw));
      setFile(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
      <div>
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Student Whitelist</h2>
        <p className="text-sm text-slate-400">
          Upload a file with columns:{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">matric_number</code>,{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">full_name</code>{" "}
          (full_name is optional). Accepted formats: CSV, PDF, DOCX, JPG, PNG.
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-all">
        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
          <Upload size={18} />
        </div>
        {file ? (
          <p className="text-sm font-semibold text-primary flex items-center gap-2">
            <FileText size={13} /> {file.name} &nbsp;·&nbsp; {(file.size / 1024).toFixed(1)} KB
          </p>
        ) : (
          <p className="text-sm text-slate-500 font-medium">Drop file here or click to browse</p>
        )}
        <input ref={inputRef} type="file" accept=".csv,.pdf,.docx,.doc,.jpg,.jpeg,.png,.webp" className="hidden"
          onChange={e => handleFile(e.target.files[0])} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <motion.button whileTap={{ scale: 0.97 }} onClick={upload}
        disabled={!file || uploading}
        className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-5 h-10 rounded-xl transition-all disabled:opacity-50">
        {uploading ? <><RefreshCw size={13} className="animate-spin" /> Uploading...</> : <><Upload size={13} /> Upload Whitelist</>}
      </motion.button>

      {result && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-3 gap-3">
          <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
            <p className="font-serif text-2xl font-bold text-emerald-700">{result.inserted}</p>
            <p className="text-xs text-emerald-600 mt-1 font-medium">Added</p>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
            <p className="font-serif text-2xl font-bold text-amber-700">{result.duplicates}</p>
            <p className="text-xs text-amber-600 mt-1 font-medium">Already existed</p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
            <p className="font-serif text-2xl font-bold text-red-700">{result.errors?.length ?? 0}</p>
            <p className="text-xs text-red-600 mt-1 font-medium">Errors</p>
          </div>
          {result.errors?.length > 0 && (
            <details className="col-span-3 bg-red-50 border border-red-200 rounded-xl p-4">
              <summary className="text-sm text-red-700 font-semibold cursor-pointer">
                {result.errors.length} errors — click to expand
              </summary>
              <ul className="mt-2 space-y-1">
                {result.errors.map((e, i) => <li key={i} className="text-xs text-red-600">{e}</li>)}
              </ul>
            </details>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ── Lecturer Whitelist Upload ─────────────────────────────
function LecturerWhitelistSection({ token }) {
  const [file,      setFile]      = useState(null);
  const [uploading, setUploading] = useState(false);
  const [result,    setResult]    = useState(null);
  const [error,     setError]     = useState("");
  const inputRef = useRef(null);

  const ACCEPT_EXTS = [".csv", ".pdf", ".docx", ".doc", ".jpg", ".jpeg", ".png", ".webp"];

  const handleFile = (f) => {
    if (!f) return;
    const ext = f.name.substring(f.name.lastIndexOf(".")).toLowerCase();
    if (!ACCEPT_EXTS.includes(ext)) {
      setError("Unsupported file type. Accepted: CSV, PDF, DOCX, JPG, PNG, WEBP");
      return;
    }
    setFile(f); setResult(null); setError("");
  };

  const upload = async () => {
    if (!file) return;
    setUploading(true); setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch(`${BASE_URL}/admin/lecturers/whitelist`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const raw = await res.json();
      if (!res.ok) throw new Error(extractErrorMessage(raw, "Upload failed"));
      setResult(unwrapEnvelope(raw));
      setFile(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-4">
      <div>
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Lecturer Whitelist</h2>
        <p className="text-sm text-slate-400">
          Upload a file with columns:{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">full_name</code>,{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">email</code>.{" "}
          A Staff ID is auto-generated and each lecturer receives an invitation email (30-min expiry).
          Accepted formats: CSV, PDF, DOCX, JPG, PNG.
        </p>
      </div>

      <div
        onDragOver={e => { e.preventDefault(); }}
        onDrop={e => { e.preventDefault(); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-slate-200 hover:border-slate-300 hover:bg-slate-50 rounded-xl p-6 flex flex-col items-center gap-2 cursor-pointer transition-all">
        <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center">
          <Upload size={18} />
        </div>
        {file ? (
          <p className="text-sm font-semibold text-primary flex items-center gap-2">
            <FileText size={13} /> {file.name} &nbsp;·&nbsp; {(file.size / 1024).toFixed(1)} KB
          </p>
        ) : (
          <p className="text-sm text-slate-500 font-medium">Drop lecturer file here or click to browse</p>
        )}
        <input ref={inputRef} type="file" accept=".csv,.pdf,.docx,.doc,.jpg,.jpeg,.png,.webp" className="hidden"
          onChange={e => handleFile(e.target.files[0])} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <motion.button whileTap={{ scale: 0.97 }} onClick={upload}
        disabled={!file || uploading}
        className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-5 h-10 rounded-xl transition-all disabled:opacity-50">
        {uploading ? <><RefreshCw size={13} className="animate-spin" /> Uploading...</> : <><Upload size={13} /> Upload Lecturer Whitelist</>}
      </motion.button>

      {result && !result.image_manual_review && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="space-y-3">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
              <p className="font-serif text-2xl font-bold text-emerald-700">{result.inserted}</p>
              <p className="text-xs text-emerald-600 mt-1 font-medium">Invited</p>
            </div>
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
              <p className="font-serif text-2xl font-bold text-amber-700">{result.duplicates}</p>
              <p className="text-xs text-amber-600 mt-1 font-medium">Already existed</p>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
              <p className="font-serif text-2xl font-bold text-red-700">{result.errors?.length ?? 0}</p>
              <p className="text-xs text-red-600 mt-1 font-medium">Errors</p>
            </div>
          </div>

          {result.entries?.length > 0 && (
            <details className="bg-slate-50 border border-slate-200 rounded-xl p-4">
              <summary className="text-sm text-primary font-semibold cursor-pointer">
                {result.entries.length} lecturer(s) invited — click to view
              </summary>
              <div className="mt-3 space-y-2">
                {result.entries.map((e, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white border border-slate-200 rounded-lg px-3 py-2">
                    <BookOpen size={13} className="text-slate-400 flex-shrink-0" />
                    <span className="text-sm font-semibold text-slate-800 flex-1">{e.full_name || "—"}</span>
                    <span className="text-xs text-slate-500">{e.email}</span>
                    <span className="font-mono text-xs bg-primary/10 text-primary px-2 py-0.5 rounded-lg">{e.staff_id}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {result.errors?.length > 0 && (
            <details className="bg-red-50 border border-red-200 rounded-xl p-4">
              <summary className="text-sm text-red-700 font-semibold cursor-pointer">
                {result.errors.length} errors — click to expand
              </summary>
              <ul className="mt-2 space-y-1">
                {result.errors.map((e, i) => <li key={i} className="text-xs text-red-600">{e}</li>)}
              </ul>
            </details>
          )}
        </motion.div>
      )}

      {result?.image_manual_review && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-800">
          <AlertCircle size={14} className="inline mr-2" />
          Image uploaded. OCR is not available — please review the image and re-upload lecturer details as a CSV, PDF, or DOCX file.
        </motion.div>
      )}
    </div>
  );
}

// ── Admin Invite Section ──────────────────────────────────
function AdminInviteSection({ token }) {
  const [form, setForm] = useState({
    staff_id: "",
    full_name: "",
    email: "",
    phone: "",
    password: "",
    admin_level: "dean",
    faculty_id: "",
    department_id: "",
  });
  const [faculties,   setFaculties]   = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loadingFac,  setLoadingFac]  = useState(false);
  const [loadingDep,  setLoadingDep]  = useState(false);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState("");
  const [success,     setSuccess]     = useState("");

  // Load faculties on mount
  useEffect(() => {
    const loadFaculties = async () => {
      setLoadingFac(true);
      try {
        const res = await fetch(`${BASE_URL}/auth/admin/faculties`);
        if (!res.ok) throw new Error("Failed to load faculties");
        const data = unwrapEnvelope(await res.json());
        setFaculties(Array.isArray(data) ? data : []);
      } catch (e) {
        setError("Could not load faculties: " + e.message);
      } finally {
        setLoadingFac(false);
      }
    };
    loadFaculties();
  }, []);

  // Load departments when faculty changes
  useEffect(() => {
    if (!form.faculty_id) {
      setDepartments([]);
      return;
    }
    const loadDepartments = async () => {
      setLoadingDep(true);
      try {
        const res = await fetch(`${BASE_URL}/auth/departments?faculty_id=${form.faculty_id}`);
        if (!res.ok) throw new Error("Failed to load departments");
        const data = unwrapEnvelope(await res.json());
        setDepartments(Array.isArray(data) ? data : []);
      } catch (e) {
        setError("Could not load departments: " + e.message);
      } finally {
        setLoadingDep(false);
      }
    };
    loadDepartments();
  }, [form.faculty_id]);

  const updateField = (field, value) => {
    setForm(prev => {
      const next = { ...prev, [field]: value };
      // Reset department when faculty changes
      if (field === "faculty_id") next.department_id = "";
      // Reset department when switching to dean
      if (field === "admin_level" && value === "dean") next.department_id = "";
      return next;
    });
    setError("");
    setSuccess("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError("");
    setSuccess("");

    // Client-side validation
    if (!form.staff_id.trim()) { setError("Staff ID is required."); setSubmitting(false); return; }
    if (!form.full_name.trim()) { setError("Full Name is required."); setSubmitting(false); return; }
    if (!form.email.trim()) { setError("Email is required."); setSubmitting(false); return; }
    if (!form.phone.trim()) { setError("Phone Number is required."); setSubmitting(false); return; }
    if (!form.password.trim()) { setError("Password is required."); setSubmitting(false); return; }
    if (!form.faculty_id) { setError("Faculty is required."); setSubmitting(false); return; }
    if (form.admin_level === "hod" && !form.department_id) {
      setError("Department is required for HOD-level admins.");
      setSubmitting(false);
      return;
    }

    try {
      // Step 1: Create whitelist entry
      await api.post("/auth/admin/whitelist", {
        staff_id: form.staff_id.trim(),
        admin_level: form.admin_level,
        email: form.email.trim(),
        full_name: form.full_name.trim(),
        faculty_id: parseInt(form.faculty_id, 10),
        department_id: form.admin_level === "hod" && form.department_id
          ? parseInt(form.department_id, 10)
          : null,
      }, { token });

      // Step 2: Register the admin account
      await api.post("/auth/admin/register", {
        staff_id: form.staff_id.trim(),
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        admin_level: form.admin_level,
        faculty_id: parseInt(form.faculty_id, 10),
        department_id: form.admin_level === "hod" && form.department_id
          ? parseInt(form.department_id, 10)
          : null,
      }, { token });

      setSuccess(`Admin registered. OTP sent to ${form.phone.trim()}. In dev mode, the account is auto-activated.`);

      // Reset form
      setForm({
        staff_id: "",
        full_name: "",
        email: "",
        phone: "",
        password: "",
        admin_level: "dean",
        faculty_id: "",
        department_id: "",
      });
    } catch (err) {
      setError(err.message || "Registration failed. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    "w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm outline-none " +
    "focus:ring-2 focus:ring-accent/15 focus:border-accent/40 hover:border-slate-300 placeholder:text-slate-400";

  const selectClass =
    "w-full h-10 px-3 bg-white border border-slate-200 rounded-xl text-sm outline-none appearance-none " +
    "focus:ring-2 focus:ring-accent/15 focus:border-accent/40 hover:border-slate-300 text-slate-700";

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-600 flex items-center justify-center flex-shrink-0">
          <ShieldCheck size={18} />
        </div>
        <div>
          <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Invite Administrator</h2>
          <p className="text-sm text-slate-400">
            Create a new Dean or HOD account. They will receive an OTP to complete registration.
          </p>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} className="flex-shrink-0" /> {error}
        </div>
      )}

      {/* Success */}
      {success && (
        <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
          className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-sm text-emerald-700">
          <CheckCircle size={14} className="flex-shrink-0" /> {success}
        </motion.div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Staff ID */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Staff ID <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={form.staff_id}
            onChange={e => updateField("staff_id", e.target.value)}
            placeholder="e.g. DEAN/001"
            required
            className={inputClass}
          />
        </div>

        {/* Full Name */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Full Name <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={form.full_name}
            onChange={e => updateField("full_name", e.target.value)}
            placeholder="e.g. Dr. Jane Smith"
            required
            className={inputClass}
          />
        </div>

        {/* Email */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Email Address <span className="text-red-400">*</span></label>
          <input
            type="email"
            value={form.email}
            onChange={e => updateField("email", e.target.value)}
            placeholder="e.g. jane.smith@mcu.edu.ng"
            required
            className={inputClass}
          />
        </div>

        {/* Phone */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Phone Number <span className="text-red-400">*</span></label>
          <input
            type="text"
            value={form.phone}
            onChange={e => updateField("phone", e.target.value)}
            placeholder="e.g. 08012345678"
            required
            className={inputClass}
          />
          <p className="text-[11px] text-slate-400">OTP will be sent to this number</p>
        </div>

        {/* Password */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Password <span className="text-red-400">*</span></label>
          <input
            type="password"
            value={form.password}
            onChange={e => updateField("password", e.target.value)}
            placeholder="Min 8 chars, upper + lower + digit"
            required
            className={inputClass}
          />
          <p className="text-[11px] text-slate-400">Must include uppercase, lowercase, and a digit</p>
        </div>

        {/* Admin Level */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Admin Level <span className="text-red-400">*</span></label>
          <div className="relative">
            <select
              value={form.admin_level}
              onChange={e => updateField("admin_level", e.target.value)}
              className={selectClass}
            >
              <option value="dean">Dean of Faculty</option>
              <option value="hod">Head of Department</option>
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Faculty */}
        <div className="space-y-1.5">
          <label className="text-xs font-semibold text-slate-600">Faculty <span className="text-red-400">*</span></label>
          <div className="relative">
            <select
              value={form.faculty_id}
              onChange={e => updateField("faculty_id", e.target.value)}
              required
              className={selectClass}
              disabled={loadingFac}
            >
              <option value="">
                {loadingFac ? "Loading faculties..." : "Select faculty"}
              </option>
              {faculties.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          </div>
        </div>

        {/* Department — only shown for HOD */}
        {form.admin_level === "hod" && (
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-600">Department <span className="text-red-400">*</span></label>
            <div className="relative">
              <select
                value={form.department_id}
                onChange={e => updateField("department_id", e.target.value)}
                required
                className={selectClass}
                disabled={loadingDep || !form.faculty_id}
              >
                <option value="">
                  {!form.faculty_id
                    ? "Select a faculty first"
                    : loadingDep
                      ? "Loading departments..."
                      : "Select department"}
                </option>
                {departments.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            </div>
          </div>
        )}

        {/* Submit */}
        <div className="sm:col-span-2 pt-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={submitting}
            className="flex items-center gap-2 bg-primary hover:bg-primary-dark text-white text-sm font-semibold px-6 h-10 rounded-xl transition-all disabled:opacity-50"
          >
            {submitting
              ? <><RefreshCw size={13} className="animate-spin" /> Registering...</>
              : <><ShieldCheck size={13} /> Create Admin Account</>
            }
          </motion.button>
        </div>
      </form>
    </div>
  );
}

export default function UserManagementPage() {
  const { token }               = useAuth();
  const [users,     setUsers]   = useState([]);
  const [loading,   setLoading] = useState(true);
  const [error,     setError]   = useState("");
  const [query,     setQuery]   = useState("");
  const [roleFilter,setRoleFilter] = useState("all");
  const [toggling,  setToggling] = useState(null); // user_id being toggled
  const ctrlRef = useRef(null);

  const fetchUsers = async () => {
    ctrlRef.current?.abort();
    ctrlRef.current = new AbortController();
    setLoading(true); setError("");
    try {
      const data = await api.get("/admin/users", { token, signal: ctrlRef.current.signal });
      setUsers(Array.isArray(data) ? data : data.items || []);
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchUsers(); return () => ctrlRef.current?.abort(); }, [token]);

  const toggleActive = async (userId) => {
    setToggling(userId);
    try {
      const res = await api.patch(`/admin/users/${userId}/toggle-active`, {}, { token });
      setUsers(prev => prev.map(u =>
        u.id === userId ? { ...u, is_active: res.is_active } : u
      ));
    } catch (e) {
      setError(e.message);
    } finally {
      setToggling(null);
    }
  };

  const filtered = users.filter(u => {
    const q = query.toLowerCase();
    const matchQ = !q
      || u.full_name.toLowerCase().includes(q)
      || u.email.toLowerCase().includes(q)
      || (u.matric_number || "").toLowerCase().includes(q);
    const matchR = roleFilter === "all" || u.role === roleFilter;
    return matchQ && matchR;
  });

  const counts = {
    all:      users.length,
    student:  users.filter(u => u.role === "student").length,
    lecturer: users.filter(u => u.role === "lecturer").length,
    admin:    users.filter(u => u.role === "admin").length,
  };

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div>
          <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">User Accounts</h1>
          <p className="text-lg text-slate-500">{users.length} registered users · toggle active status below</p>
        </div>
        <motion.button whileTap={{ scale: 0.96 }} onClick={fetchUsers}
          className="flex items-center gap-2 border border-slate-200 bg-white hover:border-slate-300 text-slate-600 text-sm font-medium px-4 h-10 rounded-xl transition-all">
          <RefreshCw size={13} /> Refresh
        </motion.button>
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {/* Student Whitelist Upload */}
      <WhitelistSection token={token} />

      {/* Lecturer Whitelist Upload */}
      <LecturerWhitelistSection token={token} />

      {/* Admin Invite */}
      <AdminInviteSection token={token} />

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            name="user-search"
            aria-label="Search users"
            value={query} onChange={e => setQuery(e.target.value)}
            placeholder="Search name, email, matric..."
            className="w-full h-10 pl-8 pr-3 bg-white border border-slate-200 rounded-xl text-sm outline-none
              focus:ring-2 focus:ring-accent/15 focus:border-accent/40 hover:border-slate-300 placeholder:text-slate-400"
          />
        </div>

        {/* Role pills */}
        <div className="flex gap-2 flex-wrap">
          {["all", "student", "lecturer", "admin"].map(r => (
            <button key={r} onClick={() => setRoleFilter(r)}
              className={[
                "px-3.5 h-9 rounded-xl text-xs font-semibold border transition-all capitalize",
                roleFilter === r
                  ? "bg-primary text-white border-primary"
                  : "bg-white text-slate-500 border-slate-200 hover:border-slate-300",
              ].join(" ")}>
              {r === "all" ? "All" : r} ({counts[r]})
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-400">
            <Users size={28} className="mb-3 opacity-40" />
            <p className="text-sm">No users match your search</p>
          </div>
        ) : (
          <VirtualizedTable
            data={filtered}
            rowHeight={52}
            maxHeight={600}
            emptyMessage="No users found."
            columns={[
              { key: "full_name", label: "Name", width: 180, render: (val) => (
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-accent font-bold text-[10px] flex-shrink-0">
                    {val.split(" ").map(n => n[0]).join("").slice(0,2).toUpperCase()}
                  </div>
                  <span className="font-semibold text-slate-900 truncate">{val}</span>
                </div>
              )},
              { key: "email", label: "Email", width: 200, render: (val) => <span className="text-slate-500 text-xs">{val}</span> },
              { key: "matric_number", label: "Matric / ID", width: 130, render: (val) =>
                val ? <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-lg text-primary">{val}</span> : <span className="text-slate-300 text-xs">—</span>
              },
              { key: "role", label: "Role", width: 110, render: (val) => {
                const meta = ROLE_META[val] || ROLE_META.student;
                const RoleIcon = meta.icon;
                return <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-lg border ${meta.color}`}><RoleIcon size={11} /> {meta.label}</span>;
              }},
              { key: "created_at", label: "Joined", width: 100, render: (val) => <span className="text-slate-400 text-xs">{formatDate(val)}</span> },
              { key: "is_active", label: "Status", width: 90, render: (val) =>
                val
                  ? <span className="inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold"><CheckCircle size={12} /> Active</span>
                  : <span className="inline-flex items-center gap-1 text-xs text-slate-400 font-semibold"><XCircle size={12} /> Inactive</span>
              },
              { key: "_action", label: "Action", width: 100, render: (_, u) => (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleActive(u.id); }}
                  disabled={toggling === u.id}
                  className={[
                    "text-xs font-semibold px-3 py-1.5 rounded-lg border transition-all",
                    u.is_active
                      ? "border-red-200 text-red-600 hover:bg-red-50"
                      : "border-emerald-200 text-emerald-600 hover:bg-emerald-50",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                  ].join(" ")}>
                  {toggling === u.id
                    ? <RefreshCw size={11} className="animate-spin inline" />
                    : u.is_active ? "Deactivate" : "Activate"
                  }
                </button>
              )},
            ]}
          />
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Showing {filtered.length} of {users.length} users
      </p>
    </div>
  );
}
