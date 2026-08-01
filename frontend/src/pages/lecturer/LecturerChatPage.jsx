/**
 * LecturerChatPage -- Refactored with shared chat components.
 *
 * Shared: ChatRoomList, MessageBubble, ChatComposer, ChatHeader
 * Kept  : Cancel Class modal, Create Poll modal, AI Summary,
 *         pinned panel, search panel, typing dots, pagination
 *
 * Real data via chatApi + useChat WebSocket hook.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "../../context/AuthContext";
import { chatApi } from "../../services/api";
import useChat from "../../hooks/useChat";
import { motion, AnimatePresence } from "framer-motion";
import {
  MessageSquare, Search, Pin, X, Check,
  ChevronUp, AlertTriangle, BarChart3,
} from "lucide-react";
import ChatRoomList from "../../components/chat/ChatRoomList";
import MessageBubble from "../../components/chat/MessageBubble";
import ChatComposer from "../../components/chat/ChatComposer";
import ChatHeader from "../../components/chat/ChatHeader";
import VirtualizedMessageList from "../../components/chat/VirtualizedMessageList";

/* ─── Modal shell (re-used for Cancel Class & Create Poll) ──── */
function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            className="relative bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
              <h2 className="text-lg font-bold text-slate-800 dark:text-slate-100">{title}</h2>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                <X size={18} />
              </button>
            </div>
            <div className="p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ─── Time formatter ──────────────────────────────────────────── */
function fmtTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return "now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
  if (diff < 86400000) return d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: true });
  return d.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
}

/* ─── Helpers ─────────────────────────────────────────────────── */
const getMsgId = (m) => String(m.id ?? m.message_id);

/* ================================================================
   MAIN COMPONENT
   ================================================================ */
