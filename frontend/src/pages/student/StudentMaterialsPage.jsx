/**
 * StudentMaterialsPage — Browse and download course materials.
 * Materials uploaded by lecturers are listed per course.
 */
import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router-dom";
import { FileText, Download, BookOpen, Eye, Search, CircleDot, AlertCircle, ExternalLink, ThumbsUp, Plus, X, ChevronDown, ChevronUp } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";

import { studentsApi, lecturersApi, curatedResourcesApi } from "../../services/api";
import { formatDate, formatFileSize } from "../../utils/helpers";
import CustomDropdown from "../../components/ui/CustomDropdown";

const FILE_ICON_COLORS = {
  pdf:  { bg: "bg-red-50 border-red-100",   text: "text-red-500"   },
  docx: { bg: "bg-blue-50 border-blue-100", text: "text-blue-500"  },
  pptx: { bg: "bg-orange-50 border-orange-100", text: "text-orange-500" },
  txt:  { bg: "bg-slate-50 border-slate-200",   text: "text-slate-500" },
};

/* Simple local storage tracker for viewed materials */
function getViewedMaterials() {
  try { return JSON.parse(localStorage.getItem("viewed_materials") || "[]"); }
  catch { return []; }
}

function markMaterialViewed(id) {
  const viewed = getViewedMaterials();
  if (!viewed.includes(id)) {
    viewed.push(id);
    localStorage.setItem("viewed_materials", JSON.stringify(viewed));
  }
}

