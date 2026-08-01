import { useState, useEffect, useCallback } from "react";

/**
 * Tracks browser network state: online/offline, connection type, and slow detection.
 * Uses Navigator.connection API where available (Chromium browsers).
 *
 * @returns {{ isOnline: boolean, connectionType: string|null, isSlow: boolean, downlink: number|null }}
 */
export default function useNetworkStatus() {
  const getConnection = () => navigator.connection || navigator.mozConnection || navigator.webkitConnection;

  const [state, setState] = useState(() => {
    const conn = getConnection();
    return {
      isOnline: navigator.onLine,
      connectionType: conn?.effectiveType ?? null,
      downlink: conn?.downlink ?? null,
      isSlow: conn ? conn.effectiveType === "slow-2g" || conn.effectiveType === "2g" : false,
    };
  });

  const updateConnection = useCallback(() => {
    const conn = getConnection();
    setState({
      isOnline: navigator.onLine,
      connectionType: conn?.effectiveType ?? null,
      downlink: conn?.downlink ?? null,
      isSlow: conn ? conn.effectiveType === "slow-2g" || conn.effectiveType === "2g" : false,
    });
  }, []);

  const goOnline = useCallback(() => setState((s) => ({ ...s, isOnline: true })), []);
  const goOffline = useCallback(() => setState((s) => ({ ...s, isOnline: false })), []);

  useEffect(() => {
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);

    const conn = getConnection();
    if (conn) conn.addEventListener("change", updateConnection);

    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
      if (conn) conn.removeEventListener("change", updateConnection);
    };
  }, [goOnline, goOffline, updateConnection]);

  return state;
}
