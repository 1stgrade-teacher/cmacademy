// api/_homework.js — 📸 사진 과제: 선생님이 과제를 내고 → 학생이 사진으로 제출 → 마감이 지나면 미제출 학생 학부모님께 알림톡
// 노션: 📸 과제(HW_DB) · 📮 과제 제출(SUB_DB, 한 줄 = 학생 × 과제) · 학생 DB의 '학부모 연락처'·'알림 끄기'
// 마감 확인(hw_cron)은 GitHub Actions가 30분마다 불러요. 여러 번 불러도 과제마다 한 번만 처리해요.
const N = require("./_notify.js");

module.exports = function (ctx) {
  const { notion, queryAll, P, rt, sel, clip, uuid, normId, id32, roster, getLastErr } = ctx;
  const HW_DB = () => id32(process.env.NOTION_HW_DB_ID || "284584e0b6d64f2297137ffdcb2b6298");
  const SUB_DB = () => id32(process.env.NOTION_HWSUB_DB_ID || "f81f921219e94f6cb1afd0b9c58338df");
  const NV = "2022-06-28";

  // 한국 시간 "2026-11-05T21:00" ↔ 노션 날짜
  const toNotionDue = (s) => (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s || "") ? s + ":00+09:00" : null);
  const kst = (iso) => { const d = new Date(Date.parse(iso) + 9 * 3600e3); return d.toISOString().slice(0, 16); };
  const dueLabel = (iso) => { if (!iso) return ""; const s = kst(iso), d = new Date(Date.parse(iso) + 9 * 3600e3); return Number(s.slice(5, 7)) + "/" + Number(s.slice(8, 10)) + "(" + "일월화수목금토"[d.getUTCDay()] + ") " + s.slice(11, 16); };
  const dueOf = (p) => { const d = P.date(p, "마감"); if (!d || !d.start) return null; return /T/.test(d.start) ? d.start : d.start + "T23:59:00+09:00"; };

  function readHw(p) {
    const due = dueOf(p);
    return { id: normId(p.id), url: p.url, title: P.title(p, "과제명"), cls: P.text(p, "반"), desc: P.text(p, "설명"), due, dueKst: due ? kst(due) : "", dueLabel: dueLabel(due), active: P.chk(p, "사용"), notify: P.chk(p, "알림 보내기"), done: P.chk(p, "알림 처리"), teacher: P.text(p, "만든 선생님"), past: !!due && Date.parse(due) <= Date.now() };
  }
  function readSub(p) {
    const files = ((p.properties["사진"] || {}).files || []).map((f) => ({ name: f.name, url: (f.file && f.file.url) || (f.external && f.external.url) || "" })).filter((f) => f.url);
    return { id: normId(p.id), url: p.url, sid: P.rel(p, "학생")[0] || "", hw: P.rel(p, "과제")[0] || "", status: P.sel(p, "상태"), at: (P.date(p, "제출 시각") || {}).start || "", memo: P.text(p, "학생 메모"), notice: P.text(p, "알림 결과"), checked: P.chk(p, "선생님 확인"), files };
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
    const list = rows.map(readHw).filter((h) => h.due && Date.parse(h.due) > Date.now() - 21 * 864e5).slice(0, 20);
    const mine = await queryAll(SUB_DB(), { filter: { property: "학생", relation: { contains: uuid(who.sid) } } }, 2);
    const by = new Map((mine || []).map(readSub).map((s) => [s.hw, s]));
    return list.sort((a, b) => (a.past - b.past) || (a.past ? Date.parse(b.due) - Date.parse(a.due) : Date.parse(a.due) - Date.parse(b.due)))
      .map((h) => { const s = by.get(h.id); return { id: h.id, title: h.title, desc: h.desc, due: h.dueKst, dueLabel: h.dueLabel, past: h.past, status: s ? s.status : "", at: s ? s.at : "", n: s ? s.files.length : 0 }; });
  }
  async function studentSubmit(who, b) {
    const hp = await notion("pages/" + id32(b.id), "GET");
    if (!hp || normId(hp.parent && hp.parent.database_id) !== normId(HW_DB())) return { status: 404, msg: "과제를 찾지 못했어요." };
    const hw = readHw(hp);
    if (!hw.active || hw.cls !== who.cls) return { status: 403, msg: "우리 반 과제가 아니에요." };
    const files = (Array.isArray(b.files) ? b.files : []).filter((f) => f && /^[0-9a-f-]{32,36}$/i.test(String(f.fid))).slice(0, 5);
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
    const list = rows.map(readHw).slice(0, 40);
    const counts = await Promise.all(list.slice(0, 20).map((h) => subsOf(h.id)));
    return list.map((h, i) => { const s = (counts[i] || []).map(readSub); return Object.assign(h, { nSub: s.filter((x) => x.status === "제출").length, nLate: s.filter((x) => x.status === "지각 제출").length, nMiss: s.filter((x) => x.status === "미제출").length, counted: i < 20 }); });
  }
  async function teacherSave(me, b) {
    const title = clip(b.title, 120), cls = clip(b.cls, 40), due = toNotionDue(b.due);
    if (!title || !cls || !due) return { status: 400, msg: "과제명·반·마감 날짜와 시간을 넣어 주세요." };
    const props = { "과제명": { title: rt(title) }, "반": { rich_text: rt(cls) }, "마감": { date: { start: due } }, "설명": { rich_text: rt(clip(b.desc, 1500)) }, "사용": { checkbox: b.active !== false }, "알림 보내기": { checkbox: !!b.notify } };
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
    return pg ? { status: 200, hw: readHw(pg) } : { status: 502, msg: "저장하지 못했어요.", debug: getLastErr() };
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

  return { studentList, studentSubmit, uploadPhoto, teacherList, teacherSave, teacherDetail, cron, HW_DB, SUB_DB, _t: { toNotionDue, dueLabel, readHw } };
};
