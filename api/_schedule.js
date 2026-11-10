// api/_schedule.js — 📅 반 일정: 단어시험·평가·휴원 같은 일정을 미리 넣어 두면 학생 달력·다가오는 일정·학부모 앱에 보여요
// 노션: 📅 반 일정 (일정명 · 반 · 날짜 · 종류 · 범위 · 메모 · 사용 · 만든 선생님)
//   반에 '전체'를 쓰면 모든 반에 보여요. 과제와 달리 제출·알림은 없어요.
module.exports = function (ctx) {
  const { notion, queryAll, P, rt, sel, clip, normId, id32, getLastErr } = ctx;
  const SCHED_DB = () => id32(process.env.NOTION_SCHED_DB_ID || "f99ae2309c3c44a4931cb6316fbe6c2d");
  const KINDS = ["단어시험", "단어 외우기", "듣기시험", "주간평가", "월간평가", "분기평가", "행사", "휴원", "기타"];
  const ALL = "전체";
  const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
  const today = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const addDays = (s, n) => new Date(Date.parse(s + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10);

  function read(p) {
    const d = P.date(p, "날짜");
    return { id: normId(p.id), title: P.title(p, "일정명"), cls: P.text(p, "반"), date: d && d.start ? String(d.start).slice(0, 10) : "", kind: P.sel(p, "종류") || "기타",
      range: P.text(p, "범위"), memo: P.text(p, "메모"), active: P.chk(p, "사용") };
  }
  const forCls = (cls) => (cls ? { or: [{ property: "반", rich_text: { equals: cls } }, { property: "반", rich_text: { equals: ALL } }] } : null);

  async function between(cls, from, to, onlyActive) { // from ≤ 날짜 < to
    const and = [{ property: "날짜", date: { on_or_after: from } }, { property: "날짜", date: { before: to } }];
    const fc = forCls(cls); if (fc) and.push(fc);
    if (onlyActive) and.push({ property: "사용", checkbox: { equals: true } });
    const rows = await queryAll(SCHED_DB(), { filter: { and }, sorts: [{ property: "날짜", direction: "ascending" }] }, 3);
    return rows ? rows.map(read) : null;
  }
  async function month(cls, ym, onlyActive) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym || "")) return { status: 400, msg: "달을 다시 골라 주세요." };
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const list = await between(cls, ym + "-01", new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), onlyActive);
    return list ? { status: 200, list } : { status: 502, msg: "일정을 읽지 못했어요.", debug: getLastErr() };
  }
  // 학생·학부모: 오늘부터 days일 안의 일정
  async function upcoming(cls, days) {
    const t = today();
    return (await between(cls, t, addDays(t, days || 21), true)) || [];
  }
  const pub = (e) => ({ title: e.title, date: e.date, kind: e.kind, range: e.range, memo: e.memo });

  function props(me, it) {
    const o = {
      "일정명": { title: rt(clip(it.title, 120)) }, "반": { rich_text: rt(clip(it.cls, 40)) }, "날짜": { date: { start: it.date } },
      "종류": sel(KINDS.includes(it.kind) ? it.kind : "기타"), "범위": { rich_text: rt(clip(it.range, 200)) }, "메모": { rich_text: rt(clip(it.memo, 500)) },
      "사용": { checkbox: it.active !== false },
    };
    if (me && !it.id) o["만든 선생님"] = { rich_text: rt(clip(me, 40)) };
    return o;
  }
  async function isSched(id) {
    const p = await notion("pages/" + id, "GET", null, 2);
    return !!(p && p.parent && normId(p.parent.database_id) === normId(SCHED_DB()) && !p.archived);
  }
  // 여러 일정 한 번에 저장 (id 있으면 고치기). items: [{ id?, cls, date, kind, title, range, memo, active }]
  async function save(me, items) {
    const L = (Array.isArray(items) ? items : []).slice(0, 200);
    if (!L.length) return { status: 400, msg: "저장할 일정이 없어요." };
    const bad = L.filter((it) => !isDay(it.date) || !clip(it.cls, 40) || !clip(it.title, 120));
    if (bad.length) return { status: 400, msg: "날짜·반·일정명이 빠진 일정이 " + bad.length + "개 있어요." };
    let made = 0, updated = 0; const failed = [], ids = [];
    for (let i = 0; i < L.length; i += 3) {
      const part = L.slice(i, i + 3);
      const done = await Promise.all(part.map(async (it) => {
        const id = clip(it.id, 60);
        if (id) {
          if (!(await isSched(id))) return null;
          const pg = await notion("pages/" + id, "PATCH", { properties: props(me, it) }, 2);
          if (pg) updated++; return pg ? normId(pg.id) : null;
        }
        const pg = await notion("pages", "POST", { parent: { database_id: SCHED_DB() }, properties: props(me, it) }, 2);
        if (pg) made++; return pg ? normId(pg.id) : null;
      }));
      done.forEach((x, k) => { ids.push(x); if (!x) failed.push(part[k].date + " " + part[k].title); });
    }
    return { status: made + updated ? 200 : 502, made, updated, failed, ids, msg: made + updated ? "" : "저장하지 못했어요.", debug: failed.length ? getLastErr() : undefined };
  }
  async function del(ids) {
    let n = 0;
    for (const raw of (Array.isArray(ids) ? ids : [ids]).slice(0, 100)) {
      const id = clip(raw, 60); if (!id) continue;
      if ((await isSched(id)) && (await notion("pages/" + id, "PATCH", { archived: true }, 2))) n++;
    }
    return { status: 200, removed: n };
  }
  return { SCHED_DB, KINDS, ALL, month, upcoming, pub, save, del, read };
};
