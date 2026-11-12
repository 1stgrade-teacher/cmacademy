// api/_plus.js — 🏫 플러스 수업 출결 (자습실)
// ------------------------------------------------------------------
// · 학생마다 매주 같은 요일·시각을 학생 DB의 「플러스 수업」 칸에 적어 둬요. (예: "화 17:00" / "화 17:00, 목 18:00")
// · 자습실 화면(/admin/plus.html?screen=1)에 30초마다 바뀌는 QR과 숫자 4자리가 떠요.
//   학생은 휴대폰으로 QR을 찍거나, 공용 태블릿(/plus.html)에 숫자 4자리를 넣고 → 반·이름·본인번호로 출석해요.
// · 수업 시각 10분 안에 출석 = '출석', 그 뒤(3시간 안) = '지각'. 출석하면 바로 학부모님께 참여 알림.
// · 수업 시각 10분이 지나도록 출석이 없으면 '미참여'로 기록하고 학부모님께 알림. (반 일정에 '휴원'인 날은 '면제')
// · 미참여 확인은 ① 자습실 출석 화면이 켜져 있으면 1분마다 ② Vercel 크론(Pro) ③ GitHub Actions(5분마다, 예비)가 불러요.
//   여러 곳에서 동시에 불러도 학생·수업마다 한 번만 처리돼요.
// 노션: 🏫 플러스 수업 출결 (NOTION_PLUS_DB_ID로 바꿀 수 있음)
// 알림톡 템플릿 ID: KAKAO_TPL_PLUS_IN(참여), KAKAO_TPL_PLUS_OUT(미참여) — 없으면 문자로, 솔라피가 없으면 '발송 설정 전'으로 기록만
// ------------------------------------------------------------------
const crypto = require("crypto");
const N = require("./_notify.js");

const TPL = {
  in: {
    tplEnv: "KAKAO_TPL_PLUS_IN",
    template: "[#{학원}] 플러스 수업 참여 안내\n\n#{학생} 학생이 오늘 플러스 수업에 참여했습니다.\n\n■ 수업: #{수업}\n■ 출석: #{출석}\n\n자습실에서 학습을 시작했습니다. 문의는 학원으로 연락 주세요.",
  },
  out: {
    tplEnv: "KAKAO_TPL_PLUS_OUT",
    template: "[#{학원}] 플러스 수업 미참여 안내\n\n#{학생} 학생이 오늘 플러스 수업에 참여하지 않았습니다.\n\n■ 수업: #{수업}\n■ 확인 시각: #{확인}\n\n가정에서 한 번 확인 부탁드립니다. 문의는 학원으로 연락 주세요.",
  },
};

