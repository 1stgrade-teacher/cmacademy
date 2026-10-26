/**
 * learn-check.js — 강의 페이지용 "학습 완료 인증"
 * ------------------------------------------------------
 * chat-widget.js 가 자동으로 불러옵니다. (강의 HTML은 고칠 필요 없음)
 *
 * 1) 강의를 보는 동안 몰래(가볍게) 기록합니다.
 *    - 시청률: 전체 슬라이드 중 실제로 넘겨 본 슬라이드 비율
 *    - 집중시간: 화면을 켜 두고 강의가 재생 중이거나 직접 조작한 시간
 *    - 자리비움: 강의 재생 중에 다른 탭/앱으로 나간 횟수
 *    - 최고 배속
 * 2) 강의를 다 보면 '학습 인증' 버튼을 눌러
 *    확인 문제(강의 속 문제를 다시 섞어서, 없으면 AI가 출제) + 한줄요약 + 이해도 + 선생님께 한마디
 *    를 제출합니다. → /api/report → 선생님 노션(+구글 시트)에 자동 기록
 * ------------------------------------------------------
 */
(function () {
  if (window.__cmLearn) return;
  window.__cmLearn = true;

  // 반 목록 (바꾸고 싶으면 여기만 고치면 됩니다)
  var CLASSES = ["초6 S반", "중1 S반", "중2 일등급반", "중2 사관반", "중3 일등급반"];
  var PASS_COVERAGE = 0.8;   // 이만큼 보면 '다 봤다'로 봄
  var MAX_LECTURE_Q = 5;     // 강의 속 문제 중 최대 몇 개를 낼지
  var API = "/api/report";
  var LS_ME = "cm-learn-me";
  var LS_CODE = "cm-chat-code"; // AI 조교와 같은 입장 코드를 함께 씀
  var PATH = location.pathname;
  var LS_PROG = "cm-learn:" + PATH;

  function lsGet(k) { try { return localStorage.getItem(k) || ""; } catch (e) { return ""; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function jGet(k) { try { return JSON.parse(lsGet(k) || "null"); } catch (e) { return null; } }
  function jSet(k, v) { lsSet(k, JSON.stringify(v)); }
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function clean(s) { return String(s || "").replace(/\s+/g, " ").trim(); }
  function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)), t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ================================================================
  // 1. 강의 자료 읽기 (스크립트 안의 슬라이드·자막 데이터)
  // ================================================================
  // 스크립트 글자에서 start 위치의 { 또는 [ 로 시작하는 JSON 덩어리를 통째로 잘라냄
  function sliceJson(s, start) {
    var open = s[start], close = open === "{" ? "}" : "]", depth = 0, inStr = false;
    for (var i = start; i < s.length; i++) {
      var c = s[i];
      if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") depth++;
      else if (c === "}" || c === "]") { depth--; if (depth === 0) return s.slice(start, i + 1); }
    }
    return "";
  }
  function lectureData() {
    var out = [];
    var scripts = document.querySelectorAll("script:not([src])");
    for (var k = 0; k < scripts.length; k++) {
      var s = scripts[k].textContent || "";
      if (s.length < 50) continue;
      s = s.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+\/=]{60,}/gi, "");
      var marks = [/lecturePlayer\([^,]*,\s*\{/g, /var\s+D\s*=\s*\{/g, /var\s+A\s*=\s*\[/g];
      for (var m = 0; m < marks.length; m++) {
        var re = marks[m], hit;
        while ((hit = re.exec(s))) {
          var j = sliceJson(s, hit.index + hit[0].length - 1);
          if (!j) continue;
          try { out.push(JSON.parse(j)); } catch (e) {}
        }
      }
    }
    return out;
  }
  function collectStrings(o, key, acc) {
    if (typeof o === "string") { acc.push({ k: key, v: o }); return acc; }
    if (Array.isArray(o)) { for (var i = 0; i < o.length; i++) collectStrings(o[i], key, acc); return acc; }
    if (o && typeof o === "object") for (var p in o) if (Object.prototype.hasOwnProperty.call(o, p)) collectStrings(o[p], p, acc);
    return acc;
  }
  var parser = window.DOMParser ? new DOMParser() : null;
  function htmlText(h) {
    if (!/[<&]/.test(h)) return clean(h);
    if (!parser) return clean(h.replace(/<[^>]+>/g, " "));
    // 칸(div·li·td 등) 사이 글자가 붙지 않도록 태그 앞에 띄어쓰기를 넣고 읽음
    var d = parser.parseFromString("<div>" + h.replace(/<(?!\/?(b|i|u|em|strong|span|small|sup|sub)\b)/gi, " <") + "</div>", "text/html");
    return clean(d.body.textContent);
  }

  var LECTURE_TEXT = "", LECTURE_Q = [];
  function readLecture() {
    var strs = [];
    lectureData().forEach(function (d) { collectStrings(d, "", strs); });
    var texts = [], seen = {}, slideHtml = [];
    strs.forEach(function (x) {
      if (x.k === "u" || x.k === "hl" || x.k === "brand" || x.k === "reveal") return;
      if (/^(audio|https?:|\.\/|\/)/.test(x.v) && x.v.length < 200) return;
      if (/<[a-z]/i.test(x.v)) slideHtml.push(x.v);
      var t = htmlText(x.v);
      if (t.length < 4 || seen[t]) return;
      seen[t] = 1; texts.push(t);
    });
    // 슬라이드가 HTML에 그대로 있는 강의(gl-item 형식)
    var stage = document.querySelector(".gl-stage, main");
    if (stage && texts.join("").length < 200) texts.push(clean(stage.textContent));
    LECTURE_TEXT = texts.join("\n").slice(0, 6000);
    LECTURE_Q = extractQuestions(slideHtml);
  }

  function normAns(s) {
    return String(s || "").toLowerCase()
      .replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"')
      .replace(/\s+([,.!?;:])/g, "$1").replace(/[.!?。]+\s*$/, "")
      .replace(/\s+/g, " ").trim();
  }
  function extractQuestions(htmls) {
    if (!parser) return [];
    var qs = [];
    htmls.forEach(function (h) {
      if (h.indexOf("g-q") < 0) return;
      var d = parser.parseFromString("<div>" + h + "</div>", "text/html").body;
      var qEl = d.querySelector(".g-q");
      if (!qEl) return;
      var qs1 = d.querySelector(".g-qs");
      var kind = d.querySelector(".g-kind");
      var ansEl = d.querySelector(".g-ans .a");
      var expEl = d.querySelector(".g-exp");
      var answer = ansEl ? clean(ansEl.textContent) : "";
      var item = {
        kind: kind ? clean(kind.textContent) : "",
        q: clean(qEl.textContent), sub: qs1 ? qs1.textContent.replace(/[ \t]+/g, " ").trim() : "",
        exp: expEl ? clean(expEl.textContent) : "", answer: answer, src: "lecture",
      };
      var opts = d.querySelectorAll(".g-opt");
      if (opts.length >= 2) {
        var list = [], okIdx = -1;
        for (var i = 0; i < opts.length; i++) {
          var o = opts[i].cloneNode(true), b = o.querySelector("b");
          if (b) b.remove();
          var t = clean(o.textContent);
          list.push(t);
          if (opts[i].getAttribute("data-ok")) okIdx = i;
        }
        if (okIdx < 0 && answer) for (var x = 0; x < list.length; x++) if (normAns(list[x]) === normAns(answer)) okIdx = x;
        // '배열' 같은 조각 보기(정답이 보기 중에 없음)는 객관식으로 낼 수 없음
        if (okIdx < 0) return;
        item.type = "mc"; item.opts = list; item.ans = okIdx; item.answer = list[okIdx];
      } else {
        if (!answer || /[가-힣]/.test(answer) || answer.length > 140) return; // 우리말 답(채점 어려움)은 제외
        item.type = "text";
      }
      qs.push(item);
    });
    return qs;
  }

  // ================================================================
  // 2. 시청 기록
  // ================================================================
  var S = { seen: {}, total: 0, active: 0, away: 0, maxRate: 1, started: Date.now(), last: -1 };
  (function restore() {
    var p = jGet(LS_PROG);
    if (p && Date.now() - (p.t || 0) < 12 * 3600 * 1000) {
      S.seen = p.seen || {}; S.total = p.total || 0; S.active = p.active || 0; S.away = p.away || 0; S.maxRate = p.maxRate || 1;
    }
  })();
  function save() { jSet(LS_PROG, { seen: S.seen, total: S.total, active: S.active, away: S.away, maxRate: S.maxRate, t: Date.now() }); }
  function coverage() {
    if (!S.total) return null;
    var n = 0; for (var k in S.seen) if (S.seen[k] && +k <= S.total) n++;
    return Math.min(1, n / S.total);
  }

  // 오디오 재생 여부 (강의 플레이어는 화면에 없는 Audio 객체를 씀)
  var playingMedia = [];
  var origPlay = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    var el = this;
    if (!el.__cmTracked) {
      el.__cmTracked = true;
      var off = function () { playingMedia = playingMedia.filter(function (x) { return x !== el; }); };
      el.addEventListener("pause", off); el.addEventListener("ended", off); el.addEventListener("emptied", off);
      el.addEventListener("ratechange", function () { if (el.playbackRate > S.maxRate) S.maxRate = el.playbackRate; });
    }
    if (playingMedia.indexOf(el) < 0) playingMedia.push(el);
    if (el.playbackRate > S.maxRate) S.maxRate = el.playbackRate;
    return origPlay.apply(this, arguments);
  };
  function mediaPlaying() { return playingMedia.some(function (m) { return !m.paused && !m.ended; }); }

  var lastAct = Date.now(), lastSlide = Date.now();
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) {
    document.addEventListener(ev, function () { lastAct = Date.now(); }, { passive: true, capture: true });
  });
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && (mediaPlaying() || Date.now() - lastAct < 15000)) { S.away++; save(); }
  });

  function readCounter() {
    var el = document.querySelector(".lp-cnt, .gl-cnt, .cnt, #cnt");
    if (!el) return null;
    var m = (el.textContent || "").match(/(\d+)\s*\/\s*(\d+)/);
    return m ? { i: +m[1], n: +m[2] } : null;
  }
  function readRate() {
    var r = document.querySelector(".lp-rate, #rate, select.rate");
    var v = r ? parseFloat(r.value) : NaN;
    if (isFinite(v) && v > S.maxRate && mediaPlaying()) S.maxRate = v;
  }

  var tickN = 0;
  function tick() {
    var c = readCounter();
    if (c) {
      if (c.n !== S.total) S.total = c.n;
      if (c.i !== S.last) {
        // 휙휙 넘기지 않고 3초 이상 머문 슬라이드만 '본 것'으로 기록
        if (S.last > 0 && Date.now() - lastSlide >= 3000) S.seen[S.last] = 1;
        S.last = c.i; lastSlide = Date.now();
      }
      if (!S.seen[c.i] && Date.now() - lastSlide >= 3000) {
        S.seen[c.i] = 1;
        if (c.i === c.n) nudge();
      }
    }
    readRate();
    if (document.visibilityState === "visible" && (mediaPlaying() || Date.now() - lastAct < 45000 || Date.now() - lastSlide < 45000)) S.active++;
    if (++tickN % 5 === 0) save();
    paintFab();
  }

  // ================================================================
  // 3. 화면 (Shadow DOM)
  // ================================================================
  var host = document.createElement("div");
  host.id = "cm-learn-host";
  host.style.cssText = "position:fixed;z-index:2147482999;left:0;bottom:0;width:0;height:0;";
  var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;

  var CSS =
    ":host{all:initial}" +
    "*{box-sizing:border-box;font-family:'Pretendard','Apple SD Gothic Neo','Malgun Gothic',system-ui,sans-serif}" +
    ".fab{position:fixed;left:16px;bottom:96px;height:46px;padding:0 16px 0 12px;border:0;border-radius:999px;background:#fff;color:#0A5F61;font-size:15px;font-weight:700;display:flex;align-items:center;gap:8px;box-shadow:0 6px 20px rgba(10,60,62,.22),0 0 0 2px #0E8A8C inset;cursor:pointer;transition:transform .15s}" +
    ".fab:hover{transform:translateY(-2px)}.fab.hide{display:none}" +
    ".fab .ring{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;font-size:10px;font-weight:800;color:#0A5F61}" +
    ".fab.done{background:#0E8A8C;color:#fff}.fab.done .ring{color:#fff}" +
    ".tip{position:fixed;left:16px;bottom:152px;max-width:260px;background:#1B2733;color:#fff;font-size:13.5px;line-height:1.5;padding:10px 14px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);animation:up .3s ease;cursor:pointer}" +
    ".tip:after{content:'';position:absolute;left:26px;bottom:-6px;width:12px;height:12px;background:#1B2733;transform:rotate(45deg)}" +
    "@keyframes up{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}" +
    ".dim{position:fixed;inset:0;background:rgba(15,30,40,.45);display:none;align-items:center;justify-content:center;padding:16px}" +
    ".dim.on{display:flex}" +
    ".pn{width:min(560px,100%);max-height:min(88vh,860px);background:#fff;border-radius:18px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,.3);color:#1B2733}" +
    ".hd{padding:14px 16px;background:#0E8A8C;color:#fff;display:flex;align-items:center;gap:10px}" +
    ".hd b{font-size:16px}.hd small{display:block;font-size:12px;opacity:.85;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}" +
    ".x{margin-left:auto;background:rgba(255,255,255,.15);border:0;color:#fff;width:32px;height:32px;border-radius:10px;font-size:16px;cursor:pointer;flex:none}" +
    ".bd{overflow:auto;padding:16px;display:flex;flex-direction:column;gap:14px;background:#F6FAFA}" +
    ".card{background:#fff;border:1px solid #E1ECEC;border-radius:14px;padding:14px}" +
    ".card h4{margin:0 0 10px;font-size:14px;color:#0A5F61;display:flex;align-items:center;gap:6px}" +
    ".stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}" +
    ".st{background:#F3FAFA;border-radius:10px;padding:8px 10px}.st span{display:block;font-size:11.5px;color:#5F6E7C}.st b{font-size:18px;color:#1B2733}" +
    ".bar{height:8px;border-radius:99px;background:#E6EFEF;overflow:hidden;margin-top:10px}.bar i{display:block;height:100%;background:#0E8A8C;border-radius:99px}" +
    ".warn{margin-top:10px;font-size:13px;color:#9A5B00;background:#FFF5E3;border-radius:10px;padding:8px 10px;line-height:1.5}" +
    ".me{display:flex;align-items:center;gap:8px;font-size:14px}.me a{margin-left:auto;font-size:12.5px;color:#0E8A8C;cursor:pointer;text-decoration:underline}" +
    "label{display:block;font-size:13px;color:#5F6E7C;margin:0 0 6px}" +
    "input[type=text],input[type=password],select,textarea{width:100%;border:1px solid #CFE5E4;border-radius:10px;padding:10px 12px;font-size:15px;color:#1B2733;background:#fff;outline:none}" +
    "input:focus,select:focus,textarea:focus{border-color:#0E8A8C;box-shadow:0 0 0 3px #DDF2F1}" +
    "textarea{resize:vertical;min-height:64px;line-height:1.5}" +
    ".row{display:flex;gap:8px}.row>*{flex:1}" +
    ".q{padding:12px 0;border-top:1px dashed #DCE7E7}.q:first-of-type{border-top:0;padding-top:0}" +
    ".qn{font-size:12px;color:#0E8A8C;font-weight:700;margin-bottom:4px}.qt{font-size:15px;font-weight:600;line-height:1.5}" +
    ".qs{margin:6px 0 8px;padding:8px 10px;background:#F3F6F8;border-radius:8px;font-size:15px;line-height:1.55;white-space:pre-wrap}" +
    ".opts{display:flex;flex-direction:column;gap:6px;margin-top:8px}" +
    ".opt{text-align:left;border:1px solid #D6E4E4;background:#fff;border-radius:10px;padding:9px 12px;font-size:14.5px;cursor:pointer;color:#1B2733;line-height:1.45}" +
    ".opt:hover{background:#F0F8F8}.opt.on{border-color:#0E8A8C;background:#DDF2F1;font-weight:600}" +
    ".opt.ok{border-color:#2E9E5B;background:#E5F6EC}.opt.ng{border-color:#D9534F;background:#FBE9E8}" +
    ".res{margin-top:8px;font-size:13.5px;line-height:1.5;padding:8px 10px;border-radius:8px}.res.ok{background:#E5F6EC;color:#1F6E40}.res.ng{background:#FBE9E8;color:#9B2C28}" +
    ".rate{display:flex;gap:6px}.rate button{flex:1;border:1px solid #D6E4E4;background:#fff;border-radius:10px;padding:8px 2px;font-size:12px;cursor:pointer;color:#1B2733;line-height:1.3}" +
    ".rate button b{display:block;font-size:18px}.rate button.on{border-color:#0E8A8C;background:#DDF2F1}" +
    ".ft{padding:12px 16px;border-top:1px solid #E6ECEF;background:#fff;display:flex;gap:8px;align-items:center}" +
    ".go{height:46px;flex:1;border:0;border-radius:12px;background:#0E8A8C;color:#fff;font-size:16px;font-weight:700;cursor:pointer}" +
    ".go:disabled{background:#B9CDD0;cursor:default}" +
    ".err{color:#C0392B;font-size:13px;flex:1}" +
    ".big{text-align:center;padding:6px 0 2px}.big .v{font-size:40px;font-weight:800;color:#0A5F61}.big .t{font-size:17px;font-weight:700;margin-top:4px}" +
    ".ai{background:#F1F0FF;border-color:#DEDAFB}.ai h4{color:#5146C7}" +
    ".hint{font-size:12.5px;color:#7A8896;margin-top:6px}" +
    ".spin{display:inline-block;width:14px;height:14px;border:2px solid #CFE5E4;border-top-color:#0E8A8C;border-radius:50%;animation:sp .8s linear infinite;vertical-align:-2px;margin-right:6px}" +
    "@keyframes sp{to{transform:rotate(360deg)}}" +
    "@media (max-width:680px){.fab{left:12px;bottom:92px;height:42px;font-size:14px}.tip{left:12px;bottom:142px}" +
    ".dim{padding:0;align-items:flex-end}.pn{width:100%;max-height:92vh;max-height:92dvh;border-radius:16px 16px 0 0}}" +
    "@media print{.fab,.dim,.tip{display:none!important}}";

  root.innerHTML =
    "<style>" + CSS + "</style>" +
    '<button class="fab" type="button" aria-label="학습 완료 인증"><span class="ring"></span><span class="lbl">학습 인증</span></button>' +
    '<div class="dim"><section class="pn" role="dialog" aria-label="학습 완료 인증">' +
    '<div class="hd"><div style="min-width:0"><b>학습 완료 인증</b><small class="sub"></small></div><button class="x" type="button" aria-label="닫기">✕</button></div>' +
    '<div class="bd"></div>' +
    '<div class="ft"></div>' +
    "</section></div>";

  var $ = function (s) { return root.querySelector(s); };
  var fab = $(".fab"), dim = $(".dim"), bd = $(".bd"), ft = $(".ft");
  // 강의 페이지의 단축키(스페이스·화살표)가 입력을 가로채지 않게
  ["keydown", "keyup", "keypress"].forEach(function (ev) { dim.addEventListener(ev, function (e) { e.stopPropagation(); if (e.key === "Escape") close(); }); });
  dim.addEventListener("click", function (e) { if (e.target === dim) close(); });
  $(".x").onclick = close;
  fab.onclick = open;

  var submitted = jGet(LS_PROG + ":done");
  function paintFab() {
    var c = coverage(), pct = c == null ? null : Math.round(c * 100);
    var ring = fab.querySelector(".ring");
    if (submitted) {
      fab.classList.add("done"); ring.textContent = "✓"; ring.style.background = "rgba(255,255,255,.2)";
      fab.querySelector(".lbl").textContent = "인증 완료";
      return;
    }
    var p = pct == null ? 0 : pct;
    ring.textContent = pct == null || pct >= 100 ? "✓" : pct + "%";
    ring.style.background = "conic-gradient(#0E8A8C " + p * 3.6 + "deg, #DDF2F1 0)";
    ring.style.color = "#0A5F61";
    ring.style.boxShadow = "inset 0 0 0 4px #fff";
  }

  var tipEl = null, nudged = false;
  function nudge() {
    if (nudged || submitted || dim.classList.contains("on")) return;
    nudged = true;
    tipEl = document.createElement("div");
    tipEl.className = "tip";
    tipEl.textContent = "강의 끝! 🎉 확인 문제 풀고 '학습 인증'으로 마무리해요.";
    tipEl.onclick = function () { tipEl.remove(); open(); };
    root.appendChild(tipEl);
    setTimeout(function () { if (tipEl) tipEl.remove(); }, 12000);
  }

  // ---------- 서버 상태 ----------
  var server = null;
  function loadServer() {
    if (server) return Promise.resolve(server);
    return fetch(API, { cache: "no-store" }).then(function (r) { return r.json(); }).then(function (j) { server = j || {}; return server; })
      .catch(function () { server = { ok: false }; return server; });
  }

  // ---------- 문제 준비 ----------
  var QUIZ = null, answers = {};
  function prepareQuiz() {
    if (QUIZ) return Promise.resolve(QUIZ);
    readLecture();
    var lq = LECTURE_Q.slice();
    // 객관식/주관식이 섞이도록 고르고, 보기 순서를 섞음
    var mc = shuffle(lq.filter(function (q) { return q.type === "mc"; }));
    var tx = shuffle(lq.filter(function (q) { return q.type === "text"; }));
    var pick = [];
    while (pick.length < MAX_LECTURE_Q && (mc.length || tx.length)) {
      if (mc.length) pick.push(mc.shift());
      if (pick.length < MAX_LECTURE_Q && tx.length) pick.push(tx.shift());
    }
    pick.forEach(function (q) {
      if (q.type !== "mc") return;
      var order = shuffle(q.opts.map(function (_, i) { return i; }));
      var right = q.opts[q.ans];
      q.opts = order.map(function (i) { return q.opts[i]; });
      q.ans = q.opts.indexOf(right);
    });
    QUIZ = pick;
    if (pick.length >= 3) return Promise.resolve(QUIZ);
    // 강의 속 문제가 3개 미만이면 AI가 부족한 만큼 출제 (같은 강의는 한 번만 만들어 저장)
    return loadServer().then(function (sv) {
      if (!sv.ai) return QUIZ;
      var cached = jGet(LS_PROG + ":aiq");
      var get = cached && cached.items ? Promise.resolve(cached) :
        fetch(API, { method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "quiz", code: lsGet(LS_CODE), ctx: { title: pageInfo().title, text: LECTURE_TEXT } }) })
          .then(function (r) { return r.ok ? r.json() : { items: [] }; })
          .then(function (j) { if (j.items && j.items.length) jSet(LS_PROG + ":aiq", j); return j; })
          .catch(function () { return { items: [] }; });
      return get.then(function (j) {
        (j.items || []).slice(0, 3 - QUIZ.length).forEach(function (x) {
          QUIZ.push({ type: "mc", src: "ai", kind: "AI 확인 문제", q: x.q, sub: "", opts: x.opts.slice(), ans: x.ans, answer: x.opts[x.ans], exp: x.exp || "" });
        });
        return QUIZ;
      });
    });
  }

  function pageInfo() {
    var segs = PATH.split("/").filter(Boolean).map(function (x) { try { return decodeURIComponent(x); } catch (e) { return x; } });
    var area = segs[0] || "기타";
    if (["문법", "독해", "구문", "교과서"].indexOf(area) < 0) area = "기타";
    var title = (document.title || "").replace(/\s*[—-]\s*(AI ?강의|일등급샘).*$/, "").trim();
    var t2 = title.split(/\s+—\s+/);
    if (t2.length === 2) title = t2[1] + " · " + t2[0];
    return { area: area, book: segs.slice(1, -1).join(" › "), title: title || segs[segs.length - 1] || "강의", url: location.href.split("#")[0] };
  }
  var bookName = null;
  function loadBookName() {
    if (bookName !== null) return Promise.resolve(bookName);
    var info = pageInfo();
    bookName = info.book;
    if (info.area === "교과서") return Promise.resolve(bookName); // 교과서는 경로(학년›출판사›과)가 더 알아보기 쉬움
    return fetch("./index.html", { cache: "force-cache" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (h) {
      var m = h.match(/<title>([^<]+)<\/title>/i);
      if (m) { var t = m[1].replace(/\s*[-—|]\s*일등급샘.*$/, "").trim(); if (t) bookName = t; }
      return bookName;
    }).catch(function () { return bookName; });
  }

  // ---------- 패널 열기 ----------
  function open() {
    if (tipEl) { tipEl.remove(); tipEl = null; }
    dim.classList.add("on"); fab.classList.add("hide");
    host.style.zIndex = "2147483001"; // 열려 있는 동안은 '질문하기' 버튼보다 위에
    $(".sub").textContent = pageInfo().title;
    var me = jGet(LS_ME);
    if (!me || !me.name) return renderMe(true);
    renderMain();
  }
  function close() { dim.classList.remove("on"); fab.classList.remove("hide"); host.style.zIndex = "2147482999"; }

  function renderMe(first) {
    var me = jGet(LS_ME) || {};
    var known = CLASSES.indexOf(me.cls) >= 0;
    bd.innerHTML =
      '<div class="card"><h4>👋 ' + (first ? "처음 한 번만 적어 주세요" : "내 정보 바꾸기") + '</h4>' +
      '<label>이름</label><input type="text" class="nm" maxlength="20" placeholder="예: 김일등" value="' + esc(me.name || "") + '">' +
      '<div style="height:10px"></div><label>반</label><select class="cl"><option value="">반을 고르세요</option>' +
      CLASSES.map(function (c) { return '<option' + (me.cls === c ? " selected" : "") + ">" + esc(c) + "</option>"; }).join("") +
      '<option value="__etc"' + (me.cls && !known ? " selected" : "") + '>기타 (직접 입력)</option></select>' +
      '<input type="text" class="etc" maxlength="20" placeholder="반 이름" style="margin-top:8px;display:' + (me.cls && !known ? "block" : "none") + '" value="' + esc(known ? "" : me.cls || "") + '">' +
      '<div class="hint">선생님 기록에 이 이름으로 남아요. 정확하게 적어 주세요.</div></div>';
    var cl = bd.querySelector(".cl"), etc = bd.querySelector(".etc");
    cl.onchange = function () { etc.style.display = cl.value === "__etc" ? "block" : "none"; };
    ft.innerHTML = '<span class="err"></span><button class="go" type="button" style="flex:0 0 140px">저장</button>';
    ft.querySelector(".go").onclick = function () {
      var name = clean(bd.querySelector(".nm").value), cls = cl.value === "__etc" ? clean(etc.value) : cl.value;
      if (!name) return showErr("이름을 적어 주세요.");
      if (!cls) return showErr("반을 골라 주세요.");
      jSet(LS_ME, { name: name, cls: cls });
      renderMain();
    };
    setTimeout(function () { var n = bd.querySelector(".nm"); if (n && !n.value) n.focus(); }, 50);
  }
  function showErr(t) { var e = ft.querySelector(".err"); if (e) e.textContent = t; }

  function statsHtml() {
    var c = coverage(), mins = Math.round(S.active / 60);
    var cov = c == null ? "—" : Math.round(c * 100) + "%";
    var seen = 0; for (var k in S.seen) if (S.seen[k] && +k <= S.total) seen++;
    var h = '<div class="card"><h4>📊 나의 시청 기록</h4><div class="stats">' +
      '<div class="st"><span>시청률</span><b>' + cov + "</b></div>" +
      '<div class="st"><span>집중 시간</span><b>' + mins + "분</b></div>" +
      '<div class="st"><span>자리비움</span><b>' + S.away + "회</b></div></div>";
    if (c != null) h += '<div class="bar"><i style="width:' + Math.round(c * 100) + '%"></i></div><div class="hint">' + seen + " / " + S.total + " 슬라이드를 봤어요.</div>";
    if (c != null && c < PASS_COVERAGE) h += '<div class="warn">아직 강의를 ' + Math.round(PASS_COVERAGE * 100) + "% 이상 보지 않았어요. 지금 제출해도 되지만, 시청률이 선생님께 그대로 전달돼요. 끝까지 보고 제출하는 걸 추천해요!</div>";
    return h + "</div>";
  }

  function renderMain() {
    var me = jGet(LS_ME) || {};
    bd.innerHTML = '<div class="card me">🙋 <b>' + esc(me.name) + "</b> · " + esc(me.cls) + '<a class="chg">바꾸기</a></div>' +
      statsHtml() +
      '<div class="card qbox"><h4>📝 확인 문제</h4><div class="hint"><span class="spin"></span>문제를 준비하고 있어요…</div></div>' +
      '<div class="card"><h4>✍️ 오늘 배운 내용 한 줄 요약 <small style="color:#C0392B;font-weight:400">(필수)</small></h4>' +
      '<textarea class="sum" maxlength="400" placeholder="예: 주어가 I면 am, he/she/it이면 is, 여럿이면 are를 쓴다."></textarea>' +
      '<div class="hint">강의를 안 본 친구에게 설명하듯 내 말로 적어 보세요. AI가 읽고 한마디 해 줘요.</div></div>' +
      '<div class="card"><h4>🤔 얼마나 이해했나요?</h4><div class="rate">' +
      [["5", "완벽해요", "😎"], ["4", "거의 이해", "🙂"], ["3", "보통", "😐"], ["2", "헷갈려요", "😕"], ["1", "모르겠어요", "😵"]].map(function (r) {
        return '<button type="button" data-v="' + r[0] + " " + r[1] + '"><b>' + r[2] + "</b>" + r[1] + "</button>";
      }).join("") + "</div></div>" +
      '<div class="card"><h4>💬 선생님께 한마디 / 질문 <small style="color:#7A8896;font-weight:400">(선택)</small></h4>' +
      '<textarea class="msg" maxlength="1000" placeholder="헷갈린 부분, 궁금한 점, 하고 싶은 말을 자유롭게 적어요."></textarea></div>' +
      '<div class="card codecard" style="display:none"><h4>🔑 입장 코드</h4><input type="password" class="code" placeholder="선생님께 받은 입장 코드" autocomplete="off"></div>';
    bd.querySelector(".chg").onclick = function () { renderMe(false); };
    var rate = "";
    Array.prototype.forEach.call(bd.querySelectorAll(".rate button"), function (b) {
      b.onclick = function () {
        Array.prototype.forEach.call(bd.querySelectorAll(".rate button"), function (x) { x.classList.remove("on"); });
        b.classList.add("on"); rate = b.getAttribute("data-v");
      };
    });
    ft.innerHTML = '<span class="err"></span><button class="go" type="button" style="flex:0 0 150px">제출하기</button>';
    var go = ft.querySelector(".go");
    go.onclick = function () { submit(rate); };

    loadServer().then(function (sv) {
      if (sv.needCode && !lsGet(LS_CODE)) bd.querySelector(".codecard").style.display = "";
      if (sv.ok && sv.ready === false) showErr("선생님이 아직 기록 장소를 연결하지 않았어요.");
    });
    prepareQuiz().then(renderQuiz, function () { renderQuiz([]); });
  }

  function renderQuiz(qs) {
    var box = bd.querySelector(".qbox");
    if (!box) return;
    answers = {};
    if (!qs.length) {
      box.innerHTML = '<h4>📝 확인 문제</h4><div class="hint">이 강의는 확인 문제가 없어요. 아래 한줄요약을 정성껏 적어 주세요!</div>';
      return;
    }
    var h = '<h4>📝 확인 문제 <small style="color:#7A8896;font-weight:400">' + qs.length + "문항 · 강의에서 배운 그대로 풀어 보세요</small></h4>";
    qs.forEach(function (q, i) {
      h += '<div class="q" data-i="' + i + '"><div class="qn">Q' + (i + 1) + (q.kind ? " · " + esc(q.kind) : "") + "</div>" +
        '<div class="qt">' + esc(q.q) + "</div>" + (q.sub ? '<div class="qs">' + esc(q.sub) + "</div>" : "");
      if (q.type === "mc") {
        h += '<div class="opts">' + q.opts.map(function (o, k) {
          return '<button type="button" class="opt" data-k="' + k + '">' + "①②③④⑤⑥"[k] + " " + esc(o) + "</button>";
        }).join("") + "</div>";
      } else {
        h += '<input type="text" class="ta" maxlength="200" placeholder="답을 영어로 쓰세요" autocomplete="off" autocapitalize="off" spellcheck="false">';
      }
      h += "</div>";
    });
    box.innerHTML = h;
    Array.prototype.forEach.call(box.querySelectorAll(".q"), function (qEl) {
      var i = +qEl.getAttribute("data-i");
      Array.prototype.forEach.call(qEl.querySelectorAll(".opt"), function (b) {
        b.onclick = function () {
          Array.prototype.forEach.call(qEl.querySelectorAll(".opt"), function (x) { x.classList.remove("on"); });
          b.classList.add("on"); answers[i] = +b.getAttribute("data-k");
        };
      });
      var ta = qEl.querySelector(".ta");
      if (ta) ta.oninput = function () { answers[i] = ta.value; };
    });
  }

  function grade(q, a) {
    if (q.type === "mc") return { given: a == null ? "" : q.opts[a], ok: a === q.ans };
    var given = clean(a);
    var alts = String(q.answer).split(/\s+\/\s+|\s*\|\s*|\s+또는\s+/).map(normAns);
    return { given: given, ok: !!given && alts.indexOf(normAns(given)) >= 0 };
  }

  var busy = false;
  function submit(rate) {
    if (busy) return;
    var me = jGet(LS_ME) || {};
    var sum = clean(bd.querySelector(".sum").value), msg = (bd.querySelector(".msg").value || "").trim();
    var qs = QUIZ || [];
    for (var i = 0; i < qs.length; i++) {
      if (answers[i] == null || answers[i] === "") return showErr("Q" + (i + 1) + "번을 아직 안 풀었어요.");
    }
    if (sum.length < 10) { bd.querySelector(".sum").focus(); return showErr("한줄요약을 10자 이상 적어 주세요."); }
    if (!rate) return showErr("이해도를 골라 주세요.");
    var codeIn = bd.querySelector(".code");
    if (codeIn && codeIn.value.trim()) lsSet(LS_CODE, codeIn.value.trim());

    var items = qs.map(function (q, k) {
      var g = grade(q, answers[k]);
      return { q: q.q + (q.sub ? " | " + clean(q.sub) : ""), given: g.given, answer: q.answer, ok: g.ok, src: q.src };
    });
    busy = true;
    var go = ft.querySelector(".go");
    go.disabled = true; go.innerHTML = '<span class="spin"></span>제출 중…';
    showErr("");
    save();
    loadBookName().then(function (book) {
      var info = pageInfo();
      return fetch(API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: lsGet(LS_CODE),
          student: { name: me.name, cls: me.cls },
          page: { title: info.title, area: info.area, book: book || info.book, url: info.url },
          stats: { coverage: coverage(), activeSec: S.active, away: S.away, maxRate: S.maxRate, slidesSeen: Object.keys(S.seen).length, slidesTotal: S.total },
          quiz: { items: items },
          summary: sum, understanding: rate, message: msg,
          lectureText: LECTURE_TEXT.slice(0, 5000),
        }),
      });
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) { return { status: r.status, j: j }; });
    }).then(function (x) {
      busy = false;
      if (x.status === 401) { lsSet(LS_CODE, ""); var cc = bd.querySelector(".codecard"); if (cc) cc.style.display = ""; }
      if (x.status !== 200 || !x.j.ok) {
        go.disabled = false; go.textContent = "다시 제출";
        return showErr((x.j && x.j.msg) || "제출하지 못했어요. 잠시 뒤 다시 해 주세요.");
      }
      submitted = { at: Date.now(), verdict: x.j.verdict };
      jSet(LS_PROG + ":done", submitted);
      paintFab();
      renderResult(x.j, qs, items);
    }).catch(function () {
      busy = false; go.disabled = false; go.textContent = "다시 제출";
      showErr("인터넷 연결을 확인하고 다시 제출해 주세요.");
    });
  }

  function renderResult(j, qs, items) {
    var pct = j.total ? Math.round(j.right / j.total * 100) : null;
    var msg = j.verdict && j.verdict.indexOf("통과") >= 0 ? "훌륭해요! 오늘 강의 완벽하게 끝!" :
      j.verdict && j.verdict.indexOf("재수강") >= 0 ? "틀린 부분을 다시 보고, 강의를 한 번 더 들어 보면 좋겠어요." : "잘했어요! 틀린 문제만 다시 확인해 봐요.";
    var h = '<div class="card big"><div class="v">' + (pct == null ? "✓" : pct + "점") + '</div><div class="t">' + esc(j.verdict || "") + "</div>" +
      '<div class="hint">' + esc(msg) + "<br>기록이 선생님께 전달되었어요. 📬</div></div>";
    if (j.aiFeedback) h += '<div class="card ai"><h4>🤖 한줄요약 AI 피드백 · ' + esc(j.aiGrade) + "</h4><div style=\"font-size:14.5px;line-height:1.6\">" + esc(j.aiFeedback) + "</div></div>";
    if (qs.length) {
      h += '<div class="card"><h4>📝 채점 결과</h4>';
      qs.forEach(function (q, i) {
        var it = items[i];
        h += '<div class="q"><div class="qn">Q' + (i + 1) + "</div><div class=\"qt\">" + esc(q.q) + "</div>" + (q.sub ? '<div class="qs">' + esc(q.sub) + "</div>" : "") +
          '<div class="res ' + (it.ok ? "ok" : "ng") + '">' + (it.ok ? "⭕ 정답!" : "❌ 내 답: " + esc(it.given || "(없음)") + "<br>정답: <b>" + esc(q.answer) + "</b>") +
          (q.exp ? '<div style="margin-top:4px;color:#3D4B57">' + esc(q.exp) + "</div>" : "") + "</div></div>";
      });
      h += "</div>";
    }
    bd.innerHTML = h;
    bd.scrollTop = 0;
    ft.innerHTML = '<button class="go" type="button">닫기</button>';
    ft.querySelector(".go").onclick = close;
  }

  // ================================================================
  // 4. 시작 — 슬라이드 번호(1 / 9 같은 표시)가 있는 강의 화면에서만 동작
  // ================================================================
  function start() {
    var tries = 0;
    (function wait() {
      if (readCounter() || document.querySelector(".gl-item")) {
        setInterval(tick, 1000);
        window.addEventListener("pagehide", save);
        // 선생님이 노션(또는 시트)을 연결해 둔 경우에만 버튼을 보여 줌
        loadServer().then(function (sv) {
          if (!sv || !sv.ready) return;
          document.body.appendChild(host);
          paintFab();
        });
        return;
      }
      if (++tries < 20) setTimeout(wait, 500); // 준비 중 페이지 등은 버튼을 띄우지 않음
    })();
  }
  if (document.body) start(); else document.addEventListener("DOMContentLoaded", start);
})();
