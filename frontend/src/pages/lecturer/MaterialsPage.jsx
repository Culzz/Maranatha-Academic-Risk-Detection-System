/**
 * MaterialsPage — Lecturer uploads course materials for the Course Tutor.
 * Real data: lecturersApi.getCourses, uploadMaterial, getMaterials, deleteMaterial
 */
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Upload, FileText, Trash2 } from "lucide-react";
import { SuccessBanner, ErrorBanner } from "../../components/ui/Feedback";
import { useAuth } from "../../context/AuthContext";
import { lecturersApi } from "../../services/api";
import { formatDate } from "../../utils/helpers";
import CustomDropdown from "../../components/ui/CustomDropdown";
import UploadConfirmModal from "../../components/shared/UploadConfirmModal";

export default function MaterialsPage() {
  const { token } = useAuth();
  const [courses,   setCourses]   = useState([]);
  const [materials, setMaterials] = useState([]);
  const [courseId,  setCourseId]  = useState("");
  const [dragOver,  setDragOver]  = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress,  setProgress]  = useState(0);
  const [success,   setSuccess]   = useState("");
  const [error,     setError]     = useState("");
  const [pendingFile, setPendingFile] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [weekNumber, setWeekNumber] = useState("");
  const [topicTag, setTopicTag] = useState("");
  const fileRef = useRef(null);

  useEffect(() => {
    if (!token) return;
    lecturersApi.getCourses(token)
      .then(cs => {
        const arr = Array.isArray(cs) ? cs : [];
        setCourses(arr);
        if (arr.length) setCourseId(String(arr[0].id ?? arr[0].course_id ?? ""));
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!courseId || !token) return;
    lecturersApi.getMaterials(courseId, token)
      .then(data => setMaterials(Array.isArray(data) ? data : []))
      .catch(() => setMaterials([]));
  }, [courseId, token]);

  const handleFileSelect = (e) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer?.files[0] || e.target?.files?.[0];
    if (!file || !courseId) return;
    if (fileRef.current) fileRef.current.value = "";
    setPendingFile(file);
  };

  const handleConfirmUpload = async () => {
    if (!pendingFile || !courseId) return;
    setUploading(true); setError(""); setProgress(0);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      if (weekNumber) formData.append("week_number", weekNumber);
      if (topicTag.trim()) formData.append("topic_tag", topicTag.trim());
      // Simulate progress since fetch doesn't support upload progress natively
      const progressInterval = setInterval(() => {
        setProgress(p => p >= 90 ? 90 : p + Math.random() * 15);
      }, 300);
      await lecturersApi.uploadMaterial(courseId, formData, token);
      clearInterval(progressInterval);
      setProgress(100);
      const data = await lecturersApi.getMaterials(courseId, token);
      setMaterials(Array.isArray(data) ? data : []);
      setSuccess(`"${pendingFile.name}" uploaded. Students can now use this material in the Course Tutor.`);
      setPendingFile(null);
      setWeekNumber("");
      setTopicTag("");
    } catch (err) {
      setError(err.message || "Upload failed. Please try again.");
    } finally {
      setUploading(false);
      setProgress(0);
    }
  };

  const handleCancelUpload = () => {
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleDelete = async (id) => {
    try {
      await lecturersApi.deleteMaterial(id, token);
      setMaterials(prev => prev.filter(m => m.id !== id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err.message || "Failed to delete material.");
      setDeleteTarget(null);
    }
  };

  return (
    <div className="space-y-8">

      {/* Header */}
      <div className="mb-6">
        <h1 className="font-serif font-semibold text-primary"
            style={{ fontSize: 28, letterSpacing: "-0.028em", lineHeight: 1.2 }}>
          Course Materials
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Upload lecture notes and slides to power the Course Tutor
        </p>
      </div>

      <SuccessBanner message={success} />
      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Course selector */}
      {courses.length > 0 && (
        <div className="mb-6 max-w-xs">
          <CustomDropdown
            label="Course"
            value={courseId}
            onChange={(val) => setCourseId(val)}
            options={courses.map(c => ({
              value: String(c.id ?? c.course_id),
              label: `${c.course_code} — ${c.course_title}`,
            }))}
            searchable
          />
        </div>
      )}

      {/* Upload card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-6">
        <h2 className="font-serif font-semibold text-primary mb-1"
            style={{ fontSize: 17, letterSpacing: "-0.018em" }}>
          Upload Material
        </h2>
        <p className="text-sm text-slate-400 mb-5">Select a course and upload your file</p>

        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleFileSelect}
          onClick={() => fileRef.current?.click()}
          className={[
            "border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all",
            dragOver ? "border-accent bg-amber-50/40" : "border-slate-200 hover:border-accent/40 hover:bg-slate-50/50",
          ].join(" ")}
        >
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.docx,.pptx,.txt"
            className="hidden"
            onChange={handleFileSelect}
          />
          <Upload size={26} className="text-slate-300 mx-auto mb-3" />
          <p className="text-sm font-semibold text-primary mb-1">
            Drop a file here or click to browse
          </p>
          <p className="text-sm text-slate-400">PDF, DOCX, PPTX, TXT — max 10 MB</p>
        </div>

        {/* Optional metadata */}
        <div className="flex gap-3 mt-4">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Week (optional)</label>
            <input
              type="number" min="1" max="20"
              value={weekNumber} onChange={e => setWeekNumber(e.target.value)}
              placeholder="e.g. 3"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
          <div className="flex-[2]">
            <label className="block text-xs font-semibold text-slate-500 mb-1">Topic tag (optional)</label>
            <input
              type="text"
              value={topicTag} onChange={e => setTopicTag(e.target.value)}
              placeholder="e.g. Arrays & Pointers"
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>
        </div>
      </div>

      {/* Uploaded materials */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-100">
          <h2 className="font-serif font-semibold text-primary"
              style={{ fontSize: 17, letterSpacing: "-0.018em" }}>
            Uploaded Materials
          </h2>
        </div>

        {materials.length === 0 ? (
          <p className="text-center text-sm text-slate-400 py-10">No materials uploaded yet.</p>
        ) : (
          <div className="divide-y divide-slate-100">
            {materials.map(m => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex items-center justify-between gap-4 px-6 py-4"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center flex-shrink-0">
                    <FileText size={15} className="text-blue-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-primary truncate">{m.filename || m.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">
                      {m.course_code} · {m.file_size ? `${Math.round(m.file_size / 1024)} KB` : ""}
                      {m.uploaded_at || m.created_at ? ` · ${formatDate(m.uploaded_at || m.created_at)}` : ""}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDeleteTarget(m)}
                  className="text-slate-400 hover:text-risk-high transition-colors flex-shrink-0 p-1"
                >
                  <Trash2 size={14} />
                </button>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* Upload confirmation modal */}
      {pendingFile && (
        <UploadConfirmModal
          file={pendingFile}
          onConfirm={handleConfirmUpload}
          onCancel={handleCancelUpload}
          uploading={uploading}
          progress={progress}
          title="Upload Course Material"
          description="This file will be available to students via the Course Tutor."
        />
      )}

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-6">
            <h3 className="font-serif text-lg font-bold text-slate-900 mb-2">Delete Material</h3>
            <p className="text-sm text-slate-600 mb-1">
              Are you sure you want to delete <span className="font-semibold">{deleteTarget.filename || deleteTarget.name}</span>?
            </p>
            <p className="text-xs text-slate-400 mb-6">This action cannot be undone.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteTarget(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button onClick={() => handleDelete(deleteTarget.id)}
                className="flex-1 py-2.5 bg-red-600 text-white font-semibold rounded-xl text-sm hover:bg-red-700 transition-colors flex items-center justify-center gap-2">
                <Trash2 size={14} /> Delete
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
