// api/_vocab.js — 단어장(단어·뜻·예문·영영정의·동의어·반의어) → 여러 유형의 단어 문항
// ------------------------------------------------------------------
// 단어 한 줄: { w:"attract", pos:"동사", m:"끌어당기다", ex:"Magnets [attract] iron.", exk:"자석은 철을 끌어당긴다.", def:"to pull something toward itself", syn:"draw, pull", ant:"repel" }
//  - 예문에서 시험 볼 낱말은 [ ]로 감싸 두면 정확해요. 없으면 단어와 그 변화형(-s, -ed, -ing …)을 찾아요.
// 유형(vt)
//   meaning 단어 → 뜻 고르기            spell  뜻 → 철자 쓰기
//   blankmc 예문 빈칸 고르기             blank  예문 빈칸 쓰기
//   def     영영 풀이 → 단어 고르기       paren  괄호 속 문맥에 맞는 단어 고르기
//   synmc   동의어·반의어 → 단어 고르기   synw   동의어·반의어 → 단어 쓰기
//   mwrite  단어 → 우리말 뜻 쓰기: 단어장 뜻과 같으면 바로 정답, 다르면 채점 때 AI가 사전에 있는 뜻·비슷한 뜻인지 확인
// ------------------------------------------------------------------
const crypto = require("crypto");

const VTYPES = [
  { id: "meaning", label: "뜻 고르기", need: "뜻" },
  { id: "spell", label: "철자 쓰기 (뜻 보고)", need: "뜻" },
  { id: "mwrite", label: "뜻 쓰기 (AI가 비슷한 뜻도 채점)", need: "뜻" },
  { id: "blankmc", label: "예문 빈칸 고르기", need: "예문" },
  { id: "blank", label: "예문 빈칸 쓰기", need: "예문" },
  { id: "def", label: "영영 풀이 → 단어 고르기", need: "영영정의" },
  { id: "paren", label: "괄호 속 문맥에 맞는 단어", need: "예문" },
  { id: "synmc", label: "동의어·반의어 → 단어 고르기", need: "동의어/반의어" },
  { id: "synw", label: "동의어·반의어 → 단어 쓰기", need: "동의어/반의어" },
];
const VT_IDS = VTYPES.map((t) => t.id);

const h = (s, n) => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, n || 10);
const clip = (s, n) => { s = s == null ? "" : String(s).replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n) : s; };
function rngOf(seed) { let x = parseInt(h(seed, 8), 16) || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return (x >>> 0) / 4294967296; }; }
function shuffle(a, r) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const BL = "________";

// 단어 한 줄 다듬기 (엑셀·AI가 준 값)
function cleanWord(x) {
  const w = clip(x && (x.w || x.word), 60);
  if (!w || !/[A-Za-z]/.test(w)) return null;
  return {
    w, pos: clip(x.pos, 20), m: clip(x.m || x.meaning, 120), ex: clip(x.ex, 300), exk: clip(x.exk, 200),
    def: clip(x.def, 240), syn: clip(x.syn, 120), ant: clip(x.ant, 120),
  };
}
const mainForm = (w) => w.split(/\s*[\/,;]\s*/)[0].trim(); // "colour/color" → colour
const altForms = (w) => w.split(/\s*[\/,;]\s*/).map((x) => x.trim()).filter(Boolean);

