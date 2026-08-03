import { useState, useEffect } from "react";
import { authApi, sessionsApi } from "../services/api";
import { useAuth } from "../context/AuthContext";

/**
 * Shared hook to fetch /sessions/current/week-info once.
 * Returns { weekInfo, weekInfoLoading }.
 * Used by overview pages to avoid duplicate API calls
 * (SemesterWeekTracker and holiday greeting both need this data).
 */
export default function useWeekInfo() {
  const { token } = useAuth();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    authApi.getBootstrap(token)
      .then((data) => {
        if (data?.current_week_info) {
          setInfo(data.current_week_info);
          return;
        }
        return sessionsApi.getCurrentWeekInfo(token).then(setInfo);
      })
      .catch(() => {
        sessionsApi.getCurrentWeekInfo(token).then(setInfo).catch(() => {});
      })
      .finally(() => setLoading(false));
  }, [token]);

  return { weekInfo: info, weekInfoLoading: loading };
}
