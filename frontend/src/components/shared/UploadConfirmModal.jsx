/**
 * UploadConfirmModal — Reusable confirmation dialog for file uploads.
 *
 * Shows file name, size, and type with a "Proceed" / "Cancel" choice.
 * Displays an inline progress bar during upload.
 */
import { motion, AnimatePresence } from "framer-motion";
import { Upload, X, FileText, Image, FileSpreadsheet, File } from "lucide-react";

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(name) {
  const ext = (name || "").split(".").pop().toLowerCase();
  if (["pdf"].includes(ext)) return FileText;
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return Image;
  if (["xlsx", "xls", "csv"].includes(ext)) return FileSpreadsheet;
  return File;
}

export default function UploadConfirmModal({
  file,
  onConfirm,
  onCancel,
  uploading = false,
  progress = 0,
  title = "Confirm Upload",
  description,
}) {
  if (!file) return null;

  const Icon = fileIcon(file.name);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={uploading ? undefined : onCancel}
      >
        <motion.div
          className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-serif font-semibold text-primary">{title}</h3>
            {!uploading && (
              <button onClick={onCancel} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
                <X size={18} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="px-6 py-5">
            {description && (
              <p className="text-sm text-slate-500 mb-4">{description}</p>
            )}

            {/* File preview card */}
            <div className="flex items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200">
              <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center flex-shrink-0">
                <Icon size={22} className="text-accent" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-primary truncate">{file.name}</p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {formatSize(file.size)} &middot; {file.type || "Unknown type"}
                </p>
              </div>
            </div>

            {/* Progress bar */}
            {uploading && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-slate-500">Uploading...</span>
                  <span className="text-xs font-bold text-accent">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-accent rounded-full"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ duration: 0.3 }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-3">
            {!uploading && (
              <button
                onClick={onCancel}
                className="px-4 py-2 text-sm font-semibold text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              onClick={onConfirm}
              disabled={uploading}
              className="px-5 py-2 text-sm font-semibold text-white bg-accent hover:bg-accent-dark rounded-xl transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload size={16} />
                  Proceed
                </>
              )}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
