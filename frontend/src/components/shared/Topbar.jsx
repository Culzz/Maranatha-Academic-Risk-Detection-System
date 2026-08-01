/**
 * Topbar — Minimal top bar with page title, search icon, notifications, profile avatar.
 * Search opens as a command-palette overlay.
 */
import { useState, useRef, useEffect, useMemo } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Bell, Menu, Search, BarChart3, Users, BookOpen, ClipboardList,
  GraduationCap, MessageSquare, Calendar, Shield, Settings, Activity,
  FileText, Compass, Heart, Brain, CheckSquare, Clock, Megaphone,
  Flame, AlertTriangle, Layers, UserCheck, TrendingUp, ScrollText,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { initials } from "../../utils/helpers";

function pageTitleFromPath(pathname) {
  const segments = pathname.split("/").filter(Boolean);
  const last = segments[segments.length - 1] || "";
  const map = {
    student: "Overview", lecturer: "Overview", admin: "Dashboard",
    engagement: "Engagement", attendance: "Attendance", assignments: "Assignments",
    quizzes: "Quizzes", tutor: "Course Tutor",
    students: "Students & Risk", interventions: "Interventions", materials: "Course Materials",
    users: "User Accounts", "department-risk": "Department Risk",
    enrollments: "Enrollments", audit: "Audit Log",
    sessions: "Academic Sessions", model: "Model Performance", profile: "My Profile",
    todo: "To-Do List", schedule: "My Schedule", recovery: "Recovery Path",
    "peer-study": "Study Groups", pulse: "Student Pulse", broadcast: "Broadcast",
    heatmap: "Engagement Map", settings: "System Settings", efficacy: "Efficacy Report",
    workload: "Staff Workload", sos: "SOS Dashboard", timetable: "Timetable",
    checkin: "Weekly Check-In", chat: "Chat", results: "My Results",
    "office-hours": "Office Hours", roadmap: "My Day", "spaced-rep": "Daily Review",
    "self-study": "Self Study", portfolio: "My Portfolio", insights: "Peer Insights",
    guardian: "Guardian Portal", departments: "Departments", hod: "HOD Dashboard",
    thermometer: "Health Monitor", "cross-course": "Cross-Course Risk",
    effectiveness: "Lecturer Impact", accreditation: "Accreditation",
    patterns: "Semester Patterns",
  };
  return map[last] || "Dashboard";
}

const STUDENT_ROUTES = [
  { name: "Overview",       path: "/student",              icon: BarChart3 },
  { name: "Engagement",     path: "/student/engagement",   icon: Activity },
  { name: "Attendance",     path: "/student/attendance",   icon: CheckSquare },
  { name: "My Day",         path: "/student/roadmap",      icon: Compass },
  { name: "Assignments",    path: "/student/assignments",  icon: ClipboardList },
  { name: "Quizzes",        path: "/student/quizzes",      icon: FileText },
  { name: "Materials",      path: "/student/materials",    icon: BookOpen },
  { name: "Course Tutor",   path: "/student/tutor",        icon: Brain },
  { name: "Schedule",       path: "/student/schedule",     icon: Calendar },
  { name: "Timetable",      path: "/student/timetable",    icon: Clock },
  { name: "Results",        path: "/student/results",      icon: ScrollText },
  { name: "To-Do List",     path: "/student/todo",         icon: CheckSquare },
  { name: "Check-In",       path: "/student/checkin",      icon: Heart },
  { name: "Chat",           path: "/student/chat",         icon: MessageSquare },
  { name: "Profile",        path: "/student/profile",      icon: UserCheck },
];

const LECTURER_ROUTES = [
  { name: "Dashboard",       path: "/lecturer",              icon: BarChart3 },
  { name: "Interventions",   path: "/lecturer/interventions",icon: Shield },
  { name: "Students & Risk", path: "/lecturer/students",     icon: Users },
  { name: "Attendance",      path: "/lecturer/attendance",   icon: CheckSquare },
  { name: "Quizzes",         path: "/lecturer/quizzes",      icon: FileText },
  { name: "Assignments",     path: "/lecturer/assignments",  icon: ClipboardList },
  { name: "Materials",       path: "/lecturer/materials",    icon: BookOpen },
  { name: "Student Pulse",   path: "/lecturer/pulse",        icon: Activity },
  { name: "Broadcast",       path: "/lecturer/broadcast",    icon: Megaphone },
  { name: "Engagement Map",  path: "/lecturer/heatmap",      icon: Flame },
  { name: "Timetable",       path: "/lecturer/timetable",    icon: Clock },
  { name: "Chat",            path: "/lecturer/chat",         icon: MessageSquare },
  { name: "Profile",         path: "/lecturer/profile",      icon: UserCheck },
];

const ADMIN_ROUTES = [
  { name: "Dashboard",       path: "/admin",                icon: BarChart3 },
  { name: "User Accounts",   path: "/admin/users",          icon: Users },
  { name: "Department Risk", path: "/admin/department-risk", icon: AlertTriangle },
  { name: "Enrollments",     path: "/admin/enrollments",    icon: Layers },
  { name: "Audit Log",       path: "/admin/audit",          icon: FileText },
  { name: "Sessions",        path: "/admin/sessions",       icon: Calendar },
  { name: "Model Performance",path: "/admin/model",         icon: TrendingUp },
  { name: "System Settings", path: "/admin/settings",       icon: Settings },
  { name: "Efficacy Report", path: "/admin/efficacy",       icon: Activity },
  { name: "SOS Dashboard",   path: "/admin/sos",            icon: AlertTriangle },
  { name: "Timetable",       path: "/admin/timetable",      icon: Clock },
  { name: "Profile",         path: "/admin/profile",        icon: UserCheck },
];

