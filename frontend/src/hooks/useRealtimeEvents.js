/**
 * useRealtimeEvents — thin wrapper around RealtimeContext.
 *
 * All SSE logic now lives in RealtimeContext (single connection per user).
 * This hook exists for backward compatibility with DashboardLayout's toast.
 */
import { useRealtime } from "../context/RealtimeContext";

export default function useRealtimeEvents() {
  return useRealtime();
}
