/**
 * useApi
 * Generic data-fetching hook.
 * Handles loading, error, and data states so pages stay clean.
 * Automatically cancels in-flight requests on unmount via AbortController.
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi(
 *     () => studentsApi.getRiskScores(token),
 *     [token]
 *   );
 */
import { useState, useEffect, useCallback, useRef } from "react";

export function useApi(apiFn, deps = []) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);
  const abortRef = useRef(null);

  const fetch = useCallback(async () => {
    if (!apiFn) return;

    // Cancel any previous in-flight request
    if (abortRef.current) abortRef.current.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setLoading(true);
    setError(null);
    try {
      const result = await apiFn({ signal: controller.signal });
      if (!controller.signal.aborted) setData(result);
    } catch (err) {
      if (err.name === "AbortError" || controller.signal.aborted) return;
      setError(err.message || "Something went wrong.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    fetch();
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, [fetch]);

  return { data, loading, error, refetch: fetch };
}

/**
 * useMutation
 * For POST/PUT/DELETE actions with loading and error handling.
 *
 * Usage:
 *   const { mutate, loading, error } = useMutation(
 *     (code) => studentsApi.submitAttendanceCode(code, courseId, token)
 *   );
 *   await mutate("847291");
 */
export function useMutation(apiFn) {
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState(null);
  const [data,    setData]    = useState(null);

  const mutate = useCallback(async (...args) => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiFn(...args);
      setData(result);
      return result;
    } catch (err) {
      const msg = err.message || "Something went wrong.";
      setError(msg);
      throw err;
    } finally {
      setLoading(false);
    }
  }, [apiFn]);

  return { mutate, loading, error, data };
}
