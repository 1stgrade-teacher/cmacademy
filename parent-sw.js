// parent-sw.js — 🔔 청명 학부모 앱 알림(무료 웹 푸시) 받기
// 서버가 보낸 알림을 휴대폰 알림으로 띄우고, 누르면 학부모 앱의 🔔 알림 탭을 열어요.
self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "청명 학부모", body: e.data ? e.data.text() : "" }; }
  e.waitUntil(self.registration.showNotification(d.title || "청명 학부모", {
    body: d.body || "", icon: d.icon || "/icon-192.png", badge: "/favicon-32.png", tag: d.tag || undefined, renotify: !!d.tag, lang: "ko",
    data: { url: d.url || "/parent.html" },
  }));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/parent.html";
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (list) {
    for (var i = 0; i < list.length; i++) { var c = list[i]; if (/\/parent/.test(c.url) && "focus" in c) { c.postMessage({ cm: "inbox", url: url }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
