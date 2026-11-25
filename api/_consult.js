// api/_consult.js — 📅 신규생 상담 예약 (되는시간·캘린들리처럼: 링크 하나로 학부모님이 빈 시간을 골라 예약)
// ------------------------------------------------------------------
// · 선생님이 /admin/consult.html 에서 요일별 상담 가능 시간·상담 길이·앞뒤 여유 시간·하루 최대 상담 수를 정해요.
// · 학부모님은 /consult.html (입장 코드 없이) 에서 달력 → 시간 → 정보 입력으로 예약해요. 이미 잡힌 시간은 안 보여요.
// · 예약하면 학부모님께 확정 안내(예약 확인·변경 링크 포함), 선생님께 새 예약 알림이 가요. 하루 전쯤 리마인더도 가요.
// · 학부모님은 받은 링크에서 직접 시간을 바꾸거나 취소할 수 있어요.
// · 선생님 구글·네이버 캘린더에 '구독 주소(ICS)'를 넣으면 예약이 캘린더에 자동으로 보여요.
// 노션: 📅 신규 상담 예약(한 줄 = 예약 1건) · ⚙️ 상담 예약 설정 — 처음 쓸 때 📸 과제 DB와 같은 페이지 아래에 자동으로 만들어요.
//       (NOTION_CONSULT_DB_ID, NOTION_CONSULT_CFG_DB_ID 로 직접 지정 가능)
// 알림톡 템플릿 ID: KAKAO_TPL_CONSULT_OK(확정·변경), KAKAO_TPL_CONSULT_REMIND(리마인더), KAKAO_TPL_CONSULT_CANCEL(취소),
//                  KAKAO_TPL_CONSULT_ALERT(선생님께 새 예약 알림) — 없으면 문자로, 솔라피가 없으면 '발송 설정 전'으로 기록만
// ------------------------------------------------------------------
const crypto = require("crypto");
const N = require("./_notify.js");

const TPL = {
  ok: {
    tplEnv: "KAKAO_TPL_CONSULT_OK",
    template: "[#{학원}] 상담 예약 확정 안내\n\n#{학부모}님, #{학생} 학생 상담 예약이 확정되었습니다.\n\n■ 일시: #{일시}\n■ 방식: #{방식}\n■ 장소: #{장소}\n\n예약 확인·변경·취소는 아래 링크에서 하실 수 있습니다.\n#{링크}\n\n문의는 학원으로 연락 주세요.",
  },
  remind: {
    tplEnv: "KAKAO_TPL_CONSULT_REMIND",
    template: "[#{학원}] 상담 일정 안내\n\n#{학부모}님, #{학생} 학생 상담 일정을 다시 안내드립니다.\n\n■ 일시: #{일시}\n■ 방식: #{방식}\n■ 장소: #{장소}\n\n일정 변경이 필요하시면 아래 링크를 이용해 주세요.\n#{링크}",
  },
  cancel: {
    tplEnv: "KAKAO_TPL_CONSULT_CANCEL",
    template: "[#{학원}] 상담 예약 취소 안내\n\n#{학부모}님, #{학생} 학생 상담 예약이 취소되었습니다.\n\n■ 취소된 일시: #{일시}\n\n다시 예약하시려면 아래 링크를 이용해 주세요.\n#{링크}",
  },
  alert: {
    tplEnv: "KAKAO_TPL_CONSULT_ALERT",
    template: "[#{학원}] 상담 예약 #{구분}\n\n■ 학생: #{학생} (#{학년})\n■ 학부모: #{학부모} #{연락처}\n■ 일시: #{일시}\n■ 방식: #{방식}\n■ 문의: #{문의}",
  },
};

const GRADES = ["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3", "기타"];
const DEF = {
  open: true, title: "신입생 상담 예약", place: "청명학원 문화본원", tel: "",
  intro: "청명학원 영어과 신입생 상담 예약 페이지입니다.\n편하신 날짜와 시간을 고르시면 바로 예약이 확정되고 안내 문자를 보내 드려요.",
  dur: 30, step: 30, buf: 0, maxDay: 0, minHours: 3, days: 21, remindH: 24,
  modes: ["학원 방문 상담", "전화 상담"], grades: GRADES, alert: "", owner: "",
  week: { 0: [], 1: [["13:00", "17:00"]], 2: [["13:00", "17:00"]], 3: [["13:00", "17:00"]], 4: [["13:00", "17:00"]], 5: [["13:00", "17:00"]], 6: [["10:00", "13:00"]] },
  except: {},
};
const ST = { ok: "예약확정", done: "상담완료", cancel: "취소", noshow: "노쇼" };
const STATES = [ST.ok, ST.done, ST.cancel, ST.noshow];

