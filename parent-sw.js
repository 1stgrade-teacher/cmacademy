// parent-sw.js — 🔔 청명 학부모 앱 알림(무료 웹 푸시) 받기
// 서버가 보낸 알림을 휴대폰 '진짜 알림'으로 띄워요: 맨 위 상태 표시줄 🔔 아이콘 · 알림음/진동 · 잠금 화면 · 앱 아이콘 숫자(배지)
// 누르면 학부모 앱의 🔔 알림 탭을 열어요.
var BADGE_CACHE = "cm-parent-badge";
function getCount() { return caches.open(BADGE_CACHE).then(function (c) { return c.match("/n"); }).then(function (r) { return r ? r.text() : "0"; }).then(function (t) { return parseInt(t, 10) || 0; }).catch(function () { return 0; }); }
function setCount(n) { return caches.open(BADGE_CACHE).then(function (c) { return c.put("/n", new Response(String(n))); }).catch(function () {}); }
function showBadge(n) { try { if (self.navigator && self.navigator.setAppBadge) return n > 0 ? self.navigator.setAppBadge(n) : self.navigator.clearAppBadge(); } catch (e) {} return Promise.resolve(); }

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener("push", function (e) {
  var d = {}; try { d = e.data ? e.data.json() : {}; } catch (x) { d = { title: "청명 학부모", body: e.data ? e.data.text() : "" }; }
  var important = d.kind === "과제" || /미참여|미제출/.test(d.title || ""); // 중요한 알림은 확인할 때까지 남겨 둬요
  e.waitUntil(Promise.all([
    self.registration.showNotification(d.title || "청명 학부모", {
      body: d.body || "", icon: d.icon || "/icon-192.png", badge: "/badge-96.png", // badge = 맨 위 상태 표시줄에 뜨는 하얀 🔔 아이콘(안드로이드)
      tag: d.tag || "cm-" + Date.now(), renotify: true, silent: false, vibrate: important ? [300, 120, 300, 120, 300] : [200, 100, 200],
      requireInteraction: important, timestamp: Date.now(), lang: "ko", dir: "ltr",
      data: { url: d.url || "/parent.html" },
    }),
    getCount().then(function (n) { n++; return setCount(n).then(function () { return showBadge(n); }); }), // 앱 아이콘에 안 읽은 숫자
  ]));
});
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = (e.notification.data && e.notification.data.url) || "/parent.html";
  e.waitUntil(Promise.all([setCount(0), showBadge(0)]).then(function () { return self.clients.matchAll({ type: "window", includeUncontrolled: true }); }).then(function (list) {
    for (var i = 0; i < list.length; i++) { var c = list[i]; if (/\/parent/.test(c.url) && "focus" in c) { c.postMessage({ cm: "inbox", url: url }); return c.focus(); } }
    return self.clients.openWindow(url);
  }));
});
// 앱에서 알림함을 보면 숫자 지우기
self.addEventListener("message", function (e) { if (e.data && e.data.cm === "seen") e.waitUntil(Promise.all([setCount(0), showBadge(0)])); });