export default function LecturerChatPage() {
  const { token, user } = useAuth();

  /* ── Room state ──────────────────────────────────────────── */
  const [rooms, setRooms]               = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(true);
  const [activeRoomId, setActiveRoomId] = useState(null);
  const [sidebarOpen, setSidebarOpen]   = useState(false);

  /* ── Message state ───────────────────────────────────────── */
  const [messages, setMessages]           = useState([]);
  const [messagesLoading, setMsgLoading]  = useState(false);
  const [page, setPage]                   = useState(1);
  const [hasMore, setHasMore]             = useState(true);
  const [pinnedMessages, setPinned]       = useState([]);
  const [showPinned, setShowPinned]       = useState(false);

  /* ── Composer state ──────────────────────────────────────── */
  const [replyTo, setReplyTo]       = useState(null);
  const [editingMsg, setEditingMsg] = useState(null);

  /* ── Search state ────────────────────────────────────────── */
  const [searchOpen, setSearchOpen]       = useState(false);
  const [searchQuery, setSearchQuery]     = useState("");
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching]         = useState(false);

  /* ── Cancel Class modal state ────────────────────────────── */
  const [cancelModalOpen, setCancelModal]   = useState(false);
  const [cancelReason, setCancelReason]     = useState("");
  const [cancelLoading, setCancelLoading]   = useState(false);
  const [cancelSuccess, setCancelSuccess]   = useState("");

  /* ── Create Poll modal state ─────────────────────────────── */
  const [pollModalOpen, setPollModal]   = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions]   = useState(["", ""]);
  const [pollLoading, setPollLoading]   = useState(false);

  /* ── AI Summary state ────────────────────────────────────── */
  const [summaryLoading, setSummaryLoading] = useState(false);

  /* ── Refs ─────────────────────────────────────────────────── */
  const scrollRef = useRef(null);
  const [msgListHeight, setMsgListHeight] = useState(500);

  /* ── WebSocket ────────────────────────────────────────────── */
  const {
    connected, typingUsers, onlineCount, incomingEvent,
    clearIncomingEvent, sendTyping, sendReaction, sendRead, sendPollVote,
  } = useChat(activeRoomId);

  /* ── Derived ──────────────────────────────────────────────── */
  const activeRoom = rooms.find((r) => String(r.id ?? r.room_id) === String(activeRoomId));
  const isOwnMsg   = (m) => String(m.sender_id ?? m.user_id) === String(user?.user_id);

  /* ================================================================
     DATA FETCHING
     ================================================================ */

  // Fetch rooms on mount
  useEffect(() => {
    if (!token) return;
    setRoomsLoading(true);
    chatApi.getMyRooms(token)
      .then((data) => {
        const arr = Array.isArray(data) ? data : data?.rooms || [];
        setRooms(arr);
        if (!activeRoomId && arr.length) {
          setActiveRoomId(String(arr[0].id ?? arr[0].room_id));
        }
      })
      .catch(() => {})
      .finally(() => setRoomsLoading(false));
  }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch messages + pinned when room changes
  useEffect(() => {
    if (!activeRoomId || !token) return;
    setMsgLoading(true);
    setMessages([]);
    setPage(1);
    setHasMore(true);
    setShowPinned(false);

    chatApi.getMessages(activeRoomId, 1, token)
      .then((data) => {
        const msgs = Array.isArray(data) ? data : data?.messages || [];
        setMessages(msgs);
        setHasMore(msgs.length >= 50);
        if (msgs.length) {
          const lastId = msgs[msgs.length - 1]?.id ?? msgs[msgs.length - 1]?.message_id;
          if (lastId) chatApi.markRead(activeRoomId, lastId, token).catch(() => {});
        }
      })
      .catch(() => {})
      .finally(() => setMsgLoading(false));

    chatApi.getPinnedMessages(activeRoomId, token)
      .then((data) => setPinned(Array.isArray(data) ? data : data?.messages || []))
      .catch(() => setPinned([]));
  }, [activeRoomId, token]);

  // Load more (pagination)
  const loadMore = useCallback(() => {
    if (!hasMore || messagesLoading || !activeRoomId || !token) return;
    const nextPage = page + 1;
    setMsgLoading(true);
    chatApi.getMessages(activeRoomId, nextPage, token)
      .then((data) => {
        const msgs = Array.isArray(data) ? data : data?.messages || [];
        setMessages((prev) => [...msgs, ...prev]);
        setPage(nextPage);
        setHasMore(msgs.length >= 50);
      })
      .catch(() => {})
      .finally(() => setMsgLoading(false));
  }, [hasMore, messagesLoading, activeRoomId, token, page]);

  // Auto-scroll handled by VirtualizedMessageList
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry.contentRect.height > 0) {
        setMsgListHeight(entry.contentRect.height);
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [activeRoomId]);

  /* ── Render a single chat message (for VirtualizedMessageList) ── */
  const renderMessage = useCallback((msg, idx) => (
    <MessageBubble
      msg={msg}
      isOwn={isOwnMsg(msg)}
      onReply={(m) => setReplyTo(m)}
      onReact={handleReaction}
      onEdit={(m) => setEditingMsg(m)}
      onDelete={handleDelete}
      onPin={handleTogglePin}
      currentUserId={String(user?.user_id)}
      showSender={
        idx === 0 ||
        (msg.sender_id ?? msg.user_id) !== (enrichedMessages[idx - 1]?.sender_id ?? enrichedMessages[idx - 1]?.user_id)
      }
    />
  ), [isOwnMsg, handleReaction, handleDelete, handleTogglePin, user?.user_id, enrichedMessages]);

  /* ── WebSocket incoming events ───────────────────────────── */
  useEffect(() => {
    if (!incomingEvent) return;
    const evt = incomingEvent;

    if (evt.type === "new_message") {
      // Incoming message from another user
      const msgId = String(evt.message?.id ?? evt.message?.message_id ?? evt.id ?? "");
      if (msgId && String(activeRoomId) === String(evt.room_id ?? evt.message?.room_id)) {
        setMessages((prev) => {
          if (prev.some(m => String(m.id ?? m.message_id) === msgId)) return prev;
          return [...prev, evt.message || evt];
        });
        // Mark as read
        sendRead?.();
      }
    } else if (evt.type === "reaction_update") {
      setMessages((prev) =>
        prev.map((m) =>
          String(m.id ?? m.message_id) === String(evt.message_id)
            ? { ...m, reactions: evt.reactions } : m
        )
      );
    } else if (evt.type === "message_edited") {
      setMessages((prev) =>
        prev.map((m) =>
          String(m.id ?? m.message_id) === String(evt.message_id)
            ? { ...m, content: evt.content, is_edited: true } : m
        )
      );
    } else if (evt.type === "message_deleted") {
      setMessages((prev) =>
        prev.filter((m) => String(m.id ?? m.message_id) !== String(evt.message_id))
      );
    } else if (evt.type === "pin_update") {
      chatApi.getPinnedMessages(activeRoomId, token)
        .then((data) => setPinned(Array.isArray(data) ? data : data?.messages || []))
        .catch(() => {});
    } else if (evt.type === "poll_update") {
      setMessages((prev) =>
        prev.map((m) =>
          String(m.id ?? m.message_id) === String(evt.message_id)
            ? { ...m, poll: evt.poll } : m
        )
      );
    }

    clearIncomingEvent();
  }, [incomingEvent, clearIncomingEvent, activeRoomId, token]);

  /* ================================================================
     ACTIONS
     ================================================================ */

  /** Unified send handler called by ChatComposer */
  const handleComposerSend = async ({ content, file, replyToId, editingId }) => {
    try {
      if (editingId) {
        await chatApi.editMessage(editingId, content, token);
        setMessages((prev) =>
          prev.map((m) =>
            String(m.id ?? m.message_id) === String(editingId)
              ? { ...m, content, is_edited: true } : m
          )
        );
      } else if (file) {
        const fd = new FormData();
        fd.append("file", file);
        if (content) fd.append("content", content);
        const newMsg = await chatApi.uploadFile(activeRoomId, fd, token);
        setMessages((prev) => [...prev, { ...newMsg, _status: "sent" }]);
      } else if (content) {
        const tempId = `_temp_${Date.now()}`;
        const optimistic = {
          id: tempId, content, sender_id: user?.user_id || user?.id,
          sender_name: user?.full_name, created_at: new Date().toISOString(), _status: "sending",
        };
        setMessages((prev) => [...prev, optimistic]);
        try {
          const payload = { content };
          if (replyToId) payload.reply_to_id = replyToId;
          const newMsg = await chatApi.sendMessage(activeRoomId, payload, token);
          setMessages((prev) => prev.map(m => m.id === tempId ? { ...newMsg, _status: "sent" } : m));
        } catch {
          setMessages((prev) => prev.map(m => m.id === tempId ? { ...m, _status: "failed" } : m));
        }
      }
    } catch (err) {
      console.error("Send failed:", err);
    }
  };

  /** Reaction via API + WebSocket */
  const handleReaction = async (msgId, emoji) => {
    try {
      await chatApi.reactToMessage(msgId, emoji, token);
      sendReaction(msgId, emoji);
    } catch {}
  };

  /** Pin / unpin toggle */
  const handleTogglePin = async (msgId) => {
    try {
      await chatApi.togglePin(activeRoomId, msgId, token);
      const data = await chatApi.getPinnedMessages(activeRoomId, token);
      setPinned(Array.isArray(data) ? data : data?.messages || []);
    } catch {}
  };

  /** Delete message */
  const handleDelete = async (msgId) => {
    try {
      await chatApi.deleteMessage(msgId, token);
      setMessages((prev) => prev.filter((m) => String(m.id ?? m.message_id) !== String(msgId)));
    } catch {}
  };

  /** Search messages in current room */
  const handleSearch = async () => {
    if (!searchQuery.trim() || !activeRoomId) return;
    setSearching(true);
    try {
      const data = await chatApi.searchMessages(activeRoomId, searchQuery.trim(), token);
      setSearchResults(Array.isArray(data) ? data : data?.messages || []);
    } catch {
      setSearchResults([]);
    }
    setSearching(false);
  };

  /** Cancel Class (lecturer-only) */
  const handleCancelClass = async () => {
    if (!cancelReason.trim() || !activeRoomId) return;
    setCancelLoading(true);
    try {
      const result = await chatApi.cancelClass(activeRoomId, { message: cancelReason.trim() }, token);
      setCancelSuccess(`Class cancelled. ${result?.students_notified ?? ""} students notified.`);
      setCancelReason("");
      const data = await chatApi.getMessages(activeRoomId, 1, token);
      setMessages(Array.isArray(data) ? data : data?.messages || []);
      setTimeout(() => { setCancelModal(false); setCancelSuccess(""); }, 2500);
    } catch (err) {
      setCancelSuccess(`Error: ${err.message}`);
    }
    setCancelLoading(false);
  };

  /** Create Poll (lecturer-only) */
  const handleCreatePoll = async () => {
    if (!pollQuestion.trim() || !activeRoomId) return;
    const validOptions = pollOptions.filter((o) => o.trim());
    if (validOptions.length < 2) return;
    setPollLoading(true);
    try {
      await chatApi.createPoll(activeRoomId, {
        question: pollQuestion.trim(),
        options: validOptions.map((o) => o.trim()),
      }, token);
      setPollModal(false);
      setPollQuestion("");
      setPollOptions(["", ""]);
      const data = await chatApi.getMessages(activeRoomId, 1, token);
      setMessages(Array.isArray(data) ? data : data?.messages || []);
    } catch (err) {
      console.error("Poll creation failed:", err);
    }
    setPollLoading(false);
  };

  /** AI Summary (lecturer-only) */
  const handleAISummary = async () => {
    if (!activeRoomId || summaryLoading) return;
    setSummaryLoading(true);
    try {
      await chatApi.generateSummary(activeRoomId, token);
      const data = await chatApi.getMessages(activeRoomId, 1, token);
      setMessages(Array.isArray(data) ? data : data?.messages || []);
      const pinData = await chatApi.getPinnedMessages(activeRoomId, token);
      setPinned(Array.isArray(pinData) ? pinData : pinData?.messages || []);
    } catch (err) {
      console.error("AI Summary failed:", err);
    }
    setSummaryLoading(false);
  };

  /** Switch active room */
  const switchRoom = (room) => {
    setActiveRoomId(String(room.id ?? room.room_id));
    setSidebarOpen(false);
  };

  /* ── Enrich messages for MessageBubble ────────────────────── */
  const enrichedMessages = messages.map((m) => ({
    ...m,
    id: m.id ?? m.message_id,
    is_pinned: pinnedMessages.some((p) => getMsgId(p) === getMsgId(m)),
    poll_data: m.poll_data || m.poll,
    reply_to_content: m.reply_to_content || m.reply_to?.content,
    reply_to_sender: m.reply_to_sender || m.reply_to?.sender_name,
  }));

  /* ================================================================
     RENDER
     ================================================================ */
  return (
    <div className="space-y-2">
      <div className="flex h-[calc(100vh-5rem)] rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm mx-2 sm:mx-4 my-2 sm:my-4 overflow-hidden bg-white dark:bg-slate-900">
      {/* ── Sidebar (desktop -- hidden below lg) ───────────── */}
      <ChatRoomList
        rooms={rooms}
        activeRoomId={activeRoomId}
        onSelect={switchRoom}
        userName={user?.full_name || ""}
        userRole="lecturer"
        connected={connected}
      />

      {/* ── Sidebar (mobile overlay) ───────────────────────── */}
      {sidebarOpen && (
        <ChatRoomList
          rooms={rooms}
          activeRoomId={activeRoomId}
          onSelect={switchRoom}
          onClose={() => setSidebarOpen(false)}
          isMobile
          userName={user?.full_name || ""}
          userRole="lecturer"
          connected={connected}
        />
      )}

      {/* ── Main chat area ─────────────────────────────────── */}
      {!activeRoomId ? (
        /* No room selected placeholder */
        <div className="flex-1 flex items-center justify-center bg-[var(--chat-bg)]">
          <div className="text-center">
            <div className="w-20 h-20 bg-slate-200 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <MessageSquare size={36} className="text-slate-400" />
            </div>
            <h2 className="text-xl font-bold text-slate-700 dark:text-slate-200 mb-2">Select a Chat Room</h2>
            <p className="text-sm text-slate-500 max-w-sm">
              Choose a room from the sidebar to start communicating with your students
            </p>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-w-0 bg-[var(--chat-bg)]">
          {/* ── Header (shared) ─────────────────────────── */}
          <ChatHeader
            room={activeRoom}
            onlineCount={onlineCount}
            connected={connected}
            onToggleSidebar={() => setSidebarOpen(true)}
            onToggleSearch={() => { setSearchOpen((p) => !p); setSearchResults([]); setSearchQuery(""); }}
            onTogglePin={() => setShowPinned((p) => !p)}
            searchActive={searchOpen}
            pinActive={showPinned}
            pinnedCount={pinnedMessages.length}
            isLecturer
            onAiSummary={handleAISummary}
            onCreatePoll={() => setPollModal(true)}
            onCancelClass={() => setCancelModal(true)}
          />

          {/* ── Search bar (slides open below header) ──── */}
          <AnimatePresence>
            {searchOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 overflow-hidden"
              >
                <div className="flex items-center gap-2 px-4 py-3">
                  <div className="flex-1 relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                      placeholder="Search messages..."
                      className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 transition-all"
                    />
                  </div>
                  <button
                    onClick={handleSearch}
                    disabled={searching}
                    className="px-4 py-2 rounded-xl bg-slate-800 dark:bg-amber-600 text-white text-xs font-semibold hover:bg-slate-700 dark:hover:bg-amber-500 transition-colors disabled:opacity-50"
                  >
                    {searching ? "..." : "Search"}
                  </button>
                </div>

                {searchResults.length > 0 && (
                  <div className="mx-4 mb-3 max-h-40 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">
                    {searchResults.map((m) => (
                      <div key={getMsgId(m)} className="px-3 py-2 hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors cursor-pointer">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{m.sender_name || m.user_name}</span>
                          <span className="text-[10px] text-slate-400">{fmtTime(m.created_at)}</span>
                        </div>
                        <p className="text-xs text-slate-700 dark:text-slate-300 truncate">{m.content}</p>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Pinned messages panel ───────────────────── */}
          <AnimatePresence>
            {showPinned && pinnedMessages.length > 0 && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-amber-50/50 dark:bg-amber-500/5 border-b border-amber-200 dark:border-amber-500/20 overflow-hidden"
              >
                <div className="p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Pin size={13} className="text-amber-500" />
                    <span className="text-xs font-bold text-amber-700 dark:text-amber-400 uppercase tracking-wide">
                      Pinned Messages ({pinnedMessages.length})
                    </span>
                    <button
                      onClick={() => setShowPinned(false)}
                      className="ml-auto p-1 rounded hover:bg-amber-100 dark:hover:bg-amber-500/20 text-amber-500 transition-colors"
                    >
                      <ChevronUp size={14} />
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto">
                    {pinnedMessages.map((pm) => (
                      <div
                        key={getMsgId(pm)}
                        className="bg-white dark:bg-slate-800 rounded-lg px-3 py-2 border border-amber-200/60 dark:border-amber-500/20 text-sm text-slate-700 dark:text-slate-300 flex items-start gap-2"
                      >
                        <Pin size={11} className="text-amber-400 mt-0.5 flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <span className="font-medium text-slate-600 dark:text-slate-400 text-[11px]">
                            {pm.sender_name || pm.user_name}:{" "}
                          </span>
                          <span className="text-xs">{pm.content?.slice(0, 120)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Message feed ────────────────────────────── */}
          <div ref={scrollRef} className="flex-1 px-4 py-3 scroll-smooth">
            {/* Load older messages */}
            {hasMore && (
              <div className="text-center py-2">
                <button
                  onClick={loadMore}
                  disabled={messagesLoading}
                  className="text-xs text-amber-600 hover:text-amber-700 font-medium px-4 py-1.5 rounded-full bg-amber-50 dark:bg-amber-500/10 hover:bg-amber-100 dark:hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                >
                  {messagesLoading ? "Loading..." : "Load older messages"}
                </button>
              </div>
            )}

            {messagesLoading && messages.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                  <p className="text-sm text-slate-400">Loading messages...</p>
                </div>
              </div>
            ) : messages.length === 0 ? (
              <div className="flex items-center justify-center py-20">
                <div className="text-center">
                  <div className="w-16 h-16 bg-slate-100 dark:bg-slate-700 rounded-2xl flex items-center justify-center mx-auto mb-3">
                    <MessageSquare size={28} className="text-slate-300" />
                  </div>
                  <p className="text-sm font-medium text-slate-500">No messages yet</p>
                  <p className="text-xs text-slate-400 mt-1">Start the conversation with your students</p>
                </div>
              </div>
            ) : (
              <VirtualizedMessageList
                messages={enrichedMessages}
                renderMessage={renderMessage}
                height={msgListHeight - 24}
              />
            )}

            {/* Animated typing dots */}
            {typingUsers.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 py-1 px-2"
              >
                <div className="flex gap-0.5">
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-amber-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
                <span className="text-[11px] text-slate-400 italic">
                  {typingUsers.map((u) => u.name).join(", ")}{" "}
                  {typingUsers.length === 1 ? "is" : "are"} typing...
                </span>
              </motion.div>
            )}
          </div>

          {/* ── Composer (shared) ───────────────────────── */}
          <ChatComposer
            onSend={handleComposerSend}
            replyTo={replyTo}
            onCancelReply={() => setReplyTo(null)}
            editingMsg={editingMsg}
            onCancelEdit={() => setEditingMsg(null)}
            onTyping={sendTyping}
            disabled={!activeRoomId}
          />
        </div>
      )}

      {/* ── Cancel Class Modal (lecturer-only) ─────────────── */}
      <Modal
        open={cancelModalOpen}
        onClose={() => { setCancelModal(false); setCancelReason(""); setCancelSuccess(""); }}
        title="Cancel Class"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-xl border border-red-200 dark:border-red-800">
            <AlertTriangle size={20} className="text-red-500 flex-shrink-0" />
            <p className="text-sm text-red-700 dark:text-red-300">
              This will notify all students enrolled in this course that the class has been cancelled.
            </p>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">
              Cancellation Reason
            </label>
            <textarea
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder="e.g. Due to a faculty meeting, today's class is cancelled..."
              rows={3}
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100 dark:focus:ring-red-500/20 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 resize-none transition-all placeholder:text-slate-400"
            />
          </div>

          {cancelSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className={`p-3 rounded-xl text-sm font-medium ${
                cancelSuccess.startsWith("Error")
                  ? "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800"
                  : "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
              }`}
            >
              {!cancelSuccess.startsWith("Error") && <Check size={14} className="inline mr-1.5 -mt-0.5" />}
              {cancelSuccess}
            </motion.div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => { setCancelModal(false); setCancelReason(""); setCancelSuccess(""); }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCancelClass}
              disabled={!cancelReason.trim() || cancelLoading}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {cancelLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <AlertTriangle size={14} />
              Confirm Cancellation
            </button>
          </div>
        </div>
      </Modal>

      {/* ── Create Poll Modal (lecturer-only) ──────────────── */}
      <Modal
        open={pollModalOpen}
        onClose={() => { setPollModal(false); setPollQuestion(""); setPollOptions(["", ""]); }}
        title="Create Poll"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Question</label>
            <input
              type="text"
              value={pollQuestion}
              onChange={(e) => setPollQuestion(e.target.value)}
              placeholder="What would you like to ask?"
              className="w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-1.5">Options</label>
            <div className="space-y-2">
              {pollOptions.map((opt, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {String.fromCharCode(65 + i)}
                  </div>
                  <input
                    type="text"
                    value={opt}
                    onChange={(e) => {
                      const next = [...pollOptions];
                      next[i] = e.target.value;
                      setPollOptions(next);
                    }}
                    placeholder={`Option ${i + 1}`}
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 dark:focus:ring-amber-500/20 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400"
                  />
                  {pollOptions.length > 2 && (
                    <button
                      onClick={() => setPollOptions((prev) => prev.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {pollOptions.length < 6 && (
              <button
                onClick={() => setPollOptions((prev) => [...prev, ""])}
                className="mt-2 text-xs font-semibold text-amber-600 dark:text-amber-400 hover:text-amber-700 px-3 py-1.5 rounded-lg hover:bg-amber-50 dark:hover:bg-amber-500/10 transition-colors"
              >
                + Add Option
              </button>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              onClick={() => { setPollModal(false); setPollQuestion(""); setPollOptions(["", ""]); }}
              className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreatePoll}
              disabled={!pollQuestion.trim() || pollOptions.filter((o) => o.trim()).length < 2 || pollLoading}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {pollLoading && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
              <BarChart3 size={14} />
              Create Poll
            </button>
          </div>
        </div>
      </Modal>
    </div>
    </div>
  );
}