// 아주 단순한 변화형: 빈칸 보기의 모양을 정답과 맞춰 정답이 티 나지 않게
function inflect(base, like, ofBase) {
  const b = base.toLowerCase(), t = like.toLowerCase(), o = ofBase.toLowerCase();
  if (t === o) return base;
  const suf = t.startsWith(o) ? t.slice(o.length) : t.startsWith(o.replace(/e$/, "")) ? t.slice(o.replace(/e$/, "").length) : t.startsWith(o.replace(/y$/, "i")) ? "i" + t.slice(o.length) : null;
  if (suf == null || b.includes(" ")) return base;
  const cons = /[^aeiou]$/;
  if (/^(s|es)$/.test(suf)) return /(s|x|z|ch|sh|o)$/.test(b) ? base + "es" : /[^aeiou]y$/.test(b) ? base.slice(0, -1) + "ies" : base + "s";
  if (/^i?es$/.test(suf)) return /[^aeiou]y$/.test(b) ? base.slice(0, -1) + "ies" : base + "s";
  if (/^(e?d|ied|[bcdfgklmnprstvz]ed)$/.test(suf)) return /e$/.test(b) ? base + "d" : /[^aeiou]y$/.test(b) ? base.slice(0, -1) + "ied" : base + "ed";
  if (/ing$/.test(suf)) return /ie$/.test(b) ? base.slice(0, -2) + "ying" : /[^e]e$/.test(b) ? base.slice(0, -1) + "ing" : base + "ing";
  if (/^(er|r)$/.test(suf)) return /e$/.test(b) ? base + "r" : base + "er";
  if (/^(est|st)$/.test(suf)) return /e$/.test(b) ? base + "st" : base + "est";
  if (suf === "ly") return /y$/.test(b) ? base.slice(0, -1) + "ily" : base + "ly";
  return cons.test(b) || true ? base : base;
}
// 예문에서 시험 볼 낱말 찾기 → { sent: 빈칸 문장, token: 실제 들어간 모양, plain: 괄호 없는 원래 문장 }
function findToken(e) {
  if (!e.ex) return null;
  const mk = e.ex.match(/\[([^\]]{1,60})\]|\*([^*]{1,60})\*|__([^_]{1,60})__/);
  if (mk) {
    const token = (mk[1] || mk[2] || mk[3]).trim(), plain = e.ex.replace(mk[0], token).replace(/[\[\]*]/g, "");
    return { token, sent: e.ex.replace(mk[0], BL).replace(/[\[\]*]/g, ""), plain };
  }
  for (const f of altForms(e.w)) {
    const parts = f.toLowerCase().split(/\s+/), base = parts[0], tail = parts.slice(1).join(" "), stem = base.replace(/e$/, ""), ystem = base.replace(/y$/, "i");
    let forms = [...new Set([base, base + "s", base + "es", base + "d", base + "ed", base + "ing", stem + "ing", stem + "ed", ystem + "es", ystem + "ed", base + base.slice(-1) + "ed", base + base.slice(-1) + "ing", base + "ly", base + "er", base + "est"])];
    if (tail) forms = forms.map((x) => x + " " + tail); // look for → looking for, looked for …
    forms.sort((a, c) => c.length - a.length);
    const re = new RegExp("(^|[^A-Za-z])(" + forms.map(esc).join("|") + ")(?![A-Za-z])", "i");
    const m = e.ex.match(re);
    if (m) { const token = m[2]; return { token, sent: e.ex.replace(re, (all, pre) => pre + BL), plain: e.ex }; }
  }
  return null;
}
const posK = (p) => (/동|verb|^v/i.test(p) ? "v" : /명|noun|^n/i.test(p) ? "n" : /형|adj|^a/i.test(p) ? "a" : /부|adv/i.test(p) ? "d" : "");
// 같은 과의 다른 단어로 오답 고르기 (같은 품사 먼저, 동의어로 적힌 단어는 빼기)
function others(list, e, n, r, also) {
  const bad = new Set([e.w.toLowerCase()].concat(altForms(e.syn || "").map((x) => x.toLowerCase())));
  const pool = list.filter((x) => x !== e && !bad.has(x.w.toLowerCase()) && (!also || also(x)));
  const same = shuffle(pool.filter((x) => posK(x.pos) && posK(x.pos) === posK(e.pos)), r), rest = shuffle(pool.filter((x) => !same.includes(x)), r);
  return same.concat(rest).slice(0, n);
}

