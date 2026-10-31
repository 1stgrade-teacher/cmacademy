// tools/build-exam-bank.mjs
// ------------------------------------------------------------------
// 강의 HTML 안의 '확인 문제'를 모두 모아서 월간·분기 평가용 문제은행을 만듭니다.
//   결과: exam-bank/catalog.json        (교재 → 챕터 → 과 목록, 문항 수)
//         exam-bank/books/<교재ID>.json (문항 + 정답 + 해설 + 강의 요약 글)
// 실행:  cd tools && npm install && node build-exam-bank.mjs
// (GitHub에 강의를 올리면 .github/workflows/exam-bank.yml 이 자동으로 다시 만들어요)
// exam-bank 폴더는 사이트에서 직접 열 수 없도록 middleware.js 가 막고, 서버(api/monthly.js)만 읽습니다.
// ------------------------------------------------------------------
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { parse } from "node-html-parser";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const OUT = path.join(ROOT, "exam-bank");
const AREAS = ["문법", "구문", "독해", "교과서"];
const SKIP_DIR = /^(_보관|node_modules|\.git|.*_audio|.*_scripts)$/;
const SKIP_FILE = /^(index|preview|key)\.html$|^_/;

const h = (s, n = 8) => crypto.createHash("sha1").update(s).digest("hex").slice(0, n);
const clean = (s) => String(s || "").replace(/\s+/g, " ").trim();
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) { if (!SKIP_DIR.test(e.name)) walk(path.join(dir, e.name), out); }
    else if (e.name.endsWith(".html")) out.push(path.join(dir, e.name));
  }
  return out;
}

