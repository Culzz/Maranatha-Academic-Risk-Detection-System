/**
 * EnrollmentPage — Bulk CSV + single student enrollment
 * Real API: POST /enrollments/bulk-csv, POST /enrollments/single,
 *           GET  /enrollments/session-enrollments
 */
import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Upload, Plus, CheckCircle, XCircle, AlertCircle,
  FileText, RefreshCw, Users, ChevronDown,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { api, apiFetch, BASE_URL } from "../../services/api";
import { formatDate, formatCourseCode } from "../../utils/helpers";
import Input from "../../components/ui/Input";
import Button from "../../components/ui/Button";
import { SuccessBanner } from "../../components/ui/Feedback";
import CustomDropdown from "../../components/ui/CustomDropdown";

const c  = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const it = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } };

// ── Bulk Upload Section ─────────────────────────────────────
function BulkSection({ token, onDone }) {
  const [dragging,  setDragging]  = useState(false);
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
      const res = await fetch(`${BASE_URL}/enrollments/bulk-csv`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setResult(data);
      setFile(null);
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Bulk Enrollment</h2>
        <p className="text-sm text-slate-400">
          Upload a file with columns: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">matric_number</code>,{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">course_code</code>,{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">course_title</code>,{" "}
          <code className="bg-slate-100 px-1.5 py-0.5 rounded text-xs">course_unit</code>.{" "}
          Accepted formats: CSV, PDF, DOCX, JPG, PNG.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => inputRef.current?.click()}
        className={[
          "border-2 border-dashed rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer transition-all",
          dragging ? "border-accent bg-accent/5" : "border-slate-200 hover:border-slate-300 hover:bg-slate-50",
        ].join(" ")}>
        <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${dragging ? "bg-accent/15 text-accent" : "bg-slate-100 text-slate-400"}`}>
          <Upload size={22} />
        </div>
        {file ? (
          <div className="text-center">
            <p className="font-semibold text-primary text-sm flex items-center gap-2">
              <FileText size={14} /> {file.name}
            </p>
            <p className="text-xs text-slate-400 mt-0.5">{(file.size / 1024).toFixed(1)} KB · Ready to upload</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm font-semibold text-slate-600">Drop file here or click to browse</p>
            <p className="text-xs text-slate-400 mt-0.5">CSV, PDF, DOCX, JPG, PNG accepted</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".csv,.pdf,.docx,.doc,.jpg,.jpeg,.png,.webp" name="enrollment-file" className="hidden"
          onChange={e => handleFile(e.target.files[0])} />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <Button onClick={upload} loading={uploading} disabled={!file || uploading} icon={<Upload size={13} />}>
        Upload & Enroll
      </Button>

      {/* Result */}
      <AnimatePresence>
        {result && result.requires_manual_review && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-sm text-amber-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>{result.message || "Image uploaded. Please re-upload enrollment data as a CSV, PDF, or DOCX file."}</span>
          </motion.div>
        )}
        {result && !result.requires_manual_review && (
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="space-y-3">
            <div className="grid grid-cols-3 gap-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-center">
                <p className="font-serif text-2xl font-bold text-emerald-700">{result.summary.successfully_enrolled}</p>
                <p className="text-xs text-emerald-600 mt-1 font-medium">Enrolled</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-center">
                <p className="font-serif text-2xl font-bold text-amber-700">{result.summary.skipped_duplicates}</p>
                <p className="text-xs text-amber-600 mt-1 font-medium">Skipped</p>
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-center">
                <p className="font-serif text-2xl font-bold text-red-700">{result.summary.failed}</p>
                <p className="text-xs text-red-600 mt-1 font-medium">Failed</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 text-center">
              Session: {result.session} · {result.summary.total_rows_processed} rows processed
            </p>
            {result.errors?.length > 0 && (
              <details className="bg-red-50 border border-red-200 rounded-xl p-4">
                <summary className="text-sm text-red-700 font-semibold cursor-pointer">
                  {result.errors.length} failed rows — click to expand
                </summary>
                <ul className="mt-3 space-y-1.5">
                  {result.errors.map((e, i) => (
                    <li key={i} className="text-xs text-red-600">
                      Row {e.row}: <span className="font-mono">{e.matric_number}</span> / <span className="font-mono">{e.course_code}</span> — {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Single Enrollment Section ────────────────────────────
function SingleSection({ token, onDone }) {
  const [matric,   setMatric]   = useState("");
  const [course,   setCourse]   = useState("");
  const [loading,  setLoading]  = useState(false);
  const [success,  setSuccess]  = useState("");
  const [error,    setError]    = useState("");

  const submit = async () => {
    if (!matric.trim() || !course.trim()) { setError("Both fields are required."); return; }
    setLoading(true); setError(""); setSuccess("");
    try {
      const res = await api.post(
        `/enrollments/single?matric_number=${encodeURIComponent(matric.trim())}&course_code=${encodeURIComponent(course.trim().toUpperCase())}`,
        {},
        { token }
      );
      setSuccess(`${res.student} enrolled in ${res.course_code} — ${res.course}.`);
      setMatric(""); setCourse("");
      onDone?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 space-y-5">
      <div>
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Single Enrollment</h2>
        <p className="text-sm text-slate-400">Enroll one student by matric number and course code</p>
      </div>

      <SuccessBanner message={success} />
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Input label="Matric Number" required placeholder="e.g. 22/CSC/007"
          value={matric} onChange={setMatric} />
        <Input label="Course Code" required placeholder="e.g. CSC 303"
          value={course} onChange={setCourse} />
      </div>

      <Button onClick={submit} loading={loading} icon={<Plus size={13} />}>
        Enroll Student
      </Button>
    </div>
  );
}

// ── Enrollment List Section ──────────────────────────────
function EnrollmentList({ token, refresh }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [query,   setQuery]   = useState("");
  const [filterDept,   setFilterDept]   = useState("");
  const [filterLevel,  setFilterLevel]  = useState("");
  const [displayLimit, setDisplayLimit] = useState(100);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await api.get("/enrollments/session-enrollments", { token });
      setData(res);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { fetchData(); }, [token, refresh]);

  const allEnrollments = data?.items || data?.enrollments || [];
  const departments = [...new Set(allEnrollments.map(e => e.department_name).filter(Boolean))].sort();

  const filtered = allEnrollments
    .filter(e => {
      const q = query.toLowerCase();
      return !q || e.matric_number.toLowerCase().includes(q)
        || e.student_name.toLowerCase().includes(q)
        || e.course_code.toLowerCase().includes(q);
    })
    .filter(e => !filterDept || e.department_name === filterDept)
    .filter(e => !filterLevel || String(e.level) === filterLevel);

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-serif text-xl font-bold text-slate-900">Active Session Enrollments</h2>
          <p className="text-sm text-slate-400 mt-0.5">{data?.session} · {data?.total ?? "—"} total</p>
        </div>
        <div className="relative">
          <input value={query} onChange={e => setQuery(e.target.value)}
            name="enrollment-search"
            aria-label="Filter enrollments"
            placeholder="Filter by name, matric, course..."
            className="h-9 pl-3 pr-3 bg-white border border-slate-200 rounded-xl text-sm outline-none
              focus:ring-2 focus:ring-accent/15 focus:border-accent/40 w-56 placeholder:text-slate-400" />
        </div>
      </div>

      {/* Department & Level filter dropdowns */}
      <div className="px-6 py-3 border-b border-slate-100 flex gap-3 flex-wrap">
        <select
          value={filterDept}
          onChange={e => { setFilterDept(e.target.value); setDisplayLimit(100); }}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
        >
          <option value="">All Departments</option>
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select
          value={filterLevel}
          onChange={e => { setFilterLevel(e.target.value); setDisplayLimit(100); }}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm"
        >
          <option value="">All Levels</option>
          {[100, 200, 300, 400, 500, 600].map(l => <option key={l} value={String(l)}>{l}L</option>)}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-slate-400">
          <Users size={24} className="mb-2 opacity-40" />
          <p className="text-sm">No enrollments found</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ds-table w-full">
            <thead>
              <tr>
                <th className="text-left">Student</th>
                <th className="text-left hidden sm:table-cell">Matric</th>
                <th className="text-left">Course</th>
                <th className="text-left hidden md:table-cell">Course Title</th>
                <th className="text-left hidden lg:table-cell">Enrolled</th>
              </tr>
            </thead>
            <motion.tbody variants={c} initial="hidden" animate="show">
              {filtered.slice(0, displayLimit).map((e, i) => (
                <motion.tr key={i} variants={it}>
                  <td className="font-semibold text-slate-900">{e.student_name}</td>
                  <td className="hidden sm:table-cell">
                    <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded-lg text-primary">{e.matric_number}</span>
                  </td>
                  <td className="font-semibold text-primary">{formatCourseCode(e.course_code)}</td>
                  <td className="text-slate-500 hidden md:table-cell text-sm">{e.course_title}</td>
                  <td className="text-slate-400 text-xs hidden lg:table-cell">{formatDate(e.enrolled_at)}</td>
                </motion.tr>
              ))}
            </motion.tbody>
          </table>
          {filtered.length > displayLimit && (
            <div className="text-center py-4">
              <p className="text-sm text-slate-500 mb-2">
                Showing {displayLimit} of {filtered.length} results
              </p>
              <button
                onClick={() => setDisplayLimit(prev => prev + 100)}
                className="px-4 py-2 bg-[#0f1f3d] text-white rounded-lg text-sm hover:opacity-90 transition"
              >
                Load More
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Course-Lecturer Assignment Section ───────────────────
function CourseAssignmentSection({ token }) {
  const [courses,   setCourses]   = useState([]);
  const [lecturers, setLecturers] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(null); // course_id being saved
  const [error,     setError]     = useState("");

  useEffect(() => {
    setLoading(true);
    Promise.allSettled([
      api.get("/admin/courses",           { token }),
      api.get("/admin/users",             { token }),
    ]).then(([coursesRes, usersRes]) => {
      if (coursesRes.status === "fulfilled") setCourses(coursesRes.value);
      if (usersRes.status  === "fulfilled") {
        const usersData = usersRes.value;
        const usersList = Array.isArray(usersData) ? usersData : usersData?.items || [];
        setLecturers(usersList.filter(u => u.role === "lecturer"));
      }
    }).finally(() => setLoading(false));
  }, [token]);

  const assign = async (courseId, lecturerId) => {
    setSaving(courseId); setError("");
    try {
      const res = await api.patch(
        `/admin/courses/${courseId}/assign-lecturer`,
        { lecturer_id: lecturerId || null },
        { token }
      );
      setCourses(prev => prev.map(c =>
        c.id === courseId ? { ...c, lecturer: res.lecturer } : c
      ));
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-200">
        <h2 className="font-serif text-xl font-bold text-slate-900 mb-1">Assign Lecturers to Courses</h2>
        <p className="text-sm text-slate-400">
          Courses auto-created from bulk CSV have no lecturer. Assign a lecturer so the course appears on their dashboard.
        </p>
      </div>

      {error && (
        <div className="mx-6 mt-4 flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="w-5 h-5 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : courses.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-32 text-slate-400">
          <p className="text-sm">No courses in active session</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="ds-table w-full">
            <thead>
              <tr>
                <th className="text-left">Course Code</th>
                <th className="text-left hidden md:table-cell">Title</th>
                <th className="text-left hidden sm:table-cell">Level</th>
                <th className="text-left hidden sm:table-cell">Students</th>
                <th className="text-left">Assigned Lecturer</th>
              </tr>
            </thead>
            <tbody>
              {courses.map(c => (
                <tr key={c.id}>
                  <td className="font-semibold text-primary whitespace-nowrap">{formatCourseCode(c.course_code)}</td>
                  <td className="text-slate-600 hidden md:table-cell text-sm max-w-[180px] truncate">{c.course_title}</td>
                  <td className="text-slate-500 hidden sm:table-cell">{c.level}</td>
                  <td className="text-slate-500 hidden sm:table-cell">{c.enrolled_count ?? "—"}</td>
                  <td>
                    <div className="flex items-center gap-2">
                      <CustomDropdown
                        value={lecturers.find(l => l.full_name === c.lecturer)?.id || ""}
                        onChange={(val) => assign(c.id, val || null)}
                        disabled={saving === c.id}
                        options={[
                          { value: "", label: "\u2014 Unassigned \u2014" },
                          ...lecturers.map(l => ({
                            value: String(l.id),
                            label: l.full_name,
                          })),
                        ]}
                        placeholder="\u2014 Unassigned \u2014"
                      />
                      {saving === c.id && (
                        <RefreshCw size={12} className="animate-spin text-accent" />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Main Page ────────────────────────────────────────────
export default function EnrollmentPage() {
  const { token } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const bump = () => setRefresh(r => r + 1);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3 leading-tight">Enrollments</h1>
        <p className="text-lg text-slate-500">Manage student course enrollments for the active academic session</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <BulkSection   token={token} onDone={bump} />
        <SingleSection token={token} onDone={bump} />
      </div>

      <EnrollmentList token={token} refresh={refresh} />

      <CourseAssignmentSection token={token} />
    </div>
  );
}
