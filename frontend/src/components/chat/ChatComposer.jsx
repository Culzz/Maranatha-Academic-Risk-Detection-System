import { useState, useRef, useEffect } from "react";
import { AnimatePresence } from "framer-motion";
import { Smile, Paperclip, Mic, Send, EyeOff, X, FileText } from "lucide-react";
import EmojiPicker from "./EmojiPicker";

export default function ChatComposer({
  onSend,
  onFileUpload,
  replyTo,
  onCancelReply,
  editingMsg,
  onCancelEdit,
  onTyping,
  showAnonymous = false,
  showVoiceNote = false,
  disabled = false,
}) {
  const [text, setText] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [anonymous, setAnonymous] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const audioRef = useRef(null);

  useEffect(() => {
    if (editingMsg) {
      setText(editingMsg.content || "");
      inputRef.current?.focus();
    }
  }, [editingMsg]);

  useEffect(() => {
    if (replyTo) inputRef.current?.focus();
  }, [replyTo]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed && !selectedFile) return;
    onSend?.({
      content: trimmed,
      anonymous,
      file: selectedFile,
      replyToId: replyTo?.id,
      editingId: editingMsg?.id,
    });
    setText("");
    setSelectedFile(null);
    setShowEmoji(false);
    if (editingMsg) onCancelEdit?.();
    if (replyTo) onCancelReply?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleInput = (e) => {
    setText(e.target.value);
    onTyping?.();
    // Auto-resize
    e.target.style.height = "auto";
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      onFileUpload?.(file);
    }
  };

  return (
    <div className="border-t border-slate-200 dark:border-slate-700 bg-[var(--chat-input-bg)] px-3 py-2.5 flex-shrink-0">
      {/* Reply / Edit preview */}
      {(replyTo || editingMsg) && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border-l-2 border-amber-400">
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              {editingMsg ? "Editing message" : `Replying to ${replyTo.sender_name || "message"}`}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {editingMsg?.content || replyTo?.content}
            </p>
          </div>
          <button
            onClick={() => { editingMsg ? onCancelEdit?.() : onCancelReply?.(); }}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Selected file preview */}
      {selectedFile && (
        <div className="flex items-center gap-2 mb-2 px-3 py-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
          <FileText size={14} className="text-amber-500 flex-shrink-0" />
          <span className="text-xs text-slate-600 dark:text-slate-300 truncate flex-1">{selectedFile.name}</span>
          <button onClick={() => setSelectedFile(null)} className="p-1 text-slate-400 hover:text-red-500">
            <X size={12} />
          </button>
        </div>
      )}

      {/* Emoji picker */}
      <AnimatePresence>
        {showEmoji && (
          <div className="mb-2">
            <EmojiPicker
              onSelect={(emoji) => {
                setText(p => p + emoji);
                inputRef.current?.focus();
              }}
              onClose={() => setShowEmoji(false)}
            />
          </div>
        )}
      </AnimatePresence>

      {/* Input row */}
      <div className="flex items-end gap-2">
        {/* Action buttons */}
        <div className="flex items-center gap-0.5 pb-1">
          <button
            onClick={() => setShowEmoji(v => !v)}
            className={`p-2 rounded-full transition-colors ${
              showEmoji ? "bg-amber-100 dark:bg-amber-500/20 text-amber-600 dark:text-amber-400" : "hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
            }`}
          >
            <Smile size={18} />
          </button>

          <button
            onClick={() => fileRef.current?.click()}
            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
          >
            <Paperclip size={18} />
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={handleFileSelect} />

          {showVoiceNote && (
            <>
              <button
                onClick={() => audioRef.current?.click()}
                className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition-colors"
              >
                <Mic size={18} />
              </button>
              <input ref={audioRef} type="file" accept="audio/*" className="hidden" onChange={handleFileSelect} />
            </>
          )}

          {showAnonymous && (
            <button
              onClick={() => setAnonymous(v => !v)}
              className={`p-2 rounded-full transition-colors ${
                anonymous ? "bg-indigo-100 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400" : "hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
              }`}
              title={anonymous ? "Anonymous mode on" : "Send anonymously"}
            >
              <EyeOff size={18} />
            </button>
          )}
        </div>

        {/* Textarea */}
        <textarea
          ref={inputRef}
          value={text}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={anonymous ? "Send anonymously..." : "Type a message..."}
          disabled={disabled}
          rows={1}
          className="flex-1 px-4 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 focus:border-amber-300 dark:focus:border-amber-500/50 resize-none transition-all"
          style={{ minHeight: 42, maxHeight: 120 }}
        />

        {/* Send */}
        <button
          onClick={handleSubmit}
          disabled={disabled || (!text.trim() && !selectedFile)}
          className="p-2.5 bg-amber-500 text-white rounded-full hover:bg-amber-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 shadow-sm mb-0.5"
        >
          <Send size={16} />
        </button>
      </div>

      {/* Anonymous indicator */}
      {anonymous && (
        <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-1 px-1">Sending as anonymous</p>
      )}
    </div>
  );
}
