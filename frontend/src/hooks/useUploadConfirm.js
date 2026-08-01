/**
 * useUploadConfirm — hook to gate file uploads behind a confirmation dialog.
 * Returns state + handlers that pair with <UploadConfirmModal />.
 */
import { useState, useRef, useCallback } from "react";

export default function useUploadConfirm() {
  const [pendingFile, setPendingFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileRef = useRef(null);
  const intervalRef = useRef(null);

  /** Call from <input onChange> or <div onDrop> — stages the file, no upload yet */
  const selectFile = useCallback((e) => {
    e?.preventDefault?.();
    const file = e?.dataTransfer?.files?.[0] || e?.target?.files?.[0];
    if (!file) return;
    if (fileRef.current) fileRef.current.value = "";
    setPendingFile(file);
  }, []);

  /** User clicks "Cancel" in the modal */
  const cancelUpload = useCallback(() => {
    setPendingFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  /**
   * User clicks "Proceed" — call with your actual upload function.
   * `uploadFn` receives the file and must return a promise.
   */
  const confirmUpload = useCallback(async (uploadFn) => {
    if (!pendingFile) return;
    setUploading(true);
    setProgress(0);
    intervalRef.current = setInterval(() => {
      setProgress((p) => (p >= 90 ? 90 : p + Math.random() * 15));
    }, 300);
    try {
      await uploadFn(pendingFile);
      clearInterval(intervalRef.current);
      setProgress(100);
    } finally {
      clearInterval(intervalRef.current);
      setUploading(false);
      setProgress(0);
      setPendingFile(null);
    }
  }, [pendingFile]);

  return { pendingFile, uploading, progress, fileRef, selectFile, cancelUpload, confirmUpload };
}
