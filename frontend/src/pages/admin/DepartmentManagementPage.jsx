/**
 * DepartmentManagementPage — Admin CRUD for faculties and departments.
 * Two-tab layout: Faculties | Departments
 */
import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Building2, Plus, CheckCircle, AlertCircle, Pencil, RefreshCw, Trash2,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { adminApi } from "../../services/api";
import Badge from "../../components/ui/Badge";

const c  = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const it = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } };

const inputCls =
  "w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all";

const TABS = ["Faculties", "Departments"];

export default function DepartmentManagementPage() {
  const { token } = useAuth();
  const [tab, setTab] = useState("Faculties");

  /* ── Shared state ──────────────────────────────────────── */
  const [faculties, setFaculties]     = useState([]);
  const [departments, setDepartments] = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");
  const [success, setSuccess]         = useState("");

  /* ── Faculty form ──────────────────────────────────────── */
  const [showFacultyForm, setShowFacultyForm] = useState(false);
  const [facForm, setFacForm] = useState({ name: "", code: "" });
  const [editFacId, setEditFacId]     = useState(null);
  const [facBusy, setFacBusy]         = useState(false);

  /* ── Department form ───────────────────────────────────── */
  const [showDeptForm, setShowDeptForm] = useState(false);
  const [deptForm, setDeptForm] = useState({ name: "", code: "", faculty_id: "" });
  const [editDeptId, setEditDeptId]   = useState(null);
  const [deptBusy, setDeptBusy]       = useState(false);
  const [delBusy, setDelBusy]         = useState(false);
  const [facultyFilter, setFacultyFilter] = useState("");

  /* ── Fetch ─────────────────────────────────────────────── */
  const fetchAll = async () => {
    setLoading(true); setError("");
    try {
      const [facs, depts] = await Promise.all([
        adminApi.getFaculties(token),
        adminApi.getDepartmentsFull(token),
      ]);
      setFaculties(Array.isArray(facs) ? facs : []);
      setDepartments(Array.isArray(depts) ? depts : []);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (token) fetchAll(); }, [token]);

  useEffect(() => { if (success) { const t = setTimeout(() => setSuccess(""), 4000); return () => clearTimeout(t); } }, [success]);
  useEffect(() => { if (error)   { const t = setTimeout(() => setError(""),   6000); return () => clearTimeout(t); } }, [error]);

  /* ── Faculty CRUD ──────────────────────────────────────── */
  const openFacultyEdit = (f) => {
    setEditFacId(f.id);
    setFacForm({ name: f.name, code: f.code });
    setShowFacultyForm(true);
  };

  const saveFaculty = async () => {
    if (!facForm.name.trim() || !facForm.code.trim()) { setError("Faculty name and code are required."); return; }
    setFacBusy(true); setError(""); setSuccess("");
    try {
      if (editFacId) {
        await adminApi.updateFaculty(editFacId, facForm, token);
        setSuccess("Faculty updated.");
      } else {
        await adminApi.createFaculty(facForm, token);
        setSuccess("Faculty created.");
      }
      setFacForm({ name: "", code: "" }); setEditFacId(null); setShowFacultyForm(false);
      fetchAll();
    } catch (e) { setError(e.message); }
    finally { setFacBusy(false); }
  };

  const removeFaculty = async (faculty) => {
    if (delBusy) return;
    if (!window.confirm(`Delete ${faculty.name}? This cannot be undone.`)) return;
    setDelBusy(true); setError(""); setSuccess("");
    try {
      await adminApi.deleteFaculty(faculty.id, token);
      setSuccess("Faculty deleted.");
      fetchAll();
    } catch (e) { setError(e.message); }
    finally { setDelBusy(false); }
  };

  /* ── Department CRUD ───────────────────────────────────── */
  const openDeptEdit = (d) => {
    setEditDeptId(d.id);
    setDeptForm({ name: d.name, code: d.code, faculty_id: d.faculty_id ?? "" });
    setShowDeptForm(true);
  };

  const saveDepartment = async () => {
    if (!deptForm.name.trim() || !deptForm.code.trim()) { setError("Department name and code are required."); return; }
    setDeptBusy(true); setError(""); setSuccess("");
    try {
      const payload = {
        name: deptForm.name.trim(),
        code: deptForm.code.trim(),
        faculty_id: deptForm.faculty_id ? Number(deptForm.faculty_id) : null,
      };
      if (editDeptId) {
        await adminApi.updateDepartment(editDeptId, payload, token);
        setSuccess("Department updated.");
      } else {
        await adminApi.createDepartment(payload, token);
        setSuccess("Department created.");
      }
      setDeptForm({ name: "", code: "", faculty_id: "" }); setEditDeptId(null); setShowDeptForm(false);
      fetchAll();
    } catch (e) { setError(e.message); }
    finally { setDeptBusy(false); }
  };

  const removeDepartment = async (department) => {
    if (delBusy) return;
    if (!window.confirm(`Delete ${department.name}? This cannot be undone.`)) return;
    setDelBusy(true); setError(""); setSuccess("");
    try {
      await adminApi.deleteDepartment(department.id, token);
      setSuccess("Department deleted.");
      fetchAll();
    } catch (e) { setError(e.message); }
    finally { setDelBusy(false); }
  };

  const filteredDepts = facultyFilter
    ? departments.filter(d => d.faculty_id === Number(facultyFilter))
    : departments;

  /* ── Render ────────────────────────────────────────────── */
  return (
    <motion.div variants={c} initial="hidden" animate="show" className="space-y-6 p-1">
      {/* Header */}
      <motion.div variants={it} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-serif font-bold text-slate-900 flex items-center gap-2">
            <Building2 size={22} className="text-accent" /> Departments &amp; Faculties
          </h1>
          <p className="text-sm text-slate-400 mt-1">Manage academic organisational units</p>
        </div>
        <button onClick={fetchAll} disabled={loading} className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 hover:text-primary transition-colors">
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </motion.div>

      {/* Feedback */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl px-4 py-3 text-sm">
            <AlertCircle size={16} /> {error}
          </motion.div>
        )}
        {success && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl px-4 py-3 text-sm">
            <CheckCircle size={16} /> {success}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Tabs */}
      <motion.div variants={it} className="flex gap-1 bg-slate-100 rounded-xl p-1 w-fit">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={[
              "px-4 py-2 rounded-lg text-sm font-semibold transition-all",
              tab === t ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-700",
            ].join(" ")}
          >{t}</button>
        ))}
      </motion.div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      ) : tab === "Faculties" ? (
        /* ══ Faculties Tab ════════════════════════════════════ */
        <motion.div variants={it} className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-slate-500">{faculties.length} faculties</p>
            <button onClick={() => { setEditFacId(null); setFacForm({ name: "", code: "" }); setShowFacultyForm(true); }}
              className="inline-flex items-center gap-1.5 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors shadow-sm">
              <Plus size={14} /> Add Faculty
            </button>
          </div>

          {/* Faculty form */}
          <AnimatePresence>
            {showFacultyForm && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 overflow-hidden">
                <h3 className="font-semibold text-slate-900">{editFacId ? "Edit Faculty" : "New Faculty"}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Faculty Name</label>
                    <input className={inputCls} placeholder="e.g. Faculty of Science" value={facForm.name}
                      onChange={e => setFacForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Code</label>
                    <input className={inputCls} placeholder="e.g. FOS" value={facForm.code}
                      onChange={e => setFacForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setShowFacultyForm(false); setEditFacId(null); }}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
                  <button onClick={saveFaculty} disabled={facBusy}
                    className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {facBusy ? "Saving..." : editFacId ? "Update" : "Create"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Faculty table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Code</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Departments</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {faculties.map(f => (
                  <tr key={f.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{f.name}</td>
                    <td className="px-4 py-3"><Badge variant="pill" label={f.code} color="navy" dot={false} /></td>
                    <td className="px-4 py-3 text-center text-slate-600">{f.department_count}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button onClick={() => openFacultyEdit(f)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/70 transition-colors">
                          <Pencil size={12} /> Edit
                        </button>
                        <button onClick={() => removeFaculty(f)} disabled={delBusy}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-500 transition-colors disabled:opacity-50">
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!faculties.length && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No faculties found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      ) : (
        /* ══ Departments Tab ═════════════════════════════════ */
        <motion.div variants={it} className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-sm text-slate-500">{filteredDepts.length} departments</p>
              <select value={facultyFilter} onChange={e => setFacultyFilter(e.target.value)}
                className="h-9 bg-white border border-slate-200 rounded-lg text-sm px-2 text-slate-700 focus:outline-none focus:ring-2 focus:ring-accent/30">
                <option value="">All Faculties</option>
                {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <button onClick={() => { setEditDeptId(null); setDeptForm({ name: "", code: "", faculty_id: "" }); setShowDeptForm(true); }}
              className="inline-flex items-center gap-1.5 bg-primary text-white text-sm font-semibold px-4 py-2 rounded-xl hover:bg-primary/90 transition-colors shadow-sm">
              <Plus size={14} /> Add Department
            </button>
          </div>

          {/* Department form */}
          <AnimatePresence>
            {showDeptForm && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="bg-white border border-slate-200 rounded-xl shadow-sm p-5 space-y-4 overflow-hidden">
                <h3 className="font-semibold text-slate-900">{editDeptId ? "Edit Department" : "New Department"}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Department Name</label>
                    <input className={inputCls} placeholder="e.g. Computer Science" value={deptForm.name}
                      onChange={e => setDeptForm(p => ({ ...p, name: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Code</label>
                    <input className={inputCls} placeholder="e.g. CSC" value={deptForm.code}
                      onChange={e => setDeptForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-500 mb-1">Faculty</label>
                    <select value={deptForm.faculty_id} onChange={e => setDeptForm(p => ({ ...p, faculty_id: e.target.value }))}
                      className={inputCls}>
                      <option value="">— None —</option>
                      {faculties.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => { setShowDeptForm(false); setEditDeptId(null); }}
                    className="px-4 py-2 text-sm font-medium text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
                  <button onClick={saveDepartment} disabled={deptBusy}
                    className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50">
                    {deptBusy ? "Saving..." : editDeptId ? "Update" : "Create"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Department table */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Name</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Code</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Faculty</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDepts.map(d => (
                  <tr key={d.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-4 py-3 font-medium text-slate-800">{d.name}</td>
                    <td className="px-4 py-3"><Badge variant="pill" label={d.code} color="blue" dot={false} /></td>
                    <td className="px-4 py-3 text-slate-600">{d.faculty_name || "\u2014"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-3">
                        <button onClick={() => openDeptEdit(d)}
                          className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/70 transition-colors">
                          <Pencil size={12} /> Edit
                        </button>
                        <button onClick={() => removeDepartment(d)} disabled={delBusy}
                          className="inline-flex items-center gap-1 text-xs font-medium text-red-600 hover:text-red-500 transition-colors disabled:opacity-50">
                          <Trash2 size={12} /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!filteredDepts.length && (
                  <tr><td colSpan={4} className="px-4 py-8 text-center text-slate-400">No departments found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
