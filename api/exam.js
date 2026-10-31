// api/exam.js — 선생님 전용: 시험 점수를 반 단위로 한 번에 입력 → 노션 '시험 기록' + 학생별 페이지
// Vercel 환경 변수
//   TEACHER_CODE         (필수) 선생님 전용 코드. 이걸 알아야만 점수 입력 가능
//   NOTION_TOKEN         (필수) 학습 인증과 같은 노션 키
//   NOTION_EXAM_DB_ID    (선택) '시험 기록' DB ID (기본값 내장)
//   NOTION_STUDENT_DB_ID (선택) '인강 학생별 기록' DB ID (기본값 내장)
const crypto = require("crypto");

const NOTION_VER = "2022-06-28";
const EXAM_DB = () => (process.env.NOTION_EXAM_DB_ID || "dbdd356f53544c94a45b451a8a4ee84a").replace(/-/g, "").trim();
const STUDENT_DB = () => (process.env.NOTION_STUDENT_DB_ID || "d6829ce41b134523945a1bdc2e87ce30").replace(/-/g, "").trim();
const KINDS = ["단어시험", "듣기시험", "주간평가", "월간평가", "분기평가"];
// 다른 선생님(저스틴쌤·로미쌤 등)의 코드: 노션 👩‍🏫 선생님 DB (정기평가 관리 화면에서 만듦)
const TEACHER_DB = () => (process.env.NOTION_TEACHER_DB_ID || "63a6527837024ddaa3d256b0cb243304").replace(/-/g, "").trim();
const teacherHash = (code) => crypto.createHash("sha256").update("cm-teacher|" + String(code || "").trim() + "|" + (process.env.REPORT_SECRET || process.env.NOTION_TOKEN || "cm")).digest("hex");
async function otherTeacherOk(code) {
  code = String(code || "").trim(); if (!code) return false;
  const q = await notion("databases/" + TEACHER_DB() + "/query", "POST", { page_size: 100, filter: { property: "사용", checkbox: { equals: true } } }, 1);
  const h = teacherHash(code);
  return !!(q && (q.results || []).some((p) => ((p.properties["코드"] && p.properties["코드"].rich_text) || []).map((x) => x.plain_text).join("") === h));
}
const GRADES = ["우수", "양호", "보통", "노력 필요"];

const fails = new Map();
function failed(ip) {
  const now = Date.now(), e = fails.get(ip) || { n: 0, t: now };
  if (now - e.t > 10 * 60 * 1000) { e.n = 0; e.t = now; }
  e.n++; fails.set(ip, e);
  return e.n > 20;
}
function blocked(ip) { const e = fails.get(ip); return !!e && Date.now() - e.t <= 10 * 60 * 1000 && e.n > 20; }

function clip(s, n) {
  s = typeof s === "string" ? s : s == null ? "" : String(s);
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  return s.length > n ? s.slice(0, n) : s;
}
function num(v, lo, hi) {
  if (v === "" || v == null) return null;
  v = Number(v);
  if (!isFinite(v)) return null;
  return Math.max(lo, Math.min(hi, v));
}
const rt = (s) => { s = clip(s, 1990); return s ? [{ type: "text", text: { content: s } }] : []; };
const sel = (n) => { n = clip(n, 90).replace(/,/g, " "); return n ? { select: { name: n } } : { select: null }; };
function normName(n) { n = clip(n, 30).replace(/\s+/g, " "); return /[가-힣]/.test(n) ? n.replace(/\s/g, "") : n; }