module.exports = function (ctx) {
  const { notion, queryAll, P, rt, rtLong, sel, clip, uuid, normId, id32, HW, secret, getLastErr } = ctx;
  const MIN = 60000, H = 3600000, DAYS = "일월화수목금토";
  const BOOK_TITLE = "📅 신규 상담 예약", CFG_TITLE = "⚙️ 상담 예약 설정";

  // ---------- 한국 시간 ----------
  const kst = (ms) => new Date((ms == null ? Date.now() : ms) + 9 * H);
  const dayOf = (ms) => kst(ms).toISOString().slice(0, 10);
  const hmOf = (ms) => kst(ms).toISOString().slice(11, 16);
  const slotAt = (date, hm) => Date.parse(date + "T" + hm + ":00+09:00");
  const isoKst = (ms) => kst(ms).toISOString().slice(0, 19) + "+09:00";
  const dowOf = (date) => new Date(date + "T00:00:00Z").getUTCDay();
  const addDays = (date, n) => new Date(Date.parse(date + "T00:00:00Z") + n * 86400000).toISOString().slice(0, 10);
  const toMin = (hm) => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(hm || "")); return m ? Number(m[1]) * 60 + Number(m[2]) : NaN; };
  const fromMin = (t) => String(Math.floor(t / 60)).padStart(2, "0") + ":" + String(t % 60).padStart(2, "0");
  const label = (ms) => { const d = dayOf(ms); return Number(d.slice(5, 7)) + "월 " + Number(d.slice(8, 10)) + "일(" + DAYS[dowOf(d)] + ") " + hmOf(ms); };
  const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(Date.parse(s + "T00:00:00Z"));
  const isHm = (s) => /^\d{2}:\d{2}$/.test(String(s || "")) && toMin(s) < 24 * 60;
  const fmtPhone = (s) => { const d = N.phone(s); return !d ? "" : d.length === 11 ? d.slice(0, 3) + "-" + d.slice(3, 7) + "-" + d.slice(7) : d.slice(0, 3) + "-" + d.slice(3, 6) + "-" + d.slice(6); };
  const sameKey = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
  const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const sleep = (ms) => new Promise((ok) => setTimeout(ok, ms));

  // ---------- 설정 다듬기 (잘못된 값은 기본값으로) ----------
  const n = (v, lo, hi, d) => { v = Number(v); return isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d; };
  function cleanRanges(a) {
    const out = [];
    (Array.isArray(a) ? a : []).slice(0, 8).forEach((r) => {
      if (!Array.isArray(r) || !isHm(r[0]) || !isHm(r[1]) || toMin(r[1]) <= toMin(r[0])) return;
      out.push([r[0], r[1]]);
    });
    return out.sort((x, y) => toMin(x[0]) - toMin(y[0]));
  }
  function cleanList(a, max, len) {
    const seen = new Set();
    return (Array.isArray(a) ? a : String(a || "").split(/[,\n]/)).map((x) => clip(x, len).replace(/,/g, " ")).filter((x) => x && !seen.has(x) && seen.add(x)).slice(0, max);
  }
  function normCfg(x) {
    x = x && typeof x === "object" ? x : {};
    const c = {
      open: x.open !== false,
      title: clip(x.title, 40) || DEF.title, place: clip(x.place, 120), tel: clip(x.tel, 30),
      intro: String(x.intro == null ? DEF.intro : x.intro).replace(/\r/g, "").slice(0, 800).trim(),
      dur: n(x.dur, 10, 180, DEF.dur), step: n(x.step, 5, 180, DEF.step), buf: n(x.buf, 0, 120, DEF.buf),
      maxDay: n(x.maxDay, 0, 50, DEF.maxDay), minHours: n(x.minHours, 0, 240, DEF.minHours), days: n(x.days, 1, 120, DEF.days),
      remindH: n(x.remindH, 0, 72, DEF.remindH),
      modes: cleanList(x.modes, 6, 30), grades: cleanList(x.grades, 20, 10),
      alert: cleanList(x.alert, 3, 20).map(fmtPhone).filter(Boolean).join(", "), owner: clip(x.owner, 30),
      week: {}, except: {},
    };
    if (!c.modes.length) c.modes = DEF.modes.slice();
    if (!c.grades.length) c.grades = GRADES.slice();
    const w = x.week && typeof x.week === "object" ? x.week : DEF.week;
    for (let d = 0; d < 7; d++) c.week[d] = cleanRanges(w[d] || w[String(d)]);
    const e = x.except && typeof x.except === "object" ? x.except : {};
    const old = dayOf(Date.now() - 7 * 86400000);
    Object.keys(e).filter((d) => isDate(d) && d >= old).sort().slice(0, 120).forEach((d) => { c.except[d] = cleanRanges(e[d]); });
    return c;
  }

  // ---------- 노션 DB (없으면 만들기) ----------
  let bookDb = process.env.NOTION_CONSULT_DB_ID ? id32(process.env.NOTION_CONSULT_DB_ID) : null;
  let cfgDb = process.env.NOTION_CONSULT_CFG_DB_ID ? id32(process.env.NOTION_CONSULT_CFG_DB_ID) : null;
  let parentPage = null;
  async function findDb(title, query) {
    const s = await notion("search", "POST", { query, filter: { property: "object", value: "database" }, page_size: 20 }, 2);
    const hit = s && (s.results || []).find((d) => (d.title || []).map((t) => t.plain_text).join("") === title && !d.archived && !d.in_trash);
    return hit ? normId(hit.id) : null;
  }
  async function parentOf() {
    if (parentPage) return parentPage;
    const hwDb = await notion("databases/" + HW().HW_DB(), "GET", null, 2);
    const p = hwDb && hwDb.parent && hwDb.parent.type === "page_id" && hwDb.parent.page_id;
    return p ? (parentPage = p) : null;
  }
  let making = null;
  async function BOOK_DB() {
    if (bookDb) return bookDb;
    if (making) return making;
    making = (async () => {
      const hit = await findDb(BOOK_TITLE, "신규 상담 예약"); if (hit) return (bookDb = hit);
      const parent = await parentOf(); if (!parent) return null;
      const made = await notion("databases", "POST", {
        parent: { type: "page_id", page_id: parent }, icon: { type: "emoji", emoji: "📅" }, title: [{ type: "text", text: { content: BOOK_TITLE } }],
        properties: {
          "예약": { title: {} }, "상담 일시": { date: {} },
          "상태": { select: { options: [{ name: ST.ok, color: "blue" }, { name: ST.done, color: "green" }, { name: ST.cancel, color: "gray" }, { name: ST.noshow, color: "red" }] } },
          "학생": { rich_text: {} }, "학년": { select: { options: GRADES.map((g) => ({ name: g })) } }, "학교": { rich_text: {} },
          "학부모": { rich_text: {} }, "연락처": { phone_number: {} }, "상담 방식": { select: {} }, "문의 내용": { rich_text: {} },
          "담당": { rich_text: {} }, "메모": { rich_text: {} }, "취소 사유": { rich_text: {} },
          "예약 경로": { select: { options: [{ name: "학부모 직접", color: "orange" }, { name: "선생님 입력", color: "purple" }] } },
          "알림 결과": { rich_text: {} }, "관리 키": { rich_text: {} }, "접수 순서": { number: {} },
        },
      }, 2);
      return made ? (bookDb = normId(made.id)) : null;
    })();
    try { return await making; } finally { making = null; }
  }
  async function CFG_DB() {
    if (cfgDb) return cfgDb;
    const hit = await findDb(CFG_TITLE, "상담 예약 설정"); if (hit) return (cfgDb = hit);
    const parent = await parentOf(); if (!parent) return null;
    const made = await notion("databases", "POST", {
      parent: { type: "page_id", page_id: parent }, icon: { type: "emoji", emoji: "⚙️" }, title: [{ type: "text", text: { content: CFG_TITLE } }],
      properties: { "이름": { title: {} }, "값": { rich_text: {} } },
    }, 2);
    return made ? (cfgDb = normId(made.id)) : null;
  }

  // ---------- 설정 읽기·저장 ----------
  let cfgCache = { t: 0, cfg: null, pid: null };
  async function loadCfg(fresh) {
    if (!fresh && cfgCache.cfg && Date.now() - cfgCache.t < 30000) return cfgCache;
    const db = await CFG_DB();
    if (!db) return { cfg: normCfg(DEF), pid: null, dbOk: false };
    const rows = await queryAll(db, { sorts: [{ timestamp: "created_time", direction: "ascending" }] }, 1);
    if (!rows) return { cfg: cfgCache.cfg || normCfg(DEF), pid: cfgCache.pid, dbOk: false };
    const row = rows.find((p) => !p.archived && P.title(p, "이름") === "설정");
    let raw = null; try { raw = row ? JSON.parse(P.text(row, "값") || "{}") : null; } catch (e) { raw = null; }
    cfgCache = { t: Date.now(), cfg: normCfg(raw || DEF), pid: row ? normId(row.id) : null, dbOk: true };
    return cfgCache;
  }
  async function saveCfg(x) {
    const c = normCfg(x), cur = await loadCfg(true), db = await CFG_DB();
    if (!db) return null;
    const props = { "이름": { title: rt("설정") }, "값": { rich_text: rtLong(JSON.stringify(c)) } };
    const r = cur.pid ? await notion("pages/" + cur.pid, "PATCH", { properties: props }) : await notion("pages", "POST", { parent: { database_id: db }, properties: props });
    if (!r) return null;
    cfgCache = { t: Date.now(), cfg: c, pid: normId(r.id), dbOk: true };
    return c;
  }

  // ---------- 예약 ----------
  function readBook(p) {
    const d = P.date(p, "상담 일시") || {}, start = Date.parse(d.start || ""), end = d.end ? Date.parse(d.end) : start + 30 * MIN;
    return {
      id: normId(p.id), url: p.url, title: P.title(p, "예약"), start, end, date: isNaN(start) ? "" : dayOf(start), hm: isNaN(start) ? "" : hmOf(start), endHm: isNaN(end) ? "" : hmOf(end),
      state: P.sel(p, "상태") || ST.ok, student: P.text(p, "학생"), grade: P.sel(p, "학년"), school: P.text(p, "학교"), parent: P.text(p, "학부모"),
      phone: (p.properties["연락처"] || {}).phone_number || "", mode: P.sel(p, "상담 방식"), ask: P.text(p, "문의 내용"), owner: P.text(p, "담당"),
      memo: P.text(p, "메모"), reason: P.text(p, "취소 사유"), via: P.sel(p, "예약 경로"), notice: P.text(p, "알림 결과"), key: P.text(p, "관리 키"),
      seq: P.num(p, "접수 순서") || Date.parse(p.created_time) || 0, created: Date.parse(p.created_time) || 0, archived: !!(p.archived || p.in_trash),
    };
  }
  const live = (b) => b && !b.archived && !isNaN(b.start) && b.state !== ST.cancel;
  // from·to: 한국 날짜(YYYY-MM-DD), to는 그날 포함
  async function listRange(from, to) {
    const db = await BOOK_DB(); if (!db) return null;
    const rows = await queryAll(db, { filter: { and: [{ property: "상담 일시", date: { on_or_after: from } }, { property: "상담 일시", date: { before: addDays(to, 1) } }] }, sorts: [{ property: "상담 일시", direction: "ascending" }] }, 8);
    return rows && rows.map(readBook).filter((b) => !b.archived && b.date >= from && b.date <= to).sort((a, b) => a.start - b.start);
  }
  let liveCache = { t: 0, key: "", list: null };
  async function liveBooks(cfg, fresh) {
    const from = dayOf(), to = addDays(from, cfg.days + 1), key = from + "|" + to;
    if (!fresh && liveCache.list && liveCache.key === key && Date.now() - liveCache.t < 15000) return liveCache.list;
    const l = await listRange(from, to);
    if (!l) return null;
    liveCache = { t: Date.now(), key, list: l.filter(live) };
    return liveCache.list;
  }
  const dropCache = () => { liveCache = { t: 0, key: "", list: null }; };

  // ---------- 빈 시간 계산 ----------
  function rangesFor(cfg, date) { return Object.prototype.hasOwnProperty.call(cfg.except, date) ? cfg.except[date] : cfg.week[dowOf(date)] || []; }
  const clash = (cfg, s, e, x) => s - cfg.buf * MIN < x.end && e + cfg.buf * MIN > x.start;
  function freeSlots(cfg, books, now, selfId) {
    const out = {}, first = dayOf(now), act = books.filter((b) => live(b) && b.id !== selfId);
    for (let i = 0; i < cfg.days; i++) {
      const date = addDays(first, i), dayBooks = act.filter((b) => b.date === date);
      if (cfg.maxDay && dayBooks.length >= cfg.maxDay) continue;
      const list = new Set();
      rangesFor(cfg, date).forEach((r) => {
        for (let t = toMin(r[0]); t + cfg.dur <= toMin(r[1]); t += cfg.step) {
          const s = slotAt(date, fromMin(t)), e = s + cfg.dur * MIN;
          if (s < now + cfg.minHours * H) continue;
          if (act.some((x) => clash(cfg, s, e, x))) continue;
          list.add(fromMin(t));
        }
      });
      if (list.size) out[date] = [...list].sort();
    }
    return out;
  }
  function slotOk(cfg, books, date, hm, now, selfId) { const f = freeSlots(cfg, books, now, selfId); return !!(f[date] && f[date].includes(hm)); }

  // 노션에는 동시에 쓰기를 막는 장치가 없어서: 저장한 다음 같은 날 예약을 다시 읽어, 먼저 접수된 예약과 겹치면 내 것을 지워요.
  async function lostRace(cfg, me) {
    await sleep(900);
    const l = await listRange(me.date, me.date); if (!l) return false;
    const before = l.filter((x) => live(x) && x.id !== me.id && (x.seq < me.seq || (x.seq === me.seq && x.id < me.id)));
    if (before.some((x) => clash(cfg, me.start, me.end, x))) return true;
    return !!(cfg.maxDay && before.length >= cfg.maxDay);
  }

  function bookProps(cfg, f, start, extra) {
    const end = start + cfg.dur * MIN;
    return Object.assign({
      "예약": { title: rt(f.student + " 학부모 · " + label(start)) }, "상담 일시": { date: { start: isoKst(start), end: isoKst(end) } },
      "학생": { rich_text: rt(f.student) }, "학년": sel(f.grade), "학교": { rich_text: rt(f.school) }, "학부모": { rich_text: rt(f.parent) },
      "연락처": { phone_number: f.phone || null }, "상담 방식": sel(f.mode), "문의 내용": { rich_text: rt(f.ask) },
    }, extra || {});
  }
  // 학부모님께 보여 줄 것만 (메모·알림 결과·담당 메모는 빼요)
  function pubBook(cfg, b, base) {
    return { date: b.date, hm: b.hm, endHm: b.endHm, label: label(b.start), state: b.state, student: b.student, grade: b.grade, school: b.school, parent: b.parent,
      phone: b.phone, mode: b.mode, ask: b.ask, place: cfg.place, tel: cfg.tel, start: isoKst(b.start), end: isoKst(b.end),
      canChange: live(b) && b.state === ST.ok && b.start - Date.now() > Math.max(1, cfg.minHours) * H, past: b.start < Date.now(), link: linkOf(b, base) };
  }
  const linkOf = (b, base) => (base || "") + "/consult.html?b=" + b.id + "." + b.key;
  async function auth(k) {
    const m = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{16,40})$/.exec(String(k || ""));
    if (!m) return null;
    const db = await BOOK_DB(); if (!db) return null;
    const p = await notion("pages/" + m[1], "GET");
    if (!p || normId(p.parent && p.parent.database_id) !== normId(db)) return null;
    const b = readBook(p);
    return !b.archived && b.key && sameKey(b.key, m[2]) ? b : null;
  }

  // ---------- 알림 ----------
  const stamp = () => dayOf().slice(5).replace("-", "/") + " " + hmOf() + " ";
  const addNote = (old, s) => { const t = (old ? old + "\n" : "") + s; return t.length > 1900 ? t.slice(t.length - 1900) : t; };
  function vars(cfg, b, base, extra) {
    return Object.assign({ 학부모: b.parent || "학부모", 학생: b.student, 학년: b.grade || "-", 연락처: b.phone || "-", 일시: label(b.start) + "~" + b.endHm, 방식: b.mode || "-", 장소: cfg.place || "학원", 링크: linkOf(b, base), 문의: clip(b.ask || "-", 80) }, extra || {});
  }
  async function toParent(kind, cfg, b, base, extra) {
    const tag = stamp() + { ok: "확정 안내", remind: "리마인더", cancel: "취소 안내" }[kind] + ": ";
    if (!N.phone(b.phone)) return tag + "보내지 않음 (연락처 없음)";
    const r = (await N.sendMany([{ to: b.phone, vars: vars(cfg, b, base, extra) }], TPL[kind]))[0] || {};
    return tag + (r.msg || "");
  }
  async function toTeacher(what, cfg, b, base) {
    const tos = String(cfg.alert || "").split(",").map((x) => N.phone(x)).filter(Boolean);
    if (!tos.length) return "";
    const r = await N.sendMany(tos.map((to) => ({ to, vars: vars(cfg, b, base, { 구분: what }) })), TPL.alert);
    return stamp() + "선생님 알림(" + what + "): " + (r.every((x) => x.ok) ? (r[0] || {}).msg : r.map((x) => x.msg).join(" / "));
  }
  async function note(b, lines) {
    const t = lines.filter(Boolean); if (!t.length) return;
    let s = b.notice; t.forEach((x) => (s = addNote(s, x)));
    b.notice = s;
    await notion("pages/" + uuid(b.id), "PATCH", { properties: { "알림 결과": { rich_text: rt(s) } } });
  }

  // ---------- 입력 확인 ----------
  function readForm(cfg, b, teacher) {
    const f = {
      parent: clip(b.parent, 20), phone: fmtPhone(b.phone), student: clip(b.student, 20), grade: clip(b.grade, 10), school: clip(b.school, 30),
      mode: clip(b.mode, 30), ask: String(b.ask == null ? "" : b.ask).replace(/\r/g, "").slice(0, 600).trim(),
    };
    if (!f.student) return { err: "학생 이름을 적어 주세요." };
    if (!teacher) {
      if (!f.parent) return { err: "학부모님 성함을 적어 주세요." };
      if (!f.phone) return { err: "휴대폰 번호를 정확히 적어 주세요. (예: 010-1234-5678)" };
      if (!f.grade || !cfg.grades.includes(f.grade)) return { err: "학년을 골라 주세요." };
      if (!cfg.modes.includes(f.mode)) return { err: "상담 방식을 골라 주세요." };
      if (b.agree !== true) return { err: "개인정보 수집·이용에 동의해 주세요." };
    } else if (b.phone && !f.phone) return { err: "휴대폰 번호 형식이 맞지 않아요." };
    return { f };
  }
  async function byPhone(phone) {
    const db = await BOOK_DB(); if (!db || !phone) return null;
    const rows = await queryAll(db, { filter: { and: [{ property: "연락처", phone_number: { equals: phone } }, { property: "상담 일시", date: { on_or_after: dayOf() } }] } }, 2);
    return rows && rows.map(readBook).filter((b) => live(b) && b.phone === phone && b.state === ST.ok && b.end > Date.now()).sort((a, b) => a.start - b.start);
  }

  // ---------- 너무 자주 부르면 잠시 막기 ----------
  const hits = new Map();
  function limited(ip, kind, max) {
    const k = kind + "|" + ip, e = hits.get(k), now = Date.now();
    if (!e || now - e.t > 10 * MIN) { hits.set(k, { n: 1, t: now }); if (hits.size > 5000) hits.clear(); return false; }
    e.n++; return e.n > max;
  }
  const busy = new Set();
  async function locked(key, fn) {
    for (let i = 0; i < 40 && busy.has(key); i++) await sleep(150);
    busy.add(key);
    try { return await fn(); } finally { busy.delete(key); }
  }

  // =================== 학부모 (입장 코드 없이) ===================
  async function pub(act, b, ip, base) {
    const C = await loadCfg(), cfg = C.cfg;
    const info = () => ({ title: cfg.title, intro: cfg.intro, place: cfg.place, tel: cfg.tel, dur: cfg.dur, modes: cfg.modes, grades: cfg.grades, open: cfg.open });

    if (act === "consult_info") { // 달력에 쓸 빈 시간 전부 (예약 가능 기간 안)
      if (!cfg.open) return { info: info(), slots: {}, closed: true };
      const books = await liveBooks(cfg);
      if (!books) return { status: 502, msg: "예약 정보를 불러오지 못했어요. 잠시 뒤 다시 시도해 주세요." };
      return { info: info(), slots: freeSlots(cfg, books, Date.now(), b.k ? clip(b.k, 32) : ""), today: dayOf() };
    }

    if (act === "consult_book") {
      if (String(b.hp || "")) return { status: 400, msg: "다시 시도해 주세요." }; // 자동 입력 막기(사람에게는 안 보이는 칸)
      if (limited(ip, "book", 6)) return { status: 429, msg: "잠시 뒤에 다시 시도해 주세요." };
      if (!cfg.open) return { status: 403, msg: "지금은 온라인 상담 예약을 받지 않아요. 학원으로 연락 주세요." };
      const r = readForm(cfg, b, false); if (r.err) return { status: 400, msg: r.err };
      const f = r.f, date = String(b.date || ""), hm = String(b.hm || "");
      if (!isDate(date) || !isHm(hm)) return { status: 400, msg: "날짜와 시간을 골라 주세요." };
      return locked("day|" + date, async () => {
        const dup = await byPhone(f.phone);
        if (dup && dup.length) return { status: 409, dup: true, msg: "이 번호로 이미 " + label(dup[0].start) + " 상담 예약이 있어요. 시간을 바꾸시려면 안내 문자의 링크나 '예약 확인하기'를 이용해 주세요." };
        const books = await liveBooks(cfg, true); if (!books) return { status: 502, msg: "예약하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
        if (!slotOk(cfg, books, date, hm, Date.now())) return { status: 409, taken: true, msg: "방금 다른 분이 이 시간을 예약했어요. 다른 시간을 골라 주세요." };
        const db = await BOOK_DB(), start = slotAt(date, hm), key = b64u(crypto.randomBytes(18)), seq = Date.now();
        const made = await notion("pages", "POST", { parent: { database_id: db }, properties: bookProps(cfg, f, start, {
          "상태": sel(ST.ok), "예약 경로": sel("학부모 직접"), "관리 키": { rich_text: rt(key) }, "접수 순서": { number: seq }, "담당": { rich_text: rt(cfg.owner) } }) });
        if (!made) return { status: 502, msg: "예약하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
        const me = readBook(made); dropCache();
        if (await lostRace(cfg, me)) {
          await notion("pages/" + uuid(me.id), "PATCH", { archived: true });
          return { status: 409, taken: true, msg: "방금 다른 분이 이 시간을 예약했어요. 다른 시간을 골라 주세요." };
        }
        await note(me, [await toParent("ok", cfg, me, base), await toTeacher("새 예약", cfg, me, base)]);
        return { book: pubBook(cfg, me, base), token: me.id + "." + me.key };
      });
    }

    if (act === "consult_find") { // 예약 확인하기: 휴대폰 번호 + 학생 이름
      if (limited(ip, "find", 10)) return { status: 429, msg: "여러 번 시도했어요. 10분 뒤에 다시 해 주세요." };
      const phone = fmtPhone(b.phone), student = clip(b.student, 20).replace(/\s+/g, "");
      if (!phone || !student) return { status: 400, msg: "휴대폰 번호와 학생 이름을 적어 주세요." };
      const l = await byPhone(phone); if (!l) return { status: 502, msg: "확인하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
      const mine = l.filter((x) => x.student.replace(/\s+/g, "") === student);
      if (!mine.length) return { status: 404, msg: "앞으로 남은 예약을 찾지 못했어요. 번호와 이름을 다시 확인해 주세요." };
      return { token: mine[0].id + "." + mine[0].key, book: pubBook(cfg, mine[0], base) };
    }

    if (act === "consult_get" || act === "consult_cancel" || act === "consult_move") {
      if (act !== "consult_get" && limited(ip, "edit", 12)) return { status: 429, msg: "잠시 뒤에 다시 시도해 주세요." };
      const bk = await auth(b.k);
      if (!bk) return { status: 404, msg: "예약을 찾을 수 없어요. 링크가 잘못되었거나 지워진 예약이에요." };
      if (act === "consult_get") return { book: pubBook(cfg, bk, base), info: info() };
      if (!live(bk) || bk.state !== ST.ok) return { status: 409, msg: "이미 취소되었거나 끝난 예약이에요.", book: pubBook(cfg, bk, base) };
      if (bk.start - Date.now() <= Math.max(1, cfg.minHours) * H) return { status: 409, msg: "상담 시간이 가까워 온라인으로는 바꿀 수 없어요. 학원으로 연락 주세요." + (cfg.tel ? " (" + cfg.tel + ")" : ""), book: pubBook(cfg, bk, base) };
      if (act === "consult_cancel") {
        const reason = clip(b.reason, 200);
        const r = await notion("pages/" + uuid(bk.id), "PATCH", { properties: { "상태": sel(ST.cancel), "취소 사유": { rich_text: rt("학부모 취소" + (reason ? ": " + reason : "")) } } });
        if (!r) return { status: 502, msg: "취소하지 못했어요. 잠시 뒤 다시 시도해 주세요." };
        bk.state = ST.cancel; dropCache();
        await note(bk, [await toParent("cancel", cfg, bk, base, { 링크: base + "/consult.html" }), await toTeacher("취소", cfg, bk, base)]);
        return { book: pubBook(cfg, bk, base) };
      }
      // 시간 바꾸기
      const date = String(b.date || ""), hm = String(b.hm || "");
      if (!isDate(date) || !isHm(hm)) return { status: 400, msg: "바꿀 날짜와 시간을 골라 주세요." };
      if (!cfg.open) return { status: 403, msg: "지금은 온라인으로 시간을 바꿀 수 없어요. 학원으로 연락 주세요." };
      return locked("day|" + date, async () => {
        const books = await liveBooks(cfg, true); if (!books) return { status: 502, msg: "바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요." };
        if (!slotOk(cfg, books, date, hm, Date.now(), bk.id)) return { status: 409, taken: true, msg: "방금 다른 분이 이 시간을 예약했어요. 다른 시간을 골라 주세요." };
        const old = Object.assign({}, bk), start = slotAt(date, hm), seq = Date.now();
        const f = { student: bk.student, grade: bk.grade, school: bk.school, parent: bk.parent, phone: bk.phone, mode: bk.mode, ask: bk.ask };
        const props = bookProps(cfg, f, start, { "접수 순서": { number: seq } });
        const r = await notion("pages/" + uuid(bk.id), "PATCH", { properties: { "예약": props["예약"], "상담 일시": props["상담 일시"], "접수 순서": props["접수 순서"] } });
        if (!r) return { status: 502, msg: "바꾸지 못했어요. 잠시 뒤 다시 시도해 주세요." };
        const me = readBook(r); dropCache();
        if (await lostRace(cfg, me)) { // 되돌리기
          await notion("pages/" + uuid(me.id), "PATCH", { properties: { "예약": { title: rt(old.title) }, "상담 일시": { date: { start: isoKst(old.start), end: isoKst(old.end) } }, "접수 순서": { number: old.seq } } });
          return { status: 409, taken: true, msg: "방금 다른 분이 이 시간을 예약했어요. 다른 시간을 골라 주세요." };
        }
        me.notice = bk.notice;
        await note(me, [stamp() + "학부모가 시간 변경: " + label(old.start) + " → " + label(me.start), await toParent("ok", cfg, me, base), await toTeacher("변경 (" + label(old.start) + "에서)", cfg, me, base)]);
        return { book: pubBook(cfg, me, base) };
      });
    }
    return { status: 400, msg: "알 수 없는 요청이에요." };
  }

  // =================== 선생님 ===================
  function teacherBook(b, base) {
    return { id: b.id, url: b.url, date: b.date, hm: b.hm, endHm: b.endHm, start: b.start, end: b.end, state: b.state, student: b.student, grade: b.grade, school: b.school,
      parent: b.parent, phone: b.phone, mode: b.mode, ask: b.ask, owner: b.owner, memo: b.memo, reason: b.reason, via: b.via, notice: b.notice, link: linkOf(b, base) };
  }
  const icsToken = () => crypto.createHmac("sha256", "cm-consult-ics|" + secret()).update("v1").digest("hex").slice(0, 32);
  async function teacher(act, b, me, base) {
    if (act === "t_consult_list") {
      const C = await loadCfg(true), db = await BOOK_DB();
      const from = isDate(b.from) ? b.from : addDays(dayOf(), -30), to = isDate(b.to) ? b.to : addDays(dayOf(), 120);
      const l = db ? await listRange(from, to) : null;
      return { cfg: C.cfg, dbOk: !!(db && C.dbOk !== false && l), list: (l || []).map((x) => teacherBook(x, base)), today: dayOf(), now: Date.now(),
        mode: { ok: N.mode(TPL.ok), alert: N.mode(TPL.alert) }, links: { book: base + "/consult.html", ics: base + "/api/monthly?consult_ics=" + icsToken() },
        free: freeSlots(C.cfg, (l || []).filter(live), Date.now()), err: db && l ? null : getLastErr() };
    }
    if (act === "t_consult_cfg") {
      const c = await saveCfg(b.cfg);
      if (!c) return { status: 502, msg: "설정을 저장하지 못했어요. 노션 연결을 확인해 주세요.", debug: getLastErr() };
      dropCache();
      return { cfg: c };
    }
    if (act === "t_consult_set") { // 상태·메모·담당 바꾸기 (취소하면 원하면 학부모님께 안내)
      const id = normId(b.id); if (!/^[0-9a-f]{32}$/.test(id)) return { status: 400, msg: "예약을 골라 주세요." };
      const p = await notion("pages/" + uuid(id), "GET"); const db = await BOOK_DB();
      if (!p || normId(p.parent && p.parent.database_id) !== normId(db)) return { status: 404, msg: "예약을 찾지 못했어요." };
      const bk = readBook(p), props = {};
      if (b.state != null) { if (!STATES.includes(b.state)) return { status: 400, msg: "상태가 올바르지 않아요." }; props["상태"] = sel(b.state); }
      if (b.memo != null) props["메모"] = { rich_text: rt(clip(b.memo, 1900)) };
      if (b.owner != null) props["담당"] = { rich_text: rt(clip(b.owner, 30)) };
      if (b.state === ST.cancel && b.reason != null) props["취소 사유"] = { rich_text: rt("학원 취소" + (clip(b.reason, 200) ? ": " + clip(b.reason, 200) : "")) };
      if (!Object.keys(props).length) return { book: teacherBook(bk, base) };
      const r = await notion("pages/" + uuid(id), "PATCH", { properties: props });
      if (!r) return { status: 502, msg: "저장하지 못했어요.", debug: getLastErr() };
      const nb = readBook(r); dropCache();
      if (b.state === ST.cancel && bk.state !== ST.cancel && b.notify) { const cfg = (await loadCfg()).cfg; await note(nb, [await toParent("cancel", cfg, nb, base, { 링크: base + "/consult.html" })]); }
      return { book: teacherBook(nb, base) };
    }
    if (act === "t_consult_add") { // 전화로 받은 예약을 선생님이 직접 넣기 (가능 시간 밖이어도 넣을 수 있어요)
      const cfg = (await loadCfg()).cfg, r = readForm(cfg, b, true); if (r.err) return { status: 400, msg: r.err };
      const date = String(b.date || ""), hm = String(b.hm || ""), dur = n(b.dur, 10, 240, cfg.dur);
      if (!isDate(date) || !isHm(hm)) return { status: 400, msg: "날짜와 시간을 골라 주세요." };
      const start = slotAt(date, hm), c2 = Object.assign({}, cfg, { dur });
      const books = await liveBooks(cfg, true) || [];
      const hit = books.find((x) => clash(cfg, start, start + dur * MIN, x));
      if (hit && !b.force) return { status: 409, clash: true, msg: label(hit.start) + " " + hit.student + " 학생 상담과 겹쳐요. 그래도 넣으려면 '겹쳐도 넣기'를 눌러 주세요." };
      const db = await BOOK_DB(); if (!db) return { status: 502, msg: "노션 연결을 확인해 주세요." };
      const key = b64u(crypto.randomBytes(18));
      const made = await notion("pages", "POST", { parent: { database_id: db }, properties: bookProps(c2, r.f, start, {
        "상태": sel(ST.ok), "예약 경로": sel("선생님 입력"), "관리 키": { rich_text: rt(key) }, "접수 순서": { number: Date.now() }, "담당": { rich_text: rt(clip(b.owner, 30) || cfg.owner) }, "메모": { rich_text: rt(clip(b.memo, 1900)) } }) });
      if (!made) return { status: 502, msg: "저장하지 못했어요.", debug: getLastErr() };
      const bk = readBook(made); dropCache();
      if (b.notify) await note(bk, [await toParent("ok", cfg, bk, base)]);
      else await note(bk, [stamp() + "선생님 입력 (" + me.name + "), 안내 문자 보내지 않음"]);
      return { book: teacherBook(bk, base) };
    }
    if (act === "t_consult_send") { // 확정 안내 다시 보내기
      const id = normId(b.id); const p = id ? await notion("pages/" + uuid(id), "GET") : null; const db = await BOOK_DB();
      if (!p || normId(p.parent && p.parent.database_id) !== normId(db)) return { status: 404, msg: "예약을 찾지 못했어요." };
      const bk = readBook(p), cfg = (await loadCfg()).cfg;
      const line = await toParent(b.kind === "remind" ? "remind" : "ok", cfg, bk, base); await note(bk, [line]);
      return { book: teacherBook(bk, base), msg: line };
    }
    if (act === "t_consult_tpl") {
      const cfg = (await loadCfg()).cfg;
      const sample = { parent: "김민지", student: "이준서", grade: "중1", phone: "010-1234-5678", mode: cfg.modes[0], ask: "내신 대비 반이 궁금해요", start: slotAt(addDays(dayOf(), 3), "15:00"), endHm: fromMin(15 * 60 + cfg.dur), id: "0".repeat(32), key: "예시" };
      return { list: Object.keys(TPL).map((k) => ({ kind: k, env: TPL[k].tplEnv, name: { ok: "예약 확정·변경 안내 (학부모)", remind: "상담 리마인더 (학부모)", cancel: "예약 취소 안내 (학부모)", alert: "새 예약 알림 (선생님)" }[k],
        template: TPL[k].template, sample: N.fill(Object.assign({ 학원: N.ACADEMY() }, vars(cfg, sample, base, { 구분: "새 예약" })), TPL[k].template), mode: N.mode(TPL[k]) })) };
    }
    return { status: 400, msg: "알 수 없는 요청이에요." };
  }

  // =================== ⏰ 리마인더 (GitHub Actions가 30분마다) ===================
  async function cron(base) {
    const cfg = (await loadCfg()).cfg; if (!cfg.remindH) return { ok: true, sent: 0, off: true };
    const now = Date.now(), l = await listRange(dayOf(now), dayOf(now + (cfg.remindH + 1) * H));
    if (!l) return { ok: false, msg: "노션을 읽지 못했어요." };
    let sent = 0;
    for (const bk of l) {
      if (!live(bk) || bk.state !== ST.ok || bk.start <= now || bk.start - now > cfg.remindH * H) continue;
      if (/리마인더:/.test(bk.notice)) continue;
      if (bk.seq > bk.start - cfg.remindH * H) { await note(bk, [stamp() + "리마인더: 보내지 않음 (가까운 시간에 예약해서 확정 안내로 대신)"]); continue; }
      await note(bk, [await toParent("remind", cfg, bk, base)]); sent++;
    }
    return { ok: true, sent };
  }

  // =================== 📆 캘린더 구독 (ICS) ===================
  function icsEsc(s) { return String(s || "").replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function fold(line) { // 한 줄 75바이트 넘으면 접기 (한글이 깨지지 않게 글자 단위로)
    const out = []; let cur = "", bytes = 0;
    for (const ch of line) { const b = Buffer.byteLength(ch); if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; } cur += ch; bytes += b; }
    out.push(cur); return out.join("\r\n ");
  }
  const utc = (ms) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  async function ics(tok, base) {
    if (!tok || !sameKey(String(tok), icsToken())) return null;
    const cfg = (await loadCfg()).cfg;
    const l = (await listRange(addDays(dayOf(), -60), addDays(dayOf(), 180))) || [];
    const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//cmacademy//consult//KO", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:" + icsEsc(N.ACADEMY() + " 상담 예약"), "X-WR-TIMEZONE:Asia/Seoul", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
    l.filter((x) => live(x)).forEach((x) => {
      L.push("BEGIN:VEVENT", "UID:" + x.id + "@cmacademy-consult", "DTSTAMP:" + utc(Date.now()), "DTSTART:" + utc(x.start), "DTEND:" + utc(x.end),
        fold("SUMMARY:" + icsEsc((x.state === ST.ok ? "" : "[" + x.state + "] ") + "상담 · " + x.student + (x.grade ? "(" + x.grade + ")" : "") + (x.mode ? " · " + x.mode : ""))),
        fold("DESCRIPTION:" + icsEsc(["학부모: " + x.parent + " " + x.phone, x.school ? "학교: " + x.school : "", x.ask ? "문의: " + x.ask : "", x.memo ? "메모: " + x.memo : "", x.url ? "노션: " + x.url : ""].filter(Boolean).join("\n"))),
        fold("LOCATION:" + icsEsc(/전화/.test(x.mode) ? "전화 " + x.phone : cfg.place)), "STATUS:CONFIRMED", "END:VEVENT");
    });
    L.push("END:VCALENDAR");
    return L.join("\r\n") + "\r\n";
  }

  return { pub, teacher, cron, ics, _t: { normCfg, freeSlots, rangesFor, label, DEF, TPL } };
};
