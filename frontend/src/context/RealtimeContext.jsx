/**
 * RealtimeContext — single SSE connection shared by all pages.
 *
 * Provides an `on(eventType, callback)` pub/sub API so any page can
 * subscribe to specific event types and refetch data when they arrive.
 * One SSE connection per user, regardless of how many pages subscribe.
 */
import { createContext, useContext, useEffect, useRef, useCallback, useState } from "react";
import { useAuth } from "./AuthContext";
import { useNotifications } from "./NotificationContext";
import { BASE_URL } from "../services/api";

const RealtimeContext = createContext(null);

const EVENT_LABELS = {
  quiz_published: "New Quiz Published",
  assignment_published: "New Assignment",
  attendance_open: "Attendance Open",
  notification: "Notification",
  risk_changed: "Risk Level Changed",
  sos_received: "SOS Alert",
  lecturer_assigned: "Lecturer Assigned",
  timetable_updated: "Timetable Updated",
  session_activated: "Session Activated",
  message_received: "New Message",
  intervention_created: "New Intervention",
  intervention_updated: "Intervention Updated",
  chat_message: "New Chat Message",
  class_cancelled: "Class Cancelled",
  class_timetable_published: "Class Timetable Published",
  class_timetable_updated: "Class Timetable Updated",
  exam_timetable_published: "Exam Timetable Published",
  calendar_updated: "Calendar Updated",
  result_released: "Result Released",
  material_uploaded: "New Course Material",
  attendance_confirmed: "Attendance Confirmed",
  assignment_marked: "Assignment Graded",
  office_hour_response: "Office Hour Update",
  sos_response: "SOS Response",
  student_struggling: "Student Needs Support",
  group_message: "New Study Group Message",
  group_member_joined: "New Group Member",
  group_goal_completed: "Study Goal Completed",
  knowledge_milestone: "Knowledge Milestone",
  deadline_reminder: "Deadline Reminder",
  class_reminder: "Class Reminder",
  retrain_complete: "Model Retrained",
};

export function RealtimeProvider({ children }) {
  const { token } = useAuth();
  const { push } = useNotifications();
  const listenersRef = useRef({});
  const sourceRef = useRef(null);
  const reconnectRef = useRef(null);
  const stoppedRef = useRef(false);
  const [latestEvent, setLatestEvent] = useState(null);

  // Sound alert via Web Audio API
  const playNotificationSound = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      osc.frequency.setValueAtTime(1047, ctx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 0.3);
    } catch {
      // AudioContext not available
    }
  }, []);

  const emit = useCallback((type, payload) => {
    const event = {
      type,
      title: EVENT_LABELS[type] || type,
      message: payload.message || payload.title || "",
      course_code: payload.course_code || null,
      ...payload,
    };
    setLatestEvent(event);
    push(event);

    // Play sound if not silent
    if (!payload.silent) {
      playNotificationSound();
    }

    // Fire type-specific listeners
    const cbs = listenersRef.current[type];
    if (cbs) cbs.forEach((cb) => cb(payload));

    // Fire wildcard listeners
    const anyCbs = listenersRef.current["*"];
    if (anyCbs) anyCbs.forEach((cb) => cb({ type, ...payload }));
  }, [push, playNotificationSound]);

  const on = useCallback((eventType, callback) => {
    if (!listenersRef.current[eventType]) {
      listenersRef.current[eventType] = new Set();
    }
    listenersRef.current[eventType].add(callback);
    return () => listenersRef.current[eventType]?.delete(callback);
  }, []);

  const connect = useCallback(() => {
    if (!token || stoppedRef.current) return;
    if (sourceRef.current) sourceRef.current.close();

    // Pre-check: skip connecting if token is expired
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      if (payload.exp && payload.exp * 1000 < Date.now()) {
        reconnectRef.current = setTimeout(connect, 3000);
        return;
      }
    } catch { /* proceed anyway */ }

    const url = `${BASE_URL}/events/stream?token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);
    sourceRef.current = es;

    // Generic message listener
    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        emit(d.event_type || "notification", d);
      } catch {
        // Ignore malformed
      }
    };

    // Named event listeners for all known types
    Object.keys(EVENT_LABELS).forEach((type) => {
      es.addEventListener(type, (e) => {
        try {
          emit(type, JSON.parse(e.data));
        } catch {
          // Ignore malformed
        }
      });
    });

    es.onerror = () => {
      es.close();
      sourceRef.current = null;
      // Don't fire a redundant fetch — just reconnect after delay.
      // Token may have been refreshed by api.js in the meantime.
      if (!stoppedRef.current) {
        reconnectRef.current = setTimeout(connect, 5000);
      }
    };
  }, [token, emit]);

  // Reset stopped flag when token changes
  useEffect(() => {
    stoppedRef.current = false;
  }, [token]);

  useEffect(() => {
    connect();
    return () => {
      if (sourceRef.current) sourceRef.current.close();
      if (reconnectRef.current) clearTimeout(reconnectRef.current);
    };
  }, [connect]);

  const clearLatest = useCallback(() => setLatestEvent(null), []);

  return (
    <RealtimeContext.Provider value={{ on, latestEvent, clearLatest }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export const useRealtime = () => useContext(RealtimeContext);
