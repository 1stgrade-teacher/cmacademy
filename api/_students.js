// api/_students.js — 🧑‍🎓 선생님 화면 학생 관리: 전체 명단 · 반 만들기/이름 바꾸기/지우기 · 여러 명 반 이동·상태·학년 · 학생 카드
// 노션: 🧑‍🎓 학생 DB(반·학년·학교·학부모 연락처·알림 끄기·상태·메모, 시험 평균 등 자동 계산 칸)
//       반 이름을 바꾸면 진행 중인 시험지(🗓 시험지)·과제(📸 과제)의 반도 함께 바꿔요. 지난 시험 기록은 그대로 둬요.
module.exports = function (ctx) {
  const { notion, queryAll, P, rt, sel, clip, uuid, normId, id32, STUDENT_DB, EXAM_DB, PAPER_DB, HW_DB, SUB_DB, GAME_DB, PIN_PROP, PLACE_CLS, getLastErr } = ctx;
  const STATUSES = ["재원", "휴원", "퇴원"];
  const GRADES = ["초1", "초2", "초3", "초4", "초5", "초6", "중1", "중2", "중3", "고1", "고2", "고3"];
  const rollup = (p, k) => { const r = p.properties[k] && p.properties[k].rollup; if (!r) return null; return r.type === "date" ? (r.date && r.date.start) || null : r.number != null ? r.number : null; };
  const num1 = (v) => (typeof v === "number" && isFinite(v) ? Math.round(v * 10) / 10 : null);
  const formulaNum = (p, k) => { const f = p.properties[k] && p.properties[k].formula; if (!f) return null; if (typeof f.number === "number") return f.number; const m = String(f.string || "").match(/-?\d+(\.\d+)?/); return m ? Number(m[0]) : null; };

  function read(p) {
    return {
      id: normId(p.id), url: p.url, name: P.title(p, "이름"), cls: P.sel(p, "반"), grade: P.sel(p, "학년"), school: P.text(p, "학교"),
      phone: (p.properties["학부모 연락처"] || {}).phone_number || "", mute: P.chk(p, "알림 끄기"), status: P.sel(p, "상태") || "재원",
      hasPin: !!P.text(p, PIN_PROP), memo: P.text(p, "메모"), teacher: P.sel(p, "담당 선생님"),
      testAvg: num1(rollup(p, "시험 평균 원값") != null ? rollup(p, "시험 평균 원값") : formulaNum(p, "시험 평균")), tests: rollup(p, "시험 횟수"),
      certs: rollup(p, "인증 횟수"), watch: num1(formulaNum(p, "평균 시청률")), lastCert: rollup(p, "최근 제출"),
    };
  }
  const active = (s) => s.status !== "휴원" && s.status !== "퇴원";

  // ---------- 반 선택지 (노션 학생 DB의 「반」) ----------
  async function options() {
    const db = await notion("databases/" + STUDENT_DB(), "GET");
    const o = db && db.properties && db.properties["반"] && db.properties["반"].select && db.properties["반"].select.options;
    return o || null;
  }
  async function setOptions(list) {
    return notion("databases/" + STUDENT_DB(), "PATCH", { properties: { "반": { select: { options: list.map((o) => (o.id ? { id: o.id, name: o.name } : { name: o.name })) } } } });
  }
  const goodName = (s) => /^[가-힣A-Za-z0-9][가-힣A-Za-z0-9 ()\-·.]{0,28}[가-힣A-Za-z0-9)]$/.test(s);

  async function all() {
    const [rows, opts] = await Promise.all([queryAll(STUDENT_DB(), { sorts: [{ property: "이름", direction: "ascending" }] }, 15), options()]);
    if (!rows || !opts) return null;
    const classes = opts.map((o) => o.name).filter((n) => n !== "기타");
    if (!classes.includes(PLACE_CLS())) classes.push(PLACE_CLS());
    return { students: rows.map(read), classes };
  }

  async function classAdd(name) {
    name = clip(name, 30).replace(/\s+/g, " ");
    if (!goodName(name)) return { ok: false, msg: "반 이름은 2~30글자로 써 주세요. (예: 중3 사관반)" };
    const opts = await options(); if (!opts) return { ok: false, msg: "반 목록을 불러오지 못했어요." };
    if (opts.some((o) => o.name === name)) return { ok: false, msg: "이미 있는 반이에요." };
    const r = await setOptions(opts.concat([{ name }]));
    return r ? { ok: true, name } : { ok: false, msg: "반을 만들지 못했어요. 잠시 뒤 다시 해 주세요.", debug: getLastErr() };
  }

  // 여러 페이지를 5개씩 나눠 고쳐요 (노션 속도 제한)
  async function patchMany(ids, propsOf) {
    let fail = 0;
    for (let i = 0; i < ids.length; i += 5) {
      const rs = await Promise.all(ids.slice(i, i + 5).map((id) => notion("pages/" + id32(id), "PATCH", { properties: propsOf(id) })));
      fail += rs.filter((r) => !r).length;
    }
    return fail;
  }

  async function classRename(from, to) {
    from = clip(from, 40); to = clip(to, 30).replace(/\s+/g, " ");
    if (from === PLACE_CLS()) return { ok: false, msg: "「" + PLACE_CLS() + "」 반은 신입생 등록에 쓰여서 이름을 바꿀 수 없어요." };
    if (!goodName(to)) return { ok: false, msg: "새 반 이름은 2~30글자로 써 주세요." };
    if (from === to) return { ok: false, msg: "이름이 같아요." };
    const opts = await options(); if (!opts) return { ok: false, msg: "반 목록을 불러오지 못했어요." };
    if (!opts.some((o) => o.name === from)) return { ok: false, msg: "바꿀 반을 찾지 못했어요." };
    const merge = opts.some((o) => o.name === to);
    if (!merge) { const r = await setOptions(opts.concat([{ name: to }])); if (!r) return { ok: false, msg: "새 반 이름을 만들지 못했어요.", debug: getLastErr() }; }
    // 1) 학생 (휴원·퇴원 학생도 함께)
    const studs = await queryAll(STUDENT_DB(), { filter: { property: "반", select: { equals: from } } }, 5);
    if (!studs) return { ok: false, msg: "학생 명단을 읽지 못했어요.", debug: getLastErr() };
    const f1 = await patchMany(studs.map((p) => normId(p.id)), () => ({ "반": sel(to) }));
    // 2) 아직 끝나지 않은 시험지 (준비 중·예정·응시중)
    const papers = await queryAll(PAPER_DB(), { filter: { and: [{ property: "반", select: { equals: from } }, { property: "상태", select: { does_not_equal: "마감" } }] } }, 3) || [];
    const f2 = await patchMany(papers.map((p) => normId(p.id)), () => ({ "반": sel(to) }));
    // 3) 사용 중인 과제
    const hws = await queryAll(HW_DB(), { filter: { and: [{ property: "반", rich_text: { equals: from } }, { property: "사용", checkbox: { equals: true } }] } }, 3) || [];
    const f3 = await patchMany(hws.map((p) => normId(p.id)), () => ({ "반": { rich_text: rt(to) } }));
    if (f1) return { ok: false, msg: "학생 " + f1 + "명을 옮기지 못했어요. 다시 눌러 주세요(이미 옮긴 학생은 그대로예요).", debug: getLastErr() };
    // 4) 옛 반 이름 지우기 (안 되면 그대로 두고 알려 줘요)
    const now = await options(); let removed = false;
    if (now) { const left = await queryAll(STUDENT_DB(), { filter: { property: "반", select: { equals: from } } }, 1); if (left && !left.length) removed = !!(await setOptions(now.filter((o) => o.name !== from))); }
    return { ok: true, from, to, merged: merge, students: studs.length, papers: papers.length - f2, homework: hws.length - f3, removed };
  }

  async function classDelete(name) {
    name = clip(name, 40);
    if (name === PLACE_CLS()) return { ok: false, msg: "「" + PLACE_CLS() + "」 반은 지울 수 없어요." };
    const left = await queryAll(STUDENT_DB(), { filter: { property: "반", select: { equals: name } } }, 1);
    if (!left) return { ok: false, msg: "학생 명단을 읽지 못했어요." };
    if (left.length) return { ok: false, msg: "이 반에 학생이 있어요(휴원·퇴원 포함). 먼저 다른 반으로 옮겨 주세요." };
    const opts = await options(); if (!opts) return { ok: false, msg: "반 목록을 불러오지 못했어요." };
    const r = await setOptions(opts.filter((o) => o.name !== name));
    return r ? { ok: true, name } : { ok: false, msg: "지우지 못했어요. 노션 학생 DB의 「반」 선택지에서 직접 지워 주세요.", debug: getLastErr() };
  }

  // 여러 명 한꺼번에: [{ id, cls?, grade?, status? }] (한 번에 25명)
  async function patch(changes, classes) {
    const list = (Array.isArray(changes) ? changes : []).slice(0, 25).filter((c) => c && /^[0-9a-f-]{32,36}$/i.test(String(c.id || "")));
    const props = (c) => {
      const o = {};
      if (c.cls !== undefined && classes.includes(c.cls)) o["반"] = sel(c.cls);
      if (c.grade !== undefined) o["학년"] = GRADES.includes(c.grade) ? sel(c.grade) : { select: null };
      if (c.status !== undefined && STATUSES.includes(c.status)) o["상태"] = sel(c.status);
      return o;
    };
    const res = [];
    for (let i = 0; i < list.length; i += 5) {
      const part = list.slice(i, i + 5);
      const rs = await Promise.all(part.map((c) => { const pr = props(c); return Object.keys(pr).length ? notion("pages/" + id32(c.id), "PATCH", { properties: pr }) : Promise.resolve(null); }));
      rs.forEach((r, k) => res.push({ id: normId(part[k].id), ok: !!r }));
    }
    return res;
  }

  // 📋 학생 카드: 기본 정보 + 최근 시험 + 과제 + 이번 달 단어 게임
  async function detail(id) {
    const pg = await notion("pages/" + id32(id), "GET");
    if (!pg || normId(pg.parent && pg.parent.database_id) !== normId(STUDENT_DB())) return null;
    const s = read(pg), rel = { property: "학생", relation: { contains: uuid(s.id) } };
    const since = new Date(Date.now() - 30 * 864e5).toISOString();
    const [ex, subs, games] = await Promise.all([
      notion("databases/" + EXAM_DB() + "/query", "POST", { filter: rel, sorts: [{ property: "시험일", direction: "descending" }], page_size: 15 }),
      queryAll(SUB_DB(), { filter: rel }, 3),
      GAME_DB ? queryAll(GAME_DB(), { filter: { and: [rel, { property: "날짜", date: { on_or_after: since } }] } }, 3) : Promise.resolve([]),
    ]);
    const tests = ((ex && ex.results) || []).map((p) => ({ title: P.title(p, "시험명"), kind: P.sel(p, "종류"), date: (P.date(p, "시험일") || {}).start || "", score: P.num(p, "점수"), total: P.num(p, "만점"), pct: P.formula(p, "환산점수"), grade: P.sel(p, "종합 평가"), url: p.url }));
    const hw = { 제출: 0, "지각 제출": 0, 미제출: 0, recent: [] };
    (subs || []).forEach((p) => { const st = P.sel(p, "상태"); if (hw[st] != null) hw[st]++; });
    hw.recent = (subs || []).sort((a, b) => String(b.created_time || "").localeCompare(String(a.created_time || ""))).slice(0, 6).map((p) => ({ title: P.title(p, "제목"), status: P.sel(p, "상태"), at: ((P.date(p, "제출 시각") || {}).start || "").slice(0, 10) }));
    const game = { points: 0, plays: 0, words: 0 };
    (games || []).forEach((p) => { game.points += P.num(p, "포인트") || 0; game.plays++; game.words += P.num(p, "문제 수") || 0; });
    return { student: s, tests, hw, game };
  }

  return { all, read, active, classAdd, classRename, classDelete, patch, detail, STATUSES, GRADES };
};
