// admin/import-parser.js — 📚 자료 올리기: 파일 → 글줄 → 문항
// 브라우저(관리 화면)에서 쓰고, 같은 파일을 node 에서도 시험할 수 있게 만듦.
// 밑줄은 ⟪밑줄⟫ 로 표시합니다. (빈칸 ____ 과 섞이지 않게)
(function (root) {
  var CIRC = "①②③④⑤⑥";

  // ---------- 1. 파일 → 글줄 ----------
  function loadScript(src) {
    return new Promise(function (ok, no) {
      if (document.querySelector('script[src="' + src + '"]')) return ok();
      var s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = function () { no(new Error("load " + src)); }; document.head.appendChild(s);
    });
  }
  var LIB = {
    mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
    jszip: "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js",
    pdf: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.min.js",
    pdfWorker: "https://cdn.jsdelivr.net/npm/pdfjs-dist@3.11.174/build/pdf.worker.min.js",
    xlsx: "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js",
    hwp: "https://esm.sh/hwp.js@0.0.3",
  };
  function mergeU(s) { return s.replace(/⟫(\s*)⟪/g, "$1").replace(/⟪(\s*)⟫/g, "$1").replace(/\u00a0/g, " ").replace(/_{2,}/g, "______"); }

  // 워드(.docx): 밑줄 유지
  function htmlToLines(html) {
    var doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
    var out = [];
    doc.querySelectorAll("u").forEach(function (u) { u.replaceWith("⟪" + u.textContent + "⟫"); });
    doc.querySelectorAll("br").forEach(function (b) { b.replaceWith("\n"); });
    doc.querySelectorAll("p, li, h1, h2, h3, h4, h5, h6").forEach(function (p) {
      if (p.querySelector("p, li")) return;
      p.textContent.split("\n").forEach(function (l) { out.push(mergeU(l)); });
    });
    return out;
  }
  async function docxLines(buf) {
    await loadScript(LIB.mammoth);
    var r = await window.mammoth.convertToHtml({ arrayBuffer: buf }, { styleMap: ["u => u"] });
    return htmlToLines(r.value);
  }
  // 한글 .hwpx (zip + XML): 밑줄 유지
  async function hwpxLines(buf) {
    await loadScript(LIB.jszip);
    var zip = await window.JSZip.loadAsync(buf), under = {};
    var head = zip.file(/Contents\/header\.xml$/i)[0];
    if (head) {
      var hx = new DOMParser().parseFromString(await head.async("string"), "application/xml");
      Array.prototype.forEach.call(hx.getElementsByTagNameNS("*", "charPr"), function (c) {
        var u = c.getElementsByTagNameNS("*", "underline")[0];
        if (u && u.getAttribute("type") && u.getAttribute("type") !== "NONE") under[c.getAttribute("id")] = 1;
      });
    }
    var secs = zip.file(/Contents\/section\d+\.xml$/i).sort(function (a, b) { return a.name.localeCompare(b.name, "en", { numeric: true }); });
    var out = [];
    for (var i = 0; i < secs.length; i++) {
      var x = new DOMParser().parseFromString(await secs[i].async("string"), "application/xml");
      Array.prototype.forEach.call(x.getElementsByTagNameNS("*", "p"), function (p) {
        var line = "";
        Array.prototype.forEach.call(p.getElementsByTagNameNS("*", "run"), function (run) {
          var owner = run.parentNode; while (owner && owner.localName !== "p") owner = owner.parentNode;
          if (owner !== p) return; // 표 안의 문단은 그 문단에서 따로 읽음
          var t = Array.prototype.map.call(run.getElementsByTagNameNS("*", "t"), function (n) { return n.textContent; }).join("");
          if (!t) return;
          line += under[run.getAttribute("charPrIDRef")] && t.trim() ? "⟪" + t + "⟫" : t;
        });
        out.push(mergeU(line));
      });
    }
    return out;
  }
  // 한글 .hwp (예전 형식): 글자만 (표 안의 글은 순서가 섞일 수 있음)
  async function hwpLines(buf) {
    var mod = await import(LIB.hwp);
    var parse = mod.parse || (mod.default && mod.default.parse);
    var doc = parse(new Uint8Array(buf), { type: "array" });
    var out = [], seen = new Set();
    function para(p) {
      if (!p || seen.has(p)) return; seen.add(p);
      var t = (p.content || []).map(function (c) { return c && c.type === 0 && typeof c.value === "string" ? c.value : ""; }).join("");
      out.push(t);
      (p.controls || []).forEach(function (c) { walk(c, 0); });
    }
    function walk(o, d) {
      if (!o || typeof o !== "object" || d > 8) return;
      if (Array.isArray(o)) { o.forEach(function (x) { walk(x, d + 1); }); return; }
      if (Array.isArray(o.content) && o.content.length && o.content[0] && Array.isArray(o.content[0].content) && "controls" in o.content[0]) { o.content.forEach(para); return; }
      Object.keys(o).forEach(function (k) { if (k !== "content" || !Array.isArray(o.content) || typeof o.content[0] !== "object") walk(o[k], d + 1); });
    }
    (doc.sections || []).forEach(function (s) { (s.content || []).forEach(para); });
    return out;
  }
  // PDF (글자가 있는 PDF만)
  async function pdfLines(buf) {
    await loadScript(LIB.pdf);
    window.pdfjsLib.GlobalWorkerOptions.workerSrc = LIB.pdfWorker;
    var pdf = await window.pdfjsLib.getDocument({ data: buf }).promise, out = [];
    for (var n = 1; n <= pdf.numPages; n++) {
      var tc = await (await pdf.getPage(n)).getTextContent(), rows = [];
      tc.items.forEach(function (it) {
        var y = Math.round(it.transform[5]), x = it.transform[4];
        var row = rows.find(function (r) { return Math.abs(r.y - y) <= 3; });
        if (!row) { row = { y: y, items: [] }; rows.push(row); }
        row.items.push({ x: x, s: it.str, w: it.width });
      });
      rows.sort(function (a, b) { return b.y - a.y; }).forEach(function (r) {
        r.items.sort(function (a, b) { return a.x - b.x; });
        var line = "", end = null;
        r.items.forEach(function (it) { if (end !== null && it.x - end > 2 && !/\s$/.test(line)) line += " "; line += it.s; end = it.x + it.w; });
        out.push(line);
      });
    }
    return out;
  }
  async function fileLines(file) {
    var buf = await file.arrayBuffer(), ext = (file.name.split(".").pop() || "").toLowerCase();
    if (ext === "docx") return docxLines(buf);
    if (ext === "hwpx") return hwpxLines(buf);
    if (ext === "hwp") return hwpLines(buf);
    if (ext === "pdf") return pdfLines(buf);
    if (ext === "txt") return new TextDecoder().decode(buf).split(/\r?\n/);
    throw new Error("지원하지 않는 파일이에요: ." + ext + " (docx, hwpx, hwp, pdf, xlsx, txt)");
  }

  // ---------- 2. 정답지 읽기: "1. ① 2. ② … 9. has owned …" ----------
  function parseAnswers(lines) {
    var text = " " + lines.join(" ").replace(/\s+/g, " ") + " ", out = {}, n = 1, pos = 0, guard = 0;
    var first = text.search(/\s1\s*[.)]\s/); if (first < 0) return out; pos = first;
    while (guard++ < 400) {
      var re = new RegExp("\\s" + n + "\\s*[.)]\\s", "g"); re.lastIndex = pos;
      var m = re.exec(text); if (!m) break;
      var reN = new RegExp("\\s" + (n + 1) + "\\s*[.)]\\s", "g"); reN.lastIndex = m.index + m[0].length;
      var mN = reN.exec(text);
      out[n] = text.slice(m.index + m[0].length, mN ? mN.index : text.length).trim();
      if (!mN) break;
      pos = mN.index; n++;
    }
    return out;
  }
  // 문제지 끝에 '정답' 부분이 붙어 있으면 떼어 냄
  function splitAnswerSection(lines) {
    for (var i = lines.length - 1; i > 0; i--) {
      if (/^\s*(\[?\s*정답\s*\]?|정답\s*(및|과)\s*해설|answers?|빠른\s*정답)\s*$/i.test(lines[i])) return { q: lines.slice(0, i), a: lines.slice(i + 1) };
    }
    return { q: lines, a: [] };
  }

  // ---------- 3. 문제지 → 문항 ----------
  function circIdx(s) { return CIRC.indexOf(s); }
  function parseQuestions(lines, key) {
    key = key || {};
    var qs = [], groups = [], cur = null, last = 0;
    lines.map(function (l) { return String(l || "").replace(/\s+$/g, ""); }).forEach(function (raw) {
      var L = raw.trim(); if (!L) return;
      var g = L.match(/^\[\s*(\d{1,3})\s*[-~–]\s*(\d{1,3})\s*\]\s*(.*)$/);
      if (g) { groups.push({ from: +g[1], to: +g[2], text: g[3].trim() }); return; }
      var m = L.match(/^(\d{1,3})\s*[.)]\s*(.*)$/);
      if (m && (+m[1] === last + 1 || (!cur && +m[1] <= 3)) && !/[①②③④⑤]/.test(m[2].slice(0, 1))) {
        cur = { no: +m[1], own: m[2].trim(), lines: [], opts: [] }; qs.push(cur); last = +m[1]; return;
      }
      if (!cur) return;
      if (/[①②③④⑤⑥]/.test(L)) {
        var parts = L.split(/(?=[①②③④⑤⑥])/);
        parts.forEach(function (p) {
          var c = circIdx(p.charAt(0));
          if (c >= 0) cur.opts[c] = p.slice(1).trim();
          else if (p.trim()) cur.lines.push(p.trim());
        });
        return;
      }
      cur.lines.push(L);
    });
    return qs.map(function (q) {
      var grp = groups.filter(function (g) { return q.no >= g.from && q.no <= g.to; }).pop();
      var instr = grp ? grp.text : "";
      var out = { no: String(q.no), q: q.own || instr, sub: "", opts: [], type: "mc", answer: "", warn: [] };
      if (q.own && instr && !/고르|쓰시오|완성|배열|고치|바꾸|판단/.test(q.own)) { out.q = instr; q.lines.unshift(q.own); }
      var opts = []; for (var i = 0; i < q.opts.length; i++) if (q.opts[i] !== undefined) opts.push(q.opts[i]);
      var ans = (key[q.no] || "").trim();
      var body = q.lines.slice();
      if (opts.length >= 2) {
        out.opts = opts;
        var cs = (ans.match(/[①②③④⑤⑥]/g) || []).map(circIdx);
        if (cs.length > 1 || /모두/.test(out.q)) { out.type = "multi"; out.anss = cs; out.answer = cs.map(function (c) { return opts[c]; }).join(" / "); }
        else if (cs.length === 1) { out.ans = cs[0]; out.answer = opts[cs[0]]; }
        else { out.ans = -1; if (ans) out.warn.push("정답 '" + ans + "'을 보기 번호로 못 읽었어요"); }
      } else {
        var wl = body.findIndex(function (l) { return /^\(\s*[^()]+\/[^()]+\)$/.test(l) && /배열|순서/.test(out.q + body.join(" ")); });
        if (wl >= 0) {
          out.type = "arrange";
          out.words = body[wl].replace(/^\(\s*|\s*\)$/g, "").split(/\s*\/\s*/).filter(Boolean);
          body.splice(wl, 1);
          out.answer = ans;
        } else {
          out.type = "short"; out.answer = ans;
          var ox = body.findIndex(function (l) { return /\(\s*O\s*\/\s*X\s*\)/i.test(l); });
          if (ox >= 0) { body.splice(ox, 1); out.q += " (맞으면 O, 틀리면 'X, 고친 말'을 쓰세요)"; }
          var fl = -1; for (var j = body.length - 1; j >= 0; j--) if (/_{3,}/.test(body[j])) { fl = j; break; }
          if (fl >= 0) { var fr = body[fl].replace(/^→\s*/, "").replace(/\s*\([^()]*\)\s*$/, "").trim(); if (/[A-Za-z가-힣]/.test(fr.replace(/_+/g, ""))) out.frame = fr; }
        }
      }
      out.sub = body.join("\n");
      if (!out.q) out.warn.push("문제 지시문이 없어요");
      if (!ans) out.warn.push("정답을 못 찾았어요");
      // 난이도: 쉬운 고르기 1 · 어법 판단 2 · 모두 고르기/서술형/배열 3
      var t = out.q + " " + out.sub;
      out.lv = out.type === "mc" ? (/어법|틀린|옳은|개수|쓰임|의미|짝지어/.test(t) ? 2 : 1) : out.type === "short" && out.answer.split(/\s+/).length <= 2 ? 2 : 3;
      out.kind = out.type === "mc" ? "객관식" : out.type === "multi" ? "모두 고르기" : out.type === "arrange" ? "배열" : "서술형";
      return out;
    });
  }

  // ---------- 4. 제목 줄에서 교재·단원 추정 ----------
  function guessMeta(fileName, lines) {
    var base = String(fileName || "").replace(/\.[^.]+$/, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
    var head = (lines || []).slice(0, 8).join(" ");
    var ch = head.match(/CHAPTER\s*0?(\d{1,2})\s*([가-힣A-Za-z ]{0,20})/i) || base.match(/(?:CH|Chapter|Unit|Lesson)\s*0?(\d{1,2})\s*([가-힣A-Za-z ]{0,20})/i);
    var chapter = ch ? "Chapter " + String(ch[1]).padStart(2, "0") + (ch[2] && ch[2].trim() ? " " + ch[2].trim().split(" ")[0] : "") : "";
    var book = base.split(/\s+(?:CH|Chapter|Unit|Lesson)\s*\d/i)[0].replace(/(추가\s*)?문제(지)?|정답(지)?/g, "").trim();
    var unit = /추가\s*문제/.test(head + base) ? "추가 문제" : base;
    var area = /grammar|문법|그래머/i.test(base + head) ? "문법" : /reading|독해|리딩/i.test(base) ? "독해" : /구문|syntax/i.test(base) ? "구문" : /교과서|lesson/i.test(base) ? "교과서" : /voca|어휘|단어/i.test(base) ? "어휘" : "기타";
    return { book: book, chapter: chapter, unit: unit, area: area };
  }

  // ---------- 5. 엑셀 양식 (📚 자료 올리기 양식.xlsx) ----------
  async function xlsxUnits(file) {
    await loadScript(LIB.xlsx);
    var wb = window.XLSX.read(await file.arrayBuffer(), { type: "array" });
    var units = new Map();
    function U(r) {
      var k = [r["교재"], r["단원"], r["과"]].map(function (x) { return String(x || "").trim(); });
      if (!k[0]) return null;
      var id = k.join("|");
      if (!units.has(id)) units.set(id, { meta: { book: k[0], chapter: k[1] || "단원", unit: k[2] || "자료", area: String(r["영역"] || "").trim() || "기타", grade: String(r["학년"] || "").trim(), file: file.name }, questions: [], text: "" });
      return units.get(id);
    }
    var qs = wb.Sheets["문제"] || wb.Sheets[wb.SheetNames[0]];
    window.XLSX.utils.sheet_to_json(qs, { defval: "" }).forEach(function (r, i) {
      var u = U(r); if (!u || !String(r["문제"]).trim()) return;
      var opts = [1, 2, 3, 4, 5].map(function (n) { return String(r["보기" + n] || "").trim(); }).filter(Boolean);
      var t = String(r["유형"] || "").trim(), ans = String(r["정답"] || "").trim();
      var q = { no: String(i + 1), q: String(r["문제"]).trim(), sub: String(r["지문"] || r["지문/예문"] || "").trim(), exp: String(r["해설"] || "").trim(), lv: +r["난이도"] || 2, warn: [] };
      if (/배열/.test(t)) { q.type = "arrange"; q.answer = ans; q.words = String(r["배열 조각"] || r["보기1"] || "").split(/\s*\/\s*/).filter(Boolean); }
      else if (/주관|서술|단답/.test(t) || opts.length < 2) { q.type = "short"; q.answer = ans; q.frame = String(r["답 쓰는 틀"] || "").trim(); }
      else {
        q.opts = opts;
        var nums = (ans.match(/\d|[①②③④⑤]/g) || []).map(function (c) { var k = circIdx(c); return k >= 0 ? k : +c - 1; });
        if (nums.length > 1) { q.type = "multi"; q.anss = nums; } else { q.type = "mc"; q.ans = nums.length ? nums[0] : -1; }
        q.answer = nums.map(function (k) { return opts[k]; }).join(" / ");
      }
      if (!ans) q.warn.push("정답이 비어 있어요");
      u.questions.push(q);
    });
    var tx = wb.Sheets["본문"];
    if (tx) window.XLSX.utils.sheet_to_json(tx, { defval: "" }).forEach(function (r) { var u = U(r); if (u) u.text += (u.text ? "\n\n" : "") + String(r["본문"] || "").trim(); });
    return [...units.values()];
  }

  var API = { fileLines: fileLines, parseAnswers: parseAnswers, splitAnswerSection: splitAnswerSection, parseQuestions: parseQuestions, guessMeta: guessMeta, xlsxUnits: xlsxUnits, htmlToLines: htmlToLines };
  if (typeof module !== "undefined" && module.exports) module.exports = API; else root.ImportParser = API;
})(typeof window !== "undefined" ? window : globalThis);