const ROLE_ROUTES = { student: STUDENT_ROUTES, lecturer: LECTURER_ROUTES, admin: ADMIN_ROUTES };

export default function Topbar({ user, onMenuClick, onNotifClick }) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const { user: authUser } = useAuth();
  const { unreadCount, refetch: refetchNotifications } = useNotifications();
  const location = useLocation();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const activeUser = user || authUser || {};
  const pageName = pageTitleFromPath(location.pathname);
  const routes = ROLE_ROUTES[activeUser.role] || STUDENT_ROUTES;

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return routes;
    const q = searchQuery.toLowerCase();
    return routes.filter((r) => r.name.toLowerCase().includes(q));
  }, [searchQuery, routes]);

  useEffect(() => { setSelectedIdx(0); }, [filtered]);

  // Focus input when search palette opens
  useEffect(() => {
    if (searchOpen) setTimeout(() => inputRef.current?.focus(), 50);
  }, [searchOpen]);

  // Close search on Escape
  useEffect(() => {
    if (!searchOpen) return;
    function handleKey(e) {
      if (e.key === "Escape") setSearchOpen(false);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [searchOpen]);

  const handleNav = (path) => {
    navigate(path);
    setSearchOpen(false);
    setSearchQuery("");
  };

  const handleKeyDown = (e) => {
    if (!searchOpen || filtered.length === 0) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setSelectedIdx((i) => (i + 1) % filtered.length); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setSelectedIdx((i) => (i - 1 + filtered.length) % filtered.length); }
    else if (e.key === "Enter") { e.preventDefault(); handleNav(filtered[selectedIdx].path); }
  };

  return (
    <>
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md h-16 flex items-center justify-between px-4 sm:px-6">
        {/* Left: Hamburger (mobile) + Page title */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="p-2 rounded-xl hover:bg-slate-100 transition-colors lg:hidden"
            aria-label="Open menu"
          >
            <Menu className="w-5 h-5 text-slate-600" />
          </button>

          <h1
            className="text-lg font-sans font-semibold text-primary truncate leading-tight"
            style={{ letterSpacing: "-0.018em" }}
          >
            {pageName}
          </h1>
        </div>

        {/* Right: Search icon + Notification bell + Profile avatar */}
        <div className="flex items-center gap-2.5">
          {/* Search icon */}
          <button
            onClick={() => setSearchOpen(true)}
            className="p-2.5 rounded-xl bg-slate-50/80 hover:bg-slate-100 transition-colors"
            aria-label="Search pages"
          >
            <Search className="w-[18px] h-[18px] text-slate-500" />
          </button>

          {/* Notifications */}
          <button
            onClick={() => {
              refetchNotifications();
              onNotifClick?.();
            }}
            className="relative p-2.5 rounded-xl bg-slate-50/80 hover:bg-slate-100 transition-colors"
            aria-label="Open notifications"
          >
            <Bell className="w-[18px] h-[18px] text-slate-500" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] bg-risk-high text-white text-[10px] rounded-full flex items-center justify-center font-bold px-1">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
          </button>

          {/* Profile avatar (decorative) */}
          <div className="w-9 h-9 rounded-full overflow-hidden flex-shrink-0 ring-2 ring-transparent hover:ring-accent/20 transition-all">
            {activeUser?.profile_picture_url ? (
              <img
                src={activeUser.profile_picture_url}
                alt=""
                className="w-9 h-9 rounded-full object-cover"
              />
            ) : (
              <div className="w-9 h-9 bg-primary rounded-full flex items-center justify-center">
                <span className="text-accent font-bold text-xs">
                  {initials(activeUser?.full_name || "U")}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Search Command Palette ─────────────────────────── */}
      <AnimatePresence>
        {searchOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[55] flex items-start justify-center pt-24"
          >
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
              onClick={() => setSearchOpen(false)}
            />

            {/* Palette */}
            <motion.div
              initial={{ opacity: 0, y: -12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.97 }}
              transition={{ duration: 0.18 }}
              className="relative w-full max-w-md mx-4 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
                <Search className="w-4 h-4 text-slate-400 flex-shrink-0" />
                <input
                  ref={inputRef}
                  type="text"
                  autoComplete="off"
                  placeholder="Search pages..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="flex-1 text-sm text-primary placeholder:text-slate-400 outline-none bg-transparent"
                />
                <kbd className="hidden sm:inline-flex text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded font-mono">
                  ESC
                </kbd>
              </div>

              {/* Results */}
              <div className="max-h-72 overflow-y-auto py-1.5">
                {filtered.length === 0 ? (
                  <div className="px-4 py-6 text-center text-sm text-slate-400">
                    No pages match &ldquo;{searchQuery}&rdquo;
                  </div>
                ) : (
                  filtered.map((route, idx) => {
                    const Icon = route.icon;
                    const isActive = location.pathname === route.path;
                    return (
                      <button
                        key={route.path}
                        onClick={() => handleNav(route.path)}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className={[
                          "w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors text-left",
                          idx === selectedIdx
                            ? "bg-slate-50 text-primary"
                            : "text-slate-600 hover:bg-slate-50",
                          isActive ? "font-semibold" : "",
                        ].join(" ")}
                      >
                        <Icon
                          className={`w-4 h-4 flex-shrink-0 ${
                            idx === selectedIdx ? "text-accent" : "text-slate-400"
                          }`}
                        />
                        <span className="flex-1 truncate">{route.name}</span>
                        {isActive && (
                          <span className="text-[10px] font-medium text-accent bg-accent/10 px-1.5 py-0.5 rounded">
                            Current
                          </span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
