import { useState, useEffect, useRef } from "react";

/**
 * Animated number counter using requestAnimationFrame.
 * @param {number} end      — target value
 * @param {number} duration — animation duration in ms (default 800)
 * @param {number} decimals — decimal places to show (default 0)
 * @returns {string} formatted current value
 */
export default function useCountUp(end, duration = 800, decimals = 0) {
  const [value, setValue] = useState(0);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  useEffect(() => {
    if (end === 0 || end == null) {
      setValue(0);
      return;
    }

    const target = Number(end);
    if (isNaN(target)) {
      setValue(0);
      return;
    }

    startRef.current = null;

    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

    const step = (timestamp) => {
      if (!startRef.current) startRef.current = timestamp;
      const elapsed = timestamp - startRef.current;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);

      setValue(easedProgress * target);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [end, duration]);

  return value.toFixed(decimals);
}