async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { return {}; }
}
function sendTo(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

let lastErr = null;
async function notion(path, method, body, tries) {
  for (let a = 0; a < (tries || 3); a++) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 9000);
    try {
      const r = await fetch("https://api.notion.com/v1/" + path, {
        method, signal: ctl.signal, body: body ? JSON.stringify(body) : undefined,
        headers: { Authorization: "Bearer " + process.env.NOTION_TOKEN, "Notion-Version": NOTION_VER, "Content-Type": "application/json" },
      });
      const j = await r.json().catch(() => ({}));
      if (r.ok) return j;
      lastErr = { status: r.status, code: j && j.code, msg: clip(j && j.message, 160) };
      if (r.status === 429 || r.status >= 500) { await new Promise((ok) => setTimeout(ok, 700 * (a + 1))); continue; }
      return null;
    } catch (e) {
      lastErr = { status: 0, code: "network", msg: clip(e && e.message, 100) };
    } finally { clearTimeout(t); }
  }
  return null;
}

let titleProp = null;
async function studentTitleProp() {
  if (titleProp) return titleProp;
  const db = await notion("databases/" + STUDENT_DB(), "GET");
  if (!db) return null;
  titleProp = Object.keys(db.properties || {}).find((k) => db.properties[k].type === "title") || "이름";
  return titleProp;
}

async function classList() {
  const db = await notion("databases/" + STUDENT_DB(), "GET");
  const opts = db && db.properties && db.properties["반"] && db.properties["반"].select && db.properties["반"].select.options;
  return (opts || []).map((o) => o.name);
}

async function roster(cls) {
  const tp = await studentTitleProp();
  if (!tp) return null;
  const out = [];
  let cursor;
  for (let i = 0; i < 6; i++) {
    const q = await notion("databases/" + STUDENT_DB() + "/query", "POST", {
      filter: { property: "반", select: { equals: cls } }, page_size: 100, start_cursor: cursor,
      sorts: [{ property: tp, direction: "ascending" }],
    });
    if (!q) return null;
    (q.results || []).forEach((p) => {
      const t = p.properties[tp] && p.properties[tp].title;
      out.push({ id: p.id, name: (t || []).map((x) => x.plain_text).join("") });
    });
    if (!q.has_more) break;
    cursor = q.next_cursor;
  }
  return out;
}

async function addStudents(cls, names) {
  const tp = await studentTitleProp();
  if (!tp) return null;
  const have = await roster(cls);
  if (!have) return null;
  const seen = new Set(have.map((s) => normName(s.name)));
  let added = 0, skipped = 0;
  for (const raw of names.slice(0, 60)) {
    const name = normName(raw);
    if (!name) continue;
    if (seen.has(name)) { skipped++; continue; }
    const pg = await notion("pages", "POST", { parent: { database_id: STUDENT_DB() }, properties: { [tp]: { title: rt(name) }, "반": sel(cls) } });
    if (pg) { added++; seen.add(name); }
  }
  return { added, skipped };
}

