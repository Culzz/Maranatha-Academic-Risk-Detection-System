/**
 * NotificationPanel — Slide-out notification drawer with click-to-navigate.
 */
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  X, AlertTriangle, Bell, ClipboardList, BookOpen, CheckCircle,
  Info, CalendarDays, GraduationCap, Calendar,
} from "lucide-react";
import { useAuth } from "../../context/AuthContext";
import { useNotifications } from "../../context/NotificationContext";
import { timeAgo, notifColors } from "../../utils/helpers";

const TYPE_ICONS = {
  risk: AlertTriangle, intervention: Bell, quiz: ClipboardList,
  assignment: BookOpen, attendance: CheckCircle, system: Info,
  class_timetable_published: CalendarDays, class_timetable_updated: CalendarDays,
  exam_timetable_published: ClipboardList, calendar_updated: Calendar,
  result_released: GraduationCap, result: GraduationCap, timetable: CalendarDays,
  sos: AlertTriangle,
};

// Map notification type → destination route per role
function getNotifRoute(type, role) {
  const base = role === "lecturer" ? "/lecturer" : role === "admin" ? "/admin" : "/student";
  const routes = {
    risk:           role === "student" ? "/student" : `${base}/students`,
    intervention:   role === "student" ? "/student/recovery" : `${base}/interventions`,
    quiz:           `${base}/quizzes`,
    assignment:     `${base}/assignments`,
    attendance:     `${base}/attendance`,
    timetable:      `${base}/timetable`,
    class_timetable_published: `${base}/timetable`,
    class_timetable_updated:   `${base}/timetable`,
    exam_timetable_published:  `${base}/timetable`,
    calendar_updated: `${base}/timetable`,
    result:         "/student/results",
    result_released:"/student/results",
    sos:            role === "admin" ? "/admin/sos" : base,
    system:         null, // stay on current page
  };
  return routes[type] || null;
}

export default function NotificationPanel({ open, onClose }) {
  const { notifications, markRead, markAllRead } = useNotifications();
  const { user } = useAuth();
  const navigate = useNavigate();
  const unreadCount = notifications.filter(n => !n.read).length;

  const handleClick = (notif) => {
    markRead(notif.id);
    const dest = getNotifRoute(notif.type, user?.role);
    if (dest) {
      navigate(dest);
      onClose();
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-[60]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            className="fixed top-0 right-0 h-full w-full max-w-sm bg-white border-l border-slate-200 shadow-xl z-[70] flex flex-col"
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 350 }}
          >
            {/* Header */}
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-serif font-semibold text-primary">
                  Notifications
                </h2>
                {unreadCount > 0 && (
                  <span className="text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                    {unreadCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={markAllRead}
                    className="text-xs font-semibold text-accent hover:text-accent-dark px-3 py-1.5 rounded-lg hover:bg-accent/10 transition-all"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 px-6 text-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-center text-slate-400">
                    <Bell size={20} />
                  </div>
                  <div>
                    <p className="text-base font-semibold text-primary">All caught up</p>
                    <p className="text-sm text-slate-400 mt-1 leading-relaxed max-w-xs">
                      Important updates about your academic progress will appear here.
                    </p>
                  </div>
                </div>
              ) : (
                notifications.map(notif => {
                  const colors = notifColors(notif.type);
                  const Icon = TYPE_ICONS[notif.type] || Info;
                  const hasRoute = !!getNotifRoute(notif.type, user?.role);
                  return (
                    <button
                      key={notif.id}
                      onClick={() => handleClick(notif)}
                      className={[
                        "w-full text-left flex items-start gap-4 px-5 py-4 border-b border-slate-50",
                        "transition-colors hover:bg-slate-50",
                        hasRoute ? "cursor-pointer" : "cursor-default",
                        notif.read ? "opacity-60 hover:opacity-80" : "bg-slate-50/60",
                      ].join(" ")}
                    >
                      {/* Icon */}
                      <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center flex-shrink-0`}>
                        <Icon size={18} className={colors.icon} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <p className="text-sm font-semibold text-primary leading-snug truncate">
                            {notif.title}
                          </p>
                          {!notif.read && (
                            <span className="w-2 h-2 rounded-full bg-accent flex-shrink-0 mt-1" />
                          )}
                        </div>
                        <p className="text-sm text-slate-500 leading-relaxed mb-2 line-clamp-2">
                          {notif.message}
                        </p>
                        <div className="flex items-center gap-2">
                          {notif.course_code && (
                            <span className="text-xs font-mono font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                              {notif.course_code}
                            </span>
                          )}
                          <span className="text-xs text-slate-400">{timeAgo(notif.created_at)}</span>
                        </div>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