module.exports = function (ctx) {
  const { notion, queryAll, P, rt, sel, clip, uuid, normId, id32, STUDENT_DB, SCHED_DB, secret, signToken, readToken, login, getLastErr } = ctx;
  const PLUS_DB = () => id32(process.env.NOTION_PLUS_DB_ID || "c539836a490b41ec98df5ddc0b384b6d");
  const PROP = "플러스 수업";
  const MIN = 60000;
  const GRACE = () => Math.max(1, Math.min(60, Number(process.env.PLUS_GRACE_MIN) || 10)) * MIN; // 이 안에 오면 '출석'
  const EARLY = 30 * MIN;   // 수업 30분 전부터 출석 가능
  const LATE_MAX = 180 * MIN; // 수업 3시간 뒤까지는 '지각'으로 출석 가능, 미참여 확인도 이 안에서만 (오래된 알림 방지)
  const WIN = 30000;        // 화면 코드가 바뀌는 간격
  const KEEP = 4;           // 지난 코드도 이만큼(약 2분)은 받아 줌
  const DAYS = "일월화수목금토";

  // ---------- 한국 시간 ----------
  const kst = (ms) => new Date((ms == null ? Date.now() : ms) + 9 * 3600e3);
  const dayOf = (ms) => kst(ms).toISOString().slice(0, 10);
  const dowOf = (ms) => kst(ms).getUTCDay();
  const hmOf = (ms) => kst(ms).toISOString().slice(11, 16);
  const isoKst = (ms) => kst(ms).toISOString().slice(0, 19) + "+09:00";
  const slotAt = (date, hm) => Date.parse(date + "T" + hm + ":00+09:00");
  const label = (date, hm) => Number(date.slice(5, 7)) + "/" + Number(date.slice(8, 10)) + "(" + DAYS[new Date(date + "T00:00:00Z").getUTCDay()] + ") " + hm;

  // "화 17:00, 목 6시 30분" → [{dow:2, hm:"17:00"}, ...]
  function parseSlots(s) {
    const out = [], seen = {};
    String(s || "").replace(/([일월화수목금토])(?:요일)?\s*(\d{1,2})\s*(?:[:시]\s*(\d{1,2})?\s*분?)?/g, function (m, d, h, mi) {
      h = Number(h); mi = Number(mi || 0);
      if (h > 23 || mi > 59) return m;
      const x = { dow: DAYS.indexOf(d), hm: String(h).padStart(2, "0") + ":" + String(mi).padStart(2, "0") };
      if (!seen[x.dow + x.hm]) { seen[x.dow + x.hm] = 1; out.push(x); }
      return m;
    });
    return out.sort((a, b) => ((a.dow + 6) % 7) - ((b.dow + 6) % 7) || (a.hm < b.hm ? -1 : 1));
  }
  const fmtSlots = (a) => a.map((x) => DAYS[x.dow] + " " + x.hm).join(", ");

  // ---------- 화면 코드 (QR · 숫자 4자리) ----------
  const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  function codeFor(w) {
    const h = crypto.createHmac("sha256", "cm-plus|" + secret()).update(String(w)).digest();
    return { qr: w.toString(36) + "." + b64u(h.subarray(0, 9)), pin: String(h.readUInt32BE(12) % 10000).padStart(4, "0") };
  }
  function proofOk(p) {
    p = String(p || "").trim(); if (!p) return "";
    const w = Math.floor(Date.now() / WIN);
    for (let i = 0; i < KEEP; i++) { const c = codeFor(w - i); if (p === c.pin) return "숫자"; if (p === c.qr) return "QR"; }
    return "";
  }
  const fails = new Map(); // 코드를 계속 틀리면 잠시 막기 (숫자 맞히기 방지)
  const blocked = (ip) => { const e = fails.get(ip); return !!e && Date.now() - e.t < 10 * MIN && e.n >= 40; }; // 학원 와이파이는 학생 모두 같은 주소라 넉넉하게
  const fail = (ip) => { const e = fails.get(ip); if (!e || Date.now() - e.t >= 10 * MIN) fails.set(ip, { n: 1, t: Date.now() }); else e.n++; if (fails.size > 3000) fails.clear(); };
  function proof(p, ip) {
    if (blocked(ip)) return { status: 429, msg: "숫자를 여러 번 틀렸어요. 10분 뒤에 다시 해 주세요." };
    const how = proofOk(p);
    if (!how) { fail(ip); return { status: 403, expired: true, msg: "화면의 숫자가 바뀌었거나 맞지 않아요. 자습실 화면의 숫자를 다시 넣어 주세요." }; }
    return { status: 200, how };
  }

  // ---------- 학생 ----------
  function readStu(p) {
    return { id: normId(p.id), name: P.title(p, "이름"), cls: P.sel(p, "반") || "기타", slots: parseSlots(P.text(p, PROP)), slotText: P.text(p, PROP),
      phone: (p.properties["학부모 연락처"] || {}).phone_number || "", mute: P.chk(p, "알림 끄기"), state: P.sel(p, "상태"), hasPin: !!P.text(p, "본인번호") };
  }
  const active = (s) => !["휴원", "퇴원"].includes(s.state);
  let cache = { t: 0, list: null };
  async function scheduled(fresh) {
    if (!fresh && cache.list && Date.now() - cache.t < 60000) return cache.list;
    const rows = await queryAll(STUDENT_DB(), { filter: { property: PROP, rich_text: { is_not_empty: true } }, sorts: [{ property: "이름", direction: "ascending" }] }, 6);
    if (!rows) return null;
    cache = { t: Date.now(), list: rows.map(readStu).filter((s) => active(s) && s.slots.length) };
    return cache.list;
  }
  async function student(sid) {
    const p = await notion("pages/" + id32(sid), "GET");
    return p && normId(p.parent && p.parent.database_id) === normId(STUDENT_DB()) ? readStu(p) : null;
  }

  // 반 일정에 '휴원'인 날
  async function closedOn(date) {
    if (!SCHED_DB) return { all: false, cls: new Set() };
    const rows = await queryAll(SCHED_DB(), { filter: { and: [{ property: "날짜", date: { equals: date } }, { property: "종류", select: { equals: "휴원" } }, { property: "사용", checkbox: { equals: true } }] } }, 1);
    const cls = new Set((rows || []).map((p) => P.text(p, "반").trim()));
    return { all: cls.has("전체"), cls };
  }

  // ---------- 출결 기록 ----------
  const keyOf = (sid, date, hm) => normId(sid) + "|" + date + "|" + hm;
  function readRec(p) {
    const k = P.text(p, "키").split("|"), at = P.date(p, "출석 시각");
    return { id: normId(p.id), url: p.url, key: P.text(p, "키"), sid: P.rel(p, "학생")[0] || k[0] || "", title: P.title(p, "기록"), cls: P.text(p, "반"), date: k[1] || "", hm: k[2] || "",
      state: P.sel(p, "상태"), at: at && at.start ? hmOf(Date.parse(at.start)) : "", how: P.sel(p, "방법"), notice: P.text(p, "알림 결과"), memo: P.text(p, "메모"), created: p.created_time };
  }
  async function byKey(key) {
    const rows = await queryAll(PLUS_DB(), { filter: { property: "키", rich_text: { equals: key } }, sorts: [{ timestamp: "created_time", direction: "ascending" }] }, 1);
    return rows && rows.filter((p) => !p.archived).map(readRec);
  }
  async function onDay(date) {
    const rows = await queryAll(PLUS_DB(), { filter: { property: "키", rich_text: { contains: "|" + date + "|" } } }, 4);
    return rows && rows.map(readRec);
  }
  function recProps(st, date, hm, extra) {
    return Object.assign({
      "기록": { title: rt(st.name + " · " + label(date, hm)) }, "학생": { relation: [{ id: uuid(st.id) }] }, "반": { rich_text: rt(st.cls) },
      "수업 시각": { date: { start: date + "T" + hm + ":00+09:00" } }, "키": { rich_text: rt(keyOf(st.id, date, hm)) },
    }, extra);
  }
  const stamp = () => hmOf() + " ";
  async function notify(kind, st, vars) {
    const tag = stamp() + (kind === "in" ? "참여 알림: " : "미참여 알림: ");
    if (st.mute) return tag + "보내지 않음 (알림 끄기 학생)";
    if (!N.phone(st.phone)) return tag + "보내지 않음 (학부모 연락처 없음)";
    const r = (await N.sendMany([{ to: st.phone, vars }], TPL[kind]))[0] || {};
    return tag + (r.msg || "");
  }
  const addNote = (old, s) => clip((old ? old + "\n" : "") + s, 1900);

  // ---------- 출석 ----------
  function slotNow(st, now) {
    const date = dayOf(now), dow = dowOf(now);
    const c = st.slots.filter((x) => x.dow === dow).map((x) => ({ date, hm: x.hm, t: slotAt(date, x.hm) }))
      .filter((x) => now >= x.t - EARLY && now <= x.t + LATE_MAX);
    c.sort((a, b) => Math.abs(now - a.t) - Math.abs(now - b.t));
    return c[0] || null;
  }
  const busy = new Set();
  async function checkIn(sid, how) {
    const now = Date.now();
    const st = await student(sid);
    if (!st) return { status: 404, msg: "학생을 찾지 못했어요." };
    if (!st.slots.length) return { status: 400, msg: "플러스 수업 시간이 아직 등록되지 않았어요. 선생님께 말씀해 주세요." };
    const c = slotNow(st, now);
    if (!c) return { status: 400, msg: "지금은 " + st.name + " 학생의 플러스 수업 시간이 아니에요. (내 플러스 수업: " + fmtSlots(st.slots) + ")" };
    const key = keyOf(st.id, c.date, c.hm);
    if (busy.has(key)) return { status: 409, msg: "출석을 처리하고 있어요. 잠시만 기다려 주세요." };
    busy.add(key);
    try {
      const rows = await byKey(key);
      if (!rows) return { status: 502, msg: "출결 기록을 읽지 못했어요. 선생님께 알려 주세요.", debug: getLastErr() };
      const old = rows[0];
      if (old && (old.state === "출석" || old.state === "지각")) return { status: 200, already: true, name: st.name, cls: st.cls, state: old.state, at: old.at, slot: label(c.date, c.hm) };
      const late = now > c.t + GRACE(), state = late ? "지각" : "출석", lateMin = Math.max(0, Math.round((now - c.t) / MIN));
      const props = { "상태": sel(state), "출석 시각": { date: { start: isoKst(now) } }, "방법": sel(how) };
      const pg = old ? await notion("pages/" + id32(old.id), "PATCH", { properties: props }) : await notion("pages", "POST", { parent: { database_id: PLUS_DB() }, properties: recProps(st, c.date, c.hm, props) });
      if (!pg) return { status: 502, msg: "출석을 저장하지 못했어요. 다시 해 주세요.", debug: getLastErr() };
      const note = await notify("in", st, { 학생: st.name, 수업: label(c.date, c.hm) + " 플러스 수업", 출석: hmOf(now) + (late ? " (" + lateMin + "분 늦게 출석)" : " (정시 출석)") });
      await notion("pages/" + id32(pg.id), "PATCH", { properties: { "알림 결과": { rich_text: rt(addNote(old && old.notice, note)) } } }, 2);
      return { status: 200, name: st.name, cls: st.cls, state, at: hmOf(now), slot: label(c.date, c.hm), late: lateMin };
    } finally { busy.delete(key); }
  }

  // ---------- 미참여 확인 ----------
  let lastTick = 0, ticking = false;
  async function tick(force) {
    if (ticking || (!force && Date.now() - lastTick < 40000)) return { ok: true, skipped: true };
    ticking = true; lastTick = Date.now();
    try {
      const now = Date.now(), date = dayOf(now), dow = dowOf(now);
      const list = await scheduled(true);
      if (!list) return { ok: false, msg: "학생 명단을 읽지 못했어요.", debug: getLastErr() };
      const due = [];
      list.forEach((st) => st.slots.forEach((x) => { if (x.dow !== dow) return; const t = slotAt(date, x.hm); if (now >= t + GRACE() && now <= t + LATE_MAX) due.push({ st, hm: x.hm }); }));
      if (!due.length) return { ok: true, due: 0 };
      const recs = await onDay(date);
      if (!recs) return { ok: false, msg: "출결 기록을 읽지 못했어요. 노션 🏫 플러스 수업 출결에 'cmacademy 학습인증' 연결이 있는지 확인해 주세요.", debug: getLastErr() };
      const have = new Set(recs.map((r) => r.key));
      const todo = due.filter((d) => !have.has(keyOf(d.st.id, date, d.hm)));
      if (!todo.length) return { ok: true, due: due.length, absent: 0 };
      const closed = await closedOn(date);
      let absent = 0, exempt = 0;
      for (const d of todo) {
        const st = d.st, key = keyOf(st.id, date, d.hm);
        if (closed.all || closed.cls.has(st.cls)) {
          const pg = await notion("pages", "POST", { parent: { database_id: PLUS_DB() }, properties: recProps(st, date, d.hm, { "상태": sel("면제"), "메모": { rich_text: rt("반 일정: 휴원") } }) });
          if (pg) exempt++; continue;
        }
        const pg = await notion("pages", "POST", { parent: { database_id: PLUS_DB() }, properties: recProps(st, date, d.hm, { "상태": sel("미참여") }) });
        if (!pg) continue;
        const rows = await byKey(key); // 동시에 두 곳에서 처리했으면 먼저 만든 쪽만 남김
        if (rows && rows.length > 1 && rows[0].id !== normId(pg.id)) { await notion("pages/" + id32(pg.id), "PATCH", { archived: true }, 2); continue; }
        const note = await notify("out", st, { 학생: st.name, 수업: label(date, d.hm) + " 플러스 수업", 확인: hmOf(now) });
        await notion("pages/" + id32(pg.id), "PATCH", { properties: { "알림 결과": { rich_text: rt(note) } } }, 2);
        absent++;
      }
      return { ok: true, due: due.length, absent, exempt };
    } catch (e) { return { ok: false, msg: clip(e && e.message, 200) }; }
    finally { ticking = false; }
  }

  // ---------- 오늘 현황 ----------
  async function board(date, cls) {
    date = /^\d{4}-\d{2}-\d{2}$/.test(date || "") ? date : dayOf();
    const dow = new Date(date + "T00:00:00Z").getUTCDay();
    const [list, recs] = await Promise.all([scheduled(), onDay(date)]);
    if (!list || !recs) return null;
    const by = new Map(recs.map((r) => [r.key, r])), now = Date.now(), out = [];
    list.forEach((st) => { if (cls && st.cls !== cls) return; st.slots.forEach((x) => {
      if (x.dow !== dow) return;
      const r = by.get(keyOf(st.id, date, x.hm)), t = slotAt(date, x.hm);
      out.push({ sid: st.id, name: st.name, cls: st.cls, hm: x.hm, state: r ? r.state : now < t + GRACE() ? "대기" : "확인 중", at: r ? r.at : "", how: r ? r.how : "", notice: r ? r.notice : "", memo: r ? r.memo : "", rec: r ? r.id : "", url: r ? r.url : "" });
    }); });
    out.sort((a, b) => (a.hm < b.hm ? -1 : a.hm > b.hm ? 1 : a.name < b.name ? -1 : 1));
    return { date, label: label(date, "").trim(), list: out };
  }

  // ---------- 학생 화면 (/plus.html) ----------
  // 오늘 플러스 수업이 있는 학생만 반별로 (화면 숫자를 맞혀야 볼 수 있음)
  async function today(b, ip) {
    const pr = proof(b.proof, ip); if (pr.status !== 200) return pr;
    const list = await scheduled(); if (!list) return { status: 502, msg: "명단을 불러오지 못했어요." };
    const now = Date.now(), dow = dowOf(now), date = dayOf(now), m = new Map();
    list.forEach((st) => { const sl = st.slots.filter((x) => x.dow === dow && now >= slotAt(date, x.hm) - EARLY && now <= slotAt(date, x.hm) + LATE_MAX); if (!sl.length) return;
      if (!m.has(st.cls)) m.set(st.cls, []); m.get(st.cls).push({ id: st.id, name: st.name, hasPin: st.hasPin, hm: sl.map((x) => x.hm).join(", ") }); });
    return { status: 200, how: pr.how, classes: Array.from(m.keys()).sort().map((c) => ({ cls: c, students: m.get(c) })) };
  }
  async function check(b, ip) {
    const pr = proof(b.proof, ip); if (pr.status !== 200) return pr;
    const lg = await login(clip(b.sid, 60), String(b.pin || ""), !!b.setPin);
    if (lg.status !== 200) return { status: lg.status, msg: lg.msg, needSet: lg.needSet };
    if (b.setPin) cache.t = 0; // 방금 번호를 정했으면 명단을 새로 읽게
    return checkIn(lg.sid, b.how === "QR" || pr.how === "QR" ? "QR" : "숫자");
  }

  // ---------- 출석 화면 (자습실) ----------
  const screenToken = (me) => signToken({ sc: "ps", by: me.name, exp: Date.now() + 365 * 864e5 });
  async function screen(b) {
    const t = readToken(b.screen); if (!t || t.sc !== "ps") return { status: 401, msg: "출석 화면을 다시 켜 주세요. (선생님 화면 → 출석 화면 켜기)" };
    const w = Math.floor(Date.now() / WIN), c = codeFor(w);
    const out = { status: 200, qr: c.qr, pin: c.pin, left: WIN - (Date.now() % WIN), now: hmOf() };
    if (b.board) { tick(false).catch(() => {}); const bd = await board(); if (bd) out.board = bd; }
    return out;
  }

  // ---------- 선생님 ----------
  async function teacher(act, b, me) {
    if (act === "t_plus_list") {
      const cls = clip(b.cls, 40);
      const rows = await queryAll(STUDENT_DB(), cls ? { filter: { property: "반", select: { equals: cls } }, sorts: [{ property: "이름", direction: "ascending" }] } : { filter: { property: PROP, rich_text: { is_not_empty: true } }, sorts: [{ property: "이름", direction: "ascending" }] }, 6);
      if (!rows) return { status: 502, msg: "학생 명단을 읽지 못했어요.", debug: getLastErr() };
      const ok = await notion("databases/" + PLUS_DB(), "GET", null, 1);
      return { status: 200, dbOk: !!ok, dbErr: ok ? null : getLastErr(), students: rows.map(readStu).filter(active).map((s) => ({ id: s.id, name: s.name, cls: s.cls, slots: fmtSlots(s.slots), raw: s.slotText, phone: !!N.phone(s.phone), mute: s.mute })), mode: { in: N.mode(TPL.in), out: N.mode(TPL.out) } };
    }
    if (act === "t_plus_board") { const bd = await board(clip(b.date, 10), clip(b.cls, 40)); return bd ? Object.assign({ status: 200 }, bd) : { status: 502, msg: "출결 기록을 읽지 못했어요. 노션 🏫 플러스 수업 출결에 'cmacademy 학습인증' 연결이 있는지 확인해 주세요.", debug: getLastErr() }; }
    if (act === "t_plus_set") {
      const raw = clip(b.slots, 200), sl = parseSlots(raw);
      if (raw.trim() && !sl.length) return { status: 400, msg: "요일과 시각을 '화 17:00'처럼 써 주세요." };
      const st = await student(b.sid); if (!st) return { status: 404, msg: "학생을 찾지 못했어요." };
      const up = await notion("pages/" + id32(st.id), "PATCH", { properties: { [PROP]: { rich_text: rt(fmtSlots(sl)) } } });
      cache.t = 0;
      return up ? { status: 200, slots: fmtSlots(sl) } : { status: 502, msg: "저장하지 못했어요.", debug: getLastErr() };
    }
    if (act === "t_plus_mark") { // 선생님이 직접: 면제(미리 결석 연락) · 출석 · 미참여 — 알림은 보내지 않아요
      const state = ["출석", "지각", "미참여", "면제"].includes(b.state) ? b.state : null;
      const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date || "") ? b.date : null, hm = /^\d{2}:\d{2}$/.test(b.hm || "") ? b.hm : null;
      if (!state || !date || !hm) return { status: 400, msg: "날짜·시각·상태를 확인해 주세요." };
      const st = await student(b.sid); if (!st) return { status: 404, msg: "학생을 찾지 못했어요." };
      const rows = await byKey(keyOf(st.id, date, hm)); if (!rows) return { status: 502, msg: "출결 기록을 읽지 못했어요.", debug: getLastErr() };
      const memo = clip(b.memo, 300) || (state === "면제" ? "미리 연락" : "") ;
      const props = { "상태": sel(state), "방법": sel("선생님"), "메모": { rich_text: rt(clip((memo ? memo + " · " : "") + me.name + " 선생님 " + dayOf().slice(5) + " " + hmOf(), 500)) } };
      if ((state === "출석" || state === "지각") && !(rows[0] && rows[0].at)) props["출석 시각"] = { date: { start: date + "T" + hm + ":00+09:00" } };
      const pg = rows[0] ? await notion("pages/" + id32(rows[0].id), "PATCH", { properties: props }) : await notion("pages", "POST", { parent: { database_id: PLUS_DB() }, properties: recProps(st, date, hm, props) });
      return pg ? { status: 200 } : { status: 502, msg: "저장하지 못했어요.", debug: getLastErr() };
    }
    if (act === "t_plus_screen") return { status: 200, screen: screenToken(me) };
    if (act === "t_plus_tick") { lastTick = 0; return Object.assign({ status: 200 }, await tick(true)); }
    if (act === "t_plus_template") {
      const sv = { 학원: N.ACADEMY(), 학생: "김민준", 수업: "11/17(화) 17:00 플러스 수업" };
      return { status: 200, in: { template: TPL.in.template, sample: N.fill(Object.assign({ 출석: "17:03 (정시 출석)" }, sv), TPL.in.template), mode: N.mode(TPL.in), env: TPL.in.tplEnv },
        out: { template: TPL.out.template, sample: N.fill(Object.assign({ 확인: "17:10" }, sv), TPL.out.template), mode: N.mode(TPL.out), env: TPL.out.tplEnv } };
    }
    return { status: 400, msg: "action" };
  }

  return { parseSlots, fmtSlots, codeFor, proofOk, tick, today, check, screen, teacher, board, TPL };
};