// ---------- 강의 스크립트 속 JSON 읽기 (learn-check.js 와 같은 방식) ----------
function sliceJson(s, start) {
  const open = s[start], close = open === "{" ? "}" : "]";
  let depth = 0, inStr = false;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) { if (c === "\\") i++; else if (c === '"') inStr = false; continue; }
    if (c === '"') inStr = true;
    else if (c === "{" || c === "[") depth++;
    else if (c === "}" || c === "]") { depth--; if (depth === 0) return s.slice(start, i + 1); }
  }
  return "";
}
function lectureData(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let s = m[1];
    if (s.length < 50) continue;
    s = s.replace(/data:[a-z]+\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{60,}/gi, "");
    for (const mark of [/lecturePlayer\([^,]*,\s*\{/g, /var\s+D\s*=\s*\{/g, /var\s+A\s*=\s*\[/g]) {
      let hit;
      while ((hit = mark.exec(s))) {
        const j = sliceJson(s, hit.index + hit[0].length - 1);
        if (!j) continue;
        try { out.push(JSON.parse(j)); } catch (e) { /* 무시 */ }
      }
    }
  }
  return out;
}
function collectStrings(o, key, acc) {
  if (typeof o === "string") acc.push({ k: key, v: o });
  else if (Array.isArray(o)) o.forEach((x) => collectStrings(x, key, acc));
  else if (o && typeof o === "object") for (const p of Object.keys(o)) collectStrings(o[p], p, acc);
  return acc;
}
function htmlText(s) {
  if (!/[<&]/.test(s)) return clean(s);
  return clean(parse("<div>" + s.replace(/<(?!\/?(b|i|u|em|strong|span|small|sup|sub)\b)/gi, " <") + "</div>").textContent);
}
function normAns(s) {
  return String(s || "").toLowerCase().replace(/[‘’`´]/g, "'").replace(/[“”]/g, '"')
    .replace(/\s+([,.!?;:])/g, "$1").replace(/[.!?。]+\s*$/, "").replace(/\s+/g, " ").trim();
}
const BREAK_BEFORE = /^(in|on|at|of|to|with|without|by|for|from|as|into|onto|about|over|under|between|through|during|after|before|among|against|within|upon|toward|towards|that|which|who|whom|whose|when|where|while|because|since|if|although|though|unless|until|whether|and|but|or|than|so|yet)$/i;
function chunkSentence(words) {
  let ch = [], cur = [];
  words.forEach((w, i) => {
    const bare = w.replace(/[^A-Za-z']/g, "");
    if (cur.length && (BREAK_BEFORE.test(bare) || /[,;:]$/.test(words[i - 1]))) { ch.push(cur); cur = []; }
    cur.push(w);
  });
  if (cur.length) ch.push(cur);
  for (let i = 0; i < ch.length; i++) {
    if (ch[i].length === 1 && ch.length > 1) {
      if (i < ch.length - 1) { ch[i + 1] = ch[i].concat(ch[i + 1]); ch.splice(i, 1); i--; }
      else { ch[i - 1] = ch[i - 1].concat(ch[i]); ch.pop(); }
    }
  }
  while (ch.length > 10) {
    let best = 0, bl = 99;
    for (let j = 0; j < ch.length - 1; j++) { const l = ch[j].length + ch[j + 1].length; if (l < bl) { bl = l; best = j; } }
    ch.splice(best, 2, ch[best].concat(ch[best + 1]));
  }
  const out = [];
  ch.forEach((c) => {
    if (c.length > 6) { const k = Math.ceil(c.length / 2); out.push(c.slice(0, k).join(" ")); out.push(c.slice(k).join(" ")); }
    else out.push(c.join(" "));
  });
  return out;
}
function extractQuestions(htmls) {
  const qs = [];
  for (const raw of htmls) {
    if (raw.indexOf("g-q") < 0) continue;
    const d = parse("<div>" + raw + "</div>");
    const qEl = d.querySelector(".g-q");
    if (!qEl) continue;
    const sub = d.querySelector(".g-qs"), kind = d.querySelector(".g-kind"), ansEl = d.querySelector(".g-ans .a"), expEl = d.querySelector(".g-exp");
    const answer = ansEl ? clean(ansEl.textContent) : "";
    const item = {
      kind: kind ? clean(kind.textContent) : "", q: clean(qEl.textContent),
      sub: sub ? sub.textContent.replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim() : "",
      exp: expEl ? clean(expEl.textContent) : "", answer,
    };
    const opts = d.querySelectorAll(".g-opt");
    if (opts.length >= 2) {
      const list = []; let ok = -1;
      opts.forEach((o, i) => {
        const c = parse(o.toString()).firstChild; const b = c.querySelector("b"); if (b) b.remove();
        list.push(clean(c.textContent));
        if (o.getAttribute("data-ok")) ok = i;
      });
      if (ok < 0 && answer) ok = list.findIndex((x) => normAns(x) === normAns(answer));
      if (ok < 0 || list.some((x) => !x)) continue;
      item.type = "mc"; item.opts = list; item.ans = ok; item.answer = list[ok];
    } else {
      if (!/오류|배열|순서/.test(item.kind + " " + item.q)) continue;
      if (!answer || /[가-힣]/.test(answer) || answer.length > 300) continue;
      const one = answer.split(/\s+\/\s+|\s*\|\s*|\s+또는\s+/)[0].trim();
      let words = one.split(/\s+/);
      if (words.length < 3 || words.length > 45) continue;
      if (words.length >= 13) words = chunkSentence(words); // 짧은 문장은 낱말 단위, 긴 문장은 의미 덩어리 단위
      item.type = "arrange"; item.answer = one; item.words = words;
      if (/오류/.test(item.kind + item.q)) { item.fix = 1; item.q = "어구를 알맞은 순서로 터치하여 올바른 문장을 완성하세요."; item.sub = ""; }
      else { item.q = item.q.replace(/(영어로\s*)?(바르게\s*|알맞게\s*)?(다시\s*)?(쓰|써|배열하|나열하)(시오|세요|라)\.?/g, "완성하세요."); item.sub = /[가-힣]/.test(item.sub) ? item.sub.replace(/[A-Za-z][A-Za-z'\s,/]+$/g, "").trim() : ""; }
    }
    // 난이도(1 쉬움 ~ 3 어려움): 배열·오류 수정형, 긴 지문·긴 보기, '심화' 표시 문제는 어렵게 봄
    let lv = item.type === "arrange" ? (item.words.length <= 5 ? 2 : 3) : 1;
    if (item.type === "mc") {
      const avg = item.opts.reduce((a, x) => a + x.length, 0) / item.opts.length;
      if (item.sub.length > 80 || avg > 28) lv++;
      if (/어법|오류|틀린|올바르지|서술|심화|고난도|모두 고르/.test(item.kind + item.q)) lv++;
    }
    item.lv = Math.min(3, lv);
    qs.push(item);
  }
  return qs;
}

// ---------- 교재·챕터·과 이름 ----------
const pages = new Map(); // 파일 경로 → html
const read = (f) => { if (!pages.has(f)) pages.set(f, fs.readFileSync(f, "utf8")); return pages.get(f); };
function h1Of(file) {
  if (!fs.existsSync(file)) return "";
  const m = read(file).match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
  return m ? clean(m[1].replace(/<[^>]+>/g, " ")) : "";
}
function titleOf(file) {
  const m = read(file).match(/<title>([\s\S]*?)<\/title>/i);
  return m ? clean(parse(m[1]).textContent).replace(/\s*[—-]\s*청명학원.*$/, "").replace(/\s+—\s+(point|unit|lesson)[\w-]*$/i, "") : path.basename(file, ".html");
}
// index.html 들의 목록(chapter-head + unit-row)에서 과 이름 읽기
const unitLabel = new Map(), chapterLabel = new Map();
function scanIndex(idx) {
  const dir = path.dirname(idx);
  const root = parse(read(idx));
  root.querySelectorAll(".chapter-block").forEach((blk) => {
    const head = blk.querySelector(".chapter-head");
    const cn = head ? clean([head.querySelector(".num"), head.querySelector(".name")].filter(Boolean).map((x) => x.textContent).join(" ")) : "";
    blk.querySelectorAll("a.unit-row").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (!/\.html$/.test(href) || /^https?:/.test(href)) return;
      const f = path.resolve(dir, decodeURIComponent(href));
      const tag = a.querySelector(".tag"), txt = a.querySelector(".txt");
      const label = clean((tag ? tag.textContent + " " : "") + (txt ? txt.textContent : a.textContent));
      if (label && !unitLabel.has(f)) unitLabel.set(f, label);
      if (cn && !chapterLabel.has(f)) chapterLabel.set(f, cn);
    });
  });
  root.querySelectorAll("a.unit-row").forEach((a) => {
    const href = a.getAttribute("href") || "";
    if (!/\.html$/.test(href) || /^https?:/.test(href)) return;
    const f = path.resolve(dir, decodeURIComponent(href));
    const tag = a.querySelector(".tag"), txt = a.querySelector(".txt");
    const label = clean((tag ? tag.textContent + " " : "") + (txt ? txt.textContent : a.textContent));
    if (label && !unitLabel.has(f)) unitLabel.set(f, label);
  });
}
const GRADE_OF = (area, segs, name) => {
  if (area === "교과서") return segs[1];
  const s = name + " " + segs[1];
  if (/초등|starters|초6|elementary/i.test(s)) return "초등";
  if (/high|고등|수능|solid-advanced|marblered|룩|look/i.test(s)) return "고등";
  return "중등";
};

function bookKey(segs) { return segs[0] === "교과서" ? segs.slice(0, 3) : segs.slice(0, 2); }

const books = new Map();
let fileCount = 0, qCount = 0, aiUnits = 0;
for (const area of AREAS) {
  const base = path.join(ROOT, area);
  if (!fs.existsSync(base)) continue;
  const files = walk(base);
  files.filter((f) => path.basename(f) === "index.html").forEach(scanIndex);
  for (const f of files) {
    if (SKIP_FILE.test(path.basename(f))) continue;
    const html = read(f);
    if (html.indexOf("lecturePlayer") < 0 && html.indexOf("var D") < 0 && html.indexOf("var A") < 0 && html.indexOf("g-q") < 0) continue;
    const strs = [];
    lectureData(html).forEach((d) => collectStrings(d, "", strs));
    const slideHtml = [], texts = [], seen = new Set();
    strs.forEach((x) => {
      if (["u", "hl", "brand", "reveal"].includes(x.k)) return;
      if (/^(audio|https?:|\.\/|\/)/.test(x.v) && x.v.length < 200) return;
      if (/<[a-z]/i.test(x.v)) slideHtml.push(x.v);
      const t = htmlText(x.v);
      if (t.length < 4 || seen.has(t)) return;
      seen.add(t); texts.push(t);
    });
    const qs = extractQuestions(slideHtml);
    // 확인 문제가 없는 강의도 '과'로 넣어 둠 → 시험 때 AI가 강의 내용으로 문제를 보충
    let text = texts.join("\n");
    if (text.length < 200) text = clean(parse(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")).textContent);
    if (!qs.length && text.length < 150) continue;
    const r = rel(f), segs = r.split("/");
    const bk = bookKey(segs);
    if (segs.length <= bk.length) continue;
    const bookPath = bk.join("/");
    if (!books.has(bookPath)) {
      const bName = (h1Of(path.join(ROOT, bookPath, "index.html")) || bk[bk.length - 1]).replace(/\s*-\s*청명학원.*$/, "");
      const name = area === "교과서" ? segs[1] + " " + bName : bName;
      books.set(bookPath, { id: "b" + h(bookPath), area, grade: GRADE_OF(area, segs, name), name, path: bookPath, chapters: new Map(), units: {} });
    }
    const book = books.get(bookPath);
    const rest = segs.slice(bk.length);
    const chKey = rest.length > 1 ? rest[0] : "_";
    const chDir = path.join(ROOT, bookPath, chKey);
    let chName = chapterLabel.get(f) || (chKey === "_" ? "단원" : h1Of(path.join(chDir, "index.html")) || chKey);
    chName = chName.replace(/\s*-\s*청명학원.*$/, "");
    if (chName === chKey) chName = chKey.replace(/^(chapter|unit|part|lesson)\s*0*(\d+)$/i, (_, a, n) => a[0].toUpperCase() + a.slice(1).toLowerCase() + " " + String(n).padStart(2, "0"));
    if (!book.chapters.has(chKey)) book.chapters.set(chKey, { key: chKey, name: chName, units: [] });
    const uId = "u" + h(r);
    const uName = unitLabel.get(f) || (rest.length > 2 ? rest.slice(1, -1).join(" ") + " · " : "") + titleOf(f);
    book.chapters.get(chKey).units.push({ id: uId, name: uName, file: r, n: qs.length, lv: +(qs.reduce((a, q) => a + q.lv, 0) / qs.length).toFixed(1) });
    book.units[uId] = {
      name: uName, chapter: chName, file: r,
      text: text.slice(0, 2500),
      qs: qs.map((q) => Object.assign({ id: h(r + "|" + q.q + "|" + q.sub + "|" + q.answer, 10) }, q)),
    };
    fileCount++; qCount += qs.length; if (!qs.length) aiUnits++;
  }
}

// 정렬(chapter01 < chapter02 …, point2 < point10)
const nat = (a, b) => a.localeCompare(b, "ko", { numeric: true });
fs.rmSync(path.join(OUT, "books"), { recursive: true, force: true });
fs.mkdirSync(path.join(OUT, "books"), { recursive: true });
const catalog = [];
for (const b of [...books.values()].sort((x, y) => AREAS.indexOf(x.area) - AREAS.indexOf(y.area) || nat(x.path, y.path))) {
  const chapters = [...b.chapters.values()].sort((x, y) => nat(x.key, y.key)).map((c) => ({ key: c.key, name: c.name, units: c.units.sort((x, y) => nat(x.file, y.file)).map(({ file, ...u }) => u) }));
  const n = chapters.reduce((a, c) => a + c.units.reduce((s, u) => s + u.n, 0), 0);
  catalog.push({ id: b.id, area: b.area, grade: b.grade, name: b.name, path: b.path, n, chapters });
  fs.writeFileSync(path.join(OUT, "books", b.id + ".json"), JSON.stringify({ id: b.id, name: b.name, units: b.units }));
}
fs.writeFileSync(path.join(OUT, "catalog.json"), JSON.stringify({ built: new Date().toISOString(), books: catalog }, null, 1));
console.log(`문제은행: 교재 ${catalog.length}권 · 강의 ${fileCount}개 · 문항 ${qCount}개 (문항 없는 강의 ${aiUnits}개 → AI 보충)`);
