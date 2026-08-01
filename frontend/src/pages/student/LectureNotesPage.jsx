import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Mic, MicOff, FileText, Sparkles, Trash2, ChevronDown,
  RefreshCw, AlertCircle, CheckCircle, BookOpen, Upload,
  Radio, Type, Square, Loader, Play, Pause,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { studentsApi } from "../../services/api";

const item = { hidden: { opacity: 0, y: 6 }, show: { opacity: 1, y: 0, transition: { duration: 0.22 } } };

export default function LectureNotesPage() {
  const { token, user } = useAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [courses, setCourses] = useState([]);
  const [selectedCourse, setSelectedCourse] = useState("");

  // Recording mode: "live" = browser speech, "audio" = MediaRecorder + Whisper
  const [recordMode, setRecordMode] = useState("audio");

  // Live text (browser speech) state
  const [isRecording, setIsRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [noteTitle, setNoteTitle] = useState("");
  const recognitionRef = useRef(null);

  // Audio recording state (MediaRecorder)
  const [isAudioRecording, setIsAudioRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioElapsed, setAudioElapsed] = useState(0);
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioTitle, setAudioTitle] = useState("");
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const timerRef = useRef(null);

  // Generation state
  const [generatingId, setGeneratingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);

  // Load courses
  useEffect(() => {
    const loadCourses = async () => {
      try {
        const data = await studentsApi.getMyCourses(token);
        const list = Array.isArray(data) ? data : data.courses || data.items || [];
        setCourses(list);
        if (list.length > 0) setSelectedCourse(String(list[0].id || list[0].course_id));
      } catch {}
    };
    loadCourses();
  }, [token]);

  // Load notes when course changes
  useEffect(() => {
    if (!selectedCourse) return;
    const loadNotes = async () => {
      setLoading(true);
      setError("");
      try {
        const data = await studentsApi.getLectureNotes(selectedCourse, token);
        setNotes(Array.isArray(data) ? data : []);
      } catch (e) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };
    loadNotes();
  }, [selectedCourse, token]);

  // Web Speech API
  const startRecording = () => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Speech recognition is not supported in your browser. Please use Chrome or Edge.");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-NG";

    let finalTranscript = "";
    recognition.onresult = (event) => {
      let interim = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          finalTranscript += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      setTranscript(finalTranscript + interim);
    };

    recognition.onerror = (event) => {
      if (event.error !== "no-speech") {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still recording (speech recognition can stop)
      if (recognitionRef.current && isRecording) {
        try { recognition.start(); } catch {}
      }
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsRecording(true);
    setTranscript("");
  };

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsRecording(false);
  };

  /* ── Audio recording (MediaRecorder → Whisper) ──────── */
  const startAudioRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4" });
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start(1000); // collect chunks every second
      setIsAudioRecording(true);
      setAudioBlob(null);
      setAudioUrl(null);
      setAudioElapsed(0);
      timerRef.current = setInterval(() => setAudioElapsed(s => s + 1), 1000);
    } catch (e) {
      setError("Microphone access denied. Please allow microphone access and try again.");
    }
  }, []);

  const stopAudioRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsAudioRecording(false);
    clearInterval(timerRef.current);
    mediaRecorderRef.current = null;
  }, []);

  const discardAudio = () => {
    setAudioBlob(null);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setAudioElapsed(0);
    setAudioTitle("");
  };

  const uploadAudio = async () => {
    if (!audioBlob || !selectedCourse) return;
    setAudioUploading(true);
    setError("");
    try {
      const ext = audioBlob.type.includes("webm") ? "webm" : "mp4";
      const formData = new FormData();
      formData.append("file", audioBlob, `recording.${ext}`);
      formData.append("course_id", selectedCourse);
      formData.append("title", audioTitle || "Audio Recording");
      const data = await studentsApi.uploadAudioNote(formData, token);
      setNotes(prev => [data, ...prev]);
      discardAudio();
    } catch (e) {
      setError(e.message || "Failed to upload recording.");
    } finally {
      setAudioUploading(false);
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearInterval(timerRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
  }, [audioUrl]);

  const fmtElapsed = (s) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const saveNote = async () => {
    if (!transcript.trim() || !selectedCourse) return;
    try {
      const data = await studentsApi.createLectureNote({
        course_id: parseInt(selectedCourse),
        title: noteTitle || "Untitled Note",
        raw_transcript: transcript.trim(),
      }, token);
      setNotes(prev => [data, ...prev]);
      setTranscript("");
      setNoteTitle("");
    } catch (e) {
      setError(e.message);
    }
  };

  const generateStructured = async (noteId) => {
    setGeneratingId(noteId);
    try {
      const updated = await studentsApi.generateNotes(noteId, token);
      setNotes(prev => prev.map(n => n.id === noteId ? updated : n));
      setExpandedId(noteId);
    } catch (e) {
      setError(e.message);
    } finally {
      setGeneratingId(null);
    }
  };

  const deleteNote = async (noteId) => {
    if (!window.confirm("Delete this note?")) return;
    try {
      await studentsApi.deleteLectureNote(noteId, token);
      setNotes(prev => prev.filter(n => n.id !== noteId));
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="font-serif text-4xl font-bold text-slate-900 mb-3">Lecture Notes</h1>
        <p className="text-lg text-slate-500">Record lectures and generate AI-structured study notes</p>
      </div>

      {/* Course selector */}
      <div className="flex items-center gap-4 flex-wrap">
        <select
          value={selectedCourse}
          onChange={(e) => setSelectedCourse(e.target.value)}
          className="h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:ring-2 focus:ring-accent/15"
        >
          <option value="">Select Course</option>
          {courses.map(c => (
            <option key={c.id || c.course_id} value={c.id || c.course_id}>
              {c.course_code || c.code} — {c.course_title || c.title}
            </option>
          ))}
        </select>
      </div>

      {/* Recording section */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h2 className="font-serif text-xl font-bold text-slate-900">Record Lecture</h2>

          {/* Mode toggle */}
          <div className="flex items-center bg-slate-100 rounded-lg p-0.5">
            <button
              onClick={() => setRecordMode("audio")}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${recordMode === "audio" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Radio size={12} /> Audio Record
            </button>
            <button
              onClick={() => setRecordMode("live")}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${recordMode === "live" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              <Type size={12} /> Live Text
            </button>
          </div>
        </div>

        {recordMode === "audio" ? (
          /* ── Audio Recording Mode ──────────────────────── */
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Record audio from your microphone. After recording, the audio is uploaded and transcribed server-side using AI.
            </p>

            <div className="flex items-center gap-3">
              {!isAudioRecording ? (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={startAudioRecording}
                  disabled={!selectedCourse || audioUploading}
                  className="flex items-center gap-2 bg-red-500 text-white text-sm font-semibold px-5 h-10 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  <Mic size={16} /> Start Recording
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={stopAudioRecording}
                  className="flex items-center gap-2 bg-slate-700 text-white text-sm font-semibold px-5 h-10 rounded-xl hover:bg-slate-800 transition-colors"
                >
                  <Square size={14} /> Stop
                </motion.button>
              )}
              {isAudioRecording && (
                <span className="flex items-center gap-2 text-red-500 text-sm font-semibold">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  Recording {fmtElapsed(audioElapsed)}
                </span>
              )}
            </div>

            {/* Audio preview + upload */}
            {audioBlob && !isAudioRecording && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                    Audio Preview ({fmtElapsed(audioElapsed)})
                  </p>
                  <button onClick={discardAudio} className="text-xs text-red-400 hover:text-red-600 font-semibold">Discard</button>
                </div>
                {audioUrl && (
                  <audio controls src={audioUrl} className="w-full h-10" />
                )}
                <input
                  type="text"
                  placeholder="Note title (optional)"
                  value={audioTitle}
                  onChange={(e) => setAudioTitle(e.target.value)}
                  className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:ring-2 focus:ring-accent/15"
                />
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={uploadAudio}
                  disabled={audioUploading}
                  className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 h-10 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {audioUploading ? (
                    <><Loader size={14} className="animate-spin" /> Transcribing...</>
                  ) : (
                    <><Upload size={14} /> Upload &amp; Transcribe</>
                  )}
                </motion.button>
              </div>
            )}
          </div>
        ) : (
          /* ── Live Text Mode (browser speech) ───────────── */
          <div className="space-y-4">
            <p className="text-sm text-slate-400">
              Use your browser's speech recognition to transcribe a lecture in real time.
              Works best in Chrome or Edge.
            </p>

            <div className="flex items-center gap-3">
              {!isRecording ? (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={startRecording}
                  disabled={!selectedCourse}
                  className="flex items-center gap-2 bg-red-500 text-white text-sm font-semibold px-5 h-10 rounded-xl hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  <Mic size={16} /> Start Recording
                </motion.button>
              ) : (
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={stopRecording}
                  className="flex items-center gap-2 bg-slate-700 text-white text-sm font-semibold px-5 h-10 rounded-xl hover:bg-slate-800 transition-colors"
                >
                  <MicOff size={16} /> Stop Recording
                </motion.button>
              )}
              {isRecording && (
                <span className="flex items-center gap-2 text-red-500 text-sm font-semibold">
                  <span className="w-2.5 h-2.5 bg-red-500 rounded-full animate-pulse" />
                  Recording...
                </span>
              )}
            </div>

            {/* Title input */}
            {transcript && (
              <input
                type="text"
                placeholder="Note title (optional)"
                value={noteTitle}
                onChange={(e) => setNoteTitle(e.target.value)}
                className="w-full h-10 bg-white border border-slate-200 rounded-xl text-sm px-3 outline-none focus:ring-2 focus:ring-accent/15"
              />
            )}

            {/* Live transcript */}
            {transcript && (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 max-h-48 overflow-y-auto">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Live Transcript</p>
                <p className="text-sm text-slate-700 whitespace-pre-wrap">{transcript}</p>
              </div>
            )}

            {/* Save button */}
            {transcript && !isRecording && (
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={saveNote}
                className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-5 h-10 rounded-xl hover:bg-primary/90 transition-colors"
              >
                <CheckCircle size={14} /> Save Transcript
              </motion.button>
            )}
          </div>
        )}
      </div>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-700"
          >
            <AlertCircle size={14} /> {error}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notes list */}
      {loading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl p-6 animate-pulse space-y-3">
              <div className="h-4 bg-slate-200 rounded w-1/3" />
              <div className="h-3 bg-slate-100 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 bg-white border border-slate-200 rounded-xl text-slate-400">
          <BookOpen size={28} className="mb-3 opacity-30" />
          <p className="text-sm">No lecture notes yet. Start recording to create your first note.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {notes.map(note => (
            <motion.div
              key={note.id}
              variants={item}
              initial="hidden"
              animate="show"
              className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-serif text-lg font-bold text-slate-900">{note.title}</h3>
                  <p className="text-xs text-slate-400 mt-1">
                    {note.recorded_at ? new Date(note.recorded_at).toLocaleDateString("en-NG", {
                      weekday: "short", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                    }) : "—"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {!note.structured_notes && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => generateStructured(note.id)}
                      disabled={generatingId === note.id}
                      className="flex items-center gap-1.5 text-sm font-semibold px-3 h-8 rounded-lg bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors disabled:opacity-50"
                    >
                      {generatingId === note.id ? (
                        <><RefreshCw size={13} className="animate-spin" /> Generating...</>
                      ) : (
                        <><Sparkles size={13} /> Generate Notes</>
                      )}
                    </motion.button>
                  )}
                  <button
                    onClick={() => setExpandedId(expandedId === note.id ? null : note.id)}
                    className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
                  >
                    <ChevronDown size={16} className={`text-slate-400 transition-transform ${expandedId === note.id ? "rotate-180" : ""}`} />
                  </button>
                  <button
                    onClick={() => deleteNote(note.id)}
                    className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <AnimatePresence>
                {expandedId === note.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden space-y-3"
                  >
                    {note.raw_transcript && (
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Raw Transcript</p>
                        <p className="text-sm text-slate-600 whitespace-pre-wrap">{note.raw_transcript}</p>
                      </div>
                    )}
                    {note.structured_notes && (
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                        <p className="text-xs font-semibold text-emerald-600 uppercase tracking-wide mb-2">AI-Structured Notes</p>
                        <div
                          className="text-sm text-slate-700 prose prose-sm max-w-none"
                          dangerouslySetInnerHTML={{ __html: note.structured_notes.replace(/\n/g, "<br>").replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>").replace(/^# (.*)/gm, "<h3>$1</h3>").replace(/^## (.*)/gm, "<h4>$1</h4>").replace(/^- (.*)/gm, "<li>$1</li>") }}
                        />
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
