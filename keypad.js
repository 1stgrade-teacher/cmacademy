// keypad.js — ⌨️ 자체 키보드 (휴대폰 키보드의 자동완성·단어 추천을 막아요)
// ------------------------------------------------------------------
// 원작: 김태호 학생의 「단어 시험 · 이미지 키보드」 (한글 두벌식 조합·쌍자음·기호 배열)를 시험 화면용으로 옮겼어요.
// 쓰는 법:  KeyPad.attach(rootElement, { langOf: function (inputEl) { return "ko" | "en"; } })
//   rootElement 안의 답 칸(input.sa, 글자 칸 .lbx input)을 누르면 휴대폰 키보드 대신 화면 아래 키보드가 떠요.
//   글자를 누르면 칸에 글자를 넣고 input 이벤트를 보내요 → 시험 화면의 저장·글자 칸 이동은 원래대로 동작해요.
//   휴대폰·태블릿(손가락 터치 화면)에서만 켜져요. 컴퓨터는 실제 키보드로 써요.
// ------------------------------------------------------------------
(function (root) {
  "use strict";
  var doc = root.document;
  var CHO = "ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ".split(""), JUNG = "ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ".split(""), JONG = [""].concat("ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ".split(""));
  var JUNG_C = { "ㅗㅏ": "ㅘ", "ㅗㅐ": "ㅙ", "ㅗㅣ": "ㅚ", "ㅜㅓ": "ㅝ", "ㅜㅔ": "ㅞ", "ㅜㅣ": "ㅟ", "ㅡㅣ": "ㅢ" };
  var JONG_C = { "ㄱㅅ": "ㄳ", "ㄴㅈ": "ㄵ", "ㄴㅎ": "ㄶ", "ㄹㄱ": "ㄺ", "ㄹㅁ": "ㄻ", "ㄹㅂ": "ㄼ", "ㄹㅅ": "ㄽ", "ㄹㅌ": "ㄾ", "ㄹㅍ": "ㄿ", "ㄹㅎ": "ㅀ", "ㅂㅅ": "ㅄ" };
  var JONG_S = { "ㄳ": ["ㄱ", "ㅅ"], "ㄵ": ["ㄴ", "ㅈ"], "ㄶ": ["ㄴ", "ㅎ"], "ㄺ": ["ㄹ", "ㄱ"], "ㄻ": ["ㄹ", "ㅁ"], "ㄼ": ["ㄹ", "ㅂ"], "ㄽ": ["ㄹ", "ㅅ"], "ㄾ": ["ㄹ", "ㅌ"], "ㄿ": ["ㄹ", "ㅍ"], "ㅀ": ["ㄹ", "ㅎ"], "ㅄ": ["ㅂ", "ㅅ"] };
  var JUNG_S = { "ㅘ": ["ㅗ", "ㅏ"], "ㅙ": ["ㅗ", "ㅐ"], "ㅚ": ["ㅗ", "ㅣ"], "ㅝ": ["ㅜ", "ㅓ"], "ㅞ": ["ㅜ", "ㅔ"], "ㅟ": ["ㅜ", "ㅣ"], "ㅢ": ["ㅡ", "ㅣ"] };
  var KO = { q: "ㅂ", w: "ㅈ", e: "ㄷ", r: "ㄱ", t: "ㅅ", y: "ㅛ", u: "ㅕ", i: "ㅑ", o: "ㅐ", p: "ㅔ", a: "ㅁ", s: "ㄴ", d: "ㅇ", f: "ㄹ", g: "ㅎ", h: "ㅗ", j: "ㅓ", k: "ㅏ", l: "ㅣ", z: "ㅋ", x: "ㅌ", c: "ㅊ", v: "ㅍ", b: "ㅠ", n: "ㅜ", m: "ㅡ" };
  var KO_SH = { q: "ㅃ", w: "ㅉ", e: "ㄸ", r: "ㄲ", t: "ㅆ", o: "ㅒ", p: "ㅖ" };
  var ROWS = ["qwertyuiop".split(""), "asdfghjkl".split(""), ["shift"].concat("zxcvbnm".split(""), ["back"])];
  var SYM = ["1234567890".split(""), ["@", "#", "$", "_", "&", "-", "+", "(", ")", "/"], ["*", '"', "'", ":", ";", "!", "?", "~", "back"]];

  var css = ".kpd{position:fixed;left:0;right:0;bottom:0;z-index:60;background:#E9EDF2;border-top:1px solid #D3D9E0;padding:6px 4px calc(6px + env(safe-area-inset-bottom));box-shadow:0 -6px 18px rgba(20,30,50,.10);user-select:none;-webkit-user-select:none;touch-action:manipulation}" +
    ".kpd[hidden]{display:none}.kpd .kbar{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 6px 6px;font-size:11.5px;color:#6B7280}" +
    ".kpd .kbar b{color:#2F5D7C;font-weight:800}.kpd .kbar button{border:0;background:#fff;border-radius:8px;padding:5px 10px;font:700 12px inherit;color:#334155}" +
    ".kpd .krow{display:flex;gap:5px;margin:0 auto 6px;max-width:640px}.kpd .krow:last-child{margin-bottom:0}" +
    ".kpd .k{flex:1 1 0;min-width:0;height:clamp(42px,11vw,50px);border:1px solid #D7DBE2;border-radius:7px;background:#fff;box-shadow:0 1px 0 #C9CFD8;font:700 clamp(16px,4.6vw,20px) inherit;color:#1C2430;padding:0;display:flex;align-items:center;justify-content:center;-webkit-tap-highlight-color:transparent}" +
    ".kpd .k:active{transform:translateY(1px);background:#F1F4F8}.kpd .k.fn{background:#D5DCE5;font-size:clamp(13px,3.6vw,15px)}.kpd .k.on,.kpd .k.ent{background:#4A6A99;border-color:#4A6A99;color:#fff}" +
    ".kpd .w14{flex:1.45 1 0}.kpd .w12{flex:1.2 1 0}.kpd .sp{flex:4.4 1 0}.kpd .half{flex:.5 1 0;visibility:hidden}" +
    "input.kpd-on{caret-color:transparent}input.kpd-cur{box-shadow:0 0 0 3px rgba(74,106,153,.35)!important;border-color:#4A6A99!important}";

  var st = { lang: "en", layer: "abc", shift: false, el: null, base: "", c: { cho: "", jung: "", jong: "" }, opts: {}, pad: null, roots: [] };

  function compose(c) {
    if (c.cho && c.jung) { var ci = CHO.indexOf(c.cho), ji = JUNG.indexOf(c.jung), ti = c.jong ? JONG.indexOf(c.jong) : 0; if (ci >= 0 && ji >= 0 && ti >= 0) return String.fromCharCode(0xAC00 + ci * 588 + ji * 28 + ti); }
    return (c.cho || "") + (c.jung || "") + (c.jong || "");
  }
  function isBox(el) { return !!(el && el.closest && el.closest(".lbx")); }
  function emit(el) { el.dispatchEvent(new Event("input", { bubbles: true })); }
  function key(el, k) { el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true })); }
  // 일반 칸: 확정 글(base) + 조합 중인 글자를 칸에 보여 줘요
  function show() { if (!st.el || isBox(st.el)) return; st.el.value = st.base + compose(st.c); emit(st.el); }
  function flush() { var t = compose(st.c); st.c = { cho: "", jung: "", jong: "" }; if (t) st.base += t; }
  function maxLen() { var m = st.el && +st.el.getAttribute("maxlength"); return m > 0 ? m : 200; }

  function jamo(j) {
    var c = st.c, v = JUNG.indexOf(j) >= 0;
    if (!v) {
      if (!c.cho && !c.jung) c.cho = j;
      else if (c.cho && !c.jung) { flush(); st.c.cho = j; }
      else if (!c.jong) { if (JONG.indexOf(j) > 0) c.jong = j; else { flush(); st.c.cho = j; } }
      else { var cb = JONG_C[c.jong + j]; if (cb) c.jong = cb; else { flush(); st.c.cho = j; } }
    } else {
      if (!c.jung) c.jung = j;
      else if (!c.jong) { var cj = JUNG_C[c.jung + j]; if (cj) c.jung = cj; else { flush(); st.c.jung = j; } }
      else { var pr = JONG_S[c.jong], mv; if (pr) { c.jong = pr[0]; mv = pr[1]; } else { mv = c.jong; c.jong = ""; } flush(); st.c.cho = mv; st.c.jung = j; }
    }
    show();
  }
  function typeChar(ch) {
    var el = st.el; if (!el) return;
    if (isBox(el)) { if (/^[A-Za-z]$/.test(ch)) { el.value = ch; emit(el); } return; } // 글자 칸: 알파벳 한 글자 → 다음 칸으로 (글자 칸이 알아서 옮겨요)
    flush(); if ((st.base + ch).length > maxLen()) return; st.base += ch; show();
  }
  function back() {
    var el = st.el; if (!el) return;
    if (isBox(el)) { el.value = ""; emit(el); return; } // 비었으면 글자 칸이 앞 칸으로 옮겨요
    var c = st.c;
    if (c.cho || c.jung || c.jong) {
      if (c.jong) { var p = JONG_S[c.jong]; c.jong = p ? p[0] : ""; } else if (c.jung) { var q = JUNG_S[c.jung]; c.jung = q ? q[0] : ""; } else c.cho = "";
    } else if (st.base) st.base = Array.from(st.base).slice(0, -1).join("");
    show();
  }
  function space() { var el = st.el; if (!el) return; if (isBox(el)) { key(el, " "); return; } typeChar(" "); }
  function enter() {
    var el = st.el; if (!el) return;
    if (isBox(el)) key(el, "Enter");
    flush(); show(); hide();
  }

  function label(k) {
    if (k === "shift") return "⇧"; if (k === "back") return "⌫"; if (k === "space") return st.lang === "ko" && st.layer === "abc" ? "띄어쓰기" : "space";
    if (k === "enter") return "완료"; if (k === "lang") return st.lang === "ko" ? "A" : "한"; if (k === "layer") return st.layer === "abc" ? "?123" : "ABC";
    if (/^[a-z]$/.test(k)) return st.lang === "ko" ? (st.shift && KO_SH[k]) || KO[k] : st.shift ? k.toUpperCase() : k;
    return k;
  }
  function build() {
    var p = st.pad, rows = st.layer === "abc" ? ROWS : SYM, h = '<div class="kbar"><span>⌨️ <b>' + (st.layer !== "abc" ? "숫자·기호" : st.lang === "ko" ? "한글" : "English") + "</b> · 자동완성 없는 키보드 · 만든 학생 김태호</span><button type=\"button\" data-k=\"enter\">⌄ 닫기</button></div>";
    rows.forEach(function (r, ri) {
      h += '<div class="krow">' + (st.layer === "abc" && ri === 1 ? '<span class="k half"></span>' : "");
      r.forEach(function (k) { h += '<button type="button" class="k' + (k === "shift" || k === "back" ? " fn w14" : "") + (k === "shift" && st.shift ? " on" : "") + '" data-k="' + k + '" aria-label="' + (k === "back" ? "지우기" : k === "shift" ? "쌍자음·대문자" : label(k)) + '">' + label(k) + "</button>"; });
      h += (st.layer === "abc" && ri === 1 ? '<span class="k half"></span>' : "") + "</div>";
    });
    h += '<div class="krow"><button type="button" class="k fn w12" data-k="layer">' + label("layer") + '</button>' + (st.opts.noKo ? "" : '<button type="button" class="k fn w12" data-k="lang" aria-label="한영 전환">' + label("lang") + "</button>") +
      '<button type="button" class="k" data-k=",">,</button><button type="button" class="k sp" data-k="space">' + label("space") + '</button><button type="button" class="k" data-k=".">.</button><button type="button" class="k ent w12" data-k="enter">' + label("enter") + "</button></div>";
    p.innerHTML = h;
  }
  function press(k) {
    if (k === "back") return back(); if (k === "space") return space(); if (k === "enter") return enter();
    if (k === "layer") { flush(); st.layer = st.layer === "abc" ? "sym" : "abc"; st.shift = false; return build(); }
    if (k === "lang") { flush(); show(); st.lang = st.lang === "ko" ? "en" : "ko"; st.shift = false; return build(); }
    if (k === "shift") { st.shift = !st.shift; return build(); }
    if (/^[a-z]$/.test(k) && st.layer === "abc") {
      if (st.lang === "ko" && !isBox(st.el)) jamo((st.shift && KO_SH[k]) || KO[k]); else typeChar(st.shift ? k.toUpperCase() : k);
      if (st.shift) { st.shift = false; build(); }
      return;
    }
    typeChar(k);
  }

  function ensurePad() {
    if (st.pad) return st.pad;
    var s = doc.createElement("style"); s.textContent = css; doc.head.appendChild(s);
    var p = doc.createElement("div"); p.className = "kpd"; p.hidden = true; p.setAttribute("role", "group"); p.setAttribute("aria-label", "시험용 키보드");
    // 누를 때 칸의 선택(포커스)이 풀리지 않게 pointerdown 에서 처리해요
    // (키보드를 다시 그리면 눌린 버튼이 사라져서, 바깥을 누른 것으로 착각해 닫히지 않게 여기서 멈춰요)
    p.addEventListener("pointerdown", function (e) { var b = e.target.closest("[data-k]"); e.preventDefault(); e.stopPropagation(); if (b) press(b.getAttribute("data-k")); });
    p.addEventListener("click", function (e) { e.preventDefault(); });
    doc.body.appendChild(p); st.pad = p; return p;
  }
  function setTarget(el) {
    if (st.el === el) return;
    if (st.el) { if (!isBox(st.el)) { flush(); st.el.value = st.base; emit(st.el); } st.el.classList.remove("kpd-cur"); }
    st.el = el; st.c = { cho: "", jung: "", jong: "" }; st.base = isBox(el) ? "" : el.value || "";
    el.classList.add("kpd-cur");
    var want = isBox(el) ? "en" : (st.opts.langOf ? st.opts.langOf(el) : "en");
    if (want !== st.lang || st.layer !== "abc") { st.lang = want; st.layer = "abc"; st.shift = false; build(); }
  }
  function open(el) {
    ensurePad(); setTarget(el);
    if (st.pad.hidden) { st.pad.hidden = false; build(); }
    doc.body.style.paddingBottom = (st.pad.offsetHeight + 16) + "px";
    var r = el.getBoundingClientRect(), top = root.innerHeight - st.pad.offsetHeight - 12;
    if (r.bottom > top || r.top < 60) root.scrollBy({ top: r.bottom - top + 40, behavior: "smooth" });
  }
  function hide() {
    if (!st.pad || st.pad.hidden) return;
    st.pad.hidden = true; doc.body.style.paddingBottom = "";
    if (st.el) { st.el.classList.remove("kpd-cur"); try { st.el.blur(); } catch (e) {} }
    st.el = null;
  }
  // 손가락 터치 화면만 (컴퓨터·마우스는 실제 키보드)
  function touchOnly() { try { return root.matchMedia("(pointer: coarse)").matches || "ontouchstart" in root; } catch (e) { return false; } }

  function prep(el) {
    if (el.dataset.kpd) return; el.dataset.kpd = "1";
    el.setAttribute("readonly", "readonly"); el.setAttribute("inputmode", "none"); el.classList.add("kpd-on");
    el.addEventListener("focus", function () { if (!el.disabled) open(el); });
    el.addEventListener("pointerdown", function () { if (!el.disabled) { if (doc.activeElement !== el) el.focus(); open(el); } });
  }
  function attach(rootEl, opts) {
    if (!rootEl || !touchOnly()) return false;
    st.opts = opts || {};
    Array.prototype.forEach.call(rootEl.querySelectorAll("input.sa, .lbx input"), prep);
    if (st.roots.indexOf(rootEl) < 0) {
      st.roots.push(rootEl);
      doc.addEventListener("pointerdown", function (e) { if (!st.pad || st.pad.hidden) return; if (st.pad.contains(e.target) || (e.target.closest && e.target.closest(".kpd-on"))) return; hide(); });
    }
    return true;
  }
  root.KeyPad = { attach: attach, hide: hide, _t: { compose: compose } };
})(typeof window !== "undefined" ? window : this);
