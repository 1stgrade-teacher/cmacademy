/**
 * book-covers.js
 * ------------------------------------------------------
 * 교재 카드(.book-card)에 표지 이미지를 자동으로 넣어 주는 스크립트.
 *
 * 규칙: 카드 링크가 ./grammar-inside-lv1/index.html 이면
 *       /covers/grammar-inside-lv1.(webp|jpg|png) 파일을 찾아서 카드 맨 위에 표시.
 *       이미지가 없는 카드는 그대로 둡니다. (index.html 을 고칠 필요 없음)
 *
 * 사용법: 목록 페이지(index.html)의 </body> 위에 아래 한 줄 추가
 *   <script src="/book-covers.js" defer></script>
 * ------------------------------------------------------
 */
(function () {
  var EXTS = ["webp", "jpg", "png"];

  function folderOf(href) {
    var parts = (href || "").split("?")[0].split("/").filter(function (x) { return x && x !== "." && x !== ".."; });
    if (parts.length && /^index\.html?$/i.test(parts[parts.length - 1])) parts.pop();
    return parts.length ? parts[parts.length - 1] : "";
  }

  function attach(card) {
    var name = folderOf(card.getAttribute("href"));
    if (!name || card.querySelector(".cover")) return;
    var i = 0;
    (function tryNext() {
      if (i >= EXTS.length) return;
      var url = "/covers/" + encodeURIComponent(name) + "." + EXTS[i++];
      var img = new Image();
      img.onload = function () {
        img.className = "cover";
        img.alt = (card.querySelector(".title") || {}).textContent || name;
        img.loading = "lazy";
        card.insertBefore(img, card.firstChild);
      };
      img.onerror = tryNext;
      img.src = url;
    })();
  }

  function run() {
    Array.prototype.forEach.call(document.querySelectorAll("a.book-card"), attach);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
})();
