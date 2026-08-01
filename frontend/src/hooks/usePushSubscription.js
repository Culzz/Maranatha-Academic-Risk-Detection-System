/**
 * usePushSubscription — registers the browser for Web Push after login.
 *
 * 1. Fetches the VAPID public key from the backend
 * 2. Requests Notification permission
 * 3. Subscribes the service worker to push
 * 4. Sends the subscription to the backend
 */
import { useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";

function scheduleNonCritical(work, delay = 1500) {
  if (typeof window !== "undefined" && typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(work, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const timeoutId = window.setTimeout(work, delay);
  return () => window.clearTimeout(timeoutId);
}

function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

export default function usePushSubscription() {
  const { token } = useAuth();
  const subscribedRef = useRef(false);

  useEffect(() => {
    if (!token || subscribedRef.current) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (typeof Notification !== "undefined" && Notification.permission === "denied") return;

    let cancelled = false;
    let cleanupScheduled = () => {};

    cleanupScheduled = scheduleNonCritical(() => {
      (async () => {
        try {
          const res = await fetch("/api/push/vapid-public-key", {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok || cancelled) return;
          const json = await res.json();
          const publicKey = json?.data?.public_key || json?.public_key;
          if (!publicKey || cancelled) return;

          const registration = await navigator.serviceWorker.ready;
          if (cancelled) return;

          let subscription = await registration.pushManager.getSubscription();
          if (!subscription) {
            if (typeof Notification === "undefined" || Notification.permission !== "granted") {
              return;
            }
            subscription = await registration.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: urlBase64ToUint8Array(publicKey),
            });
          }
          if (cancelled) return;

          const subJson = subscription.toJSON();
          await fetch("/api/push/subscribe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              endpoint: subJson.endpoint,
              keys: subJson.keys,
            }),
          });

          subscribedRef.current = true;
        } catch (err) {
          if (!cancelled) console.warn("Push subscription failed:", err);
        }
      })();
    });

    return () => {
      cancelled = true;
      cleanupScheduled();
    };
  }, [token]);
}
