/**
 * Push notification handler for the service worker.
 * Imported by the Workbox-generated SW via importScripts.
 */

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: "Maranatha University", body: event.data.text() };
  }

  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icons/icon-192x192.png",
    badge: payload.badge || "/icons/icon-72x72.png",
    tag: payload.tag || "maranatha",
    data: { url: payload.url || "/" },
    vibrate: [100, 50, 100],
    actions: [
      { action: "open", title: "Open" },
      { action: "dismiss", title: "Dismiss" },
    ],
  };

  event.waitUntil(
    self.registration.showNotification(payload.title || "Maranatha University", options)
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/";

  if (event.action === "dismiss") return;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow(url);
    })
  );
});

// ── Background Sync — replay queued offline requests when connectivity returns ──
self.addEventListener("sync", (event) => {
  if (event.tag === "offline-queue-replay") {
    event.waitUntil(swReplayQueue());
  }
});

function openQueueDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("maranatha-offline-queue", 1);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onupgradeneeded = (e) => {
      e.target.result.createObjectStore("pending-requests", {
        keyPath: "id",
        autoIncrement: true,
      });
    };
  });
}

async function swReplayQueue() {
  const db = await openQueueDb();
  const items = await new Promise((res, rej) => {
    const tx = db.transaction("pending-requests", "readonly");
    const req = tx.objectStore("pending-requests").getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
  for (const item of items) {
    try {
      await fetch(item.url, {
        method: item.method || "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${item.token}`,
        },
        body: item.method !== "GET" ? JSON.stringify(item.body) : undefined,
      });
      await new Promise((res, rej) => {
        const tx = db.transaction("pending-requests", "readwrite");
        const req = tx.objectStore("pending-requests").delete(item.id);
        req.onsuccess = res;
        req.onerror = rej;
      });
    } catch {
      break; // stop at first failure — retry on next sync event
    }
  }
}
