/**
 * Global screen-reader announcer for dynamic content updates.
 * Uses aria-live="polite" to announce changes without interrupting.
 *
 * Dispatch announcements from anywhere:
 *   window.dispatchEvent(new CustomEvent("sr:announce", { detail: "Risk level updated to High" }));
 */
import { useState, useEffect } from "react";

export default function ScreenReaderAnnouncer() {
  const [message, setMessage] = useState("");

  useEffect(() => {
    const handler = (e) => {
      setMessage("");
      // Force re-render so screen reader re-reads
      requestAnimationFrame(() => setMessage(e.detail));
    };
    window.addEventListener("sr:announce", handler);
    return () => window.removeEventListener("sr:announce", handler);
  }, []);

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      role="status"
      className="sr-only"
    >
      {message}
    </div>
  );
}
