/**
 * DashboardLayout — Shared layout shell for Student, Lecturer, and Admin dashboards.
 * Handles sidebar state, profile picture fetch, topbar, page transitions, footer, and real-time toasts.
 */
import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../../context/AuthContext";
import { api } from "../../services/api";
import Topbar from "./Topbar";
import NotificationPanel from "./NotificationPanel";
import useRealtimeEvents from "../../hooks/useRealtimeEvents";
import usePushSubscription from "../../hooks/usePushSubscription";
import RealtimeToast from "./RealtimeToast";

function scheduleNonCritical(work, delay = 220) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(work, { timeout: 1500 });
    return () => window.cancelIdleCallback(id);
  }
  const timeoutId = window.setTimeout(work, delay);
  return () => window.clearTimeout(timeoutId);
}

export default function DashboardLayout({ sidebar: SidebarComponent, footerText, children }) {
  const { user, token, logout, updateUser } = useAuth();
  usePushSubscription();
  const [sidebarOpen, setSidebar] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return JSON.parse(localStorage.getItem("sidebar_collapsed") ?? "true"); }
    catch { return true; }
  });
  const [notifOpen, setNotifOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("sidebar_collapsed", JSON.stringify(sidebarCollapsed));
  }, [sidebarCollapsed]);

  // Fetch profile picture on mount
  useEffect(() => {
    if (!token || user?.profile_picture_url) return;
    let cancelled = false;
    const cleanup = scheduleNonCritical(() => {
      api.get("/profile/me", { token })
        .then((data) => {
          if (!cancelled && data?.profile_picture_url) {
            updateUser({ profile_picture_url: data.profile_picture_url });
          }
        })
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, [token, user?.profile_picture_url, updateUser]);

  const navigate = useNavigate();
  const location = useLocation();

  const { latestEvent, clearLatest } = useRealtimeEvents();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  const activeUser = user || {};

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 font-sans">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2
                   focus:z-[200] focus:bg-primary focus:text-white focus:px-4 focus:py-2
                   focus:rounded-lg focus:text-sm focus:font-semibold focus:shadow-lg"
      >
        Skip to main content
      </a>

      <SidebarComponent
        user={activeUser}
        isOpen={sidebarOpen}
        onClose={() => setSidebar(false)}
        onLogout={handleLogout}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((v) => !v)}
      />

      <div
        className={[
          "flex-1 flex flex-col overflow-hidden min-w-0 transition-all duration-300",
          sidebarCollapsed ? "lg:pl-16" : "lg:pl-56",
        ].join(" ")}
      >
        <Topbar
          user={activeUser}
          onMenuClick={() => setSidebar((o) => !o)}
          onNotifClick={() => setNotifOpen(true)}
        />

        <main id="main-content" className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 scrollbar-track-slate-50 px-4 py-4 sm:px-6 sm:py-5 lg:px-8 lg:py-6 min-w-0">
          <AnimatePresence mode="wait">
            <motion.div
              key={location.pathname}
              className="max-w-7xl mx-auto"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="h-10 bg-transparent flex items-center justify-center px-6 flex-shrink-0">
          <span className="text-xs text-slate-400 font-medium">{footerText}</span>
        </footer>
      </div>

      {/* NotificationPanel rendered outside all stacking contexts */}
      <NotificationPanel open={notifOpen} onClose={() => setNotifOpen(false)} />
      <RealtimeToast event={latestEvent} onDismiss={clearLatest} />
    </div>
  );
}
