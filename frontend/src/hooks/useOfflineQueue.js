/**
 * useOfflineQueue — Queues failed POST/PATCH/DELETE requests when offline
 * and replays them automatically when the browser comes back online.
 *
 * Uses IndexedDB via a simple wrapper for persistence across sessions.
 * Compatible with the PWA service worker — this handles application-level
 * retries while the service worker handles cache-level retries.
 */
import { useState, useEffect, useCallback, useRef } from "react";

const DB_NAME = "maranatha-offline-queue";
const STORE_NAME = "pending-requests";
const DB_VERSION = 1;

/* ── IndexedDB helpers ─────────────────────────────────── */

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function addToQueue(entry) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).add({ ...entry, queuedAt: Date.now() });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getAllQueued() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function removeFromQueue(id) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearQueue() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/* ── Hook ──────────────────────────────────────────────── */

export default function useOfflineQueue() {
  const [queueSize, setQueueSize] = useState(0);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);

  const refreshCount = useCallback(async () => {
    try {
      const items = await getAllQueued();
      setQueueSize(items.length);
    } catch {
      setQueueSize(0);
    }
  }, []);

  /** Queue a failed request for later replay. */
  const enqueue = useCallback(async (url, method, body, token) => {
    await addToQueue({ url, method, body, token });
    await refreshCount();
    // Register Background Sync so the SW can replay even if the tab is closed
    if ("serviceWorker" in navigator && "SyncManager" in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.sync.register("offline-queue-replay"))
        .catch(() => {}); // graceful degradation — online-event replay still works
    }
  }, [refreshCount]);

  /** Replay all queued requests. Called automatically on reconnect. */
  const replayAll = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setSyncing(true);

    try {
      const items = await getAllQueued();
      for (const item of items) {
        try {
          const headers = { "Content-Type": "application/json" };
          if (item.token) headers["Authorization"] = `Bearer ${item.token}`;

          await fetch(item.url, {
            method: item.method || "POST",
            headers,
            body: item.body ? JSON.stringify(item.body) : undefined,
          });
          await removeFromQueue(item.id);
        } catch {
          // Still offline or request failed — leave in queue
          break;
        }
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
      await refreshCount();
    }
  }, [refreshCount]);

  // Listen for online event to auto-replay
  useEffect(() => {
    refreshCount();

    const handleOnline = () => {
      replayAll();
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [refreshCount, replayAll]);

  return { queueSize, syncing, enqueue, replayAll, clearQueue };
}
