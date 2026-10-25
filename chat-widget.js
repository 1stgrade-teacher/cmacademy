/**
 * chat-widget.js — 강의 페이지용 "AI 조교에게 질문하기"
 * ------------------------------------------------------
 * 강의 HTML의 </body> 바로 위에 아래 한 줄만 있으면 동작합니다.
 *   <script src="/chat-widget.js" defer></script>
 * 학생이 지금 보고 있는 슬라이드 내용을 함께 보내서, 강의에 맞는 답을 받습니다.
 * API 키는 이 파일에 없습니다. (서버 /api/chat 에서만 사용)
 * ------------------------------------------------------
 */
(function () {
  if (window.__cmChat) return;
  window.__cmChat = true;

  var API = "/api/chat";
  var LS_CODE = "cm-chat-code";
  var SS_KEY = "cm-chat:" + location.pathname;
  var CHIPS = ["이 부분 쉽게 다시 설명해 줘", "예문 하나 더 보여 줘", "헷갈리기 쉬운 점 정리해 줘"];

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function ssGet(k) { try { return JSON.parse(sessionStorage.getItem(k) || "null"); } catch (e) { return null; } }
  function ssSet(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  // ---------- 지금 보고 있는 화면 내용 ----------
  function visibleText(el) {
    if (!el) return "";
    var t = (el.innerText || el.textContent || "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    return t;
  }
  function getContext() {
    var title = (document.title || "").replace(/\s*[—-]\s*AI ?강의.*$/, "").trim();
    var where = "";
    var el = null;

    var items = document.querySelectorAll(".gl-item");
    if (items.length) {
      for (var i = 0; i < items.length; i++) if (items[i].classList.contains("on")) { el = items[i]; where = "슬라이드 " + (i + 1) + " / " + items.length; break; }
    }
    if (!el) el = document.querySelector(".lp-slide") || document.querySelector(".stage > .slide") || document.querySelector("#s.slide");
    if (el && !where) {
      var cnt = document.querySelector(".lp-cnt, .cnt, .gl-cnt");
      if (cnt) where = "슬라이드 " + visibleText(cnt);
    }
    var text = "", img = "";
    if (el) {
      text = visibleText(el);
      // 슬라이드가 그림(교재 사진)으로만 되어 있으면 그림을 줄여서 함께 보냄
      if (text.replace(/\s/g, "").length < 40) img = slideImage(el);
    } else {
      var main = document.querySelector("main, .wrap, article") || document.body;
      text = visibleText(main);
    }
    var capEl = document.querySelector(".lp-cap:not([hidden]), .cap:not([hidden])");
    var cap = capEl ? visibleText(capEl) : "";
    return { title: title, where: where, text: text.slice(0, 3500), cap: cap.slice(0, 1200), img: img };
  }
  function slideImage(el) {
    var im = el.querySelector("img");
    if (!im || !im.complete || !im.naturalWidth) return "";
    try {
      var w = im.naturalWidth, h = im.naturalHeight, k = Math.min(1, 1300 / Math.max(w, h));
      var cv = document.createElement("canvas");
      cv.width = Math.round(w * k); cv.height = Math.round(h * k);
      var g = cv.getContext("2d");
      g.fillStyle = "#fff"; g.fillRect(0, 0, cv.width, cv.height);
      g.drawImage(im, 0, 0, cv.width, cv.height);
      var d = cv.toDataURL("image/jpeg", 0.8);
      return d.length < 1500000 ? d : "";
    } catch (e) { return ""; }
  }

  // ---------- 화면 만들기 (Shadow DOM: 강의 페이지 디자인과 섞이지 않게) ----------
  var host = document.createElement("div");
  host.id = "cm-chat-host";
  host.style.cssText = "position:fixed;z-index:2147483000;right:0;bottom:0;width:0;height:0;";
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var CSS = "" +
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:Pretendard,'IBM Plex Sans KR','Malgun Gothic',system-ui,sans-serif}" +
    ".fab{position:fixed;right:16px;bottom:96px;display:flex;align-items:center;gap:6px;height:44px;padding:0 16px 0 13px;border:0;border-radius:999px;background:#0E8A8C;color:#fff;font-size:14.5px;font-weight:700;cursor:pointer;box-shadow:0 6px 20px rgba(10,95,97,.35);-webkit-tap-highlight-color:transparent}" +
    ".fab:hover{background:#0A7476}.fab svg{width:20px;height:20px}" +
    ".fab.hide{display:none}" +
    ".pn{position:fixed;right:16px;bottom:16px;width:380px;height:min(600px,calc(100vh - 32px));background:#fff;border-radius:16px;box-shadow:0 18px 50px rgba(27,39,51,.28);display:none;flex-direction:column;overflow:hidden;border:1px solid #E6ECEF}" +
    ".pn.on{display:flex}" +
    ".hd{display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;background:#0E8A8C;color:#fff}" +
    ".hd b{font-size:15px;font-weight:700;flex:1}.hd small{display:block;font-size:11.5px;font-weight:500;opacity:.85;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:260px}" +
    ".x{width:32px;height:32px;border:0;border-radius:8px;background:rgba(255,255,255,.15);color:#fff;font-size:18px;cursor:pointer;line-height:1}" +
    ".x:hover{background:rgba(255,255,255,.28)}" +
    ".bd{flex:1;overflow-y:auto;padding:14px 14px 6px;background:#F3FAFA;-webkit-overflow-scrolling:touch}" +
    ".m{max-width:88%;margin:0 0 10px;padding:9px 12px;border-radius:14px;font-size:14px;line-height:1.6;color:#1B2733;word-break:keep-all;overflow-wrap:anywhere;white-space:normal}" +
    ".m.u{margin-left:auto;background:#0E8A8C;color:#fff;border-bottom-right-radius:4px}" +
    ".m.a{background:#fff;border:1px solid #DDF2F1;border-bottom-left-radius:4px}" +
    ".m.a b{color:#0A5F61}.m ul{margin:4px 0;padding-left:18px}.m li{margin:2px 0}" +
    ".m.e{background:#FFF1D8;color:#8A5A00;border:0}" +
    ".m.typing:after{content:'';display:inline-block;width:6px;height:14px;margin-left:2px;vertical-align:-2px;background:#7CCBC8;animation:bl 1s steps(2) infinite}" +
    "@keyframes bl{50%{opacity:0}}" +
    ".hi{font-size:13.5px;color:#5F6E7C;line-height:1.6;margin:2px 2px 10px}" +
    ".chips{display:flex;flex-wrap:wrap;gap:6px;padding:0 14px 8px;background:#F3FAFA}" +
    ".chip{border:1px solid #CFE5E4;background:#fff;color:#0A5F61;border-radius:999px;padding:5px 11px;font-size:12.5px;cursor:pointer}" +
    ".chip:hover{background:#DDF2F1}" +
    ".ft{border-top:1px solid #E6ECEF;padding:10px 10px 8px;background:#fff}" +
    ".row{display:flex;gap:8px;align-items:flex-end}" +
    "textarea{flex:1;resize:none;min-height:42px;max-height:120px;border:1px solid #CFE5E4;border-radius:12px;padding:10px 12px;font-size:15px;line-height:1.45;color:#1B2733;outline:none}" +
    "textarea:focus{border-color:#0E8A8C;box-shadow:0 0 0 3px #DDF2F1}" +
    ".go{height:42px;min-width:56px;border:0;border-radius:12px;background:#0E8A8C;color:#fff;font-size:14px;font-weight:700;cursor:pointer}" +
    ".go:disabled{background:#B9CDD0;cursor:default}" +
    ".nt{display:flex;justify-content:space-between;gap:8px;font-size:11px;color:#8493A1;margin-top:6px;padding:0 2px}" +
    ".nt a{color:#8493A1;cursor:pointer;text-decoration:underline;white-space:nowrap}" +
    ".code{display:flex;gap:6px;margin-top:6px}.code input{flex:1;height:36px;border:1px solid #E39A2D;border-radius:10px;padding:0 10px;font-size:14px}" +
    ".code button{height:36px;border:0;border-radius:10px;background:#E39A2D;color:#fff;font-weight:700;padding:0 12px;cursor:pointer}" +
    "@media (max-width:680px){.fab{right:12px;bottom:92px;height:42px;font-size:14px}" +
    ".pn{right:0;left:0;bottom:0;width:auto;height:82vh;height:82dvh;border-radius:16px 16px 0 0}}" +
    "@media print{.fab,.pn{display:none!important}}";

  root.innerHTML =
    "<style>" + CSS + "</style>" +
    '<button class="fab" type="button" aria-label="AI 조교에게 질문하기">' +
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1v.5"/><path d="M12 16.5h.01"/></svg>질문하기</button>' +
    '<section class="pn" role="dialog" aria-label="AI 조교">' +
    '<div class="hd"><div style="flex:1;min-width:0"><b>AI 조교에게 질문하기</b><small class="where"></small></div><button class="x" type="button" aria-label="닫기">✕</button></div>' +
    '<div class="bd"><div class="hi">강의를 보다가 궁금한 점을 물어보세요.<br>지금 보고 있는 화면 내용을 보고 답해 드려요.</div></div>' +
    '<div class="chips"></div>' +
    '<div class="ft"><div class="row"><textarea rows="1" placeholder="예: 여기서 that은 왜 관계대명사예요?"></textarea><button class="go" type="button">보내기</button></div>' +
    '<div class="codebox"></div>' +
    '<div class="nt"><span>AI 답변은 틀릴 수 있어요. 헷갈리면 선생님께 꼭 물어보세요.</span><a class="clr">대화 지우기</a></div></div>' +
    "</section>";

  var $ = function (s) { return root.querySelector(s); };
  var fab = $(".fab"), pn = $(".pn"), bd = $(".bd"), ta = $("textarea"), go = $(".go"), chips = $(".chips"), whereEl = $(".where"), codebox = $(".codebox");

  // 강의 페이지의 키보드 단축키(스페이스·화살표 등)가 입력을 가로채지 않게
  ["keydown", "keyup", "keypress"].forEach(function (ev) {
    pn.addEventListener(ev, function (e) { e.stopPropagation(); });
  });

  CHIPS.forEach(function (c) {
    var b = document.createElement("button");
    b.type = "button"; b.className = "chip"; b.textContent = c;
    b.onclick = function () { ask(c); };
    chips.appendChild(b);
  });

  // ---------- 대화 기록 (이 페이지, 이 탭 안에서만) ----------
  var hist = ssGet(SS_KEY) || [];
  var busy = false;

  function esc(s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function md(s) {
    var lines = esc(s).split("\n"), out = [], inList = false;
    lines.forEach(function (ln) {
      var m = ln.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)$/);
      if (m) { if (!inList) { out.push("<ul>"); inList = true; } out.push("<li>" + m[1] + "</li>"); return; }
      if (inList) { out.push("</ul>"); inList = false; }
      out.push(ln.replace(/^#+\s*/, "") + "<br>");
    });
    if (inList) out.push("</ul>");
    return out.join("").replace(/(<br>)+$/, "").replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  }
  function addMsg(r, t) {
    var d = document.createElement("div");
    d.className = "m " + r;
    if (r === "a") d.innerHTML = md(t); else d.textContent = t;
    bd.appendChild(d);
    bd.scrollTop = bd.scrollHeight;
    return d;
  }
  hist.forEach(function (m) { addMsg(m.r, m.t); });
  if (hist.length) chips.style.display = "none";

  function open() {
    var c = getContext();
    whereEl.textContent = "지금 보는 화면: " + (c.where || c.title || "이 강의");
    pn.classList.add("on"); fab.classList.add("hide");
    setTimeout(function () { ta.focus(); }, 50);
  }
  function close() { pn.classList.remove("on"); fab.classList.remove("hide"); }
  fab.onclick = open;
  $(".x").onclick = close;
  $(".clr").onclick = function () {
    hist = []; ssSet(SS_KEY, hist);
    Array.prototype.slice.call(bd.querySelectorAll(".m")).forEach(function (x) { x.remove(); });
    chips.style.display = "";
  };

  function autoGrow() { ta.style.height = "auto"; ta.style.height = Math.min(120, ta.scrollHeight) + "px"; }
  ta.addEventListener("input", autoGrow);
  ta.addEventListener("keydown", function (e) {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); ask(ta.value); }
  });
  go.onclick = function () { ask(ta.value); };

  function askCode(retryQ) {
    codebox.innerHTML = '<div class="code"><input type="password" placeholder="선생님께 받은 입장 코드" autocomplete="off"><button type="button">확인</button></div>';
    var inp = codebox.querySelector("input");
    var ok = function () {
      var v = inp.value.trim(); if (!v) return;
      lsSet(LS_CODE, v); codebox.innerHTML = "";
      if (retryQ) ask(retryQ, true);
    };
    codebox.querySelector("button").onclick = ok;
    inp.addEventListener("keydown", function (e) { if (e.key === "Enter" && !e.isComposing) ok(); });
    inp.focus();
  }

  function ask(q, isRetry) {
    q = String(q || "").trim();
    if (!q || busy) return;
    busy = true; go.disabled = true;
    chips.style.display = "none";
    if (!isRetry) { addMsg("u", q); ta.value = ""; autoGrow(); }
    var a = addMsg("a", ""); a.classList.add("typing");
    var ctx = getContext();
    var full = "";

    fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: q, hist: hist.slice(-6), ctx: ctx, code: lsGet(LS_CODE) }),
    }).then(function (res) {
      var ct = res.headers.get("content-type") || "";
      if (!res.ok || ct.indexOf("application/json") >= 0) {
        return res.json().catch(function () { return {}; }).then(function (j) {
          a.remove();
          if (j.error === "code") { addMsg("e", j.msg); askCode(q); return; }
          addMsg("e", j.msg || "답을 받지 못했어요. 잠시 뒤 다시 해 주세요.");
        });
      }
      if (!res.body || !res.body.getReader) {
        return res.text().then(function (t) { full = t; a.innerHTML = md(full); });
      }
      var reader = res.body.getReader(), dec = new TextDecoder();
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return;
          full += dec.decode(r.value, { stream: true });
          a.innerHTML = md(full);
          bd.scrollTop = bd.scrollHeight;
          return pump();
        });
      }
      return pump();
    }).catch(function () {
      if (!full) { a.remove(); addMsg("e", "인터넷 연결을 확인하고 다시 해 주세요."); }
    }).then(function () {
      a.classList.remove("typing");
      if (full) {
        hist.push({ r: "u", t: q }, { r: "a", t: full });
        hist = hist.slice(-12);
        ssSet(SS_KEY, hist);
      }
      busy = false; go.disabled = false;
      bd.scrollTop = bd.scrollHeight;
    });
  }

  function mount() { document.body.appendChild(host); }
  if (document.body) mount(); else document.addEventListener("DOMContentLoaded", mount);
})();