module.exports = async function handler(req, res) {
  const send = (code, obj) => sendTo(res, code, obj);
  const code = String(process.env.TEACHER_CODE || "").trim();
  if (req.method === "GET") return send(200, { ok: true, ready: !!(code && process.env.NOTION_TOKEN) });
  if (req.method !== "POST") return send(405, { error: "method" });
  const origin = req.headers.origin || "";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  if (origin) { let oh = ""; try { oh = new URL(origin).host; } catch (e) {} if (oh !== host) return send(403, { error: "origin" }); }
  if (!code || !process.env.NOTION_TOKEN) return send(503, { error: "unset", msg: "아직 준비되지 않았어요. (Vercel에 TEACHER_CODE, NOTION_TOKEN 필요)" });

  const ip = String((req.headers["x-forwarded-for"] || "").split(",")[0]).trim() || "x";
  if (blocked(ip)) return send(429, { error: "limit", msg: "시도가 너무 많아요. 잠시 뒤에 다시 해 주세요." });
  const b = await readBody(req);
  const a = crypto.createHash("sha256").update(String(b.code || "").trim()).digest(), c = crypto.createHash("sha256").update(code).digest();
  if (!crypto.timingSafeEqual(a, c) && !(await otherTeacherOk(b.code))) { failed(ip); return send(401, { error: "code", msg: "선생님 코드가 맞지 않아요." }); }

  lastErr = null;
  const act = b.action;
  if (act === "classes") {
    const list = await classList();
    return send(200, { ok: true, classes: list, debug: list.length ? undefined : lastErr });
  }
  if (act === "roster") {
    const cls = clip(b.cls, 40);
    const list = await roster(cls);
    if (!list) return send(502, { error: "notion", msg: "명단을 불러오지 못했어요.", debug: lastErr });
    return send(200, { ok: true, students: list });
  }
  if (act === "resetPin") {
    const id = clip(b.studentId, 60);
    if (!id) return send(400, { error: "input" });
    const r = await notion("pages/" + id, "PATCH", { properties: { "본인번호": { rich_text: [] } } });
    return r ? send(200, { ok: true }) : send(502, { error: "notion", msg: "초기화하지 못했어요.", debug: lastErr });
  }
  if (act === "addStudents") {
    const cls = clip(b.cls, 40);
    const names = (Array.isArray(b.names) ? b.names : []).map((x) => clip(x, 30)).filter(Boolean);
    if (!cls || !names.length) return send(400, { error: "input", msg: "반과 이름을 넣어 주세요." });
    const r = await addStudents(cls, names);
    if (!r) return send(502, { error: "notion", msg: "학생을 추가하지 못했어요. 노션 연결을 확인해 주세요.", debug: lastErr });
    return send(200, Object.assign({ ok: true }, r));
  }
  if (act === "save") {
    const cls = clip(b.cls, 40), kind = KINDS.includes(b.kind) ? b.kind : null;
    const title = clip(b.title, 150), date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : null;
    const rows = (Array.isArray(b.rows) ? b.rows : []).slice(0, 120);
    if (!cls || !kind || !title || !date || !rows.length) return send(400, { error: "input", msg: "반·종류·시험명·날짜와 점수를 확인해 주세요." });
    const maxScore = num(b.maxScore, 1, 1000);
    if (!maxScore) return send(400, { error: "input", msg: "만점을 숫자로 적어 주세요." });
    if (!b.force) { // 같은 시험을 두 번 저장하지 않도록 확인
      const dup = await notion("databases/" + EXAM_DB() + "/query", "POST", { page_size: 5, filter: { and: [
        { property: "시험명", title: { equals: title } }, { property: "반", select: { equals: cls } }, { property: "시험일", date: { equals: date } } ] } });
      if (dup && dup.results && dup.results.length) return send(200, { ok: false, dup: true, msg: "같은 이름·날짜의 시험 기록이 이미 있어요. 그래도 또 저장할까요?" });
    }
    const mode = b.mode === "온라인" ? "온라인" : "종이";
    let saved = 0; const failedNames = [];
    for (let i = 0; i < rows.length; i += 3) {
      const part = rows.slice(i, i + 3);
      const done = await Promise.all(part.map(async (r) => {
        const score = num(r.score, 0, 100000);
        if (!r.studentId || score == null) return false;
        const props = {
          "시험명": { title: rt(title) }, "학생": { relation: [{ id: String(r.studentId) }] }, "반": sel(cls), "종류": sel(kind),
          "시험일": { date: { start: date } }, "시험 범위": { rich_text: rt(b.range) }, "점수": { number: score }, "만점": { number: maxScore },
          "오답 수": { number: num(r.wrong, 0, 1000) }, "재시험": { checkbox: !!r.retest }, "재시험 점수": { number: num(r.retestScore, 0, 100000) },
          "종합 평가": GRADES.includes(r.grade) ? sel(r.grade) : { select: null }, "코멘트": { rich_text: rt(r.comment) }, "응시 방식": sel(mode),
        };
        const pg = await notion("pages", "POST", { parent: { database_id: EXAM_DB() }, properties: props });
        return !!pg;
      }));
      done.forEach((ok, k) => { if (ok) saved++; else failedNames.push(part[k].name || ""); });
    }
    return send(200, { ok: saved > 0, saved, failed: failedNames, total: rows.length, debug: failedNames.length ? lastErr : undefined });
  }
  return send(400, { error: "action" });
};
