import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Pin, FileText, Download } from "lucide-react";
import { QuickReactionBar } from "./ChatReactions";
import { formatTime } from "../../utils/helpers";

const AVATAR_COLORS = [
  "bg-blue-600","bg-indigo-600","bg-purple-600","bg-pink-600",
  "bg-amber-600","bg-emerald-600","bg-cyan-600","bg-rose-600",
];

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function initials(name) {
  return (name || "?").split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function MessageBubble({
  msg,
  isOwn,
  onReply,
  onReact,
  onEdit,
  onDelete,
  onPin,
  currentUserId,
  showSender = true,
}) {
  const [selected, setSelected] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const wrapperRef = useRef(null);

  // Outside-click dismiss: close toolbar + context when clicking elsewhere
  useEffect(() => {
    if (!selected && !showContext) return;
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setSelected(false);
        setShowContext(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("touchstart", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("touchstart", handleClickOutside);
    };
  }, [selected, showContext]);

  // System / special messages
  if (msg.message_type === "system" || msg.message_type === "join" || msg.message_type === "leave") {
    return (
      <div className="flex justify-center py-1">
        <span className="text-[11px] text-slate-400 dark:text-slate-500 bg-slate-100 dark:bg-slate-800 rounded-full px-4 py-1.5 font-medium">
          {msg.content}
        </span>
      </div>
    );
  }

  if (msg.message_type === "ai_summary") {
    return (
      <div className="flex justify-center py-2">
        <div className="border-2 border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/30 rounded-xl px-5 py-4 max-w-md">
          <p className="text-xs font-semibold text-purple-600 dark:text-purple-400 mb-1.5 flex items-center gap-1.5">
            <span>*</span> AI Summary
          </p>
          <p className="text-sm text-purple-800 dark:text-purple-200 leading-relaxed whitespace-pre-wrap">{msg.content}</p>
        </div>
      </div>
    );
  }

  if (msg.message_type === "cancellation") {
    return (
      <div className="flex justify-center py-2">
        <div className="bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-xl px-5 py-4 max-w-md text-center">
          <p className="text-xs font-semibold text-red-600 dark:text-red-400 mb-1">Class Cancelled</p>
          <p className="text-sm text-red-700 dark:text-red-300">{msg.content}</p>
        </div>
      </div>
    );
  }

  if (msg.is_deleted) {
    return (
      <div className={`flex ${isOwn ? "justify-end" : "justify-start"} py-0.5`}>
        <div className="bg-slate-100 dark:bg-slate-800 rounded-2xl px-4 py-2.5 max-w-[65%]">
          <p className="text-sm text-slate-400 italic">This message was deleted</p>
        </div>
      </div>
    );
  }

  const senderName = msg.anonymous_alias || msg.sender_name || "User";
  const reactions = msg.reactions || {};
  const reactionGroups = {};
  Object.entries(reactions).forEach(([uid, emoji]) => {
    reactionGroups[emoji] = (reactionGroups[emoji] || 0) + 1;
  });

  const handleBubbleClick = (e) => {
    // Don't toggle if user clicked on a link, button, or reaction
    if (e.target.closest("a") || e.target.closest("button")) return;
    setSelected(prev => !prev);
    setShowContext(false);
  };

  const handleContextMenu = (e) => {
    e.preventDefault();
    setSelected(true);
    setShowContext(true);
  };

  return (
    <div
      ref={wrapperRef}
      className={`flex ${isOwn ? "justify-end" : "justify-start"} py-0.5 relative ${
        selected ? "z-10" : ""
      }`}
    >
      <div className={`flex gap-2.5 max-w-[70%] ${isOwn ? "flex-row-reverse" : ""}`}>
        {/* Avatar */}
        {!isOwn && showSender && (
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0 mt-1 ${hashColor(senderName)}`}>
            {initials(senderName)}
          </div>
        )}
        {!isOwn && !showSender && <div className="w-8 flex-shrink-0" />}

        <div className="min-w-0">
          {/* Sender name */}
          {!isOwn && showSender && (
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5 px-1">
              {senderName}
            </p>
          )}

          {/* Reply preview */}
          {msg.reply_to_content && (
            <div className="mb-1 px-3 py-1.5 rounded-lg text-xs border-l-2 border-amber-400 bg-slate-50 dark:bg-slate-700/50 text-slate-500 dark:text-slate-400 truncate">
              {msg.reply_to_sender && <span className="font-semibold text-amber-600 dark:text-amber-400">{msg.reply_to_sender}: </span>}
              {msg.reply_to_content}
            </div>
          )}

          {/* Bubble — click to select, right-click for context */}
          <div
            onClick={handleBubbleClick}
            onContextMenu={handleContextMenu}
            className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed break-words shadow-sm relative cursor-pointer transition-all duration-150 ${
              isOwn
                ? "bg-[var(--chat-own)] text-slate-900 dark:text-slate-100 rounded-tr-md"
                : "bg-[var(--chat-other)] dark:bg-[var(--chat-other)] text-slate-800 dark:text-slate-200 border border-slate-100 dark:border-slate-700 rounded-tl-md"
            } ${msg.is_pinned ? "ring-2 ring-amber-300/50 dark:ring-amber-500/30" : ""}
            ${selected ? "ring-2 ring-slate-300 dark:ring-slate-500" : ""}`}
          >
            {msg.is_pinned && (
              <Pin size={10} className="absolute -top-1 -right-1 text-amber-500 rotate-45" />
            )}

            {/* File attachment */}
            {msg.file_url && (
              <a
                href={msg.file_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 mb-1.5 px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 hover:border-amber-300 transition-colors text-xs"
              >
                <FileText size={14} className="text-amber-500 flex-shrink-0" />
                <span className="truncate flex-1 text-slate-600 dark:text-slate-300">{msg.file_name || "File"}</span>
                <Download size={12} className="text-slate-400 flex-shrink-0" />
              </a>
            )}

            {/* Poll */}
            {msg.message_type === "poll" && msg.poll_data && (
              <div className="space-y-2">
                <p className="font-semibold text-sm">{msg.poll_data.question}</p>
                {msg.poll_data.options?.map((opt, i) => {
                  const totalVotes = msg.poll_data.options.reduce((s, o) => s + (o.votes || 0), 0);
                  const pct = totalVotes > 0 ? Math.round((opt.votes || 0) / totalVotes * 100) : 0;
                  return (
                    <button
                      key={i}
                      className="w-full text-left px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 hover:border-amber-300 transition-colors relative overflow-hidden"
                    >
                      <div className="absolute inset-0 bg-amber-100 dark:bg-amber-500/20 rounded-lg" style={{ width: `${pct}%` }} />
                      <div className="relative flex items-center justify-between">
                        <span className="text-xs font-medium">{opt.text}</span>
                        <span className="text-[10px] text-slate-500">{pct}%</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Message text */}
            {msg.message_type !== "poll" && (
              <span className="whitespace-pre-wrap">{msg.content}</span>
            )}

            {/* Timestamp, edited, & delivery status */}
            <div className={`flex items-center gap-1.5 mt-1 ${isOwn ? "justify-end" : ""}`}>
              <span className="text-[10px] text-slate-400 dark:text-slate-500">{formatTime(msg.created_at || msg.timestamp)}</span>
              {msg.is_edited && <span className="text-[9px] text-slate-400 dark:text-slate-500 italic">edited</span>}
              {isOwn && msg._status === "sending" && <span className="text-[10px] text-slate-400" title="Sending">⏳</span>}
              {isOwn && msg._status === "failed" && <span className="text-[10px] text-red-400" title="Failed to send">⚠</span>}
              {isOwn && (!msg._status || msg._status === "sent") && <span className="text-[10px] text-slate-400" title="Sent">✓</span>}
            </div>
          </div>

          {/* Reactions */}
          {Object.keys(reactionGroups).length > 0 && (
            <div className={`flex flex-wrap gap-1 mt-1 ${isOwn ? "justify-end" : ""}`}>
              {Object.entries(reactionGroups).map(([emoji, count]) => (
                <button
                  key={emoji}
                  onClick={() => onReact?.(msg.id, emoji)}
                  className="px-2 py-0.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-full text-xs hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors flex items-center gap-1 shadow-sm"
                >
                  <span>{emoji}</span>
                  {count > 1 && <span className="text-slate-500 dark:text-slate-400 text-[10px]">{count}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Quick reaction toolbar — only shown when user CLICKS a message */}
      <AnimatePresence>
        {selected && !showContext && (
          <QuickReactionBar
            messageId={msg.id}
            isOwn={isOwn}
            onReact={(id, emoji) => { onReact?.(id, emoji); setSelected(false); }}
            onReply={() => { onReply?.(msg); setSelected(false); }}
            onMore={() => setShowContext(true)}
          />
        )}
      </AnimatePresence>

      {/* Context menu */}
      <AnimatePresence>
        {showContext && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`absolute top-full mt-1 ${isOwn ? "right-0" : "left-10"} bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl py-1 z-30 min-w-[140px]`}
          >
            <button onClick={() => { onReply?.(msg); setShowContext(false); setSelected(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">Reply</button>
            {msg.is_pinned
              ? <button onClick={() => { onPin?.(msg.id, false); setShowContext(false); setSelected(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">Unpin</button>
              : <button onClick={() => { onPin?.(msg.id, true); setShowContext(false); setSelected(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">Pin</button>
            }
            {isOwn && (
              <>
                <button onClick={() => { onEdit?.(msg); setShowContext(false); setSelected(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300">Edit</button>
                <div className="mx-2 my-1 border-t border-slate-100 dark:border-slate-700" />
                <button onClick={() => { onDelete?.(msg.id); setShowContext(false); setSelected(false); }} className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400">Delete</button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
