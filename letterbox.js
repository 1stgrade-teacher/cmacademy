// letterbox.js — 🔤 글자 칸 입력 (휴대폰 키보드의 단어 추천·자동완성 방지)
// ------------------------------------------------------------------
// 글자마다 칸 하나씩 따로 입력해요. 키보드는 칸마다 새 입력창으로 보기 때문에 한 글자짜리 추천밖에 못 띄우고,
// 추천 단어를 눌러도 칸에는 한 글자만 들어가요.
//
//   var lb = LetterBox.create(hostElement, "l___ ___", { onChange: fn, onEnter: fn, answer: "look for" });
//   shape : "_" = 학생이 쓰는 칸, 공백 = 단어 사이 간격, 그 밖의 글자(첫 글자 힌트·하이픈·아포스트로피)는 미리 채워 둔 칸
//   lb.value()     → "lo_k f_r" (빈 칸은 _ 로. 모양 글과 글자 위치가 같아요)
//   lb.text()      → 빈 칸을 뺀 글          lb.typed() → 학생이 쓴 글자 수       lb.complete() → 모든 칸이 찼는지
//   lb.setValue(s) → value() 로 저장해 둔 글을 되살리기
//   lb.reveal()    → 다음 빈 칸 하나를 정답 글자로 채우기 (answer 필요)
//   lb.mark(true|false) · lb.disable() · lb.focus() · lb.shake()
//   LetterBox.shapeOf("look for", true) → "l___ ___"  (두 번째 값이 true 면 첫 글자는 채워서)
// ------------------------------------------------------------------
(function (root) {
  "use strict";
  var Z = "​"; // 빈 칸 표시용 보이지 않는 글자: 빈 칸에서 지우기(←)를 눌러도 입력 이벤트가 생겨 앞 칸으로 돌아갈 수 있어요
  var css = ".lbx{display:flex;flex-wrap:wrap;justify-content:center;gap:8px 16px;margin:2px auto}" +
    ".lbw{display:inline-flex;gap:4px}" +
    ".lbx input,.lbx .lbf{box-sizing:border-box;width:clamp(24px,calc((100vw - 90px) / 13),40px);height:clamp(36px,10vw,46px);border-radius:10px;text-align:center;font-weight:800;font-size:clamp(17px,5vw,23px);font-family:inherit;padding:0;text-transform:lowercase}" +
    ".lbx input{border:2px solid #DCE4E6;background:#fff;color:#16302F;caret-color:#0A7E80;-webkit-appearance:none;appearance:none}" +
    ".lbx input:focus{outline:none;border-color:#0A7E80;box-shadow:0 0 0 3px rgba(10,126,128,.18)}" +
    ".lbx input.on{border-color:#7FBFC0;background:#F2FAFA}" +
    ".lbx .lbf{display:inline-flex;align-items:center;justify-content:center;background:#E3F3F3;color:#0A5F61;border:2px solid #E3F3F3}" +
    ".lbx.ok input,.lbx.ok .lbf{border-color:#2E9E5B;background:#F1FBF5;color:#1E6B3E}" +
    ".lbx.no input,.lbx.no .lbf{border-color:#D2554A;background:#FFF5F4;color:#A2342A}" +
    ".lbx input.rv{background:#FFF7E6;border-color:#E3B341;color:#7A4B00}" +
    "@keyframes lbshake{25%{transform:translateX(-4px)}75%{transform:translateX(4px)}}.lbx.shake{animation:lbshake .3s}";
  function addCss() {
    if (root.document.getElementById("lbx-css")) return;
    var s = root.document.createElement("style"); s.id = "lbx-css"; s.textContent = css; root.document.head.appendChild(s);
  }

  // 단어 → 모양 글. 알파벳은 "_", 하이픈·아포스트로피는 그대로, 첫 글자는 showFirst 면 그대로
  function shapeOf(word, showFirst) {
    var first = true;
    return String(word || "").trim().replace(/\s+/g, " ").split("").map(function (c) {
      if (c === " " || !/[A-Za-z]/.test(c)) return c;
      if (first) { first = false; return showFirst ? c : "_"; }
      return "_";
    }).join("");
  }

  function create(host, shape, o) {
    o = o || {}; addCss();
    var wrap = root.document.createElement("div"); wrap.className = "lbx"; wrap.setAttribute("role", "group"); wrap.setAttribute("aria-label", "철자를 한 칸에 한 글자씩 쓰세요");
    var seq = [], boxes = [], answer = String(o.answer || "").trim().replace(/\s+/g, " ");
    String(shape || "").trim().split(" ").forEach(function (wd, wi) {
      if (wi > 0) seq.push({ sp: true });
      var g = root.document.createElement("span"); g.className = "lbw";
      wd.split("").forEach(function (c) {
        if (c === "_") {
          var el = root.document.createElement("input"); el.type = "text"; el.value = Z; el.dataset.had = "0"; el.dataset.keep = "";
          el.setAttribute("autocomplete", "off"); el.setAttribute("autocorrect", "off"); el.setAttribute("autocapitalize", "none"); el.setAttribute("spellcheck", "false");
          el.setAttribute("inputmode", "text"); el.setAttribute("enterkeyhint", "next"); el.setAttribute("aria-label", "글자 칸"); el.setAttribute("data-lpignore", "true");
          g.appendChild(el); var cell = { el: el, i: boxes.length }; boxes.push(cell); seq.push(cell);
        } else { var f = root.document.createElement("span"); f.className = "lbf"; f.textContent = c; g.appendChild(f); seq.push({ fixed: c }); }
      });
      wrap.appendChild(g);
    });
    host.appendChild(wrap);

    function letter(b) { return b.el.value.replace(/​/g, ""); }
    function put(b, ch) { b.el.value = ch || Z; b.el.dataset.had = ch ? "1" : "0"; b.el.dataset.keep = ch || ""; b.el.classList.toggle("on", !!ch); if (!ch) b.el.classList.remove("rv"); }
    function caretEnd(el) { try { var n = el.value.length; el.setSelectionRange(n, n); } catch (e) {} }
    function focusBox(b) { if (!b) return; b.el.focus(); caretEnd(b.el); }
    function nextEmpty() { for (var k = 0; k < boxes.length; k++) if (!letter(boxes[k])) return boxes[k]; return null; }
    function changed() { if (o.onChange) o.onChange(api.value()); }

    boxes.forEach(function (b, bi) {
      var el = b.el;
      el.addEventListener("focus", function () { setTimeout(function () { caretEnd(el); }, 0); });
      el.addEventListener("click", function () { caretEnd(el); });
      el.addEventListener("input", function (ev) {
        if (ev.isComposing) return; // 한글 등 조합 중에는 끝난 뒤에 처리
        var v = el.value.replace(/​/g, ""), had = el.dataset.had === "1";
        if (!v) { // 지웠어요
          put(b, "");
          if (!had && bi > 0) { put(boxes[bi - 1], ""); focusBox(boxes[bi - 1]); } // 빈 칸에서 한 번 더 지우면 앞 칸으로
          else caretEnd(el);
          changed(); return;
        }
        var m = v.match(/[A-Za-z]/g);
        if (!m) { put(b, el.dataset.keep); caretEnd(el); return; } // 알파벳이 아니면 무시
        put(b, m[m.length - 1].toLowerCase());
        if (bi + 1 < boxes.length) focusBox(boxes[bi + 1]); else caretEnd(el);
        changed();
      });
      el.addEventListener("compositionend", function () { el.dispatchEvent(new Event("input", { bubbles: true })); });
      el.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") { ev.preventDefault(); if (o.onEnter) o.onEnter(); }
        else if (ev.key === "ArrowLeft" && bi > 0) { ev.preventDefault(); focusBox(boxes[bi - 1]); }
        else if (ev.key === "ArrowRight" && bi + 1 < boxes.length) { ev.preventDefault(); focusBox(boxes[bi + 1]); }
        else if (ev.key === " ") { ev.preventDefault(); if (bi + 1 < boxes.length) focusBox(boxes[bi + 1]); } // 띄어쓰기 키는 다음 칸으로
      });
      el.addEventListener("paste", function (ev) { // 붙여넣으면 현재 칸부터 한 글자씩 나눠 넣어요
        ev.preventDefault();
        var t = ((ev.clipboardData || root.clipboardData).getData("text") || "").replace(/[^A-Za-z]/g, "").toLowerCase(), k = bi;
        for (var n = 0; n < t.length && k < boxes.length; n++, k++) put(boxes[k], t[n]);
        focusBox(boxes[Math.min(k, boxes.length - 1)]); changed();
      });
    });

    var api = {
      el: wrap, count: boxes.length,
      value: function () { return seq.map(function (c) { return c.sp ? " " : c.fixed != null ? c.fixed : (letter(c) || "_"); }).join(""); },
      text: function () { return api.value().replace(/_/g, ""); },
      typed: function () { return boxes.filter(function (b) { return letter(b); }).length; },
      complete: function () { return boxes.every(function (b) { return letter(b); }); },
      setValue: function (s) { // value() 로 저장한 글 되살리기 (글자 위치가 모양 글과 같아요)
        s = String(s || "");
        seq.forEach(function (c, p) { if (c.el) { var ch = s.charAt(p); put(c, /[A-Za-z]/.test(ch) ? ch.toLowerCase() : ""); } });
      },
      reveal: function () { // 힌트: 첫 빈 칸 하나를 정답 글자로 채움
        var b = nextEmpty(); if (!b || !answer) return false;
        var p = seq.indexOf(b), ch = answer.charAt(p); if (!/[A-Za-z]/.test(ch)) return false;
        put(b, ch.toLowerCase()); b.el.classList.add("rv"); changed(); focusBox(nextEmpty() || b); return true;
      },
      focus: function () { focusBox(nextEmpty() || boxes[boxes.length - 1]); },
      shake: function () { wrap.classList.remove("shake"); void wrap.offsetWidth; wrap.classList.add("shake"); },
      mark: function (ok) { wrap.classList.remove("ok", "no"); wrap.classList.add(ok ? "ok" : "no"); },
      disable: function () { boxes.forEach(function (b) { b.el.disabled = true; b.el.blur(); }); },
    };
    if (o.value) api.setValue(o.value);
    return api;
  }

  root.LetterBox = { create: create, shapeOf: shapeOf };
})(typeof window !== "undefined" ? window : this);
