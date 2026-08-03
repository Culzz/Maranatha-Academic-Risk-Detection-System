/**
 * NotificationContext
 * Global in-app notification state — backed by the real API.
 * Fetches on mount, polls every 30s, syncs markRead / markAllRead with the server.
 */
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { useAuth } from "./AuthContext";
import { api, authApi } from "../services/api";

const NotificationContext = createContext(null);

const POLL_INTERVAL = 60_000;

function scheduleNonCritical(work, delay = 1200) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(work, { timeout: 2000 });
    return () => window.cancelIdleCallback(id);
  }
  const timeoutId = window.setTimeout(work, delay);
  return () => window.clearTimeout(timeoutId);
}

export function NotificationProvider({ children }) {
  const { token } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const pollRef = useRef(null);

  const fetchBootstrap = useCallback(async (tkn, forceRefresh = false) => {
    if (!tkn || tkn.length < 20) return;
    try {
      const data = await authApi.getBootstrap(tkn, { forceRefresh });
      setUnreadCount(Number(data?.unread_notification_count) || 0);
    } catch {
      // silent
    }
  }, []);

  const fetchNotifications = useCallback(async (tkn) => {
    // Guard: JWT tokens are always longer than 20 chars; skip if absent or malformed
    if (!tkn || tkn.length < 20) return;
    try {
      const data = await api.get("/notifications/me", { token: tkn });
      const items = Array.isArray(data) ? data : Array.isArray(data?.items) ? data.items : [];
      setNotifications(items);
      setUnreadCount(items.filter((n) => !n.read).length);
    } catch {
      // silent — keep existing notifications on error
    }
  }, []);

  // Fetch on token change + start polling
  useEffect(() => {
    if (!token) {
      setNotifications([]);
      setUnreadCount(0);
      return;
    }

    let cancelled = false;
    const runFetch = () => {
      if (!cancelled && document.visibilityState === "visible") {
        fetchBootstrap(token, true);
      }
    };

    const cleanupScheduled = scheduleNonCritical(runFetch);
    const resetPolling = () => {
      clearInterval(pollRef.current);
      if (document.visibilityState === "visible") {
        pollRef.current = setInterval(runFetch, POLL_INTERVAL);
      }
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        runFetch();
      }
      resetPolling();
    };

    resetPolling();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      cleanupScheduled();
      clearInterval(pollRef.current);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [token, fetchBootstrap]);

  // Expose a manual refetch for bell icon click
  const refetch = useCallback(() => {
    if (token) {
      fetchNotifications(token);
      fetchBootstrap(token, true);
    }
  }, [token, fetchNotifications, fetchBootstrap]);

  // Mark one notification as read — optimistic update + server sync
  const markRead = useCallback((id) => {
    setNotifications((prev) => {
      let changed = false;
      const next = prev.map((n) => {
        if (n.id === id && !n.read) {
          changed = true;
          return { ...n, read: true };
        }
        return n;
      });
      if (changed) setUnreadCount((c) => Math.max(0, c - 1));
      return next;
    });
    if (token) {
      api.post(`/notifications/${id}/read`, null, { token }).catch(() => {});
    }
  }, [token]);

  // Mark all as read — optimistic update + server sync
  const markAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    setUnreadCount(0);
    if (token) {
      api.post("/notifications/read-all", null, { token }).catch(() => {});
    }
  }, [token]);

  // Push a new notification into local state (for instant in-app feedback)
  const push = useCallback((notification) => {
    setNotifications((prev) => [
      { ...notification, id: Date.now(), read: false, created_at: new Date().toISOString() },
      ...prev,
    ]);
    setUnreadCount((c) => c + 1);
  }, []);

  // Update document title with unread badge
  useEffect(() => {
    const base = "Maranatha Risk System";
    document.title = unreadCount > 0 ? `(${unreadCount}) ${base}` : base;
  }, [unreadCount]);

  // Update app badge (PWA Badging API)
  useEffect(() => {
    if ("setAppBadge" in navigator) {
      if (unreadCount > 0) {
        navigator.setAppBadge(unreadCount).catch(() => {});
      } else {
        navigator.clearAppBadge().catch(() => {});
      }
    }
  }, [unreadCount]);

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, markRead, markAllRead, push, refetch }}>
      {children}
    </NotificationContext.Provider>
  );
}

export function useNotifications() {
  const ctx = useContext(NotificationContext);
  if (!ctx) throw new Error("useNotifications must be inside <NotificationProvider>");
  return ctx;
}
