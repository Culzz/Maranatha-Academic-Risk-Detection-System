/**
 * PeerStudyPage — Student Study Hub.
 * 3-zone layout: Header + Hub (sidebar + detail with tabs) + Find Partners.
 */
import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Users, UserPlus, Plus, Send, BookOpen, Loader2,
  MessageSquare, Target, Crown, CheckSquare, Square,
  ChevronRight, Search,
} from "lucide-react";
import CustomDropdown from "../../components/ui/CustomDropdown";
import Button from "../../components/ui/Button";
import Badge from "../../components/ui/Badge";
import { ErrorBanner } from "../../components/ui/Feedback";
import { useAuth } from "../../context/AuthContext";
import { useRealtime } from "../../context/RealtimeContext";
import { studentsApi, peerStudyApi } from "../../services/api";

const MAX_MEMBERS = 6;
const POLL_INTERVAL = 3000;

export default function PeerStudyPage() {
  const { token, user } = useAuth();

  /* ── course selector ────────────────────────────────── */
  const [courses, setCourses] = useState([]);
  const [courseId, setCourseId] = useState("");

  /* ── groups + suggestions ───────────────────────────── */
  const [groups, setGroups] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loading, setLoading] = useState(false);

  /* ── selected group + detail tab ────────────────────── */
  const [activeGroupId, setActiveGroupId] = useState(null);
  const [tab, setTab] = useState("members"); // members | chat | goals

  /* ── group chat ─────────────────────────────────────── */
  const [messages, setMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMsg, setSendingMsg] = useState(false);
  const chatEndRef = useRef(null);

  /* ── group goals ────────────────────────────────────── */
  const [goals, setGoals] = useState([]);
  const [goalInput, setGoalInput] = useState("");
  const [addingGoal, setAddingGoal] = useState(false);

  /* ── create group ───────────────────────────────────── */
  const [showCreate, setShowCreate] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [creating, setCreating] = useState(false);

  /* ── discover modal ─────────────────────────────────── */
  const [showDiscover, setShowDiscover] = useState(false);

  /* ── partners filter ────────────────────────────────── */
  const [riskFilter, setRiskFilter] = useState("All");

  /* ── feedback ───────────────────────────────────────── */
  const [error, setError] = useState("");

  /* ── load courses on mount ─────────────────────────── */
  useEffect(() => {
    studentsApi.getMyCourses(token)
      .then(data => {
        const list = Array.isArray(data) ? data : [];
        setCourses(list);
        if (list.length) setCourseId(String(list[0].course_id ?? list[0].id));
      })
      .catch(() => setCourses([]));
  }, [token]);

  const COURSE_OPTIONS = courses.map(c => ({
    value: String(c.course_id ?? c.id),
    label: `${c.course_code} — ${c.course_title}`,
  }));
  const selectedCourse = courses.find(c => String(c.course_id ?? c.id) === courseId);

  /* ── fetch groups + suggestions when course changes ── */
  useEffect(() => {
    if (!courseId) { setGroups([]); setSuggestions([]); return; }
    setLoading(true);
    setActiveGroupId(null);
    Promise.all([
      peerStudyApi.getGroups(courseId, token).catch(() => []),
      peerStudyApi.getSuggestions(courseId, token).catch(() => []),
    ]).then(([grp, sug]) => {
      setGroups(Array.isArray(grp) ? grp : []);
      setSuggestions(Array.isArray(sug) ? sug : []);
    }).finally(() => setLoading(false));
  }, [courseId, token]);

  const refreshGroups = useCallback(() => {
    if (!courseId) return;
    peerStudyApi.getGroups(courseId, token)
      .then(data => setGroups(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [courseId, token]);

  // Real-time: refetch on peer study events
  const { on } = useRealtime();
  useEffect(() => {
    const u1 = on("group_message", refreshGroups);
    const u2 = on("group_member_joined", refreshGroups);
    const u3 = on("group_goal_completed", refreshGroups);
    return () => { u1(); u2(); u3(); };
  }, [on]);

  /* ── active group data ────────────────────────────── */
  const activeGroup = groups.find(g => g.id === activeGroupId);

  /* ── load chat messages for active group ────────────── */
  const loadMessages = useCallback(() => {
    if (!activeGroupId) return;
    peerStudyApi.getGroupMessages(activeGroupId, token)
      .then(data => setMessages(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [activeGroupId, token]);

  useEffect(() => {
    if (tab === "chat" && activeGroupId) {
      loadMessages();
      const interval = setInterval(loadMessages, POLL_INTERVAL);
      return () => clearInterval(interval);
    }
  }, [tab, activeGroupId, loadMessages]);

  // Auto-scroll chat to bottom on new messages
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ── load goals for active group ────────────────────── */
  const loadGoals = useCallback(() => {
    if (!activeGroupId) return;
    peerStudyApi.getGroupGoals(activeGroupId, token)
      .then(data => setGoals(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, [activeGroupId, token]);

  useEffect(() => {
    if (tab === "goals" && activeGroupId) loadGoals();
  }, [tab, activeGroupId, loadGoals]);

  /* ── handlers ───────────────────────────────────────── */
  const handleCreateGroup = async (e) => {
    e.preventDefault();
    if (!newGroupName.trim() || !courseId) return;
    setCreating(true);
    try {
      const res = await peerStudyApi.createGroup({ name: newGroupName.trim(), course_id: Number(courseId) }, token);
      setNewGroupName("");
      setShowCreate(false);
      refreshGroups();
      if (res?.id) setActiveGroupId(res.id);
    } catch (err) { setError(err.message || "Failed to create group."); }
    finally { setCreating(false); }
  };

  const handleJoin = async (groupId) => {
    try {
      await peerStudyApi.joinGroup(groupId, token);
      refreshGroups();
      setActiveGroupId(groupId);
      setShowDiscover(false);
    } catch (err) { setError(err.message || "Failed to join group."); }
  };

  const handleSendMessage = async () => {
    const text = chatInput.trim();
    if (!text || !activeGroupId) return;
    setSendingMsg(true);
    try {
      await peerStudyApi.sendGroupMessage(activeGroupId, text, token);
      setChatInput("");
      loadMessages();
    } catch (err) { setError(err.message || "Failed to send message."); }
    finally { setSendingMsg(false); }
  };

  const handleAddGoal = async (e) => {
    e.preventDefault();
    const text = goalInput.trim();
    if (!text || !activeGroupId) return;
    setAddingGoal(true);
    try {
      await peerStudyApi.createGroupGoal(activeGroupId, text, token);
      setGoalInput("");
      loadGoals();
    } catch (err) { setError(err.message || "Failed to add goal."); }
    finally { setAddingGoal(false); }
  };

  const handleToggleGoal = async (goalId) => {
    if (!activeGroupId) return;
    try {
      await peerStudyApi.toggleGoal(activeGroupId, goalId, token);
      loadGoals();
    } catch (err) { setError(err.message || "Failed to toggle goal."); }
  };

  const myGroups = groups.filter(g => g.is_member);
  const otherGroups = groups.filter(g => !g.is_member);
  const filteredPartners = riskFilter === "All"
    ? suggestions
    : suggestions.filter(s => s.risk_level === riskFilter);

  // ═══════════════════════════════════════════════════════
  // RENDER
  // ═══════════════════════════════════════════════════════
  return (
    <div className="space-y-6">
      {/* ── ZONE 1: Header ─────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="font-serif text-3xl font-bold text-slate-900 mb-1">Study Hub</h1>
          <p className="text-base text-slate-500">Collaborate with peers in your courses</p>
        </div>
        <CustomDropdown
          value={courseId}
          onChange={setCourseId}
          options={COURSE_OPTIONS}
          placeholder="Select course"
          label="Course"
          className="w-72"
        />
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-900 rounded-xl px-5 py-4 text-white">
          <p className="text-xs text-slate-400 mb-1">My Groups</p>
          <p className="text-2xl font-bold">{myGroups.length}</p>
        </div>
        <div className="bg-slate-900 rounded-xl px-5 py-4 text-white">
          <p className="text-xs text-slate-400 mb-1">Partners Found</p>
          <p className="text-2xl font-bold">{suggestions.length}</p>
        </div>
        <div className="bg-slate-900 rounded-xl px-5 py-4 text-white">
          <p className="text-xs text-slate-400 mb-1">Course</p>
          <p className="text-sm font-semibold truncate">{selectedCourse?.course_code || "—"}</p>
        </div>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError("")} />

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16 gap-3">
          <Loader2 size={20} className="animate-spin text-slate-400" />
          <span className="text-sm text-slate-400">Loading...</span>
        </div>
      )}

      {/* No course selected */}
      {!courseId && !loading && (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <BookOpen size={28} className="mx-auto mb-3 text-slate-300" />
          <p className="text-slate-500">Select a course to see your study groups</p>
        </div>
      )}

      {/* ── ZONE 2: Hub (sidebar + detail) ─────────────── */}
      {courseId && !loading && (
        <div className="flex flex-col lg:flex-row gap-4">
          {/* ─── Sidebar ──────────────────────────────── */}
          <div className="w-full lg:w-72 flex-shrink-0 bg-slate-900 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-700 flex items-center justify-between">
              <p className="text-sm font-bold text-white tracking-tight">My Groups</p>
              <button
                onClick={() => setShowCreate(v => !v)}
                className="text-amber-400 hover:text-amber-300 transition-colors"
                title="New group"
              >
                <Plus size={16} />
              </button>
            </div>

            {/* Create group form */}
            <AnimatePresence>
              {showCreate && (
                <motion.form
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  onSubmit={handleCreateGroup}
                  className="overflow-hidden"
                >
                  <div className="px-4 py-3 border-b border-slate-700">
                    <input
                      name="group_name"
                      type="text"
                      value={newGroupName}
                      onChange={e => setNewGroupName(e.target.value)}
                      placeholder="Group name..."
                      maxLength={60}
                      className="w-full px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg text-sm text-white placeholder-slate-500 outline-none focus:border-amber-400"
                    />
                    <div className="flex gap-2 mt-2">
                      <Button type="submit" size="xs" loading={creating}>Create</Button>
                      <button type="button" onClick={() => setShowCreate(false)} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                    </div>
                  </div>
                </motion.form>
              )}
            </AnimatePresence>

            {/* Group list */}
            <div className="max-h-80 overflow-y-auto">
              {myGroups.length === 0 ? (
                <div className="px-4 py-6 text-center">
                  <p className="text-xs text-slate-500">No groups yet</p>
                  <button
                    onClick={() => setShowCreate(true)}
                    className="text-xs text-amber-400 hover:text-amber-300 mt-1"
                  >
                    + Create one
                  </button>
                </div>
              ) : (
                myGroups.map(g => (
                  <button
                    key={g.id}
                    onClick={() => { setActiveGroupId(g.id); setTab("members"); }}
                    className={`w-full text-left px-4 py-3 border-b border-slate-800 flex items-center gap-3 transition-colors ${
                      activeGroupId === g.id
                        ? "bg-slate-800 border-l-2 border-l-amber-400"
                        : "hover:bg-slate-800/50 border-l-2 border-l-transparent"
                    }`}
                  >
                    <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center text-xs font-bold text-amber-400">
                      {(g.name || "G").charAt(0).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-white truncate">{g.name}</p>
                      <p className="text-[10px] text-slate-500">{g.member_count} member{g.member_count !== 1 ? "s" : ""}</p>
                    </div>
                  </button>
                ))
              )}
            </div>

            {/* Discover section */}
            <div className="px-4 py-3 border-t border-slate-700">
              <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-2">Discover</p>
              <button
                onClick={() => setShowDiscover(true)}
                className="w-full text-left flex items-center justify-between px-3 py-2 bg-slate-800 rounded-lg hover:bg-slate-700 transition-colors"
              >
                <span className="text-xs text-slate-300">
                  <Search size={12} className="inline mr-1.5" />
                  {otherGroups.length} other group{otherGroups.length !== 1 ? "s" : ""}
                </span>
                <ChevronRight size={12} className="text-slate-500" />
              </button>
            </div>
          </div>

          {/* ─── Detail area ─────────────────────────── */}
          <div className="flex-1 min-w-0">
            {!activeGroup ? (
              <div className="bg-white border border-slate-200 rounded-xl p-12 text-center h-full flex flex-col items-center justify-center">
                <Users size={28} className="mx-auto mb-3 text-slate-300" />
                <p className="text-slate-500 text-sm">Select a group from the sidebar to get started</p>
              </div>
            ) : (
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                {/* Group header */}
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50 flex items-start justify-between">
                  <div>
                    <h2 className="font-serif text-lg font-bold text-slate-900">{activeGroup.name}</h2>
                    <p className="text-xs text-slate-500">{activeGroup.member_count} member{activeGroup.member_count !== 1 ? "s" : ""} · {selectedCourse?.course_code}</p>
                  </div>
                  <button
                    onClick={() => {
                      const text = encodeURIComponent(`Join my study group "${activeGroup.name}" for ${selectedCourse?.course_code || "our course"} on Maranatha Risk System!`);
                      window.open(`https://wa.me/?text=${text}`, "_blank", "noopener");
                    }}
                    className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1.5 rounded-lg hover:bg-emerald-100 transition-colors"
                    title="Share group invite on WhatsApp"
                  >
                    <Send size={11} /> WhatsApp
                  </button>
                </div>

                {/* Tabs */}
                <div className="flex border-b border-slate-100">
                  {[
                    { key: "members", label: "Members", icon: Users },
                    { key: "chat", label: "Chat", icon: MessageSquare },
                    { key: "goals", label: "Goals", icon: Target },
                  ].map(t => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`flex-1 flex items-center justify-center gap-2 py-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
                        tab === t.key
                          ? "text-amber-600 border-b-2 border-amber-500 bg-amber-50/30"
                          : "text-slate-400 hover:text-slate-600"
                      }`}
                    >
                      <t.icon size={14} />
                      {t.label}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="min-h-[320px]">
                  {/* ── Members tab ── */}
                  {tab === "members" && (
                    <MembersTab groupId={activeGroupId} token={token} activeGroup={activeGroup} />
                  )}

                  {/* ── Chat tab ── */}
                  {tab === "chat" && (
                    <div className="flex flex-col h-[400px]">
                      <div className="flex-1 overflow-y-auto p-4 space-y-3">
                        {messages.length === 0 ? (
                          <div className="flex flex-col items-center justify-center h-full text-slate-300">
                            <MessageSquare size={24} className="mb-2" />
                            <p className="text-xs">Be the first to say hello</p>
                          </div>
                        ) : (
                          messages.map(m => {
                            const isOwn = m.sender_id === String(user?.user_id || user?.id);
                            return (
                              <div key={m.id} className={`flex ${isOwn ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[75%] rounded-xl px-3.5 py-2.5 ${
                                  isOwn
                                    ? "bg-amber-100 border border-amber-200 text-amber-900"
                                    : "bg-white border border-slate-200 text-slate-800"
                                }`}>
                                  {!isOwn && <p className="text-[10px] font-bold text-slate-500 mb-0.5">{m.sender_name}</p>}
                                  <p className="text-sm leading-relaxed">{m.content}</p>
                                  <p className="text-[9px] text-slate-400 mt-1">
                                    {m.created_at ? new Date(m.created_at).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit", hour12: true }) : ""}
                                  </p>
                                </div>
                              </div>
                            );
                          })
                        )}
                        <div ref={chatEndRef} />
                      </div>
                      {/* Chat input */}
                      <div className="border-t border-slate-100 p-3 flex items-center gap-2">
                        <input
                          type="text"
                          value={chatInput}
                          onChange={e => setChatInput(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
                          placeholder="Type a message..."
                          className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all placeholder-slate-400"
                        />
                        <button
                          onClick={handleSendMessage}
                          disabled={!chatInput.trim() || sendingMsg}
                          className="w-9 h-9 flex items-center justify-center bg-amber-500 hover:bg-amber-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl transition-colors"
                        >
                          <Send size={14} />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── Goals tab ── */}
                  {tab === "goals" && (
                    <div className="p-4">
                      {goals.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-slate-300">
                          <Target size={24} className="mb-2" />
                          <p className="text-xs">Set a shared goal for the group</p>
                        </div>
                      ) : (
                        <div className="space-y-2 mb-4">
                          {goals.map(g => (
                            <button
                              key={g.id}
                              onClick={() => handleToggleGoal(g.id)}
                              className="w-full flex items-start gap-3 px-3.5 py-3 rounded-xl border border-slate-100 hover:bg-slate-50 transition-colors text-left"
                            >
                              {g.is_done
                                ? <CheckSquare size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                                : <Square size={16} className="text-slate-300 flex-shrink-0 mt-0.5" />
                              }
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm ${g.is_done ? "line-through text-slate-400" : "text-slate-800"}`}>
                                  {g.text}
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">Added by {g.created_by_name}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                      {/* Add goal input */}
                      <form onSubmit={handleAddGoal} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={goalInput}
                          onChange={e => setGoalInput(e.target.value)}
                          placeholder="Add a goal..."
                          maxLength={255}
                          className="flex-1 px-3.5 py-2.5 border border-slate-200 rounded-xl text-sm outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition-all placeholder-slate-400"
                        />
                        <Button type="submit" size="xs" loading={addingGoal} disabled={!goalInput.trim()}>
                          Add
                        </Button>
                      </form>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── ZONE 3: Find Partners ──────────────────────── */}
      {courseId && !loading && suggestions.length > 0 && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
                <UserPlus size={14} className="text-amber-400" />
              </div>
              <h2 className="font-serif text-xl font-bold text-slate-900">Find Partners</h2>
            </div>
            {/* Risk filter pills */}
            <div className="flex gap-1.5">
              {["All", "Low", "Medium", "High"].map(f => (
                <button
                  key={f}
                  onClick={() => setRiskFilter(f)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    riskFilter === f
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-4 overflow-x-auto pb-3 -mx-1 px-1">
            {filteredPartners.map((s, i) => (
              <div
                key={`${s.student_id}-${i}`}
                className="min-w-[240px] max-w-[280px] flex-shrink-0 bg-white border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow"
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-9 h-9 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-sm font-bold text-slate-600">
                    {(s.student_name || "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-slate-900 truncate">{s.student_name}</p>
                    <p className="text-[10px] text-slate-400 font-mono">{s.matric_hint}</p>
                  </div>
                </div>
                <div className="mb-2">
                  <Badge variant="risk" level={s.risk_level} />
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed mb-2 line-clamp-2">{s.suggestion_reason}</p>
                {s.matching_topic && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-200 px-2 py-0.5 rounded-full mb-2">
                    <Target size={9} /> {s.matching_topic}
                  </span>
                )}
                {myGroups.length > 0 && (
                  <InviteDropdown
                    groups={myGroups}
                    studentName={s.student_name}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Discover Modal ────────────────────────────── */}
      <AnimatePresence>
        {showDiscover && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
            onClick={() => setShowDiscover(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={e => e.stopPropagation()}
              className="bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[70vh] overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                <h3 className="font-serif text-lg font-bold text-slate-900">Discover Groups</h3>
                <button onClick={() => setShowDiscover(false)} className="text-slate-400 hover:text-slate-600">✕</button>
              </div>
              <div className="p-5 overflow-y-auto max-h-[50vh] space-y-3">
                {otherGroups.length === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-6">No other groups available</p>
                ) : (
                  otherGroups.map(g => (
                    <div key={g.id} className="flex items-center justify-between p-3 border border-slate-100 rounded-xl">
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{g.name}</p>
                        <p className="text-[10px] text-slate-500">{g.member_count}/{MAX_MEMBERS} members</p>
                      </div>
                      {g.member_count < MAX_MEMBERS && (
                        <Button size="xs" variant="outline" icon={<UserPlus size={12} />} onClick={() => handleJoin(g.id)}>
                          Join
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


/* ── Members Tab (separate component to isolate fetching) ── */
function MembersTab({ groupId, token, activeGroup }) {
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkingIn, setCheckingIn] = useState(false);
  const [checkedIn, setCheckedIn] = useState(false);
  const [selfRating, setSelfRating] = useState(0);

  useEffect(() => {
    if (!groupId) return;
    setLoading(true);
    peerStudyApi.getGroups(activeGroup?.course_id, token)
      .then(data => {
        const grp = (Array.isArray(data) ? data : []).find(g => g.id === groupId);
        setMembers(grp ? [{ count: grp.member_count, name: grp.name }] : []);
      })
      .catch(() => setMembers([]))
      .finally(() => setLoading(false));
  }, [groupId, token, activeGroup?.course_id]);

  const handleCheckin = async () => {
    setCheckingIn(true);
    try {
      await peerStudyApi.logOutcome(groupId, { self_rating: selfRating || null }, token);
      setCheckedIn(true);
    } catch {}
    setCheckingIn(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 size={18} className="animate-spin text-slate-300" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center gap-3 px-3.5 py-3 rounded-xl bg-slate-50 border border-slate-100">
        <div className="w-9 h-9 rounded-full bg-slate-900 flex items-center justify-center">
          <Users size={14} className="text-amber-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{activeGroup?.name}</p>
          <p className="text-xs text-slate-500">{activeGroup?.member_count} member{activeGroup?.member_count !== 1 ? "s" : ""} in this group</p>
        </div>
      </div>

      {/* Session check-in */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
        <p className="text-xs font-semibold text-blue-700 mb-2">Session Check-In</p>
        {checkedIn ? (
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <CheckSquare size={14} /> Checked in for this session!
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-blue-600">Rate how productive the session was:</p>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map(n => (
                <button
                  key={n}
                  onClick={() => setSelfRating(n)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-all ${
                    selfRating >= n ? "bg-blue-500 text-white" : "bg-white border border-blue-200 text-blue-400"
                  }`}
                >{n}</button>
              ))}
            </div>
            <button
              onClick={handleCheckin}
              disabled={checkingIn}
              className="flex items-center gap-2 text-xs font-semibold bg-primary text-white px-3 py-2 rounded-lg hover:bg-primary/90 transition-all"
            >
              {checkingIn ? <Loader2 size={12} className="animate-spin" /> : <CheckSquare size={12} />}
              Check In
            </button>
          </div>
        )}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Use the Chat and Goals tabs to collaborate with your group members.
      </p>
    </div>
  );
}


/* ── Invite Dropdown (shows user's groups to invite partner) ── */
function InviteDropdown({ groups, studentName }) {
  const [open, setOpen] = useState(false);

  if (groups.length === 0) return null;
  if (groups.length === 1) {
    return (
      <button className="text-[10px] text-amber-600 hover:text-amber-700 font-semibold">
        Invite to {groups[0].name}
      </button>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className="text-[10px] text-amber-600 hover:text-amber-700 font-semibold"
      >
        Invite to Group ▾
      </button>
      {open && (
        <div className="absolute bottom-full mb-1 left-0 bg-white border border-slate-200 rounded-lg shadow-lg z-10 min-w-[160px]">
          {groups.map(g => (
            <button
              key={g.id}
              onClick={() => setOpen(false)}
              className="block w-full text-left px-3 py-2 text-xs hover:bg-slate-50 text-slate-700"
            >
              {g.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
