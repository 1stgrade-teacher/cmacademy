// 🔔 상담 예약 알림용 서비스 워커 — 학부모님이 예약·변경·취소하면 서버가 보낸 알림을 화면에 띄워요.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : "" }; }
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "📅 상담 예약", { body: d.body || "", tag: d.tag || undefined, renotify: !!d.tag, icon: "/icon-192.png", badge: "/favicon-32.png", data: { url: d.url || "/admin/consult.html" } }),
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) { list.forEach(function (c) { c.postMessage({ type: "consult-push" }); }); }),
  ]));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || "/admin/consult.html", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) {
      if (list[i].url.indexOf("/admin/consult.html") >= 0 && "focus" in list[i]) { list[i].postMessage({ type: "consult-open", url: url }); return list[i].focus(); }
    }
    return self.clients.openWindow(url);
  }));
});
