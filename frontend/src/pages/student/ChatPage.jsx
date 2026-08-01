/**
 * ChatPage -- Student real-time chat using shared components.
 *
 * Shared components: ChatRoomList, MessageBubble, ChatComposer, ChatHeader,
 *                    TypingDots, StudyInviteCard, PollCard
 * Student-specific : anonymous mode, voice notes, study invites,
 *                    members panel, poll voting, RSVP, SSE events.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { chatApi } from "../../services/api";
import useChat from "../../hooks/useChat";
import { AnimatePresence, motion } from "framer-motion";
import {
  MessageSquare, X, Pin, ChevronUp, Search,
  Calendar, MapPin,
} from "lucide-react";

import ChatRoomList from "../../components/chat/ChatRoomList";
import MessageBubble from "../../components/chat/MessageBubble";
import ChatComposer from "../../components/chat/ChatComposer";
import ChatHeader from "../../components/chat/ChatHeader";
import TypingDots from "../../components/chat/TypingDots";
import StudyInviteCard from "../../components/chat/StudyInviteCard";
import PollCard from "../../components/chat/PollCard";
import VirtualizedMessageList from "../../components/chat/VirtualizedMessageList";
import { fmtTime } from "../../components/chat/chatUtils";

import DatePicker from "../../components/ui/DatePicker";

/* ═══════════════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════════════ */
export default function ChatPage() {
  const { token, user } = useAuth();
  const userId = String(user?.user_id || "");

  /* ── Room state ──────────────────────────────────── */
  const [rooms, setRooms]           = useState([]);
  const [activeRoom, setActiveRoom] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  /* ── Message state ───────────────────────────────── */
  const [messages, setMessages]   = useState([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [page, setPage]           = useState(1);
  const [hasMore, setHasMore]     = useState(true);
  const [sending, setSending]     = useState(false);

  /* ── Reply / Edit ────────────────────────────────── */
  const [replyTo, setReplyTo]       = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);

  /* ── Members panel ───────────────────────────────── */
  const [showMembers, setShowMembers] = useState(false);
  const [members, setMembers]         = useState([]);

  /* ── Pinned messages ─────────────────────────────── */
  const [pinnedMsgs, setPinnedMsgs] = useState([]);
  const [showPinned, setShowPinned] = useState(false);

  /* ── Search ──────────────────────────────────────── */
  const [showSearch, setShowSearch]       = useState(false);
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);

  /* ── Study invite modal ──────────────────────────── */
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteForm, setInviteForm] = useState({ topic: "", venue: "", date: "", time: "" });
  const [inviteSending, setInviteSending] = useState(false);

  /* ── Refs ─────────────────────────────────────────── */
  const msgEndRef  = useRef(null);
  const msgListRef = useRef(null);
  const [msgListHeight, setMsgListHeight] = useState(500);

  /* ── WebSocket ───────────────────────────────────── */
  const {
    connected, typingUsers, onlineCount, incomingEvent,
    clearIncomingEvent, sendTyping, sendReaction, sendRead,
  } = useChat(activeRoom?.id);

  /* ═══════════════════════════════════════════════════
     FETCH ROOMS
     ═══════════════════════════════════════════════════ */
  useEffect(() => {
    if (!token) return;
    chatApi.getMyRooms(token)
      .then((data) => setRooms(Array.isArray(data) ? data : data?.rooms || []))
      .catch(() => setRooms([]));
  }, [token]);

  /* ═══════════════════════════════════════════════════
     FETCH MESSAGES
     ═══════════════════════════════════════════════════ */
  const loadMessages = useCallback(async (roomId, pageNum = 1, append = false) => {
    if (!roomId || !token) return;
    setMsgLoading(true);
    try {
      const data = await chatApi.getMessages(roomId, pageNum, token);
      const raw = Array.isArray(data) ? data : data?.messages || [];
      const sorted = [...raw].sort(
        (a, b) => new Date(a.created_at || a.sent_at) - new Date(b.created_at || b.sent_at)
      );
      if (append) {
        setMessages((prev) => [...sorted, ...prev]);
      } else {
        setMessages(sorted);
      }
      setHasMore(raw.length >= 50);
    } catch {
      if (!append) setMessages([]);
    } finally {
      setMsgLoading(false);
    }
  }, [token]);

  const selectRoom = useCallback((room) => {
    setActiveRoom(room);
    setMessages([]);
    setPage(1);
    setHasMore(true);
    setReplyTo(null);
    setEditingMsg(null);
    setShowSearch(false);
    setShowMembers(false);
    setShowPinned(false);
    loadMessages(room.id, 1);
    chatApi.getPinnedMessages(room.id, token)
      .then((data) => setPinnedMsgs(Array.isArray(data) ? data : data?.messages || []))
      .catch(() => setPinnedMsgs([]));
    if (window.innerWidth < 1024) setSidebarOpen(false);
  }, [loadMessages, token]);

  const loadMore = useCallback(() => {
    if (!activeRoom || msgLoading || !hasMore) return;
    const next = page + 1;
    setPage(next);
    loadMessages(activeRoom.id, next, true);
  }, [activeRoom, msgLoading, hasMore, page, loadMessages]);

  /* ── Auto-scroll ───────────────────────────────── */
  // VirtualizedMessageList handles auto-scroll internally

  /* ── Measure message list container height ────── */
  useEffect(() => {
    const el = msgListRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) {
        setMsgListHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeRoom]);

  /* ── Render a single chat message (for VirtualizedMessageList) ── */
  const renderMessage = useCallback((msg) => {
    if (msg.message_type === "study_invite" && msg.study_invite) {
      return (
        <StudyInviteCard
          invite={msg.study_invite}
          msgId={msg.id}
          senderName={msg.sender_name}
          onRsvp={handleRsvp}
        />
      );
    }
    if (msg.message_type === "poll" && msg.poll_data) {
      return <PollCard msg={msg} onVote={handlePollVote} />;
    }
    return (
      <MessageBubble
        msg={msg}
        isOwn={isOwnMessage(msg)}
        onReply={handleReply}
        onReact={handleReaction}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onPin={handlePin}
        currentUserId={userId}
      />
    );
  }, [userId, handleRsvp, handlePollVote, handleReply, handleReaction, handleEdit, handleDelete, handlePin, isOwnMessage]);

  /* ── Mark read ─────────────────────────────────── */
  useEffect(() => {
    if (!activeRoom || messages.length === 0) return;
    const last = messages[messages.length - 1];
    if (last?.id) {
      sendRead(last.id);
      chatApi.markRead(activeRoom.id, last.id, token).catch(() => {});
    }
  }, [activeRoom, messages, sendRead, token]);

  /* ═══════════════════════════════════════════════════
     HANDLE INCOMING WS EVENTS
     ═══════════════════════════════════════════════════ */
  useEffect(() => {
    if (!incomingEvent) return;
    const ev = incomingEvent;

    // 4B — Handle real-time new messages from other users
    if (ev.type === "new_message" && ev.message) {
      setMessages((prev) => {
        const alreadyExists = prev.some((m) => m.id === ev.message.id);
        if (alreadyExists) return prev;
        return [...prev, ev.message];
      });
      clearIncomingEvent();
      return;
    }

    if (ev.type === "reaction_update" && ev.message_id) {
      setMessages((prev) =>
        prev.map((m) => (m.id === ev.message_id ? { ...m, reactions: ev.reactions || m.reactions } : m)),
      );
    }
    if (ev.type === "message_edited" && ev.message_id) {
      setMessages((prev) =>
        prev.map((m) => (m.id === ev.message_id ? { ...m, content: ev.content, is_edited: true } : m)),
      );
    }
    if (ev.type === "message_deleted" && ev.message_id) {
      setMessages((prev) =>
        prev.map((m) => (m.id === ev.message_id ? { ...m, is_deleted: true } : m)),
      );
    }
    if (ev.type === "pin_update" && activeRoom) {
      chatApi.getPinnedMessages(activeRoom.id, token)
        .then((data) => setPinnedMsgs(Array.isArray(data) ? data : data?.messages || []))
        .catch(() => {});
    }
    if (ev.type === "poll_update" && ev.message_id) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === ev.message_id
            ? { ...m, poll_data: { ...m.poll_data, options: ev.options || m.poll_data?.options } }
            : m,
        ),
      );
    }
    if (ev.type === "rsvp_update" && ev.message_id) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === ev.message_id
            ? { ...m, study_invite: { ...m.study_invite, rsvp_count: ev.rsvp_count ?? m.study_invite?.rsvp_count } }
            : m,
        ),
      );
    }
    clearIncomingEvent();
  }, [incomingEvent, clearIncomingEvent, activeRoom, token]);

  /* 4D — Outside-click to close members panel */
  useEffect(() => {
    if (!showMembers) return;
    const handleOutside = (e) => {
      if (!e.target.closest("[data-members-panel]")) {
        setShowMembers(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, [showMembers]);

  /* ═══════════════════════════════════════════════════
     HANDLERS
     ═══════════════════════════════════════════════════ */
  const handleComposerSend = async ({ content, anonymous, file, replyToId, editingId }) => {
    if (!activeRoom) return;
    setSending(true);
    try {
      if (editingId) {
        await chatApi.editMessage(editingId, content, token);
        setMessages((prev) => prev.map((m) => (m.id === editingId ? { ...m, content, is_edited: true } : m)));
      } else {
        if (file) {
          const fd = new FormData();
          fd.append("file", file);
          const fileMsg = await chatApi.uploadFile(activeRoom.id, fd, token);
          setMessages((prev) => [...prev, { ...fileMsg, _status: "sent" }]);
        }
        if (content) {
          const tempId = `_temp_${Date.now()}`;
          const optimistic = {
            id: tempId, content, sender_id: user?.id, sender_name: user?.full_name,
            created_at: new Date().toISOString(), is_anonymous: anonymous, _status: "sending",
          };
          setMessages((prev) => [...prev, optimistic]);
          try {
            const payload = { content, is_anonymous: anonymous };
            if (replyToId) payload.reply_to_id = replyToId;
            const newMsg = await chatApi.sendMessage(activeRoom.id, payload, token);
            setMessages((prev) => prev.map(m => m.id === tempId ? { ...newMsg, _status: "sent" } : m));
            setRooms((prev) =>
              prev.map((r) =>
                r.id === activeRoom.id ? { ...r, last_message: content, last_message_at: new Date().toISOString() } : r,
              ),
            );
          } catch {
            setMessages((prev) => prev.map(m => m.id === tempId ? { ...m, _status: "failed" } : m));
          }
        }
      }
    } catch {}
    setSending(false);
  };

  const handleReaction = (msgId, emoji) => {
    sendReaction(msgId, emoji);
    chatApi.reactToMessage(msgId, emoji, token).catch(() => {});
  };

  const handlePin = async (msgId) => {
    if (!activeRoom) return;
    try {
      await chatApi.togglePin(activeRoom.id, msgId, token);
      const data = await chatApi.getPinnedMessages(activeRoom.id, token);
      setPinnedMsgs(Array.isArray(data) ? data : data?.messages || []);
    } catch {}
  };

  const handleDelete = async (msgId) => {
    try {
      await chatApi.deleteMessage(msgId, token);
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, is_deleted: true } : m)));
    } catch {}
  };

  const handleEdit = (msg) => { setEditingMsg(msg); setReplyTo(null); };
  const handleReply = (msg) => { setReplyTo(msg); setEditingMsg(null); };

  const handleSearch = async () => {
    if (!searchQuery.trim() || !activeRoom) return;
    setSearching(true);
    try {
      const data = await chatApi.searchMessages(activeRoom.id, searchQuery.trim(), token);
      setSearchResults(Array.isArray(data) ? data : data?.messages || data?.results || []);
    } catch { setSearchResults([]); }
    setSearching(false);
  };

  const toggleMembers = async () => {
    if (showMembers) { setShowMembers(false); return; }
    if (!activeRoom) return;
    try {
      const data = await chatApi.getRoomMembers(activeRoom.id, token);
      setMembers(Array.isArray(data) ? data : data?.members || []);
    } catch { setMembers([]); }
    setShowMembers(true);
  };

  const handleCreateInvite = async (e) => {
    e.preventDefault();
    if (!activeRoom) return;
    setInviteSending(true);
    try {
      const payload = {
        topic: inviteForm.topic,
        venue: inviteForm.venue,
        scheduled_date: inviteForm.date,
        scheduled_time: inviteForm.time,
      };
      const newMsg = await chatApi.createStudyInvite(activeRoom.id, payload, token);
      setMessages((prev) => [...prev, newMsg]);
      setShowInviteModal(false);
      setInviteForm({ topic: "", venue: "", date: "", time: "" });
    } catch {}
    setInviteSending(false);
  };

  const handleRsvp = async (msgId) => {
    try {
      await chatApi.rsvpStudyInvite(msgId, token);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, study_invite: { ...m.study_invite, rsvp_count: (m.study_invite?.rsvp_count || 0) + 1, user_rsvped: true } }
            : m,
        ),
      );
    } catch {}
  };

  const handlePollVote = async (msgId, optionIdx) => {
    try { await chatApi.votePoll(msgId, optionIdx, token); } catch {}
  };

  const isOwnMessage = (msg) => String(msg.sender_id || msg.user_id) === userId;

  /* ═══════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════ */
  return (
    <div className="h-[calc(100vh-5rem)] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mx-2 sm:mx-4 my-2 sm:my-4 overflow-hidden flex">

      {/* ── Room list sidebar (shared component) ──── */}
      <ChatRoomList
        rooms={rooms}
        activeRoomId={activeRoom?.id}
        onSelect={selectRoom}
        onClose={() => setSidebarOpen(false)}
        isMobile={sidebarOpen}
        userName={user?.full_name || user?.name || "Student"}
        userRole="student"
        connected={connected}
      />

      {/* ── Main chat area ─────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 bg-white dark:bg-slate-900">

        {!activeRoom ? (
          /* Empty state */
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-16 h-16 bg-slate-100 dark:bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-5">
              <MessageSquare size={28} className="text-slate-400 dark:text-slate-500" />
            </div>
            <h2 className="font-serif text-2xl font-bold text-slate-900 dark:text-slate-100 mb-2">
              Welcome to Chat
            </h2>
            <p className="text-slate-500 dark:text-slate-400 max-w-sm">
              Select a room from the sidebar to start messaging with your peers and lecturers.
            </p>
            <button
              onClick={() => setSidebarOpen(true)}
              className="mt-4 lg:hidden px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors flex items-center gap-2"
            >
              <MessageSquare size={14} /> Show Rooms
            </button>
          </div>
        ) : (
          <>
            {/* ── Header (shared component) ──────── */}
            <ChatHeader
              room={activeRoom}
              onlineCount={onlineCount}
              connected={connected}
              onToggleSidebar={() => setSidebarOpen(true)}
              onToggleSearch={() => { setShowSearch((v) => !v); setShowMembers(false); }}
              onTogglePin={() => setShowPinned((v) => !v)}
              onToggleMembers={toggleMembers}
              searchActive={showSearch}
              pinActive={showPinned}
              membersActive={showMembers}
              pinnedCount={pinnedMsgs.length}
              onStudyInvite={activeRoom.room_type === "student_group" ? () => setShowInviteModal(true) : undefined}
            />

            {/* ── Pinned messages panel ───────────── */}
            <AnimatePresence>
              {showPinned && pinnedMsgs.length > 0 && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden bg-amber-50 dark:bg-amber-900/20 border-b border-amber-200 dark:border-amber-800"
                >
                  <div className="px-4 py-2.5">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Pin size={13} className="text-amber-600 dark:text-amber-400" />
                        <span className="text-xs font-bold text-amber-800 dark:text-amber-300 uppercase tracking-wide">
                          Pinned ({pinnedMsgs.length})
                        </span>
                      </div>
                      <button
                        onClick={() => setShowPinned(false)}
                        className="p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-800/50 text-amber-500 transition-colors"
                      >
                        <ChevronUp size={14} />
                      </button>
                    </div>
                    <div className="space-y-1.5 max-h-32 overflow-y-auto scrollbar-thin">
                      {pinnedMsgs.map((pm) => (
                        <div key={pm.id} className="text-xs text-amber-900 dark:text-amber-200 bg-amber-100/60 dark:bg-amber-800/30 rounded-lg px-3 py-1.5 truncate">
                          <span className="font-semibold">{pm.sender_name || "Unknown"}:</span> {pm.content}
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Search overlay ──────────────────── */}
            <AnimatePresence>
              {showSearch && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700"
                >
                  <div className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                          type="text"
                          placeholder="Search messages..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                          className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 transition-all"
                        />
                      </div>
                      <button
                        onClick={handleSearch}
                        disabled={searching}
                        className="px-3 py-2 text-sm font-medium bg-amber-500 text-white rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50"
                      >
                        {searching ? "..." : "Search"}
                      </button>
                      <button
                        onClick={() => { setShowSearch(false); setSearchQuery(""); setSearchResults([]); }}
                        className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    </div>
                    {searchResults.length > 0 && (
                      <div className="mt-2 max-h-48 overflow-y-auto space-y-1 scrollbar-thin">
                        {searchResults.map((sr) => (
                          <div key={sr.id} className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-700/50 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer">
                            <span className="font-semibold text-slate-700 dark:text-slate-300">{sr.sender_name || "Unknown"}</span>
                            <span className="text-slate-400 ml-2">{fmtTime(sr.created_at || sr.sent_at)}</span>
                            <p className="text-slate-600 dark:text-slate-400 mt-0.5 line-clamp-2">{sr.content}</p>
                          </div>
                        ))}
                      </div>
                    )}
                    {searchResults.length === 0 && searchQuery && !searching && (
                      <p className="text-xs text-slate-400 mt-2 text-center">No results found.</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ── Messages + Members panel ────────── */}
            <div className="flex-1 flex overflow-hidden">

              {/* Message column */}
              <div className="flex-1 flex flex-col min-w-0">
                <div
                  ref={msgListRef}
                  className="flex-1 px-4 py-4 bg-[var(--chat-bg)]"
                  onClick={() => { if (showMembers) setShowMembers(false); if (showSearch) setShowSearch(false); }}
                >
                  {/* Load more */}
                  {hasMore && messages.length > 0 && (
                    <div className="flex justify-center pb-3">
                      <button
                        onClick={loadMore}
                        disabled={msgLoading}
                        className="text-xs font-medium text-slate-500 hover:text-slate-700 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-4 py-1.5 hover:shadow-sm transition-all disabled:opacity-50"
                      >
                        {msgLoading ? "Loading..." : "Load earlier messages"}
                      </button>
                    </div>
                  )}

                  {/* Virtualized message list */}
                  {messages.length > 0 && (
                    <VirtualizedMessageList
                      messages={messages}
                      renderMessage={renderMessage}
                      height={msgListHeight - 32}
                    />
                  )}

                  {/* Loading spinner */}
                  {msgLoading && messages.length === 0 && (
                    <div className="flex items-center justify-center py-20">
                      <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin" />
                    </div>
                  )}

                  {/* Empty state */}
                  {!msgLoading && messages.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-20 text-center">
                      <MessageSquare size={28} className="text-slate-300 dark:text-slate-600 mb-3" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">No messages yet. Say hello!</p>
                    </div>
                  )}
                </div>

                {/* Typing indicator */}
                <AnimatePresence>
                  {typingUsers.length > 0 && <TypingDots users={typingUsers} />}
                </AnimatePresence>

                {/* Composer (shared component) */}
                <ChatComposer
                  onSend={handleComposerSend}
                  replyTo={replyTo}
                  onCancelReply={() => setReplyTo(null)}
                  editingMsg={editingMsg}
                  onCancelEdit={() => setEditingMsg(null)}
                  onTyping={sendTyping}
                  showAnonymous={activeRoom.room_type === "student_group"}
                  showVoiceNote
                  disabled={sending}
                />
              </div>

              {/* ── Members panel ──────────────────── */}
              <AnimatePresence>
                {showMembers && (
                  <motion.div
                    data-members-panel
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 260, opacity: 1 }}
                    exit={{ width: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden border-l border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0"
                  >
                    <div className="w-[260px] h-full overflow-y-auto">
                      <div className="px-4 py-4 border-b border-slate-100 dark:border-slate-700">
                        <div className="flex items-center justify-between">
                          <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100">Members</h4>
                          <button
                            onClick={() => setShowMembers(false)}
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        <p className="text-xs text-slate-400 mt-0.5">{members.length} members</p>
                      </div>
                      <div className="px-3 py-2 space-y-0.5">
                        {members.map((m, i) => (
                          <div
                            key={m.user_id || m.id || i}
                            className="flex items-center gap-2.5 px-2 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors"
                          >
                            <div className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 flex items-center justify-center text-xs font-bold text-slate-600 dark:text-slate-300 flex-shrink-0">
                              {(m.full_name || m.name || "?").charAt(0).toUpperCase()}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-slate-800 dark:text-slate-200 truncate">
                                {m.full_name || m.name || "Unknown"}
                              </p>
                              <p className="text-[10px] text-slate-400">{m.role || "Student"}</p>
                            </div>
                            {m.is_online && <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />}
                          </div>
                        ))}
                        {members.length === 0 && (
                          <p className="text-xs text-slate-400 text-center py-8">No members found.</p>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </div>

      {/* ── Study invite modal ────────────────────── */}
      <AnimatePresence>
        {showInviteModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
            onClick={() => setShowInviteModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 12 }}
              transition={{ duration: 0.2 }}
              className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 bg-amber-100 dark:bg-amber-500/20 rounded-xl flex items-center justify-center">
                    <Calendar size={16} className="text-amber-600 dark:text-amber-400" />
                  </div>
                  <h3 className="font-serif text-lg font-bold text-slate-900 dark:text-slate-100">
                    Create Study Invite
                  </h3>
                </div>
                <button
                  onClick={() => setShowInviteModal(false)}
                  className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <form onSubmit={handleCreateInvite} className="px-6 py-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Topic</label>
                  <input
                    type="text"
                    value={inviteForm.topic}
                    onChange={(e) => setInviteForm({ ...inviteForm, topic: e.target.value })}
                    placeholder="e.g. Data Structures Revision"
                    required
                    className="w-full px-4 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 focus:border-amber-300 transition-all placeholder-slate-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Venue</label>
                  <div className="relative">
                    <MapPin size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={inviteForm.venue}
                      onChange={(e) => setInviteForm({ ...inviteForm, venue: e.target.value })}
                      placeholder="e.g. Library Room 2B"
                      required
                      className="w-full pl-9 pr-4 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 focus:border-amber-300 transition-all placeholder-slate-400"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <DatePicker
                      label="Date"
                      value={inviteForm.date}
                      onChange={(val) => setInviteForm({ ...inviteForm, date: val })}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">Time</label>
                    <input
                      type="time"
                      value={inviteForm.time}
                      onChange={(e) => setInviteForm({ ...inviteForm, time: e.target.value })}
                      required
                      className="w-full px-4 py-2.5 text-sm border border-slate-200 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 outline-none focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 focus:border-amber-300 transition-all"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setShowInviteModal(false)}
                    className="px-4 py-2.5 text-sm font-medium text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-700 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={inviteSending}
                    className="px-5 py-2.5 text-sm font-semibold text-white bg-amber-500 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center gap-2"
                  >
                    {inviteSending ? (
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Calendar size={14} />
                    )}
                    Send Invite
                  </button>
                </div>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
