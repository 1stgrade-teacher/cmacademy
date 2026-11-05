// api/_parent.js — 👪 학부모 앱: 부모님 전용 링크(학생 + 비밀 키) 하나로 우리 아이의 학습 상태만 봐요.
//   과제·제출 사진 / 시험 성적(단어·주간·월간·분기) / 분석 리포트(노션 페이지를 읽어 앱에서 보여 줌) / 인강 학습 인증 / 단어 게임 / 💬 선생님과 상담
//   선생님만 보는 것(상담 메모, 학부모 연락처, 다른 학생 정보)은 보내지 않아요.
// 노션: 💬 학부모 상담 DB는 처음 쓸 때 📸 과제 DB와 같은 페이지 아래에 자동으로 만들어요. (NOTION_PMSG_DB_ID로 직접 지정 가능)
const crypto = require("crypto");

module.exports = function (ctx) {
  const { notion, queryAll, P, rt, sel, clip, uuid, normId, id32, STUDENT_DB, EXAM_DB, CERT_DB, GAME_DB, HW, getLastErr } = ctx;
  const PKEY = "부모 링크 키", MSG_TITLE = "💬 학부모 상담";
  const kst = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 16) : "");
  const pct = (v) => (typeof v === "number" ? Math.round(v <= 1.5 ? v * 100 : v) : null);
  function sameKey(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }

  // ---------- 링크 확인 ----------
  async function auth(k) {
    const m = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{16,40})$/.exec(String(k || ""));
    if (!m) return { status: 404, msg: "링크가 올바르지 않아요. 선생님께 받은 링크를 그대로 열어 주세요." };
    const p = await notion("pages/" + m[1], "GET");
    if (!p || normId(p.parent && p.parent.database_id) !== normId(STUDENT_DB())) return { status: 404, msg: "링크가 올바르지 않아요." };
    const key = P.text(p, PKEY);
    if (!key || !sameKey(key, m[2]) || P.sel(p, "상태") === "퇴원") return { status: 403, msg: "이 링크는 더 이상 쓰지 않아요. 선생님께 새 링크를 받아 주세요." };
    return { status: 200, sid: m[1], page: p, name: P.title(p, "이름"), cls: P.sel(p, "반"), grade: P.sel(p, "학년"), school: P.text(p, "학교"), enroll: P.sel(p, "상태") || "재원" };
  }

  // ---------- 💬 상담 DB (없으면 만들기) ----------
  let msgDb = process.env.NOTION_PMSG_DB_ID ? id32(process.env.NOTION_PMSG_DB_ID) : null;
  async function MSG_DB() {
    if (msgDb) return msgDb;
    const s = await notion("search", "POST", { query: "학부모 상담", filter: { property: "object", value: "database" }, page_size: 20 }, 2);
    const hit = s && (s.results || []).find((d) => (d.title || []).map((t) => t.plain_text).join("") === MSG_TITLE && !d.archived);
    if (hit) return (msgDb = normId(hit.id));
    const hwDb = await notion("databases/" + HW().HW_DB(), "GET", null, 2);
    const parent = hwDb && hwDb.parent && hwDb.parent.type === "page_id" && hwDb.parent.page_id;
    if (!parent) return null;
    const made = await notion("databases", "POST", {
      parent: { type: "page_id", page_id: parent }, title: [{ type: "text", text: { content: MSG_TITLE } }],
      properties: {
        "제목": { title: {} }, "학생": { relation: { database_id: uuid(STUDENT_DB()), single_property: {} } }, "반": { rich_text: {} },
        "보낸 사람": { select: { options: [{ name: "학부모", color: "orange" }, { name: "선생님", color: "green" }] } },
        "내용": { rich_text: {} }, "선생님": { rich_text: {} }, "확인": { checkbox: {} },
      },
    }, 2);
    return made ? (msgDb = normId(made.id)) : null;
  }
  function readMsg(p) { return { id: normId(p.id), sid: P.rel(p, "학생")[0] || "", cls: P.text(p, "반"), from: P.sel(p, "보낸 사람"), text: P.text(p, "내용"), teacher: P.text(p, "선생님"), read: P.chk(p, "확인"), at: kst(p.created_time) }; }
  async function thread(sid) {
    const db = await MSG_DB(); if (!db) return null;
    const rows = await queryAll(db, { filter: { property: "학생", relation: { contains: uuid(sid) } }, sorts: [{ timestamp: "created_time", direction: "ascending" }] }, 3);
    return rows ? rows.map(readMsg).sort((a, b) => a.at.localeCompare(b.at)) : null;
  }
  async function addMsg(sid, cls, from, text, teacher) {
    const db = await MSG_DB(); if (!db) return null;
    const body = clip(String(text || "").trim(), 1500);
    return notion("pages", "POST", { parent: { database_id: db }, properties: {
      "제목": { title: rt(clip(body.replace(/\s+/g, " "), 40)) }, "학생": { relation: [{ id: uuid(sid) }] }, "반": { rich_text: rt(cls) },
      "보낸 사람": sel(from), "내용": { rich_text: rt(body) }, "선생님": { rich_text: rt(teacher || "") }, "확인": { checkbox: from === "선생님" },
    } });
  }

  // ---------- 리포트 (학생 '리포트 페이지' 아래 페이지 + 시험 기록에 연결된 분석 리포트) ----------
  const pageIdOf = (url) => { const m = /([0-9a-f]{32})(?:[?#].*)?$/i.exec(String(url || "").replace(/-/g, "")); return m ? m[1].toLowerCase() : ""; };
  async function children(id, max) {
    const out = []; let cur = null;
    for (let i = 0; i < 6 && out.length < (max || 300); i++) {
      const r = await notion("blocks/" + id + "/children?page_size=100" + (cur ? "&start_cursor=" + cur : ""), "GET", null, 2);
      if (!r) break; out.push(...(r.results || [])); if (!r.has_more) break; cur = r.next_cursor;
    }
    return out;
  }
  async function reportList(stuPage, exams) {
    const list = [], seen = new Set();
    const home = pageIdOf((stuPage.properties["리포트 페이지"] || {}).url);
    if (home) (await children(home, 200)).filter((b) => b.type === "child_page").forEach((b) => { const id = normId(b.id); if (!seen.has(id)) { seen.add(id); list.push({ id, title: b.child_page.title, at: kst(b.created_time).slice(0, 10) }); } });
    exams.forEach((e) => { const id = pageIdOf(e.report); if (id && !seen.has(id)) { seen.add(id); list.push({ id, title: e.title + " 분석 리포트", at: e.date }); } });
    return list.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }
  // 노션 블록 → 앱에서 그릴 간단한 모양 (글자·굵게·색·링크, 제목, 목록, 표, 콜아웃, 토글, 그림)
  function rich(a) { return (a || []).map((t) => ({ s: t.plain_text || "", b: t.annotations && t.annotations.bold, i: t.annotations && t.annotations.italic, c: t.annotations && t.annotations.color !== "default" ? t.annotations.color : "", h: t.href && /^https?:/.test(t.href) ? t.href : "" })); }
  async function simplify(blocks, depth, budget) {
    const out = [];
    for (const bl of blocks) {
      if (budget.n-- <= 0) break;
      const t = bl.type, v = bl[t] || {}, o = { t };
      if (v.rich_text) o.x = rich(v.rich_text);
      if (t === "callout" && v.icon && v.icon.emoji) o.e = v.icon.emoji;
      if (t === "to_do") o.ok = !!v.checked;
      if (t === "image") { o.src = (v.file && v.file.url) || (v.external && v.external.url) || ""; o.x = rich(v.caption); }
      if (t === "bookmark" || t === "embed" || t === "link_preview") o.h = v.url || "";
      if (t === "child_page") o.x = [{ s: v.title || "" }];
      if (t === "table") o.head = !!v.has_column_header;
      if (t === "table_row") o.cells = (v.cells || []).map(rich);
      if (bl.has_children && depth < 3 && t !== "child_page" && t !== "child_database") o.k = await simplify(await children(bl.id, 150), depth + 1, budget);
      out.push(o);
    }
    return out;
  }
  async function reportPage(k, pid) {
    const a = await auth(k); if (a.status !== 200) return a;
    pid = String(pid || "").replace(/-/g, "").toLowerCase();
    if (!/^[0-9a-f]{32}$/.test(pid)) return { status: 400, msg: "리포트를 다시 골라 주세요." };
    const exams = await examsOf(a.sid);
    const list = await reportList(a.page, exams || []);
    const hit = list.find((x) => x.id === pid);
    if (!hit) return { status: 403, msg: "우리 아이 리포트가 아니에요." };
    const blocks = await simplify(await children(pid, 300), 0, { n: 700 });
    return { status: 200, title: hit.title, blocks };
  }

  // ---------- 한 번에 불러오기 ----------
  async function examsOf(sid) {
    const rows = await queryAll(EXAM_DB(), { filter: { property: "학생", relation: { contains: uuid(sid) } }, sorts: [{ property: "시험일", direction: "descending" }] }, 2);
    return rows && rows.map((p) => ({ id: normId(p.id), title: P.title(p, "시험명"), kind: P.sel(p, "종류"), date: ((P.date(p, "시험일") || {}).start || "").slice(0, 10), score: P.num(p, "점수"), total: P.num(p, "만점"), pct: P.formula(p, "환산점수"), grade: P.sel(p, "종합 평가"), comment: P.text(p, "코멘트"), wrong: P.num(p, "오답 수"), report: (p.properties["분석 리포트"] || {}).url || "" }))
      .sort((x, y) => y.date.localeCompare(x.date)).slice(0, 80);
  }
  async function home(k) {
    const a = await auth(k); if (a.status !== 200) return a;
    const rel = { property: "학생", relation: { contains: uuid(a.sid) } }, since = new Date(Date.now() - 31 * 864e5).toISOString();
    const [hw, exams, certs, games, msgs] = await Promise.all([
      HW().hwForStudent(a.sid, a.cls),
      examsOf(a.sid),
      queryAll(CERT_DB(), { filter: { property: "학생 페이지", relation: { contains: uuid(a.sid) } }, sorts: [{ property: "제출시각", direction: "descending" }] }, 1),
      queryAll(GAME_DB(), { filter: { and: [rel, { property: "날짜", date: { on_or_after: since } }] } }, 3),
      thread(a.sid),
    ]);
    const reports = await reportList(a.page, exams || []);
    const cert = (certs || []).slice(0, 40).map((p) => ({ at: kst((P.date(p, "제출시각") || {}).start || p.created_time), area: P.sel(p, "영역"), book: P.text(p, "교재"), lecture: P.text(p, "강의"), watch: pct(P.num(p, "시청률")), minutes: P.num(p, "집중시간(분)"), score: pct(P.num(p, "점수")), right: P.text(p, "맞은 수"), verdict: P.sel(p, "판정"), understand: P.sel(p, "이해도"), summary: P.text(p, "한줄요약"), sumGrade: P.sel(p, "AI 요약평가"), feedback: P.text(p, "AI 피드백"), question: P.text(p, "질문·메시지"), checked: P.chk(p, "선생님 확인") }));
    const g = { points: 0, plays: 0, words: 0, days: new Set() };
    (games || []).forEach((p) => { g.points += P.num(p, "포인트") || 0; g.plays++; g.words += P.num(p, "문제 수") || 0; const d = (P.date(p, "날짜") || {}).start; if (d) g.days.add(kst(d).slice(0, 10)); });
    return { status: 200, student: { name: a.name, cls: a.cls, grade: a.grade, school: a.school, status: a.enroll }, hw: hw || [], exams: (exams || []).map((e) => Object.assign({}, e, { report: undefined, rid: pageIdOf(e.report) })), certs: cert, game: { points: g.points, plays: g.plays, words: g.words, days: g.days.size }, reports, msgs: msgs || [], msgOn: !!msgs, partial: !hw || !exams || !certs || !games };
  }
  async function parentSend(k, text) {
    const a = await auth(k); if (a.status !== 200) return a;
    text = String(text || "").trim(); if (!text) return { status: 400, msg: "내용을 써 주세요." };
    const t = await thread(a.sid); if (!t) return { status: 502, msg: "지금은 보낼 수 없어요. 잠시 뒤 다시 해 주세요." };
    const today = kst(new Date().toISOString()).slice(0, 10);
    if (t.filter((m) => m.from === "학부모" && m.at.slice(0, 10) === today).length >= 20) return { status: 429, msg: "오늘은 더 보낼 수 없어요. 급한 일은 학원으로 전화 주세요." };
    const pg = await addMsg(a.sid, a.cls, "학부모", text);
    return pg ? { status: 200, msg: readMsg(pg) } : { status: 502, msg: "보내지 못했어요. 다시 해 주세요." };
  }

  // ---------- 선생님 ----------
  async function inbox(students) {
    const db = await MSG_DB(); if (!db) return { status: 502, msg: "노션에 「" + MSG_TITLE + "」 DB를 만들지 못했어요. 🩺 점검을 눌러 보세요.", debug: getLastErr() };
    const rows = await queryAll(db, { sorts: [{ timestamp: "created_time", direction: "descending" }] }, 3);
    if (!rows) return { status: 502, msg: "상담 목록을 읽지 못했어요.", debug: getLastErr() };
    const by = new Map(), names = new Map((students || []).map((s) => [s.id, s]));
    rows.map(readMsg).sort((a, b) => b.at.localeCompare(a.at)).forEach((m) => {
      if (!m.sid) return;
      if (!by.has(m.sid)) { const s = names.get(m.sid) || {}; by.set(m.sid, { sid: m.sid, name: s.name || "(이름 없음)", cls: s.cls || m.cls, last: m.text, lastFrom: m.from, lastAt: m.at, unread: 0 }); }
      if (m.from === "학부모" && !m.read) by.get(m.sid).unread++;
    });
    const list = [...by.values()].sort((a, b) => (b.unread > 0) - (a.unread > 0) || b.lastAt.localeCompare(a.lastAt));
    return { status: 200, list, unread: list.reduce((n, x) => n + x.unread, 0) };
  }
  async function teacherThread(sid) {
    const t = await thread(sid); if (!t) return { status: 502, msg: "대화를 읽지 못했어요." };
    const un = t.filter((m) => m.from === "학부모" && !m.read);
    for (let i = 0; i < un.length; i += 5) await Promise.all(un.slice(i, i + 5).map((m) => notion("pages/" + m.id, "PATCH", { properties: { "확인": { checkbox: true } } })));
    return { status: 200, msgs: t };
  }
  async function teacherSend(me, sid, cls, text) {
    if (!String(text || "").trim()) return { status: 400, msg: "답장을 써 주세요." };
    const pg = await addMsg(sid, cls, "선생님", text, me.name);
    return pg ? { status: 200, msg: readMsg(pg) } : { status: 502, msg: "보내지 못했어요.", debug: getLastErr() };
  }

  // 홈 화면 앱(PWA) 설정: 시작 주소에 이 아이의 링크를 넣어, 앱 아이콘으로 열면 바로 우리 아이 화면이 나와요
  function manifest(k) {
    const ok = /^[0-9a-f]{32}\.[A-Za-z0-9_-]{16,40}$/.test(String(k || ""));
    return { name: "청명 학부모", short_name: "청명 학부모", start_url: "/parent.html" + (ok ? "?k=" + k : ""), scope: "/", display: "standalone", background_color: "#F3F3F5", theme_color: "#0E8A8C", lang: "ko",
      icons: [{ src: "/icon-192.png", sizes: "192x192", type: "image/png" }, { src: "/icon-512.png", sizes: "512x512", type: "image/png" }, { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }] };
  }

  return { auth, home, reportPage, parentSend, inbox, teacherThread, teacherSend, manifest, MSG_DB, _t: { pageIdOf, simplify } };
};
