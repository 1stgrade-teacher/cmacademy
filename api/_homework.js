// api/_homework.js — 📸 사진 과제: 선생님이 과제를 내고 → 학생이 사진으로 제출 → 마감이 지나면 미제출 학생 학부모님께 알림톡
// 노션: 📸 과제(HW_DB) · 📮 과제 제출(SUB_DB, 한 줄 = 학생 × 과제) · 학생 DB의 '학부모 연락처'·'알림 끄기'
// 마감 확인(hw_cron)은 GitHub Actions가 30분마다 불러요. 여러 번 불러도 과제마다 한 번만 처리해요.
const N = require("./_notify.js");

module.exports = function (ctx) {
  const { notion, queryAll, P, rt, sel, clip, uuid, normId, id32, roster, STUDENT_DB, listenUnit, getLastErr } = ctx;
  const crypto = require("crypto");
  const HW_DB = () => id32(process.env.NOTION_HW_DB_ID || "284584e0b6d64f2297137ffdcb2b6298");
  const SUB_DB = () => id32(process.env.NOTION_HWSUB_DB_ID || "f81f921219e94f6cb1afd0b9c58338df");
  const NV = "2022-06-28";

  // 한국 시간 "2026-11-05T21:00" ↔ 노션 날짜
  const toNotionDue = (s) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s || "") ? s + ":00+09:00" : null);
  const kst = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600e3); return d.toISOString().slice(0, 16); };
  const dueLabel = (iso) => { if (!iso) return ""; const s = kst(iso), d = new Date(Date.parse(iso) + 9 * 3600e3); return Number(s.slice(5, 7)) + "/" + Number(s.slice(8, 10)) + "(" + "일월화수목금토"[d.getUTCDay()] + ") " + s.slice(11, 16); };
  const dueOf = (p) => { const d = P.date(p, "마감"); if (!d || !d.start) return null; return /T/.test(d.start) ? d.start : d.start + "T23:59:00+09:00"; };

  // 🗓 공개일: 이 날 0시(한국 시간)부터 학생에게 보여요. 비어 있으면 바로 보여요. (월간 계획으로 미리 넣어 둔 과제가 한꺼번에 보이지 않게)
  const showOf = (p) => { const d = P.date(p, "공개일"); return d && d.start ? String(d.start).slice(0, 10) : ""; };
  const shownAt = (show) => (show ? Date.parse(show + "T00:00:00+09:00") : 0);
  const isDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
  function readHw(p) {
    const due = dueOf(p), show = showOf(p);
    return { id: normId(p.id), url: p.url, title: P.title(p, "과제명"), cls: P.text(p, "반"), desc: P.text(p, "설명"), due, dueKst: due ? kst(due) : "", dueLabel: dueLabel(due), active: P.chk(p, "사용"), notify: P.chk(p, "알림 보내기"), done: P.chk(p, "알림 처리"), teacher: P.text(p, "만든 선생님"), past: !!due && Date.parse(due) <= Date.now(), show, hidden: !!show && shownAt(show) > Date.now(), dict: dictOf(p) };
  }
  // 🎧 받아쓰기 숙제: '받아쓰기' 칸에 {"u": 듣기 회차 id, "r": 빈칸 비율} — 비어 있으면 사진 과제
  function dictOf(p) { try { const j = JSON.parse(P.text(p, "받아쓰기") || "null"); return j && j.u ? { u: String(j.u), r: Math.min(0.6, Math.max(0.1, +j.r || 0.3)) } : null; } catch (e) { return null; } }
  const propOk = {};
  async function ensureProp(db, name, def) { // 칸이 없으면 한 번 만들기
    const key = db + "|" + name; if (propOk[key]) return true;
    const d = await notion("databases/" + db, "GET", null, 2); if (!d) return false;
    if (d.properties && d.properties[name]) return (propOk[key] = true);
    const u = await notion("databases/" + db, "PATCH", { properties: { [name]: def } }, 2);
    return (propOk[key] = !!(u && u.properties && u.properties[name]));
  }
  // 노션 📸 과제 DB에 '공개일'(날짜) 칸이 없으면 한 번 만들어요. 못 만들면 공개일 없이 저장해요.
  let showProp = null;
  async function ensureShowProp() {
    if (showProp !== null) return showProp;
    const d = await notion("databases/" + HW_DB(), "GET", null, 2);
    if (!d) return false; // 다음에 다시 확인
    if (d.properties && d.properties["공개일"]) return (showProp = d.properties["공개일"].type === "date");
    const u = await notion("databases/" + HW_DB(), "PATCH", { properties: { "공개일": { date: {} } } }, 2);
    return (showProp = !!(u && u.properties && u.properties["공개일"]));
  }
  function hwProps(b, title, cls, due) {
    return { "과제명": { title: rt(title) }, "반": { rich_text: rt(cls) }, "마감": { date: { start: due } }, "설명": { rich_text: rt(clip(b.desc, 1500)) }, "사용": { checkbox: b.active !== false }, "알림 보내기": { checkbox: !!b.notify } };
  }
  function readSub(p) {
    const files = ((p.properties["사진"] || {}).files || []).map((f) => ({ name: f.name, url: (f.file && f.file.url) || (f.external && f.external.url) || "" })).filter((f) => f.url);
    return { id: normId(p.id), url: p.url, sid: P.rel(p, "학생")[0] || "", hw: P.rel(p, "과제")[0] || "", status: P.sel(p, "상태"), at: (P.date(p, "제출 시각") || {}).start || "", memo: P.text(p, "학생 메모"), notice: P.text(p, "알림 결과"), checked: P.chk(p, "선생님 확인"), files, score: P.text(p, "받아쓰기 결과") };
  }
  const subsOf = (hwId) => queryAll(SUB_DB(), { filter: { property: "과제", relation: { contains: uuid(hwId) } } }, 3);

  // ---------- 노션에 사진 올리기 (만들기 → 보내기 → 1시간 안에 제출 줄에 붙이기) ----------
  async function uploadPhoto(name, type, b64) {
    const buf = Buffer.from(String(b64 || ""), "base64");
    if (!buf.length) return { error: "사진이 비어 있어요." };
    if (buf.length > 3.5 * 1024 * 1024) return { error: "사진이 너무 커요. 다시 찍어 주세요." };
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return { error: "사진 파일만 올릴 수 있어요." };
    const fname = clip(String(name || "photo.jpg").replace(/[^\w.\-가-힣]/g, "_"), 60) || "photo.jpg";
    const H = { Authorization: "Bearer " + process.env.NOTION_TOKEN, "Notion-Version": NV };
    try {
      let r = await fetch("https://api.notion.com/v1/file_uploads", { method: "POST", headers: Object.assign({ "Content-Type": "application/json" }, H), body: JSON.stringify({ filename: fname, content_type: type }) });
      let j = await r.json().catch(() => ({}));
      if (!r.ok || !j.id) return { error: "사진을 올리지 못했어요. (" + (j.message || r.status) + ")" };
      const fd = new FormData(); fd.append("file", new Blob([buf], { type }), fname);
      r = await fetch("https://api.notion.com/v1/file_uploads/" + j.id + "/send", { method: "POST", headers: H, body: fd });
      const s = await r.json().catch(() => ({}));
      if (!r.ok || (s.status && s.status !== "uploaded")) return { error: "사진을 보내지 못했어요. (" + (s.message || r.status) + ")" };
      return { fid: j.id, name: fname };
    } catch (e) { return { error: "사진을 올리지 못했어요. 인터넷 연결을 확인해 주세요." }; }
  }

  // ---------- 학생 ----------
  async function studentList(who) {
    const rows = await queryAll(HW_DB(), { filter: { and: [{ property: "반", rich_text: { equals: who.cls } }, { property: "사용", checkbox: { equals: true } }] }, sorts: [{ property: "마감", direction: "descending" }] }, 2);
    if (!rows) return null;
    const list = rows.map(readHw).filter((h) => h.due && !h.hidden && Date.parse(h.due) > Date.now() - 21 * 864e5).slice(0, 20);
    const mine = await queryAll(SUB_DB(), { filter: { property: "학생", relation: { contains: uuid(who.sid) } } }, 2);
    const by = new Map((mine || []).map(readSub).map((s) => [s.hw, s]));
    return list.sort((a, b) => (a.past - b.past) || (a.past ? Date.parse(b.due) - Date.parse(a.due) : Date.parse(a.due) - Date.parse(b.due)))
      .map((h) => { const s = by.get(h.id); return { id: h.id, title: h.title, desc: h.desc, due: h.dueKst, dueLabel: h.dueLabel, past: h.past, status: s ? s.status : "", at: s && s.at ? kst(s.at) : "", n: s ? s.files.length : 0, dict: !!h.dict, score: s ? s.score : "" }; });
  }
  // 🗓 학생 달력: 이 달 우리 반 과제. 공개 전 과제는 제목·마감만 (설명·번호 없이 → 열기 전엔 낼 수 없어요)
  async function studentMonth(who, ym) {
    const r = await monthRows(who.cls, ym);
    if (r.status !== 200) return r;
    const list = r.list.filter((h) => h.active);
    const mine = list.some((h) => !h.hidden) ? await queryAll(SUB_DB(), { filter: { property: "학생", relation: { contains: uuid(who.sid) } } }, 2) : [];
    const by = new Map((mine || []).map(readSub).map((s) => [s.hw, s]));
    return { status: 200, list: list.map((h) => {
      if (h.hidden) return { hidden: true, title: h.title, due: h.dueKst, dueLabel: h.dueLabel, show: h.show };
      const s = by.get(h.id); return { id: h.id, title: h.title, desc: h.desc, due: h.dueKst, dueLabel: h.dueLabel, past: h.past, status: s ? s.status : "", at: s && s.at ? kst(s.at) : "", n: s ? s.files.length : 0, dict: !!h.dict, score: s ? s.score : "" };
    }) };
  }
  async function studentSubmit(who, b) {
    const hp = await notion("pages/" + id32(b.id), "GET");
    if (!hp || normId(hp.parent && hp.parent.database_id) !== normId(HW_DB())) return { status: 404, msg: "과제를 찾지 못했어요." };
    const hw = readHw(hp);
    if (!hw.active || hw.cls !== who.cls) return { status: 403, msg: "우리 반 과제가 아니에요." };
    if (hw.hidden) return { status: 403, msg: "아직 열리지 않은 과제예요. " + Number(hw.show.slice(5, 7)) + "/" + Number(hw.show.slice(8, 10)) + "부터 낼 수 있어요." };
    if (hw.dict) return { status: 400, msg: "받아쓰기 숙제는 화면에서 듣고 빈칸을 채워 내요." };
    const files = (Array.isArray(b.files) ? b.files : []).filter((f) => f && /^[0-9a-f-]{32,36}$/i.test(String(f.fid))).slice(0, 100); // 노션 파일 칸 최대 100개
    if (!files.length) return { status: 400, msg: "사진을 한 장 이상 올려 주세요." };
    const late = hw.due && Date.parse(hw.due) < Date.now();
    const props = {
      "상태": sel(late ? "지각 제출" : "제출"), "제출 시각": { date: { start: new Date().toISOString() } }, "학생 메모": { rich_text: rt(clip(b.memo, 500)) },
      "사진": { files: files.map((f) => ({ type: "file_upload", file_upload: { id: String(f.fid) }, name: clip(f.name, 60) || "photo.jpg" })) },
    };
    const ex = (await subsOf(hw.id) || []).map((p) => ({ p, s: readSub(p) })).find((x) => x.s.sid === normId(who.sid));
    const pg = ex ? await notion("pages/" + normId(ex.p.id), "PATCH", { properties: props })
      : await notion("pages", "POST", { parent: { database_id: SUB_DB() }, properties: Object.assign({ "제목": { title: rt(who.name + " · " + hw.title) }, "과제": { relation: [{ id: uuid(hw.id) }] }, "학생": { relation: [{ id: uuid(who.sid) }] } }, props) });
    if (!pg) return { status: 502, msg: "제출하지 못했어요. 다시 해 주세요.", debug: getLastErr() };
    return { status: 200, late, again: !!ex, n: files.length };
  }

  // ---------- 선생님 ----------
  async function teacherList(cls) {
    const f = cls ? { filter: { property: "반", rich_text: { equals: cls } } } : {};
    const rows = await queryAll(HW_DB(), Object.assign(f, { sorts: [{ property: "마감", direction: "descending" }] }), 2);
    if (!rows) return null;
    // 2주 넘게 남은 과제는 위 🗓 달력에서 봐요 (미리 넣어 둔 한 달 치가 목록을 채우지 않게)
    const list = rows.map(readHw).filter((h) => !h.due || Date.parse(h.due) < Date.now() + 14 * 864e5).slice(0, 40);
    const counts = await Promise.all(list.slice(0, 20).map((h) => subsOf(h.id)));
    return list.map((h, i) => { const s = (counts[i] || []).map(readSub); return Object.assign(h, { nSub: s.filter((x) => x.status === "제출").length, nLate: s.filter((x) => x.status === "지각 제출").length, nMiss: s.filter((x) => x.status === "미제출").length, counted: i < 20 }); });
  }
  async function teacherSave(me, b) {
    const title = clip(b.title, 120), cls = clip(b.cls, 40), due = toNotionDue(b.due);
    if (!title || !cls || !due) return { status: 400, msg: "과제명·반·마감 날짜와 시간을 넣어 주세요." };
    const props = hwProps(b, title, cls, due);
    let warn = "";
    if (b.showFrom !== undefined) { // 수정 화면에서 공개일을 바꿀 때만
      const show = isDay(b.showFrom) ? b.showFrom : "";
      if (await ensureShowProp()) props["공개일"] = { date: show ? { start: show } : null };
      else if (show) warn = "노션 📸 과제 DB에 「공개일」(날짜) 칸을 만들지 못해 바로 보이게 저장했어요.";
    }
    if (b.dict !== undefined) { // 🎧 받아쓰기 숙제로 저장 (빈 값이면 사진 과제)
      const d = b.dict && b.dict.u ? { u: clip(b.dict.u, 40), r: Math.min(0.6, Math.max(0.1, +b.dict.r || 0.3)) } : null;
      if (d && !(listenUnit && listenUnit(d.u))) return { status: 400, msg: "받아쓰기로 쓸 듣기 회차를 찾지 못했어요. 다시 골라 주세요." };
      if (d || b.id) { if (await ensureProp(HW_DB(), "받아쓰기", { rich_text: {} })) props["받아쓰기"] = { rich_text: rt(d ? JSON.stringify(d) : "") }; else if (d) return { status: 502, msg: "노션 📸 과제 DB에 「받아쓰기」 칸을 만들지 못했어요." }; }
    }
    let pg;
    if (b.id) {
      const old = await notion("pages/" + id32(b.id), "GET");
      if (!old || normId(old.parent && old.parent.database_id) !== normId(HW_DB())) return { status: 404, msg: "과제를 찾지 못했어요." };
      if (Date.parse(due) > Date.now()) props["알림 처리"] = { checkbox: false }; // 마감을 뒤로 미루면 다시 확인
      pg = await notion("pages/" + id32(b.id), "PATCH", { properties: props });
    } else {
      props["만든 선생님"] = { rich_text: rt(me.name) }; props["알림 처리"] = { checkbox: false };
      pg = await notion("pages", "POST", { parent: { database_id: HW_DB() }, properties: props });
    }
    return pg ? { status: 200, hw: readHw(pg), warn } : { status: 502, msg: "저장하지 못했어요.", debug: getLastErr() };
  }

  // ---------- 🎧 받아쓰기 숙제 ----------
  // 듣기 회차의 대본(.g-script)에서 빈칸을 만들어요. 같은 과제는 늘 같은 빈칸 (과제 id로 섞기).
  const STOP = new Set("the a an and or but so to of in on at by for with from is am are was were be been do does did have has had i you he she it we they me him her us them my your his its our their this that these those there here not no yes oh okay ok can will would could should what when where who how why".split(" "));
  function rng(seed) { let h = 2166136261; for (const c of String(seed)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return ((h >>> 0) % 100000) / 100000; }; }
  const normW = (w) => String(w || "").toLowerCase().replace(/[‘’`´]/g, "'").replace(/[^a-z0-9']/g, "").replace(/^'+|'+$/g, "");
  function dictBuild(hwId, d) {
    const u = listenUnit && listenUnit(d.u); if (!u) return null;
    const R = rng(hwId + "|" + d.u), items = [], key = [];
    u.items.forEach((it, qi) => {
      const lines = String(it.script || "").split(/\n+/).map((x) => x.trim()).filter(Boolean).map((ln) => {
        const m = /^([A-Z][A-Za-z]{0,10}\s?\d?)\s*:\s*(.*)$/.exec(ln); return { sp: m ? m[1] : "", text: m ? m[2] : ln };
      });
      const toks = lines.map((l) => l.text.split(/(\s+)/)); // 낱말 + 띄어쓰기 (빈칸 후보: 3글자 이상, 쉬운 기능어·줄임말(it's, I'll) 제외)
      const cand = [];
      toks.forEach((tk, li) => tk.forEach((w, wi) => { const core = w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ""); if (core.length >= 3 && /[A-Za-z]/.test(core) && core.indexOf("'") < 0 && !STOP.has(core.toLowerCase())) cand.push([li, wi]); }));
      const want = Math.max(1, Math.round(cand.length * d.r)), chosen = new Set();
      const pool = cand.slice(); while (chosen.size < want && pool.length) { const k = Math.floor(R() * pool.length); chosen.add(pool[k].join(",")); pool.splice(k, 1); }
      items.push({ n: qi + 1, audio: it.audio, lines: lines.map((l, li) => ({ sp: l.sp, parts: toks[li].map((w, wi) => {
        if (!chosen.has(li + "," + wi)) return w;
        const mm = /^([^A-Za-z0-9']*)(.*?)([^A-Za-z0-9']*)$/.exec(w); key.push(mm[2]);
        return { b: key.length - 1, pre: mm[1], post: mm[3], len: mm[2].length };
      }) })) });
    });
    return { name: u.name, items, key };
  }
  async function dictGet(who, id) {
    const hp = await notion("pages/" + id32(id), "GET");
    if (!hp || normId(hp.parent && hp.parent.database_id) !== normId(HW_DB())) return { status: 404, msg: "과제를 찾지 못했어요." };
    const hw = readHw(hp);
    if (!hw.active || (who && hw.cls !== who.cls)) return { status: 403, msg: "우리 반 과제가 아니에요." };
    if (who && hw.hidden) return { status: 403, msg: "아직 열리지 않은 과제예요." };
    if (!hw.dict) return { status: 400, msg: "받아쓰기 숙제가 아니에요." };
    const d = dictBuild(hw.id, hw.dict); if (!d) return { status: 404, msg: "듣기 회차를 찾지 못했어요. 선생님께 알려 주세요." };
    return { status: 200, hw, d };
  }
  async function studentDict(who, id) {
    const r = await dictGet(who, id); if (r.status !== 200) return r;
    return { status: 200, title: r.hw.title, desc: r.hw.desc, dueLabel: r.hw.dueLabel, due: r.hw.dueKst, past: r.hw.past, name: r.d.name, items: r.d.items, blanks: r.d.key.length };
  }
  async function studentDictSubmit(who, b) {
    const r = await dictGet(who, b.id); if (r.status !== 200) return r;
    const ans = Array.isArray(b.answers) ? b.answers : [], key = r.d.key;
    const res = key.map((k, i) => normW(ans[i]) === normW(k));
    const right = res.filter(Boolean).length, pct = key.length ? Math.round((right / key.length) * 100) : 0;
    const late = r.hw.due && Date.parse(r.hw.due) < Date.now();
    const label = right + "/" + key.length + " (" + pct + "%)";
    const props = { "상태": sel(late ? "지각 제출" : "제출"), "제출 시각": { date: { start: new Date().toISOString() } } };
    if (await ensureProp(SUB_DB(), "받아쓰기 결과", { rich_text: {} })) props["받아쓰기 결과"] = { rich_text: rt(label) };
    const wrong = key.map((k, i) => (res[i] ? null : k + "←" + clip(String(ans[i] || "(빈칸)"), 30))).filter(Boolean);
    props["학생 메모"] = { rich_text: rt(clip("🎧 받아쓰기 " + label + (wrong.length ? " · 틀린 곳: " + wrong.join(", ") : " · 모두 맞음"), 1900)) };
    const ex = (await subsOf(r.hw.id) || []).map((p) => ({ p, s: readSub(p) })).find((x) => x.s.sid === normId(who.sid));
    // 처음 제출한 점수가 기록이에요. 이미 낸 뒤 다시 풀면 연습(기록은 그대로). 미제출로 기록된 뒤 늦게 내면 지각 제출로 기록.
    if (ex && ex.s.score && /제출/.test(ex.s.status) && ex.s.status !== "미제출") return { status: 200, practice: true, first: ex.s.score, right, total: key.length, pct, res, key };
    const pg = ex ? await notion("pages/" + normId(ex.p.id), "PATCH", { properties: props })
      : await notion("pages", "POST", { parent: { database_id: SUB_DB() }, properties: Object.assign({ "제목": { title: rt(who.name + " · " + r.hw.title) }, "과제": { relation: [{ id: uuid(r.hw.id) }] }, "학생": { relation: [{ id: uuid(who.sid) }] } }, props) });
    if (!pg) return { status: 502, msg: "제출하지 못했어요. 다시 해 주세요.", debug: getLastErr() };
    return { status: 200, late, right, total: key.length, pct, res, key };
  }
  function dictPreview(u, ratio) { const d = dictBuild("preview|" + u, { u, r: Math.min(0.6, Math.max(0.1, +ratio || 0.3)) }); return d ? { status: 200, name: d.name, items: d.items, key: d.key } : { status: 404, msg: "듣기 회차를 찾지 못했어요." }; }

  // ---------- 🗓 월간 계획 ----------
  // 한 달(한국 시간 기준) 마감 과제 목록. 경계 시간대가 어긋나지 않게 앞뒤 하루씩 넓게 읽고 여기서 거릅니다.
  async function teacherMonth(cls, ym) { return monthRows(cls, ym); }
  async function monthRows(cls, ym) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym || "")) return { status: 400, msg: "달을 다시 골라 주세요." };
    const y = +ym.slice(0, 4), m = +ym.slice(5, 7);
    const from = new Date(Date.UTC(y, m - 1, 1) - 864e5).toISOString().slice(0, 10), to = new Date(Date.UTC(y, m, 1) + 864e5).toISOString().slice(0, 10);
    const and = [{ property: "마감", date: { on_or_after: from } }, { property: "마감", date: { before: to } }];
    if (cls) and.push({ property: "반", rich_text: { equals: cls } });
    const rows = await queryAll(HW_DB(), { filter: { and }, sorts: [{ property: "마감", direction: "ascending" }] }, 3);
    if (!rows) return { status: 502, msg: "과제 목록을 읽지 못했어요.", debug: getLastErr() };
    return { status: 200, list: rows.map(readHw).filter((h) => h.dueKst.slice(0, 7) === ym) };
  }
  // 여러 과제를 한 번에 만들기 (월간 계획 저장). items: [{ cls, title, due:"YYYY-MM-DDTHH:MM", desc, notify, showFrom:"YYYY-MM-DD"|"" }]
  async function teacherBulk(me, items) {
    items = (Array.isArray(items) ? items : []).slice(0, 80);
    if (!items.length) return { status: 400, msg: "저장할 과제가 없어요." };
    const bad = items.findIndex((x) => !clip(x && x.title, 120) || !clip(x && x.cls, 40) || !toNotionDue(x && x.due));
    if (bad >= 0) return { status: 400, msg: (bad + 1) + "번째 줄: 과제명·반·마감 날짜와 시간을 넣어 주세요." };
    const wantShow = items.some((x) => isDay(x.showFrom)), canShow = wantShow ? await ensureShowProp() : false;
    const out = new Array(items.length);
    for (let s = 0; s < items.length; s += 5) {
      await Promise.all(items.slice(s, s + 5).map(async (x, k) => {
        const props = hwProps(Object.assign({}, x, { active: true }), clip(x.title, 120), clip(x.cls, 40), toNotionDue(x.due));
        props["만든 선생님"] = { rich_text: rt(me.name) }; props["알림 처리"] = { checkbox: false };
        if (canShow && isDay(x.showFrom)) props["공개일"] = { date: { start: x.showFrom } };
        const pg = await notion("pages", "POST", { parent: { database_id: HW_DB() }, properties: props });
        out[s + k] = pg ? { ok: true, hw: readHw(pg) } : { ok: false, msg: (getLastErr() || {}).msg || "저장 실패" };
      }));
    }
    return { status: 200, results: out, saved: out.filter((r) => r.ok).length, warn: wantShow && !canShow ? "노션 📸 과제 DB에 「공개일」(날짜) 칸을 만들지 못해 모두 바로 보이게 저장했어요. 노션에서 이 이름의 날짜 칸을 만들어 주세요." : "" };
  }
  async function teacherDetail(id) {
    const hp = await notion("pages/" + id32(id), "GET");
    if (!hp || normId(hp.parent && hp.parent.database_id) !== normId(HW_DB())) return null;
    const hw = readHw(hp);
    const [ros, subs] = await Promise.all([roster(hw.cls), subsOf(hw.id)]);
    const by = new Map((subs || []).map(readSub).map((s) => [s.sid, s]));
    const rows = (ros || []).map((st) => { const s = by.get(st.id); return { sid: st.id, name: st.name, phone: !!N.phone(st.phone), mute: !!st.mute, status: s ? s.status : hw.past ? "미제출" : "", at: s ? s.at : "", memo: s ? s.memo : "", notice: s ? s.notice : "", files: s ? s.files : [], url: s ? s.url : "" }; });
    return { hw, rows, mode: N.mode() };
  }

  // ---------- 👪 부모님 전용 링크 ----------
  // 링크 = /parent.html?k=<학생 id>.<비밀 키>. 키는 학생 DB '부모 링크 키' 칸에 있어요. 새 링크로 바꾸면 예전 링크는 바로 안 열려요.
  const PKEY = "부모 링크 키";
  let pkProp = null;
  async function ensureKeyProp() {
    if (pkProp) return true;
    const d = await notion("databases/" + STUDENT_DB(), "GET", null, 2);
    if (!d) return false;
    if (d.properties && d.properties[PKEY]) return (pkProp = true);
    const u = await notion("databases/" + STUDENT_DB(), "PATCH", { properties: { [PKEY]: { rich_text: {} } } }, 2);
    return (pkProp = !!(u && u.properties && u.properties[PKEY]));
  }
  const newKey = () => crypto.randomBytes(15).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");
  const linkOf = (sid, key) => normId(sid) + "." + key;
  async function setKey(sid) { const key = newKey(); const pg = await notion("pages/" + id32(sid), "PATCH", { properties: { [PKEY]: { rich_text: rt(key) } } }); return pg ? key : ""; }
  async function parentLinks(cls) {
    if (!cls) return { status: 400, msg: "반을 골라 주세요." };
    if (!(await ensureKeyProp())) return { status: 502, msg: "노션 학생 DB에 「부모 링크 키」 칸을 만들지 못했어요. 노션에서 이 이름의 텍스트 칸을 만들어 주세요.", debug: getLastErr() };
    const rows = await queryAll(STUDENT_DB(), { filter: { property: "반", select: { equals: cls } }, sorts: [{ property: "이름", direction: "ascending" }] }, 4);
    if (!rows) return { status: 502, msg: "명단을 읽지 못했어요.", debug: getLastErr() };
    const list = rows.filter((p) => !["휴원", "퇴원"].includes(P.sel(p, "상태"))).map((p) => ({ sid: normId(p.id), name: P.title(p, "이름"), key: P.text(p, PKEY) }));
    const need = list.filter((x) => !x.key);
    for (let i = 0; i < need.length; i += 5) await Promise.all(need.slice(i, i + 5).map(async (x) => { x.key = await setKey(x.sid); }));
    return { status: 200, list: list.map((x) => ({ sid: x.sid, name: x.name, k: x.key ? linkOf(x.sid, x.key) : "" })) };
  }
  async function parentReset(sid) {
    if (!/^[0-9a-f-]{32,36}$/i.test(sid || "")) return { status: 400, msg: "학생을 다시 골라 주세요." };
    const p = await notion("pages/" + id32(sid), "GET");
    if (!p || normId(p.parent && p.parent.database_id) !== normId(STUDENT_DB())) return { status: 404, msg: "학생을 찾지 못했어요." };
    if (!(await ensureKeyProp())) return { status: 502, msg: "노션 학생 DB에 「부모 링크 키」 칸을 만들지 못했어요." };
    const key = await setKey(sid);
    return key ? { status: 200, k: linkOf(sid, key) } : { status: 502, msg: "새 링크를 만들지 못했어요." };
  }
  function sameKey(a, b) { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); }
  async function parentView(k) {
    const m = /^([0-9a-f]{32})\.([A-Za-z0-9_-]{16,40})$/.exec(k || "");
    if (!m) return { status: 404, msg: "링크가 올바르지 않아요. 선생님께 받은 링크를 그대로 열어 주세요." };
    const p = await notion("pages/" + m[1], "GET");
    if (!p || normId(p.parent && p.parent.database_id) !== normId(STUDENT_DB())) return { status: 404, msg: "링크가 올바르지 않아요." };
    const key = P.text(p, PKEY);
    if (!key || !sameKey(key, m[2])) return { status: 403, msg: "이 링크는 더 이상 쓰지 않아요. 선생님께 새 링크를 받아 주세요." };
    if (P.sel(p, "상태") === "퇴원") return { status: 403, msg: "이 링크는 더 이상 쓰지 않아요." };
    const name = P.title(p, "이름"), cls = P.sel(p, "반");
    const list = await hwForStudent(m[1], cls);
    if (!list) return { status: 502, msg: "과제를 불러오지 못했어요. 잠시 뒤 다시 열어 주세요." };
    return { status: 200, name, cls, list };
  }
  // 한 학생의 최근 두 달 과제 + 제출 사진 (부모님 화면용, 공개 전 과제는 빼요)
  async function hwForStudent(sid, cls) {
    const [hws, subs] = await Promise.all([
      queryAll(HW_DB(), { filter: { and: [{ property: "반", rich_text: { equals: cls } }, { property: "사용", checkbox: { equals: true } }] }, sorts: [{ property: "마감", direction: "descending" }] }, 2),
      queryAll(SUB_DB(), { filter: { property: "학생", relation: { contains: uuid(sid) } } }, 3),
    ]);
    if (!hws || !subs) return null;
    const by = new Map(subs.map(readSub).map((s) => [s.hw, s]));
    return hws.map(readHw).filter((h) => h.due && !h.hidden && Date.parse(h.due) > Date.now() - 62 * 864e5).sort((x, y) => Date.parse(y.due) - Date.parse(x.due)).slice(0, 40).map((h) => {
      const s = by.get(h.id);
      return { dict: !!h.dict, score: s ? s.score : "", title: h.title, desc: h.desc, due: h.dueKst, dueLabel: h.dueLabel, past: h.past, status: s ? s.status : h.past ? "미제출" : "", at: s && s.at ? kst(s.at) : "", memo: s ? s.memo : "", checked: s ? s.checked : false, photos: s ? s.files.map((f) => f.url) : [] };
    });
  }

  // ---------- 마감 확인 + 학부모 알림 ----------
  // 마감이 지난 과제마다: 반 학생 중 제출 줄이 없는 학생 → '미제출' 줄을 만들고, 알림이 켜져 있으면 학부모님께 보내요. 끝나면 '알림 처리' 체크.
  async function cron(opts) {
    opts = opts || {}; const t0 = Date.now(), report = [];
    const rows = await queryAll(HW_DB(), { filter: { and: [{ property: "사용", checkbox: { equals: true } }, { property: "알림 처리", checkbox: { equals: false } }, { property: "마감", date: { is_not_empty: true } }] } }, 3); // 마감 시각 비교는 아래에서 (시간대 차이 없이)
    if (!rows) return { ok: false, msg: "과제 목록을 읽지 못했어요.", debug: getLastErr() };
    const due = rows.map(readHw).filter((h) => h.due && Date.parse(h.due) <= Date.now() && (!opts.only || h.id === normId(opts.only)));
    for (const hw of due) {
      if (Date.now() - t0 > 40000) { report.push({ title: hw.title, skipped: "시간이 부족해 다음 확인 때 처리" }); continue; }
      const [ros, subs] = await Promise.all([roster(hw.cls), subsOf(hw.id)]);
      if (!ros || !subs) { report.push({ title: hw.title, error: "명단/제출 기록을 읽지 못함" }); continue; }
      const have = new Set(subs.map(readSub).map((s) => s.sid));
      const miss = ros.filter((st) => !have.has(st.id));
      const targets = hw.notify ? miss.filter((st) => !st.mute && N.phone(st.phone)) : [];
      const sent = targets.length ? await N.sendMany(targets.map((st) => ({ to: st.phone, vars: { 학생: st.name, 과제: hw.title, 마감: hw.dueLabel } }))) : [];
      const res = new Map(targets.map((st, i) => [st.id, sent[i]]));
      let made = 0;
      for (const st of miss) {
        const r = res.get(st.id), note = !hw.notify ? "알림 꺼짐" : st.mute ? "알림 끄기 학생" : !N.phone(st.phone) ? "학부모 연락처 없음" : r ? r.msg : "";
        const pg = await notion("pages", "POST", { parent: { database_id: SUB_DB() }, properties: { "제목": { title: rt(st.name + " · " + hw.title) }, "과제": { relation: [{ id: uuid(hw.id) }] }, "학생": { relation: [{ id: uuid(st.id) }] }, "상태": sel("미제출"), "알림 결과": { rich_text: rt(clip(new Date(Date.now() + 9 * 3600e3).toISOString().slice(5, 16).replace("T", " ") + " " + note, 1900)) } } });
        if (pg) made++;
      }
      await notion("pages/" + hw.id, "PATCH", { properties: { "알림 처리": { checkbox: true } } });
      report.push({ title: hw.title, cls: hw.cls, students: ros.length, missing: miss.length, sent: sent.filter((x) => x && x.ok).length, failed: sent.filter((x) => x && !x.ok && x.how !== "off").length, notSent: sent.filter((x) => x && x.how === "off").length, rows: made });
    }
    return { ok: true, checked: due.length, mode: N.mode(), report };
  }

  return { studentList, studentMonth, studentSubmit, uploadPhoto, teacherList, teacherSave, teacherDetail, teacherMonth, teacherBulk, studentDict, studentDictSubmit, dictPreview, parentLinks, parentReset, parentView, hwForStudent, cron, HW_DB, SUB_DB, _t: { toNotionDue, dueLabel, readHw } };
};
