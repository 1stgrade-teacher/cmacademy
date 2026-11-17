// admin/nav.js — 선생님 화면 맨 위 공통 이동 줄 (🏠 메인 · TEST 관리 · 점수 입력 · 플러스 · 리포트 인쇄 · 학생 화면)
// 쓰는 법: <script src="/admin/nav.js" data-here="monthly"></script> 를 화면 맨 위(.wrap/.panel 안 첫 줄)에 넣어요.
(function () {
  var me = document.currentScript, here = (me && me.getAttribute("data-here")) || "";
  var css = ".anav{display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin:0 0 10px;font-size:13px}" +
    ".anav a{display:inline-flex;align-items:center;gap:4px;padding:6px 11px;border-radius:999px;background:#fff;border:1px solid #DCE7E7;color:#145A5C;font-weight:700;text-decoration:none;white-space:nowrap}" +
    ".anav a:hover{background:#E6F6F4}.anav a.here{background:#145A5C;border-color:#145A5C;color:#fff}.anav a.home{background:#FFF6E5;border-color:#F3D9A6;color:#7A4B00}" +
    ".anav .sp{flex:1}" +
    "@media(max-width:700px){.anav{flex-wrap:nowrap;overflow-x:auto;-webkit-overflow-scrolling:touch;padding-bottom:4px;scrollbar-width:none}.anav::-webkit-scrollbar{display:none}.anav .sp{display:none}}" +
    "@media print{.anav,.totop{display:none!important}}" +
    ".totop{position:fixed;right:16px;bottom:84px;z-index:20;width:44px;height:44px;border-radius:50%;border:1px solid #DCE7E7;background:#fff;color:#145A5C;font-size:20px;font-weight:800;box-shadow:0 4px 14px rgba(10,60,62,.18);cursor:pointer;display:none;padding:0}" +
    ".totop.on{display:block}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
  var L = [["home", "/", "🏠 메인"], ["monthly", "/admin/monthly.html#list", "🗓 TEST 관리"], ["exam", "/admin/exam.html", "📝 점수 입력"],
    ["plus", "/admin/plus.html#time", "🏫 플러스 수업"], ["print", "/admin/print.html", "🖨️ 리포트 인쇄"], ["sp"], ["student", "/월간고사/index.html", "👀 학생 화면 ↗"]];
  var nav = document.createElement("nav"); nav.className = "anav"; nav.setAttribute("aria-label", "선생님 화면 이동");
  nav.innerHTML = L.map(function (x) {
    if (x[0] === "sp") return '<span class="sp"></span>';
    return '<a href="' + x[1] + '"' + (x[0] === here ? ' class="here" aria-current="page"' : x[0] === "home" ? ' class="home"' : "") + (x[0] === "student" ? ' target="_blank" rel="noopener"' : "") + ">" + x[2] + "</a>";
  }).join("");
  me.parentNode.insertBefore(nav, me);
  // 같은 화면(TEST 관리)에서 「🗓 TEST 관리」를 누르면 시험지 목록으로
  nav.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.here"); if (!a) return;
    if (here === "monthly" && window.cmGoTab) { e.preventDefault(); window.cmGoTab("list"); }
  });
  // ⬆ 맨 위로
  var up = document.createElement("button"); up.className = "totop"; up.type = "button"; up.title = "맨 위로"; up.textContent = "↑";
  up.onclick = function () { window.scrollTo({ top: 0, behavior: "smooth" }); };
  document.addEventListener("DOMContentLoaded", function () { document.body.appendChild(up); });
  window.addEventListener("scroll", function () { up.classList.toggle("on", window.scrollY > 900); }, { passive: true });
})();
