// api/_library.js — 📦 시험지 보관함: 미리 만든 시험지 틀을 단어장(폴더)별로 모아 두고 모든 선생님이 함께 써요.
// 노션: 📦 시험지 보관함 (이름 · 단어장 · 종류 · 범위 · 문항 수 · 제한시간(분) · 난이도 · 설정(JSON) · 메모 · 만든 선생님 · 쓴 횟수 · 사용)
//   설정 = { units, count, minutes, level, vtypes, exclude, seed, ai }  ← seed가 같으면 '같은 문제'로 다시 만들 수 있어요
module.exports = function (ctx) {
  const { notion, queryAll, P, rt, rtLong, sel, clip, num, normId, id32, unitIndex, rangeText, getLastErr } = ctx;
  const LIB_DB = () => id32(process.env.NOTION_LIB_DB_ID || "419f60b9e8e9813aa078e12a2739a121");
  const KINDS = ["단어시험", "주간평가", "월간평가", "분기평가", "듣기시험", "반배정시험"];
  const LEVELS = ["기본", "표준", "심화"];

  function read(p) {
    let cfg = {}; try { cfg = JSON.parse(P.text(p, "설정") || "{}"); } catch (e) { cfg = {}; }
    return { id: normId(p.id), name: P.title(p, "이름"), book: P.text(p, "단어장") || "기타", kind: P.sel(p, "종류") || "단어시험", range: P.text(p, "범위"),
      count: P.num(p, "문항 수") || 20, minutes: P.num(p, "제한시간(분)") || 0, level: P.sel(p, "난이도") || "표준", memo: P.text(p, "메모"), by: P.text(p, "만든 선생님"),
      used: P.num(p, "쓴 횟수") || 0, cfg, created: (p.created_time || "").slice(0, 10) };
  }
  async function list() {
    const rows = await queryAll(LIB_DB(), { filter: { property: "사용", checkbox: { equals: true } }, sorts: [{ property: "단어장", direction: "ascending" }, { property: "이름", direction: "ascending" }] }, 3);
    if (!rows) return { status: 502, msg: "📦 시험지 보관함을 읽지 못했어요. 노션 연결을 확인해 주세요. (TEST 관리 → 🩺 점검)", debug: getLastErr() };
    // 지금 문제은행에 없는 과는 빼고 알려 줘요 (교재가 지워진 경우)
    return { status: 200, list: rows.map(read).map((t) => Object.assign(t, { missing: (t.cfg.units || []).filter((u) => !unitIndex.has(u)).length })) };
  }
  // 고른 과에서 가장 많이 나온 교재 이름 = 폴더
  function bookOf(units) {
    const c = {}; units.forEach((u) => { const x = unitIndex.get(u); if (x) c[x.book] = (c[x.book] || 0) + 1; });
    const ks = Object.keys(c).sort((a, b) => c[b] - c[a]); return ks[0] || "기타";
  }
  async function getOne(id) {
    const p = await notion("pages/" + id, "GET", null, 2);
    return p && !p.archived && p.parent && normId(p.parent.database_id) === normId(LIB_DB()) ? p : null;
  }
  const mayEdit = (me, t) => !!(me && (me.master || !t.by || t.by === me.name));

  async function save(me, f) {
    f = f || {};
    const units = (Array.isArray(f.units) ? f.units : []).filter((u) => unitIndex.has(u)).slice(0, 300);
    if (!units.length) return { status: 400, msg: "출제할 과를 먼저 골라 주세요." };
    const name = clip(f.name, 120); if (!name) return { status: 400, msg: "보관함에 넣을 이름을 써 주세요." };
    let old = null;
    if (f.id) { const p = await getOne(clip(f.id, 60)); if (!p) return { status: 404, msg: "보관함에서 찾지 못했어요." }; old = read(p); if (!mayEdit(me, old)) return { status: 403, msg: old.by + "이(가) 만든 틀이라 고칠 수 없어요. 새 이름으로 저장해 주세요." }; }
    const level = num(f.level, 1, 3, 2);
    const cfg = { units, count: num(f.count, 5, 100, 20), minutes: num(f.minutes, 0, 180, 30), level, vtypes: (Array.isArray(f.vtypes) ? f.vtypes : []).map((x) => clip(x, 20)).slice(0, 20),
      exclude: (Array.isArray(f.exclude) ? f.exclude : []).map((x) => clip(x, 40)).slice(0, 500), seed: clip(f.seed, 40).replace(/[^\w-]/g, ""),
      ai: f.ai && typeof f.ai === "object" ? { fill: f.ai.fill !== false, variant: num(f.ai.variant, 0, 100, 0), extra: num(f.ai.extra, 0, 60, 0) } : undefined };
    const props = {
      "이름": { title: rt(name) }, "단어장": { rich_text: rt(clip(bookOf(units), 100)) }, "종류": sel(KINDS.includes(f.kind) ? f.kind : "단어시험"),
      "범위": { rich_text: rt(clip(rangeText(units), 1900)) }, "문항 수": { number: cfg.count }, "제한시간(분)": { number: cfg.minutes }, "난이도": sel(LEVELS[level - 1]),
      "설정": { rich_text: rtLong(JSON.stringify(cfg)) }, "메모": { rich_text: rt(clip(f.memo, 500)) }, "사용": { checkbox: true },
    };
    if (!old) { props["만든 선생님"] = { rich_text: rt(clip(me && me.name, 40)) }; props["쓴 횟수"] = { number: 0 }; }
    const pg = old ? await notion("pages/" + old.id, "PATCH", { properties: props }, 2) : await notion("pages", "POST", { parent: { database_id: LIB_DB() }, properties: props }, 2);
    return pg ? { status: 200, item: read(pg) } : { status: 502, msg: "보관함에 저장하지 못했어요. 노션 연결을 확인해 주세요.", debug: getLastErr() };
  }
  async function del(me, id) {
    const p = await getOne(clip(id, 60)); if (!p) return { status: 404, msg: "이미 지워졌어요." };
    const t = read(p); if (!mayEdit(me, t)) return { status: 403, msg: t.by + "이(가) 만든 틀은 " + t.by + "이나 관리자만 지울 수 있어요." };
    return (await notion("pages/" + t.id, "PATCH", { archived: true }, 2)) ? { status: 200 } : { status: 502, msg: "지우지 못했어요." };
  }
  async function used(id) { // 이 틀로 시험지를 만들면 +1
    const p = await getOne(clip(id, 60)); if (!p) return;
    await notion("pages/" + normId(p.id), "PATCH", { properties: { "쓴 횟수": { number: (P.num(p, "쓴 횟수") || 0) + 1 } } }, 1);
  }
  return { LIB_DB, list, save, del, used };
};