export default function StudentMaterialsPage() {
  const { token } = useAuth();
  const [courses,   setCourses]   = useState([]);
  const [courseId,  setCourseId]  = useState("");
  const [materials, setMaterials] = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [downloading, setDownloading] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [search, setSearch] = useState("");
  const [materialStats, setMaterialStats] = useState([]);
  const [resources, setResources] = useState([]);
  const [showResourcesSection, setShowResourcesSection] = useState(false);
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [resourceForm, setResourceForm] = useState({ title: "", url: "", source_type: "youtube", topic_tag: "", description: "" });
  const [submittingResource, setSubmittingResource] = useState(false);
  const viewedIds = getViewedMaterials();
  const { on } = useRealtime();

  useEffect(() => {
    const u1 = on("material_uploaded", () => setRefreshTick(t => t + 1));
    return () => { u1(); };
  }, [on]);

  /* Load enrolled courses + material stats */
  useEffect(() => {
    if (!token) return;
    studentsApi.getMyCourses(token)
      .then(data => {
        const arr = Array.isArray(data) ? data : [];
        setCourses(arr);
        if (arr.length) setCourseId(String(arr[0].id ?? arr[0].course_id ?? ""));
      })
      .catch(() => {});
    studentsApi.getMaterialStats(token)
      .then(data => setMaterialStats(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [token]);

  /* Load materials when course changes */
  useEffect(() => {
    if (!courseId || !token) return;
    setLoading(true);
    lecturersApi.getMaterials(courseId, token)
      .then(data => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => setMaterials([]))
      .finally(() => setLoading(false));
  }, [courseId, token, refreshTick]);

  /* Load curated resources when course changes */
  useEffect(() => {
    if (!courseId || !token) return;
    curatedResourcesApi.getResources(token, courseId)
      .then(data => setResources(Array.isArray(data) ? data : []))
      .catch(() => setResources([]));
  }, [courseId, token]);

  const handleDownload = async (material) => {
    setDownloading(material.id);
    try {
      await lecturersApi.downloadMaterial(material.id, material.filename, token);
    } catch {
      /* silent fail — browser download dialog handles errors */
    } finally {
      setDownloading(null);
    }
  };

  const handleSubmitResource = async () => {
    if (!resourceForm.title.trim() || !resourceForm.url.trim() || !resourceForm.topic_tag.trim()) return;
    setSubmittingResource(true);
    try {
      await curatedResourcesApi.submitResource({ ...resourceForm, course_id: Number(courseId) || null }, token);
      setShowSubmitModal(false);
      setResourceForm({ title: "", url: "", source_type: "youtube", topic_tag: "", description: "" });
      // Refresh resources list
      curatedResourcesApi.getResources(token, courseId)
        .then(data => setResources(Array.isArray(data) ? data : []));
    } catch {
      /* silent */
    } finally {
      setSubmittingResource(false);
    }
  };

  const handleUpvote = async (id) => {
    try {
      const res = await curatedResourcesApi.upvoteResource(id, token);
      setResources(prev => prev.map(r => r.id === id ? { ...r, upvotes: res.upvotes } : r));
    } catch { /* silent */ }
  };

  const SOURCE_BADGES = {
    youtube:  { label: "YouTube",   cls: "bg-red-50 text-red-600 border-red-200"     },
    article:  { label: "Article",   cls: "bg-blue-50 text-blue-600 border-blue-200"  },
    textbook: { label: "Textbook",  cls: "bg-emerald-50 text-emerald-600 border-emerald-200" },
    practice: { label: "Practice",  cls: "bg-purple-50 text-purple-600 border-purple-200"   },
  };

  const currentCourse = courses.find(c => String(c.id ?? c.course_id) === courseId);
  const currentStats = materialStats.find(s => String(s.course_id) === courseId);

  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.id ?? c.course_id),
    label: `${c.course_code} — ${c.course_title}`,
  }));

  return (
    <div className="max-w-2xl mx-auto space-y-6">

      {/* Header */}
      <div className="flex items-center gap-3 mb-1">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-200 flex items-center justify-center flex-shrink-0">
          <BookOpen size={18} className="text-blue-500" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold text-slate-900 leading-tight">
            Course Materials
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Download lecture notes, slides, and resources
          </p>
        </div>
      </div>

      {/* Course selector + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        {COURSE_OPTIONS.length > 1 && (
          <div className="max-w-sm flex-1">
            <CustomDropdown
              value={courseId}
              onChange={setCourseId}
              options={COURSE_OPTIONS}
              placeholder="Select course"
            />
          </div>
        )}
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search materials..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
          />
        </div>
      </div>

      {/* Materials list */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100">
          <h2 className="font-serif text-base font-bold text-slate-900">
            {currentCourse ? `${currentCourse.course_code} Materials` : "Materials"}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {materials.length} file{materials.length !== 1 ? "s" : ""} available
            {currentStats && currentStats.total_materials > 0 && (() => {
              const pct = currentStats.access_pct;
              const cls = pct < 30 ? "bg-red-50 text-red-600 border-red-200" : pct < 60 ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-emerald-50 text-emerald-600 border-emerald-200";
              return (
                <span className={`ml-2 inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
                  {currentStats.accessed_materials} of {currentStats.total_materials} opened
                </span>
              );
            })()}
            {(() => {
              // Server-side unread count takes priority; fall back to localStorage
              const serverUnread = materials.filter(m => m.has_opened === false).length;
              const localUnread = materials.filter(m => !viewedIds.includes(m.id)).length;
              const unread = serverUnread > 0 ? serverUnread : localUnread;
              return unread > 0 ? (
                <span className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-blue-600">
                  <CircleDot size={10} /> {unread} unread
                </span>
              ) : null;
            })()}
          </p>
          {/* Amber unread banner — server-side data */}
          {(() => {
            const unread = materials.filter(m => m.has_opened === false).length;
            if (!unread) return null;
            return (
              <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                <AlertCircle size={13} className="flex-shrink-0 text-amber-500" />
                <span>
                  <strong>{unread} material{unread !== 1 ? "s" : ""}</strong> not yet opened this semester
                </span>
              </div>
            );
          })()}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
          </div>
        ) : materials.length === 0 ? (
          <div className="text-center py-16 px-6">
            <FileText size={32} className="text-slate-200 mx-auto mb-3" />
            <p className="text-sm text-slate-400">No materials uploaded for this course yet.</p>
          </div>
        ) : (() => {
          const filtered = materials.filter(m =>
            m.filename.toLowerCase().includes(search.toLowerCase())
          );
          return filtered.length === 0 ? (
            <div className="text-center py-12 px-6">
              <Search size={28} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm text-slate-400">No materials match "{search}"</p>
            </div>
          ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((m, i) => {
              const colors = FILE_ICON_COLORS[m.file_type] || FILE_ICON_COLORS.txt;
              const viewable = ["pdf", "png", "jpg", "jpeg", "pptx", "ppt", "docx", "doc", "txt"].includes(m.file_type);
              const isUnread = m.has_opened === false || (!viewedIds.includes(m.id) && m.has_opened === undefined);
              return (
                <motion.div
                  key={m.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, duration: 0.2 }}
                  className="flex items-center gap-4 px-6 py-4 hover:bg-slate-50/50 transition-colors"
                >
                  <div className="relative">
                    <div className={`w-10 h-10 rounded-xl border flex items-center justify-center flex-shrink-0 ${colors.bg}`}>
                      <FileText size={16} className={colors.text} />
                    </div>
                    {isUnread && (
                      <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-blue-500 rounded-full border-2 border-white" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">
                      {m.filename}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {m.file_type?.toUpperCase() || "FILE"}
                      {m.file_size ? ` · ${formatFileSize(m.file_size)}` : ""}
                      {m.uploaded_at ? ` · ${formatDate(m.uploaded_at)}` : ""}
                    </p>
                    {(m.week_number || m.topic_tag) && (
                      <div className="flex gap-1.5 mt-1">
                        {m.week_number && (
                          <span className="inline-block text-[10px] font-semibold bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded">
                            Week {m.week_number}
                          </span>
                        )}
                        {m.topic_tag && (
                          <span className="inline-block text-[10px] font-semibold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">
                            {m.topic_tag}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    {viewable && (
                      <Link
                        to={`/student/materials/${m.id}/view`}
                        onClick={() => markMaterialViewed(m.id)}
                        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-emerald-600 hover:bg-emerald-50 border border-emerald-200 hover:border-emerald-300 transition-all"
                      >
                        <Eye size={14} />
                        View
                      </Link>
                    )}
                    <button
                      onClick={() => handleDownload(m)}
                      disabled={downloading === m.id}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 hover:border-blue-300 transition-all disabled:opacity-50"
                    >
                      {downloading === m.id ? (
                        <span className="w-3.5 h-3.5 border-2 border-blue-200 border-t-blue-500 rounded-full animate-spin" />
                      ) : (
                        <Download size={14} />
                      )}
                      Download
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </div>
          );
        })()}
      </div>

      {/* ── Supplementary Resources ────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowResourcesSection(v => !v)}
          className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <ExternalLink size={15} className="text-indigo-500" />
            <span className="font-semibold text-sm text-slate-800">
              Supplementary Resources
              {resources.length > 0 && (
                <span className="ml-2 text-xs font-normal text-slate-500">{resources.length} resource{resources.length !== 1 ? "s" : ""}</span>
              )}
            </span>
          </div>
          {showResourcesSection ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </button>

        {showResourcesSection && (
          <div className="border-t border-slate-100">
            {resources.length === 0 ? (
              <div className="text-center py-8 px-6">
                <ExternalLink size={24} className="text-slate-200 mx-auto mb-2" />
                <p className="text-sm text-slate-400">No supplementary resources yet.</p>
                <p className="text-xs text-slate-400 mt-1">Be the first to suggest a helpful link!</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {resources.map(r => {
                  const badge = SOURCE_BADGES[r.source_type] || SOURCE_BADGES.article;
                  return (
                    <div key={r.id} className="flex items-start gap-3 px-6 py-3.5 hover:bg-slate-50/50 transition-colors">
                      <span className={`flex-shrink-0 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded border ${badge.cls}`}>
                        {badge.label}
                      </span>
                      <div className="flex-1 min-w-0">
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-semibold text-indigo-700 hover:underline truncate block"
                        >
                          {r.title}
                        </a>
                        {r.description && (
                          <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{r.description}</p>
                        )}
                        <span className="text-[10px] text-slate-400">{r.topic_tag}</span>
                      </div>
                      <button
                        onClick={() => handleUpvote(r.id)}
                        className="flex items-center gap-1 text-xs text-slate-400 hover:text-indigo-600 flex-shrink-0"
                      >
                        <ThumbsUp size={12} /> {r.upvotes}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50">
              <button
                onClick={() => setShowSubmitModal(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
              >
                <Plus size={13} /> Suggest a Resource
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Submit Resource Modal ────────────────────────────────── */}
      {showSubmitModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-slate-900">Suggest a Resource</h3>
              <button onClick={() => setShowSubmitModal(false)}>
                <X size={18} className="text-slate-400" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Title *"
                value={resourceForm.title}
                onChange={e => setResourceForm(f => ({...f, title: e.target.value}))}
              />
              <input
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="URL (https://...) *"
                value={resourceForm.url}
                onChange={e => setResourceForm(f => ({...f, url: e.target.value}))}
              />
              <input
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                placeholder="Topic (e.g. Linked Lists) *"
                value={resourceForm.topic_tag}
                onChange={e => setResourceForm(f => ({...f, topic_tag: e.target.value}))}
              />
              <select
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                value={resourceForm.source_type}
                onChange={e => setResourceForm(f => ({...f, source_type: e.target.value}))}
              >
                <option value="youtube">YouTube</option>
                <option value="article">Article</option>
                <option value="textbook">Textbook</option>
                <option value="practice">Practice Problems</option>
              </select>
              <textarea
                className="w-full text-sm border border-slate-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-200 resize-none"
                placeholder="Brief description (optional)"
                rows={2}
                value={resourceForm.description}
                onChange={e => setResourceForm(f => ({...f, description: e.target.value}))}
              />
            </div>
            <p className="text-xs text-slate-400 mt-3">Student submissions are reviewed by admins before appearing.</p>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => setShowSubmitModal(false)}
                className="flex-1 py-2 text-sm text-slate-500 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitResource}
                disabled={submittingResource || !resourceForm.title || !resourceForm.url || !resourceForm.topic_tag}
                className="flex-1 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50"
              >
                {submittingResource ? "Submitting..." : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
