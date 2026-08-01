/**
 * MaterialViewerPage — In-system document viewer with annotations + AI.
 * Renders extracted text with highlight, annotation, and AI explain features.
 * For PDF rendering at scale consider adding react-pdf later.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Highlighter, MessageSquare, Volume2,
  Loader2, Trash2, BookOpen, Sparkles, Clock, HelpCircle,
} from "lucide-react";

import { useAuth } from "../../context/AuthContext";
import { studentsApi, lecturersApi } from "../../services/api";

const COLORS = [
  { key: "yellow", cls: "bg-yellow-200", label: "Yellow" },
  { key: "green",  cls: "bg-emerald-200", label: "Green" },
  { key: "red",    cls: "bg-red-200",    label: "Red (confused)" },
];

export default function MaterialViewerPage() {
  const { id } = useParams();
  const { token } = useAuth();
  const navigate = useNavigate();
  const [material, setMaterial] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [blobUrl, setBlobUrl] = useState(null);
  const [aiPanel, setAiPanel] = useState(null); // {text, response, loading}
  const [listenMode, setListenMode] = useState(null); // {summary, loading}
  const [selectedColour, setSelectedColour] = useState("yellow");
  const [selectedText, setSelectedText] = useState("");
  const [readingSeconds, setReadingSeconds] = useState(0);
  const [versions, setVersions] = useState([]);
  const [confused, setConfused] = useState(false);
  const [confusionCount, setConfusionCount] = useState(0);
  const heartbeatRef = useRef(null);
  const readingStartRef = useRef(Date.now());
  const scrollDepthRef = useRef(0);

  // Track scroll depth on #material-content via scroll events
  useEffect(() => {
    const el = document.getElementById("material-content");
    if (!el) return;
    const handler = () => {
      const scrollable = el.scrollHeight - el.clientHeight;
      if (scrollable > 0) {
        const depth = Math.min(1, el.scrollTop / scrollable);
        if (depth > scrollDepthRef.current) scrollDepthRef.current = depth;
      }
    };
    el.addEventListener("scroll", handler, { passive: true });
    return () => el.removeEventListener("scroll", handler);
  });

  // Reading time heartbeat — sends progress every 30s while page is visible
  useEffect(() => {
    if (!id || !token) return;
    readingStartRef.current = Date.now();

    const sendHeartbeat = () => {
      if (document.visibilityState !== "visible") return;
      const elapsed = Math.floor((Date.now() - readingStartRef.current) / 1000);
      setReadingSeconds(elapsed);
      studentsApi.updateMaterialProgress(id, {
        time_spent_secs: elapsed,
        progress_pct: null,
        scroll_depth_pct: Math.round(scrollDepthRef.current * 100),
      }, token).catch(() => {});
    };

    heartbeatRef.current = setInterval(sendHeartbeat, 30000);
    return () => {
      // Send final heartbeat on unmount
      const elapsed = Math.floor((Date.now() - readingStartRef.current) / 1000);
      if (elapsed > 5) {
        studentsApi.updateMaterialProgress(id, {
          time_spent_secs: elapsed,
          progress_pct: null,
          scroll_depth_pct: Math.round(scrollDepthRef.current * 100),
        }, token).catch(() => {});
      }
      clearInterval(heartbeatRef.current);
    };
  }, [id, token]);

  // Update reading seconds display every second
  useEffect(() => {
    const timer = setInterval(() => {
      setReadingSeconds(Math.floor((Date.now() - readingStartRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      lecturersApi.viewMaterial(id, token),
      lecturersApi.getMaterialAnnotations(id, token),
    ]).then(([mat, ann]) => {
      setMaterial(mat);
      setAnnotations(Array.isArray(ann) ? ann : []);
      // Fetch PDF as blob URL to solve iframe auth issue
      if (mat.file_type === "pdf" || mat.filename?.endsWith(".pdf")) {
        lecturersApi.getMaterialBlobUrl(id, token).then(url => setBlobUrl(url)).catch(() => {});
      }
      // Fetch version history
      lecturersApi.getMaterialVersions(id, token).then(v => setVersions(Array.isArray(v) ? v : [])).catch(() => {});
      // Fetch confusion status
      lecturersApi.getConfusionCount(id, token).then(c => {
        setConfusionCount(c.total || 0);
        setConfused(!!c.reported_by_me);
      }).catch(() => {});
    }).catch(() => {}).finally(() => setLoading(false));
  }, [id, token]);

  const handleTextSelect = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.toString().trim().length > 3) {
      setSelectedText(sel.toString().trim());
    }
  }, []);

  const saveAnnotation = async () => {
    if (!selectedText) return;
    try {
      await lecturersApi.createMaterialAnnotation(id, {
        page_number: 1,
        selected_text: selectedText,
        colour: selectedColour,
      }, token);
      const updated = await lecturersApi.getMaterialAnnotations(id, token);
      setAnnotations(Array.isArray(updated) ? updated : []);
      setSelectedText("");
      window.getSelection()?.removeAllRanges();
    } catch {}
  };

  const deleteAnnotation = async (annId) => {
    try {
      await lecturersApi.deleteMaterialAnnotation(id, annId, token);
      setAnnotations(a => a.filter(x => x.id !== annId));
    } catch {}
  };

  const aiExplain = async (type = "explain") => {
    if (!selectedText) return;
    setAiPanel({ text: selectedText, response: null, loading: true });
    try {
      const res = await lecturersApi.aiExplainMaterial(id, {
        selected_text: selectedText,
        interaction_type: type,
      }, token);
      setAiPanel(p => ({ ...p, response: res.response, loading: false }));
    } catch {
      setAiPanel(p => ({ ...p, response: "AI service is unavailable.", loading: false }));
    }
  };

  const toggleListenMode = async () => {
    if (listenMode) { setListenMode(null); return; }
    if (!material) return;
    setListenMode({ summary: null, loading: true });
    try {
      const pageText = document.getElementById("material-content")?.innerText || "";
      const res = await lecturersApi.aiListenMaterial(id, {
        page_text: pageText.slice(0, 3000),
        page_number: 1,
      }, token);
      setListenMode({ summary: res.summary, loading: false });
    } catch {
      setListenMode({ summary: "Unable to generate summary.", loading: false });
    }
  };

  const toggleConfusion = async () => {
    try {
      if (confused) {
        await lecturersApi.undoConfusion(id, token);
        setConfused(false);
        setConfusionCount(c => Math.max(0, c - 1));
      } else {
        await lecturersApi.reportConfusion(id, token);
        setConfused(true);
        setConfusionCount(c => c + 1);
      }
    } catch {}
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-slate-400" size={32} />
      </div>
    );
  }

  if (!material) {
    return <p className="text-slate-500 text-center py-12">Material not found.</p>;
  }

  return (
    <motion.div
      className="max-w-6xl mx-auto space-y-5"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary mb-2 transition-colors"
          >
            <ArrowLeft size={14} /> Back to Materials
          </button>
          <h1 className="font-serif text-2xl font-bold text-slate-900">{material.filename}</h1>
          {material.course_code && (
            <p className="text-sm text-slate-500 mt-1">{material.course_code} — {material.course_title}</p>
          )}
        </div>

        {/* Reading progress */}
        <div className="text-right text-sm text-slate-500 space-y-1">
          <p>Progress: {material.reading_session?.progress_pct || 0}%</p>
          <div className="flex items-center gap-1.5 justify-end">
            <Clock size={13} className="text-slate-400" />
            <span className="tabular-nums font-medium">
              {readingSeconds >= 60
                ? `${Math.floor(readingSeconds / 60)}m ${readingSeconds % 60}s`
                : `${readingSeconds}s`}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-5">
        {/* Main content area */}
        <div className="flex-1 min-w-0">
          {/* Toolbar */}
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            {COLORS.map(c => (
              <button
                key={c.key}
                onClick={() => setSelectedColour(c.key)}
                className={[
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
                  selectedColour === c.key
                    ? `${c.cls} border-slate-400 shadow-sm`
                    : "bg-white border-slate-200 hover:border-slate-300",
                ].join(" ")}
              >
                <Highlighter size={12} /> {c.label}
              </button>
            ))}
            <div className="h-5 w-px bg-slate-200 mx-1" />
            {selectedText && (
              <>
                <button onClick={saveAnnotation} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-white">
                  Highlight
                </button>
                <button onClick={() => aiExplain("explain")} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 hover:border-accent/30">
                  Explain
                </button>
                <button onClick={() => aiExplain("example")} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 hover:border-accent/30">
                  Example
                </button>
                <button onClick={() => aiExplain("relate")} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-white border border-slate-200 hover:border-accent/30">
                  Relate
                </button>
              </>
            )}
            <button
              onClick={toggleListenMode}
              className={[
                "ml-auto px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5",
                listenMode ? "bg-accent text-white border-accent" : "bg-white border-slate-200 hover:border-accent/30",
              ].join(" ")}
            >
              <Volume2 size={12} /> Listen Mode
            </button>
            <button
              onClick={toggleConfusion}
              className={[
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5",
                confused ? "bg-red-100 text-red-700 border-red-300" : "bg-white border-slate-200 hover:border-red-200 text-slate-600",
              ].join(" ")}
            >
              <HelpCircle size={12} /> {confused ? "Understood!" : "I Don't Understand"}
              {confusionCount > 0 && (
                <span className="ml-1 text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full font-semibold">{confusionCount}</span>
              )}
            </button>
          </div>

          {/* Listen mode panel */}
          {listenMode && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Volume2 size={14} className="text-amber-600" />
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Listen Mode Summary</span>
              </div>
              {listenMode.loading ? (
                <div className="flex items-center gap-2 text-sm text-amber-600">
                  <Loader2 size={14} className="animate-spin" /> Generating summary...
                </div>
              ) : (
                <p className="text-sm text-amber-900 whitespace-pre-line leading-relaxed">{listenMode.summary}</p>
              )}
            </div>
          )}

          {/* Document content */}
          {(material.file_type === "pdf" || material.filename?.endsWith(".pdf")) ? (
            <div className="space-y-4">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                {blobUrl ? (
                  <iframe
                    src={blobUrl}
                    className="w-full"
                    style={{ height: "70vh" }}
                    title={material.filename}
                  />
                ) : (
                  <div className="flex items-center justify-center h-64 text-slate-400">
                    <Loader2 size={24} className="animate-spin mr-2" /> Loading document...
                  </div>
                )}
              </div>
              {material.content_text && (
                <div
                  id="material-content"
                  onMouseUp={handleTextSelect}
                  className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-sm text-slate-800 leading-relaxed whitespace-pre-line"
                  style={{ maxHeight: "50vh", overflowY: "auto" }}
                >
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Extracted Text — select to highlight or explain</p>
                  {material.content_text}
                </div>
              )}
            </div>
          ) : (
            <div
              id="material-content"
              onMouseUp={handleTextSelect}
              className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm text-sm text-slate-800 leading-relaxed whitespace-pre-line"
              style={{ minHeight: 400, maxHeight: "70vh", overflowY: "auto" }}
            >
              {material.content_text
                ? material.content_text
                : "No text content extracted for this material. The file can be downloaded from the materials page."}
            </div>
          )}
        </div>

        {/* Side panels */}
        <div className="w-80 flex-shrink-0 space-y-4">
          {/* AI Panel */}
          {aiPanel && (
            <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles size={14} className="text-accent" />
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">AI Response</span>
                <button onClick={() => setAiPanel(null)} className="ml-auto text-slate-400 hover:text-slate-600 text-xs">Close</button>
              </div>
              {aiPanel.text && (
                <p className="text-xs text-slate-400 mb-2 line-clamp-2">"{aiPanel.text}"</p>
              )}
              {aiPanel.loading ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" /> Thinking...
                </div>
              ) : (
                <p className="text-sm text-slate-700 whitespace-pre-line leading-relaxed">{aiPanel.response}</p>
              )}
            </div>
          )}

          {/* Annotations */}
          <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm">
            <div className="flex items-center gap-2 mb-3">
              <BookOpen size={14} className="text-primary" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                My Highlights ({annotations.length})
              </span>
            </div>
            {annotations.length === 0 ? (
              <p className="text-xs text-slate-400">Select text and highlight to annotate.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {annotations.map(a => {
                  const colourObj = COLORS.find(c => c.key === a.colour) || COLORS[0];
                  return (
                    <div key={a.id} className={`${colourObj.cls} rounded-lg px-3 py-2 text-xs`}>
                      <p className="text-slate-800 line-clamp-3">"{a.selected_text}"</p>
                      {a.note && <p className="text-slate-600 mt-1">{a.note}</p>}
                      <button
                        onClick={() => deleteAnnotation(a.id)}
                        className="mt-1 flex items-center gap-1 text-red-500 hover:text-red-700 text-[10px]"
                      >
                        <Trash2 size={10} /> Remove
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Version history */}
      {versions.length > 1 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">Version History</h3>
          </div>
          <div className="divide-y divide-slate-100">
            {versions.map(v => (
              <div key={v.id} className="flex items-center justify-between px-5 py-2.5">
                <div className="flex items-center gap-2">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${v.is_latest ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-slate-50 text-slate-500 border border-slate-200"}`}>
                    v{v.version}
                  </span>
                  <span className="text-sm text-slate-700">{v.filename}</span>
                  {v.file_size && <span className="text-xs text-slate-400">({(v.file_size / 1024).toFixed(0)} KB)</span>}
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{v.uploaded_at ? new Date(v.uploaded_at).toLocaleDateString() : ""}</span>
                  {String(v.id) !== String(id) && (
                    <button onClick={() => navigate(`/student/materials/${v.id}/view`)} className="text-xs text-primary font-semibold hover:underline">
                      View
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
