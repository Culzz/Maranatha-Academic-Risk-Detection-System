import { Search, Pin, Users, Menu, X, Sparkles, BarChart3, AlertTriangle, Calendar } from "lucide-react";
import { useState } from "react";

const AVATAR_COLORS = [
  "bg-blue-600","bg-indigo-600","bg-purple-600","bg-pink-600",
  "bg-amber-600","bg-emerald-600","bg-cyan-600","bg-rose-600",
];

function hashColor(str) {
  let h = 0;
  for (let i = 0; i < (str || "").length; i++) h = str.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

export default function ChatHeader({
  room,
  onlineCount = 0,
  connected = false,
  onToggleSidebar,
  onToggleSearch,
  onTogglePin,
  onToggleMembers,
  searchActive = false,
  pinActive = false,
  membersActive = false,
  pinnedCount = 0,
  // Lecturer-only
  isLecturer = false,
  onAiSummary,
  onCreatePoll,
  onCancelClass,
  // Student-only
  onStudyInvite,
}) {
  if (!room) return null;

  const label = room.room_name || room.name || "Chat";
  const roomType = room.room_type === "announcement" ? "Announcement Channel" : "Discussion";

  return (
    <div className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 px-3 sm:px-4 py-3 flex items-center gap-3 flex-shrink-0">
      {/* Mobile menu button */}
      <button
        onClick={onToggleSidebar}
        className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 lg:hidden transition-colors"
      >
        <Menu size={18} />
      </button>

      {/* Room info */}
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${hashColor(label)} text-white text-xs font-bold`}>
        {label.split(/\s+/).map(w => w[0]).join("").slice(0, 2).toUpperCase()}
      </div>

      <div className="flex-1 min-w-0">
        <h2 className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">{label}</h2>
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">{roomType}</span>
          {connected && onlineCount > 0 && (
            <span className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {onlineCount} online
            </span>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex items-center gap-1">
        {/* Lecturer-only actions */}
        {isLecturer && (
          <>
            {onAiSummary && (
              <button onClick={onAiSummary} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 rounded-xl transition-colors">
                <Sparkles size={13} />
                <span className="hidden md:inline">AI Summary</span>
              </button>
            )}
            {onCreatePoll && (
              <button onClick={onCreatePoll} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 rounded-xl transition-colors">
                <BarChart3 size={13} />
                <span className="hidden md:inline">Poll</span>
              </button>
            )}
            {onCancelClass && (
              <button onClick={onCancelClass} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-200 dark:border-red-500/30 rounded-xl transition-colors">
                <AlertTriangle size={13} />
                <span className="hidden lg:inline">Cancel Class</span>
              </button>
            )}
          </>
        )}

        {/* Student study invite */}
        {!isLecturer && onStudyInvite && (
          <button onClick={onStudyInvite} className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 border border-amber-200 dark:border-amber-500/30 rounded-xl transition-colors">
            <Calendar size={13} />
            <span className="hidden md:inline">Study Invite</span>
          </button>
        )}

        {/* Common actions */}
        <button
          onClick={onToggleSearch}
          className={`p-2 rounded-xl transition-colors ${
            searchActive
              ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
              : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
          }`}
        >
          <Search size={16} />
        </button>

        <button
          onClick={onTogglePin}
          className={`p-2 rounded-xl transition-colors relative ${
            pinActive
              ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
              : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
          }`}
        >
          <Pin size={16} />
          {pinnedCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 text-[9px] font-bold text-white rounded-full flex items-center justify-center">
              {pinnedCount}
            </span>
          )}
        </button>

        {onToggleMembers && (
          <button
            onClick={onToggleMembers}
            className={`p-2 rounded-xl transition-colors ${
              membersActive
                ? "bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400"
                : "hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400"
            }`}
          >
            <Users size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