// 우리말 뜻 맞추기: 띄어쓰기·물결(~)·괄호 속 설명·문장부호는 빼고 비교
const koNorm = (s) => String(s || "").replace(/\([^)]*\)|\[[^\]]*\]/g, "").replace(/[~∼〜\s.,·!?'"“”‘’…\-]/g, "").replace(/^(을|를|에게|에|와|과|이|가)(?=[가-힣]{2})/, "").trim();
// "끌어당기다, 매혹하다 / (마음을) 끌다" → 정답으로 받을 뜻 목록
function meaningAccept(m) { return [...new Set(String(m || "").split(/\s*[,\/;·|]\s*|\s+또는\s+/).map((x) => x.trim()).filter(Boolean).concat([String(m || "").trim()]))].slice(0, 12); }
function mwriteOk(given, k) { const g = koNorm(given); return !!g && (k.accept && k.accept.length ? k.accept : meaningAccept(k.answer)).some((a) => koNorm(a) === g); }
// 예전에 저장한 단어장(뜻 쓰기 문항이 없던 때)도 '뜻 고르기' 문항에서 뜻 쓰기 문항을 만들어 써요
function mwriteFrom(q) {
  if (!q || q.vt !== "meaning" || !Array.isArray(q.opts)) return null;
  const m = q.opts[q.ans]; if (!m) return null;
  return { type: "short", lv: 2, vt: "mwrite", w: q.w, kind: "단어", id: "w" + String(q.id || "").slice(1), q: "다음 단어의 뜻을 우리말로 쓰시오.", sub: q.sub, answer: m, accept: meaningAccept(m), exp: q.exp };
}

// 단어 목록 → 문항 목록 (한 과 안에서). 문항마다 w(단어)·vt(유형)를 달아 출제 때 같은 단어가 겹치지 않게 해요.
function build(words, uid) {
  const list = (Array.isArray(words) ? words : []).map(cleanWord).filter(Boolean);
  const seen = new Set(), L = list.filter((e) => { const k = e.w.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  const out = [];
  const add = (e, vt, q) => { q.vt = vt; q.w = e.w.toLowerCase(); q.kind = "단어"; q.id = "v" + h(uid + "|" + e.w + "|" + vt + "|" + (q.sub || "") + "|" + (q.answer || ""), 10); q.exp = q.exp || (e.w + (e.pos ? " (" + e.pos + ")" : "") + (e.m ? ": " + e.m : "") + (e.exk ? " — " + e.exk : "")); out.push(q); };
  L.forEach((e) => {
    const r = rngOf(uid + "|" + e.w), W = mainForm(e.w), tk = findToken(e);
    const mc = (opts, ans) => { const uniq = []; opts.forEach((o) => { if (o && !uniq.some((u) => u.toLowerCase() === o.toLowerCase())) uniq.push(o); }); return uniq.length >= 3 ? { opts: uniq, ans: uniq.indexOf(ans) } : null; };
    const pos = e.pos ? " (" + e.pos + ")" : "";
    // 1) 단어 → 뜻 고르기
    if (e.m) { const o = mc([e.m].concat(others(L, e, 4, r, (x) => x.m && x.m !== e.m).map((x) => x.m)), e.m); if (o) add(e, "meaning", Object.assign({ type: "mc", lv: 1, q: "다음 단어의 뜻으로 알맞은 것을 고르시오.", sub: W + pos }, o)); }
    // 1-1) 단어 → 우리말 뜻 쓰기 (채점 때 AI가 비슷한 뜻도 확인)
    if (e.m) add(e, "mwrite", { type: "short", lv: 2, q: "다음 단어의 뜻을 우리말로 쓰시오.", sub: W + pos, answer: e.m, accept: meaningAccept(e.m) });
    // 2) 뜻 → 철자 쓰기 (첫 글자 힌트)
    if (e.m) add(e, "spell", { type: "short", lv: 2, q: "우리말 뜻에 알맞은 영어 단어를 쓰시오.", sub: e.m + pos + "  →  " + W[0] + " " + "_ ".repeat(Math.max(1, W.length - 1)).trim() + " (" + W.replace(/\s/g, "").length + "글자)", answer: W, accept: altForms(e.w) });
    if (tk) {
      const sent = tk.sent + (e.exk ? "\n(" + e.exk + ")" : "");
      // 3) 예문 빈칸 고르기 (보기는 정답과 같은 모양으로 바꿔서)
      const ds = others(L, e, 4, r, (x) => !/\s/.test(mainForm(x.w)) || /\s/.test(W)).map((x) => inflect(mainForm(x.w), tk.token, W));
      const o = mc([tk.token].concat(ds), tk.token); if (o) add(e, "blankmc", Object.assign({ type: "mc", lv: 1, q: "빈칸에 들어갈 알맞은 단어를 고르시오.", sub: sent }, o));
      // 4) 예문 빈칸 쓰기 (뜻 힌트, 필요하면 형태 바꾸기)
      add(e, "blank", { type: "short", lv: 2, q: "빈칸에 알맞은 단어를 쓰시오. (필요하면 형태를 바꾸시오)", sub: tk.sent + "\n(힌트: " + (e.m || "") + (e.m ? ", " : "") + "첫 글자 " + tk.token[0] + ")", answer: tk.token, accept: [tk.token] });
      // 6) 괄호 속 문맥에 맞는 단어 (2지선다)
      const d1 = others(L, e, 1, r)[0];
      if (d1) {
        const dis = inflect(mainForm(d1.w), tk.token, W);
        if (dis.toLowerCase() !== tk.token.toLowerCase()) {
          const pair = r() < 0.5 ? [tk.token, dis] : [dis, tk.token];
          add(e, "paren", { type: "mc", lv: 2, q: "괄호 안에서 문맥에 맞는 단어를 고르시오.", sub: tk.sent.replace(BL, "( " + pair[0] + " / " + pair[1] + " )") + (e.exk ? "\n(" + e.exk + ")" : ""), opts: pair, ans: pair.indexOf(tk.token) });
        }
      }
    }
    // 5) 영영 풀이 → 단어 고르기
    if (e.def) { const o = mc([W].concat(others(L, e, 4, r).map((x) => mainForm(x.w))), W); if (o) add(e, "def", Object.assign({ type: "mc", lv: 2, q: "다음 영영 풀이에 해당하는 단어를 고르시오.", sub: e.def }, o)); }
    // 7·8) 동의어·반의어
    [["syn", "뜻이 비슷한 말(동의어)", "와 뜻이 비슷한"], ["ant", "뜻이 반대인 말(반의어)", "와 뜻이 반대인"]].forEach(([k, name, rel]) => {
      const v = e[k]; if (!v) return;
      const shown = altForms(v).filter((x) => x.toLowerCase() !== W.toLowerCase()).slice(0, 3).join(", "); if (!shown) return;
      const o = mc([W].concat(others(L, e, 4, r, (x) => !altForms(v).some((s) => s.toLowerCase() === x.w.toLowerCase())).map((x) => mainForm(x.w))), W);
      if (o) add(e, "synmc", Object.assign({ type: "mc", lv: 2, q: "다음 단어" + rel + " 단어를 고르시오.", sub: name + ": " + shown }, o));
      add(e, "synw", { type: "short", lv: 3, q: "다음 단어" + rel + " 단어를 쓰시오. (첫 글자 " + W[0] + ")", sub: name + ": " + shown + (e.m ? "\n(뜻: " + e.m + ")" : ""), answer: W, accept: altForms(e.w) });
    });
  });
  return { questions: out, words: L };
}
// 저장된 문항에서 단어장(단어·품사·뜻·예문·영영풀이·동의어·반의어)을 다시 꺼내요 → 학생 단어 게임용
function wordsFrom(qs) {
  const map = new Map();
  const get = (k) => { if (!map.has(k)) map.set(k, { w: "", pos: "", m: "", ex: "", exk: "", def: "", syn: "", ant: "" }); return map.get(k); };
  const line1 = (s) => String(s || "").split("\n")[0].trim();
  (Array.isArray(qs) ? qs : []).forEach((q) => {
    if (!q || !q.vt || !q.w) return; const e = get(q.w);
    if ((q.vt === "meaning" || q.vt === "mwrite") && !e.m) {
      e.m = q.vt === "meaning" && Array.isArray(q.opts) ? q.opts[q.ans] || "" : q.answer || "";
      const pm = line1(q.sub).match(/^(.*?)\s*\(([^)]*)\)$/); if (pm) { e.pos = e.pos || pm[2]; if (!e.w) e.w = pm[1]; } else if (!e.w) e.w = line1(q.sub);
    }
    if (q.vt === "spell") { const a = (q.accept || []).filter(Boolean); e.w = a.length ? a.join(" / ") : q.answer || e.w; if (!e.m) e.m = line1(q.sub).split("  →  ")[0].replace(/\s*\([^)]*\)$/, ""); }
    if ((q.vt === "blankmc" || q.vt === "blank") && !e.ex) {
      const lines = String(q.sub || "").split("\n"), tok = q.vt === "blank" ? q.answer : Array.isArray(q.opts) ? q.opts[q.ans] : "";
      if (tok && lines[0].includes(BL)) e.ex = lines[0].replace(BL, "[" + tok + "]");
      if (q.vt === "blankmc" && lines[1] && /^\(.*\)$/.test(lines[1])) e.exk = lines[1].slice(1, -1);
    }
    if (q.vt === "blankmc" && !e.exk) { const l2 = String(q.sub || "").split("\n")[1]; if (l2 && /^\(.*\)$/.test(l2)) e.exk = l2.slice(1, -1); }
    if (q.vt === "def" && !e.def) e.def = q.sub || "";
    if (q.vt === "synmc" || q.vt === "synw") { const l = line1(q.sub), i = l.indexOf(": "); if (i > 0) { const k = /반의어/.test(l.slice(0, i)) ? "ant" : "syn"; if (!e[k]) e[k] = l.slice(i + 2); } }
  });
  return [...map.entries()].map(([k, e]) => Object.assign(e, { w: e.w || k })).filter((e) => e.w && e.m);
}
// 이 단어장으로 만들 수 있는 유형별 문항 수
function typeCounts(qs) { const c = {}; (qs || []).forEach((q) => { if (q.vt) c[q.vt] = (c[q.vt] || 0) + 1; }); return c; }

module.exports = { VTYPES, VT_IDS, build, wordsFrom, cleanWord, typeCounts, mwriteOk, mwriteFrom, meaningAccept, _t: { findToken, inflect, koNorm } };
