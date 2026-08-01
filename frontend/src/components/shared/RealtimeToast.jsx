import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Bell, BookOpen, ClipboardList, AlertTriangle,
  CheckCircle, MessageSquare, UserCheck,
} from "lucide-react";

const EVENT_ICONS = {
  quiz_published: ClipboardList, assignment_published: BookOpen,
  attendance_open: CheckCircle, notification: Bell,
  risk_changed: AlertTriangle, sos_received: AlertTriangle,
  message_received: MessageSquare, intervention_created: Bell,
  lecturer_assigned: UserCheck,
};

const EVENT_COLORS = {
  quiz_published: "bg-blue-500", assignment_published: "bg-emerald-500",
  attendance_open: "bg-amber-500", notification: "bg-slate-600",
  risk_changed: "bg-risk-high", sos_received: "bg-risk-high",
  message_received: "bg-indigo-500", intervention_created: "bg-purple-500",
  lecturer_assigned: "bg-primary",
};

export default function RealtimeToast({ event, onDismiss }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (event) {
      setVisible(true);
      const timer = setTimeout(() => {
        setVisible(false);
        setTimeout(onDismiss, 350);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [event, onDismiss]);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onDismiss, 350);
  };

  const Icon = EVENT_ICONS[event?.type] || Bell;
  const colorClass = EVENT_COLORS[event?.type] || "bg-slate-600";

  return (
    <AnimatePresence>
      {visible && event && (
        <motion.div
          initial={{ x: 80, opacity: 0 }}
          animate={{ x: 0,  opacity: 1 }}
          exit={{   x: 80, opacity: 0 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className={[
            "fixed bottom-6 right-6 z-50 flex items-start gap-3",
            "max-w-[calc(100vw-3rem)] sm:max-w-sm w-full",
            "bg-white border border-slate-200 rounded-xl shadow-lg px-4 py-3",
          ].join(" ")}
        >
          <div className={`flex-shrink-0 w-9 h-9 rounded-lg ${colorClass} flex items-center justify-center`}>
            <Icon className="w-4 h-4 text-white" />
          </div>

          <div className="flex-1 min-w-0 py-0.5">
            <p className="text-sm font-semibold text-primary truncate">{event.title}</p>
            {event.message && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{event.message}</p>
            )}
          </div>

          <button
            onClick={handleClose}
            className="flex-shrink-0 p-1 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
