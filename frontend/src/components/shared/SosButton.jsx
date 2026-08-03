/**
 * SosButton — Floating SOS for high-risk students.
 * Only visible when student has at least one High-risk course.
 */
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { LifeBuoy, X, CheckCircle } from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { studentsApi, sosApi } from "../../services/api";
import CustomDropdown from "../ui/CustomDropdown";
import Button from "../ui/Button";

export default function SosButton() {
  const { user, token } = useAuth();
  const [visible,  setVisible]  = useState(false);
  const [open,     setOpen]     = useState(false);
  const [courses,  setCourses]  = useState([]);
  const [courseId, setCourseId] = useState("");
  const [category, setCategory] = useState("academic");
  const [message,  setMessage]  = useState("");
  const [loading,  setLoading]  = useState(false);
  const [done,     setDone]     = useState(false);
  const [error,    setError]    = useState("");

  useEffect(() => {
    if (user?.role !== "student" || !token) return;
    studentsApi.getOverview(token)
      .then((overview) => {
        const arr = Array.isArray(overview?.risk_scores) ? overview.risk_scores : [];
        if (arr.some(s => s.risk_level === "High")) {
          setVisible(true);
          setCourses(arr);
        }
      })
      .catch(() => {});
  }, [user, token]);

  if (!visible) return null;

  const handleSend = async () => {
    if (!courseId) { setError("Please select a course."); return; }
    setLoading(true); setError("");
    try {
      await sosApi.sendSos({ course_id: Number(courseId), category, message: message.trim() || undefined }, token);
      setDone(true);
      setTimeout(() => { setOpen(false); setDone(false); setMessage(""); setCourseId(""); setCategory("academic"); }, 2000);
    } catch (e) {
      setError(e.message || "Failed to send SOS.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {/* Floating button */}
      <div className="fixed bottom-6 right-6 z-50">
        <span className="absolute inset-0 rounded-full bg-risk-high opacity-30 animate-ping" />
        <motion.button
          onClick={() => setOpen(true)}
          whileHover={{ scale: 1.08 }}
          whileTap={{ scale: 0.95 }}
          className="relative w-14 h-14 bg-risk-high hover:bg-red-700 text-white rounded-full shadow-lg flex items-center justify-center transition-colors"
          title="Request Help (SOS)"
        >
          <LifeBuoy size={22} />
        </motion.button>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[60] flex items-end sm:items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0, y: 32 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{   opacity: 0, y: 32 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm p-6"
            >
              {done ? (
                <div className="flex flex-col items-center py-6 text-center gap-3">
                  <div className="w-14 h-14 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center">
                    <CheckCircle size={28} className="text-risk-low" />
                  </div>
                  <div>
                    <p className="font-serif text-lg font-semibold text-primary">Help request sent</p>
                    <p className="text-sm text-slate-400 mt-1">Your lecturer and admin have been notified.</p>
                  </div>
                </div>
              ) : (
                <>
                  {/* Header */}
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-red-50 border border-red-200 flex items-center justify-center">
                        <LifeBuoy size={17} className="text-risk-high" />
                      </div>
                      <div>
                        <h3 className="font-serif text-lg font-semibold text-primary leading-tight">Emergency Help</h3>
                        <p className="text-xs text-slate-400">Urgent academic support request</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setOpen(false)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                    >
                      <X size={15} />
                    </button>
                  </div>

                  {/* Form */}
                  <div className="space-y-3">
                    <CustomDropdown
                      label="Course"
                      value={courseId}
                      onChange={setCourseId}
                      options={courses.map(c => ({
                        value: String(c.course_id || c.id),
                        label: `${c.course_code} — ${c.course_title}`,
                      }))}
                      placeholder="Select course..."
                      searchable
                    />
                    <CustomDropdown
                      label="Category"
                      value={category}
                      onChange={setCategory}
                      options={[
                        { value: "academic",  label: "Academic — Course difficulty, grades" },
                        { value: "financial", label: "Financial — Fees, resources" },
                        { value: "emotional", label: "Emotional — Stress, wellbeing" },
                        { value: "health",    label: "Health — Physical / mental health" },
                        { value: "technical", label: "Technical — System / IT issues" },
                      ]}
                      placeholder="What kind of help do you need?"
                    />
                    <div className="flex flex-col gap-1.5">
                      <label className="ds-label">Message <span className="font-normal normal-case text-slate-400">(optional)</span></label>
                      <textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        rows={2}
                        placeholder="Describe your situation..."
                        className="ds-textarea resize-none"
                      />
                    </div>
                  </div>

                  {error && <p className="text-xs text-risk-high mt-2">{error}</p>}

                  <Button
                    variant="danger"
                    fullWidth
                    size="md"
                    onClick={handleSend}
                    loading={loading}
                    icon={<LifeBuoy size={14} />}
                    className="mt-5"
                  >
                    Send SOS
                  </Button>
                </>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
