import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Search, Users, X, Volume2,
  PanelLeftClose, PanelLeftOpen, GraduationCap, BookOpen,
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────
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

/** Derive a short hub label from room data */
function hubLabel(room) {
  const code = room.course_code || "";
  if (room.room_type === "student_group") return `StudentHub ${code}`.trim();
  if (room.room_type === "lecturer_channel") return `ClassHub ${code}`.trim();
  return room.name || room.room_name || "Room";
}

// ── room list item ───────────────────────────────────────
function RoomItem({ room, isActive, onSelect, collapsed }) {
  const label = hubLabel(room);
  const unread = room.unread_count || 0;

  if (collapsed) {
    return (
      <button
        onClick={() => onSelect(room)}
        title={label}
        className={`w-10 h-10 mx-auto my-0.5 rounded-xl flex items-center justify-center text-xs font-bold transition-all duration-150 relative ${
          isActive
            ? "bg-slate-900 text-white shadow-sm"
            : "hover:bg-slate-100 text-slate-600"
        }`}
      >
        {room.room_type === "lecturer_channel"
          ? <BookOpen size={16} />
          : initials(room.course_code || label)
        }
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-red-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
    );
  }

  return (
    <button
      onClick={() => onSelect(room)}
      className={`w-full text-left px-3 py-2.5 rounded-xl mb-0.5 transition-all duration-150 flex items-center gap-3 ${
        isActive
          ? "bg-slate-900 text-white"
          : "hover:bg-slate-50 text-slate-700"
      }`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 text-xs font-bold ${
        isActive ? "bg-white text-slate-900" : `${hashColor(room.course_code || label)} text-white`
      }`}>
        {room.room_type === "lecturer_channel"
          ? <BookOpen size={14} />
          : initials(room.course_code || label)
        }
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className={`text-sm font-semibold truncate ${
            isActive ? "text-white" : "text-slate-800"
          }`}>{label}</span>
          {unread > 0 && (
            <span className="bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[18px] h-[18px] flex items-center justify-center px-1 flex-shrink-0">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </div>
        {room.last_message_preview && (
          <p className={`text-[11px] truncate mt-0.5 ${isActive ? "text-slate-300" : "text-slate-400"}`}>
            {room.last_message_preview}
          </p>
        )}
      </div>
    </button>
  );
}

// ── section header ───────────────────────────────────────
function SectionHeader({ icon: Icon, label, count, collapsed }) {
  if (collapsed) return null;
  return (
    <div className="flex items-center gap-1.5 px-3 py-2">
      <Icon size={11} className="text-slate-400" />
      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex-1">{label}</p>
      {count > 0 && <span className="text-[10px] text-slate-300 font-mono">{count}</span>}
    </div>
  );
}

// ══════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════
export default function ChatRoomList({
  rooms = [],
  activeRoomId,
  onSelect,
  onClose,
  isMobile = false,
  userName = "",
  userRole = "student",
  connected = false,
}) {
  const [search, setSearch] = useState("");
  const [collapsed, setCollapsed] = useState(false);

  const filtered = rooms.filter(r =>
    (r.room_name || r.name || r.course_code || "").toLowerCase().includes(search.toLowerCase())
  );

  // Separate by type
  const classHubs = filtered.filter(r => r.room_type === "lecturer_channel");
  const studentHubs = filtered.filter(r => r.room_type === "student_group");
  const otherRooms = filtered.filter(r => r.room_type !== "lecturer_channel" && r.room_type !== "student_group");

  const sidebarContent = (
    <div className={`flex flex-col h-full bg-white border-r border-slate-200 transition-all duration-200 ${
      collapsed ? "w-16" : "w-80"
    }`}>
      {/* Header */}
      <div className={`border-b border-slate-100 ${collapsed ? "px-2 py-3" : "px-4 pt-4 pb-3"}`}>
        {collapsed ? (
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setCollapsed(false)}
              className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center hover:bg-slate-800 transition-colors"
            >
              <PanelLeftOpen size={16} className="text-white" />
            </button>
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
                  <MessageSquare size={16} className="text-white" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900 tracking-tight">Course Chat</p>
                  <p className="text-[10px] text-slate-400 font-medium capitalize">{userRole} Portal</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCollapsed(true)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                  title="Collapse sidebar"
                >
                  <PanelLeftClose size={15} />
                </button>
                {isMobile && (
                  <button
                    onClick={onClose}
                    className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors"
                  >
                    <X size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-1.5 mb-3">
              <div className={`w-1.5 h-1.5 rounded-full ${connected ? "bg-emerald-400" : "bg-red-400"}`} />
              <span className="text-[10px] text-slate-400">{connected ? "Connected" : "Reconnecting..."}</span>
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search rooms..."
                className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 placeholder:text-slate-400 focus:outline-none focus:border-slate-400 focus:ring-1 focus:ring-slate-200"
              />
            </div>
          </>
        )}
      </div>

      {/* Rooms list */}
      <div className="flex-1 overflow-y-auto py-2 px-1.5 scrollbar-thin">
        {/* ClassHub rooms (lecturer + students) */}
        {classHubs.length > 0 && (
          <div className="mb-2">
            <SectionHeader icon={BookOpen} label="ClassHub" count={classHubs.length} collapsed={collapsed} />
            {classHubs.map(room => (
              <RoomItem key={room.id} room={room} isActive={room.id === activeRoomId} onSelect={onSelect} collapsed={collapsed} />
            ))}
          </div>
        )}

        {/* StudentHub rooms (students only) */}
        {studentHubs.length > 0 && (
          <div className="mb-2">
            <SectionHeader icon={GraduationCap} label="StudentHub" count={studentHubs.length} collapsed={collapsed} />
            {studentHubs.map(room => (
              <RoomItem key={room.id} room={room} isActive={room.id === activeRoomId} onSelect={onSelect} collapsed={collapsed} />
            ))}
          </div>
        )}

        {/* Other rooms */}
        {otherRooms.length > 0 && (
          <div>
            <SectionHeader icon={Volume2} label="Channels" count={otherRooms.length} collapsed={collapsed} />
            {otherRooms.map(room => (
              <RoomItem key={room.id} room={room} isActive={room.id === activeRoomId} onSelect={onSelect} collapsed={collapsed} />
            ))}
          </div>
        )}

        {filtered.length === 0 && !collapsed && (
          <p className="text-xs text-slate-400 text-center py-8">
            {search ? "No rooms match your search" : "No rooms yet"}
          </p>
        )}
      </div>

      {/* Footer — user info */}
      <div className={`border-t border-slate-100 ${collapsed ? "p-2" : "p-3"}`}>
        {collapsed ? (
          <div className={`w-10 h-10 mx-auto rounded-full flex items-center justify-center text-xs font-bold text-white ${hashColor(userName)}`}>
            {initials(userName)}
          </div>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${hashColor(userName)}`}>
              {initials(userName)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-slate-800 truncate">{userName}</p>
              <p className="text-[10px] text-slate-400 capitalize">{userRole}</p>
            </div>
            <div className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
          </div>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-30"
        >
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
          <motion.aside
            initial={{ x: -300 }}
            animate={{ x: 0 }}
            exit={{ x: -300 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="relative w-80 h-full shadow-xl z-10"
          >
            {sidebarContent}
          </motion.aside>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <aside className="hidden lg:flex flex-shrink-0">
      {sidebarContent}
    </aside>
  );
}
