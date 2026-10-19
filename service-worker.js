// Bump SHELL_CACHE only if you change the precache list; page updates arrive on their own
// because same-origin files are fetched network-first.
const SHELL_CACHE = "ty-shell-v4";
// The Firebase SDK URLs carry their version number, so cached copies never go stale.
const SDK_CACHE = "ty-sdk-v1";
const SHELL_FILES = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon.svg",
  "./icon-192.png",
  "./icon-512.png",
  "./icon-maskable-512.png",
  "./apple-touch-icon.png"
];
const NETWORK_TIMEOUT_MS = 4000;

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then(cache => Promise.allSettled(SHELL_FILES.map(file => cache.add(file))))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(key => key !== SHELL_CACHE && key !== SDK_CACHE).map(key => caches.delete(key)))
    ).then(() => self.clients.claim())
  );
});

function fetchWithTimeout(request, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    fetch(request).then(
      response => { clearTimeout(timer); resolve(response); },
      error => { clearTimeout(timer); reject(error); }
    );
  });
}

async function networkFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetchWithTimeout(request, NETWORK_TIMEOUT_MS);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    const cached = await cache.match(request, { ignoreSearch: true });
    if (cached) return cached;
    if (request.mode === "navigate") {
      const shell = (await cache.match("./index.html")) || (await cache.match("./"));
      if (shell) return shell;
    }
    return Response.error();
  }
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin === location.origin) {
    event.respondWith(networkFirst(request));
  } else if (url.hostname === "www.gstatic.com" && url.pathname.startsWith("/firebasejs/")) {
    event.respondWith(cacheFirst(request, SDK_CACHE));
  }
  // Firestore, Auth and Storage traffic is left to the browser.
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(windows => {
      for (const client of windows) if ("focus" in client) return client.focus();
      return self.clients.openWindow("./");
    })
  );
});
