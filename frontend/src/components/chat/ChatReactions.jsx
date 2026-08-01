import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { SmilePlus } from "lucide-react";
import EmojiPicker from "./EmojiPicker";

const QUICK_EMOJIS = ["👍", "❤️", "😂", "🔥", "🧠", "✅"];

export default function ChatReactions({ reactions = {}, onReact, isOwn, messageId }) {
  const [showPicker, setShowPicker] = useState(false);

  const handleReact = (emoji) => {
    onReact?.(messageId, emoji);
    setShowPicker(false);
  };

  // Group reactions by emoji with counts
  const grouped = Object.entries(reactions).reduce((acc, [userId, emoji]) => {
    acc[emoji] = (acc[emoji] || 0) + 1;
    return acc;
  }, {});

  return (
    <div className="relative">
      {/* Existing reactions display */}
      {Object.keys(grouped).length > 0 && (
        <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
          {Object.entries(grouped).map(([emoji, count]) => (
            <button
              key={emoji}
              onClick={() => handleReact(emoji)}
              className="px-2 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full text-xs hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-1 shadow-sm"
            >
              <span>{emoji}</span>
              {count > 1 && <span className="text-slate-500 dark:text-slate-400 text-[10px]">{count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Picker */}
      <AnimatePresence>
        {showPicker && (
          <div className={`absolute bottom-full mb-2 z-50 ${isOwn ? "right-0" : "left-0"}`}>
            <EmojiPicker
              onSelect={handleReact}
              onClose={() => setShowPicker(false)}
            />
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Quick reaction bar shown on message hover
export function QuickReactionBar({ onReact, onReply, onMore, isOwn, messageId }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.1 }}
      className={`absolute -top-1 ${isOwn ? "left-0 -translate-x-[calc(100%+4px)]" : "right-0 translate-x-[calc(100%+4px)]"}
        flex items-center gap-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full shadow-lg px-1.5 py-1 z-20`}
    >
      {QUICK_EMOJIS.map(emoji => (
        <button
          key={emoji}
          onClick={() => onReact?.(messageId, emoji)}
          className="w-8 h-8 flex items-center justify-center text-sm hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors"
        >
          {emoji}
        </button>
      ))}
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-600 mx-0.5" />
      <button
        onClick={() => onReply?.(messageId)}
        className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors hover:text-amber-500"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>
      </button>
      {onMore && (
        <button
          onClick={() => onMore?.(messageId)}
          className="w-8 h-8 flex items-center justify-center text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-full transition-colors hover:text-amber-500"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
        </button>
      )}
    </motion.div>
  );
}
