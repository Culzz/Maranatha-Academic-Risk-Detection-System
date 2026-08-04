/**
 * useSessionTimer
 * Tracks how long the student is actively using the platform.
 * Pings the backend every 5 minutes with accumulated active time.
 * This produces the "Study Time" proxy metric for the ML model.
 */
import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { BASE_URL } from "../services/api";

const PING_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function useSessionTimer() {
  const { token, isAuthenticated } = useAuth();
  const startRef  = useRef(Date.now());
  const timerRef  = useRef(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    startRef.current = Date.now();

    const ping = async () => {
      const minutes = Math.round((Date.now() - startRef.current) / 60000);
      if (minutes < 1) return;
      try {
        await fetch(`${BASE_URL}/sessions/ping`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ active_minutes: minutes }),
        });
        startRef.current = Date.now(); // reset after each ping
      } catch {
        // Silent — session ping failure must never break the UI
      }
    };

    timerRef.current = setInterval(ping, PING_INTERVAL_MS);

    // Also ping on tab close / navigation away
    const handleUnload = () => ping();
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      clearInterval(timerRef.current);
      window.removeEventListener("beforeunload", handleUnload);
      ping(); // final ping on unmount
    };
  }, [isAuthenticated, token]);
}
