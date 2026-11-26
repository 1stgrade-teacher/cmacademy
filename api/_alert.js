// api/_alert.js — 🔔 학부모 알림(무료 푸시) + 🔔 알림함
//   · 부모님이 학부모 앱에서 「🔔 알림 받기」를 누르면 그 기기의 구독 정보를 학생 페이지 「알림 구독」 칸에 저장해요(한 아이에 여러 기기 가능).
//   · 알림을 보낼 때마다 노션 「🔔 학부모 알림함」 DB에 한 줄씩 남겨요 → 부모님 앱 「🔔 알림」 탭에서 모아 봐요.
//   · 문자/알림톡(솔라피)은 설정에 따라 '앱 알림을 못 받는 부모님께만' 보내거나 아예 끄요.
const PUSH = require("./_push.js");

module.exports = function (ctx) {
  const { notion, queryAll, P, rt, sel, clip, uuid, normId, id32, STUDENT_DB, HW, secret, getLastErr } = ctx;
  const SUBP = "알림 구독", INBOX_TITLE = "🔔 학부모 알림함";
  const KINDS = { 과제: "📸", "플러스 수업": "🏫", 시험: "📝", 상담: "💬", 공지: "📢", 기타: "🔔" };
  const kst = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 16) : "");
  const rtLong = (s) => { s = String(s || ""); const out = []; for (let i = 0; i < s.length && out.length < 40; i += 1900) out.push({ type: "text", text: { content: s.slice(i, i + 1900) } }); return out; };

  // ---------- 노션 준비 ----------
  let subProp = false;
  async function ensureSubProp() {
    if (subProp) return true;
    const d = await notion("databases/" + STUDENT_DB(), "GET", null, 2); if (!d) return false;
    if (d.properties && d.properties[SUBP]) return (subProp = true);
    const u = await notion("databases/" + STUDENT_DB(), "PATCH", { properties: { [SUBP]: { rich_text: {} } } }, 2);
    return (subProp = !!(u && u.properties && u.properties[SUBP]));
  }
  let inboxDb = process.env.NOTION_ALERT_DB_ID ? id32(process.env.NOTION_ALERT_DB_ID) : null, inboxDesc = { t: 0, v: "" };
  let inboxP = null; // 처음 여러 알림이 동시에 가도 알림함 DB는 하나만 만들게
  function INBOX_DB() { if (inboxDb) return Promise.resolve(inboxDb); return inboxP || (inboxP = findInbox().then((v) => { inboxP = null; return v; }, () => { inboxP = null; return null; })); }
  async function findInbox() {
    if (inboxDb) return inboxDb;
    const s = await notion("search", "POST", { query: "학부모 알림함", filter: { property: "object", value: "database" }, page_size: 20 }, 2);
    const hit = s && (s.results || []).find((d) => (d.title || []).map((t) => t.plain_text).join("") === INBOX_TITLE && !d.archived && !d.in_trash);
    if (hit) return (inboxDb = normId(hit.id));
    const hwDb = await notion("databases/" + HW().HW_DB(), "GET", null, 2);
    const parent = hwDb && hwDb.parent && hwDb.parent.type === "page_id" && hwDb.parent.page_id;
    if (!parent) return null;
    const made = await notion("databases", "POST", {
      parent: { type: "page_id", page_id: parent }, title: [{ type: "text", text: { content: INBOX_TITLE } }],
      description: [{ type: "text", text: { content: "학부모님께 보낸 앱 알림(무료 푸시)이 모두 쌓여요. 부모님 앱 「🔔 알림」 탭에 그대로 보여요. [문자:nopush]" } }],
      properties: {
        "제목": { title: {} }, "학생": { relation: { database_id: uuid(STUDENT_DB()), single_property: {} } }, "반": { rich_text: {} },
        "종류": { select: { options: Object.keys(KINDS).map((k, i) => ({ name: k, color: ["blue", "green", "purple", "orange", "red", "gray"][i] })) } },
        "내용": { rich_text: {} }, "링크": { url: {} }, "보낸 결과": { rich_text: {} }, "보낸 사람": { rich_text: {} },
      },
    }, 2);
    return made ? (inboxDb = normId(made.id)) : null;
  }

  // ---------- 문자(솔라피) 함께 쓰기 설정: 알림함 DB 설명의 [문자:…] ----------
  //   nopush = 앱 알림을 못 받는 부모님께만 문자(기본) · off = 문자 안 보냄(앱 알림만) · all = 앱 알림 + 문자 모두
  async function smsMode(fresh) {
    if (!fresh && Date.now() - inboxDesc.t < 60000) return inboxDesc.v || "nopush";
    const db = await INBOX_DB(); const d = db && await notion("databases/" + db, "GET", null, 1);
    const txt = d ? (d.description || []).map((t) => t.plain_text).join("") : "";
    const m = /\[문자:(nopush|off|all)\]/.exec(txt); inboxDesc = { t: Date.now(), v: m ? m[1] : "nopush", txt };
    return inboxDesc.v;
  }
  async function setSmsMode(v) {
    if (!["nopush", "off", "all"].includes(v)) return false;
    await smsMode(true); const db = await INBOX_DB(); if (!db) return false;
    const base = String(inboxDesc.txt || "").replace(/\s*\[문자:[a-z]+\]/g, "").trim() || "학부모님께 보낸 앱 알림(무료 푸시)이 모두 쌓여요.";
    const u = await notion("databases/" + db, "PATCH", { description: [{ type: "text", text: { content: base + " [문자:" + v + "]" } }] }, 2);
    inboxDesc = { t: 0, v: "" }; return !!u;
  }

  // ---------- 구독 ----------
  function subsOf(p) { try { const a = JSON.parse(P.text(p, SUBP) || "[]"); return Array.isArray(a) ? a.filter((x) => x && x.e && x.p && x.a) : []; } catch (e) { return []; } }
  async function saveSubs(sid, list) {
    if (!(await ensureSubProp())) return false;
    return !!(await notion("pages/" + id32(sid), "PATCH", { properties: { [SUBP]: { rich_text: rtLong(JSON.stringify(list.slice(-8))) } } }, 2));
  }
  async function subscribe(page, sub, label) {
    const e = clip(sub && sub.endpoint, 900), p = clip(sub && sub.keys && sub.keys.p256dh, 200), a = clip(sub && sub.keys && sub.keys.auth, 60);
    if (!/^https:\/\//.test(e) || !p || !a) return { status: 400, msg: "알림 구독 정보가 올바르지 않아요." };
    const list = subsOf(page).filter((x) => x.e !== e); list.push({ e, p, a, d: clip(label, 40), at: kst(new Date().toISOString()) });
    return (await saveSubs(normId(page.id), list)) ? { status: 200, n: list.length } : { status: 502, msg: "알림 구독을 저장하지 못했어요.", debug: getLastErr() };
  }
  async function unsubscribe(page, endpoint) {
    const list = subsOf(page), left = list.filter((x) => x.e !== endpoint);
    if (left.length === list.length) return { status: 200, n: left.length };
    return (await saveSubs(normId(page.id), left)) ? { status: 200, n: left.length } : { status: 502, msg: "저장하지 못했어요." };
  }

  // ---------- 보내기 ----------
  // st: 학생 페이지(또는 id) · m: { kind, title, body, url, by } · sms: () => Promise<{ok,msg}> (문자 보내는 함수, 없으면 문자 없음)
  async function deliver(st, m, sms) {
    const page = typeof st === "string" ? await notion("pages/" + id32(st), "GET", null, 2) : st;
    if (!page || normId(page.parent && page.parent.database_id) !== normId(STUDENT_DB())) return { ok: false, note: "🔔 학생을 찾지 못했어요" };
    const sid = normId(page.id), subs = subsOf(page), kind = KINDS[m.kind] ? m.kind : "기타";
    const title = clip(m.title, 80), body = clip(m.body, 600);
    const db = await INBOX_DB();
    const row = db ? await notion("pages", "POST", { parent: { database_id: db }, properties: {
      "제목": { title: rt(title) }, "학생": { relation: [{ id: uuid(sid) }] }, "반": { rich_text: rt(P.sel(page, "반")) }, "종류": sel(kind),
      "내용": { rich_text: rt(body) }, "보낸 사람": { rich_text: rt(clip(m.by, 40)) }, ...(m.link ? { "링크": { url: clip(m.link, 500) } } : {}),
    } }, 2) : null;
    const key = P.text(page, "부모 링크 키"), url = key ? "/parent?k=" + sid + "." + key + "#inbox" : "/parent.html";
    let ok = 0; const gone = [];
    await Promise.all(subs.map(async (s) => {
      const r = await PUSH.send(secret(), { endpoint: s.e, keys: { p256dh: s.p, auth: s.a } }, { title, body: clip(body, 240), url, tag: m.tag || kind + "-" + Date.now(), kind, icon: "/icon-192.png" });
      if (r.ok) ok++; else if (r.gone) gone.push(s.e);
    }));
    if (gone.length) await saveSubs(sid, subs.filter((s) => !gone.includes(s.e)));
    let note = ok ? "🔔 앱 알림 보냄" + (ok > 1 ? "(" + ok + "대)" : "") : subs.length - gone.length > 0 ? "🔔 앱 알림 실패" : "🔔 앱 알림 안 켬";
    if (sms) {
      const mode = await smsMode();
      if (mode === "all" || (mode === "nopush" && !ok)) { const r = await sms(); if (r && r.msg) note += " · " + r.msg; }
    }
    if (row) await notion("pages/" + id32(row.id), "PATCH", { properties: { "보낸 결과": { rich_text: rt(note) } } }, 1);
    return { ok: ok > 0, pushed: ok, subs: subs.length - gone.length, note, logged: !!row };
  }

  // ---------- 부모님 알림함 ----------
  async function inbox(sid, n) {
    const db = await INBOX_DB(); if (!db) return null;
    const j = await notion("databases/" + db + "/query", "POST", { filter: { property: "학생", relation: { contains: uuid(sid) } }, sorts: [{ timestamp: "created_time", direction: "descending" }], page_size: Math.min(100, n || 60) }, 2);
    return j ? (j.results || []).map((p) => ({ id: normId(p.id), kind: P.sel(p, "종류"), icon: KINDS[P.sel(p, "종류")] || "🔔", title: P.title(p, "제목"), body: P.text(p, "내용"), link: (p.properties["링크"] || {}).url || "", by: P.text(p, "보낸 사람"), at: kst(p.created_time) })) : null;
  }

  // ---------- 선생님: 반별 알림 현황 ----------
  async function overview(cls) {
    const rows = await queryAll(STUDENT_DB(), cls ? { filter: { property: "반", select: { equals: cls } }, sorts: [{ property: "이름", direction: "ascending" }] } : { sorts: [{ property: "이름", direction: "ascending" }] }, 6);
    if (!rows) return null;
    return rows.filter((p) => !["휴원", "퇴원"].includes(P.sel(p, "상태"))).map((p) => { const s = subsOf(p); return { sid: normId(p.id), name: P.title(p, "이름"), cls: P.sel(p, "반"), subs: s.length, last: s.map((x) => x.at).sort().pop() || "", devices: s.map((x) => x.d).filter(Boolean), phone: !!(p.properties["학부모 연락처"] || {}).phone_number, mute: P.chk(p, "알림 끄기"), link: !!P.text(p, "부모 링크 키") }; });
  }

  return { deliver, inbox, subscribe, unsubscribe, subsOf, overview, smsMode, setSmsMode, INBOX_DB, ensureSubProp, publicKey: () => PUSH.publicKey(secret()), KINDS };
};
