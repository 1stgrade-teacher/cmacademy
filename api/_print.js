// api/_print.js — 🖨️ 가정 통신용 학습 보고서 (기간을 정해 학생별로 인쇄)
// 선생님 화면 /admin/print.html 에서 불러요. 노션에서 읽기만 하고 아무것도 바꾸지 않아요.
//   강의 학습 인증 · 시험 성적 · 과제 제출 · 플러스 수업 출결 · 단어 게임
module.exports = function (ctx) {
  const { queryAll, P, uuid, normId, id32, STUDENT_DB, EXAM_DB, CERT_DB, GAME_DB, PLUS_DB, HW, getLastErr } = ctx;
  const kst = (iso) => (iso ? new Date(Date.parse(iso) + 9 * 3600e3).toISOString().slice(0, 16).replace("T", " ") : "");
  const pct = (v) => (typeof v === "number" ? Math.round(v <= 1.5 ? v * 100 : v) : null);
  const okDay = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || "");
  // 한국 날짜 하루 전체를 UTC 시각 범위로
  const startUtc = (d) => new Date(Date.parse(d + "T00:00:00+09:00")).toISOString();
  const endUtc = (d) => new Date(Date.parse(d + "T23:59:59+09:00")).toISOString();

  async function roster(cls) {
    const rows = await queryAll(STUDENT_DB(), { filter: { property: "반", select: { equals: cls } }, sorts: [{ property: "이름", direction: "ascending" }] }, 4);
    if (!rows) return null;
    return rows.filter((p) => !["휴원", "퇴원"].includes(P.sel(p, "상태"))).map((p) => ({ id: normId(p.id), name: P.title(p, "이름"), cls: P.sel(p, "반"), grade: P.sel(p, "학년"), school: P.text(p, "학교") }));
  }

  async function one(sid, from, to) {
    const p = await ctx.notion("pages/" + id32(sid), "GET");
    if (!p || normId(p.parent && p.parent.database_id) !== normId(STUDENT_DB())) return { id: normId(sid), error: "학생을 찾지 못했어요." };
    const st = { id: normId(p.id), name: P.title(p, "이름"), cls: P.sel(p, "반"), grade: P.sel(p, "학년"), school: P.text(p, "학교") };
    const a = startUtc(from), b = endUtc(to), rel = (name) => ({ property: name, relation: { contains: uuid(st.id) } });
    const [certs, exams, hw, plus, games] = await Promise.all([
      queryAll(CERT_DB(), { filter: { and: [rel("학생 페이지"), { property: "제출시각", date: { on_or_after: a } }, { property: "제출시각", date: { on_or_before: b } }] }, sorts: [{ property: "제출시각", direction: "ascending" }] }, 3),
      queryAll(EXAM_DB(), { filter: { and: [rel("학생"), { property: "시험일", date: { on_or_after: from } }, { property: "시험일", date: { on_or_before: to } }] }, sorts: [{ property: "시험일", direction: "ascending" }] }, 3),
      HW().hwForStudent(st.id, st.cls, { from, to }),
      PLUS_DB ? queryAll(PLUS_DB(), { filter: rel("학생") }, 3) : Promise.resolve([]),
      queryAll(GAME_DB(), { filter: { and: [rel("학생"), { property: "날짜", date: { on_or_after: a } }, { property: "날짜", date: { on_or_before: b } }] } }, 4),
    ]);
    const out = { student: st, missing: [] };
    if (!certs) out.missing.push("강의 학습 인증");
    out.certs = (certs || []).map((c) => ({ at: kst((P.date(c, "제출시각") || {}).start || c.created_time), area: P.sel(c, "영역"), book: P.text(c, "교재"), lecture: P.text(c, "강의"),
      watch: pct(P.num(c, "시청률")), minutes: P.num(c, "집중시간(분)"), score: pct(P.num(c, "점수")), verdict: P.sel(c, "판정"), understand: P.sel(c, "이해도"), sumGrade: P.sel(c, "AI 요약평가") }));
    if (!exams) out.missing.push("시험 성적");
    out.exams = (exams || []).map((e) => ({ title: P.title(e, "시험명"), kind: P.sel(e, "종류"), date: ((P.date(e, "시험일") || {}).start || "").slice(0, 10), score: P.num(e, "점수"), total: P.num(e, "만점"),
      pct: P.formula(e, "환산점수"), wrong: P.num(e, "오답 수"), range: P.text(e, "시험 범위"), retest: P.chk(e, "재시험"), retestScore: P.num(e, "재시험 점수"), grade: P.sel(e, "종합 평가"), comment: P.text(e, "코멘트") }));
    if (!hw) out.missing.push("과제");
    out.hw = (hw || []).slice().reverse().map((h) => ({ title: h.title, due: h.due, status: h.status || (h.past ? "미제출" : "진행 중"), at: h.at, score: h.score, past: h.past }));
    if (!plus) out.missing.push("플러스 수업");
    out.plus = (plus || []).map((r) => { const k = P.text(r, "키").split("|"), at = P.date(r, "출석 시각"); return { date: k[1] || "", hm: k[2] || "", state: P.sel(r, "상태"), at: at && at.start ? kst(at.start).slice(11) : "", memo: P.text(r, "메모") }; })
      .filter((r) => r.date >= from && r.date <= to).sort((x, y) => (x.date + x.hm).localeCompare(y.date + y.hm));
    if (!games) out.missing.push("단어 게임");
    const g = { points: 0, plays: 0, words: 0, days: new Set() };
    (games || []).forEach((r) => { g.points += P.num(r, "포인트") || 0; g.plays++; g.words += P.num(r, "문제 수") || 0; const d = (P.date(r, "날짜") || {}).start; if (d) g.days.add(kst(d).slice(0, 10)); });
    out.game = { points: g.points, plays: g.plays, words: g.words, days: g.days.size };
    return out;
  }

  async function teacher(act, b) {
    if (act === "t_print_roster") {
      const cls = String(b.cls || "").slice(0, 40); if (!cls) return { status: 400, msg: "반을 골라 주세요." };
      const list = await roster(cls);
      return list ? { status: 200, students: list } : { status: 502, msg: "학생 명단을 읽지 못했어요.", debug: getLastErr() };
    }
    if (act === "t_print") {
      const from = b.from, to = b.to;
      if (!okDay(from) || !okDay(to) || from > to) return { status: 400, msg: "기간을 확인해 주세요." };
      if ((Date.parse(to) - Date.parse(from)) / 864e5 > 370) return { status: 400, msg: "기간은 1년 안으로 골라 주세요." };
      const sids = (Array.isArray(b.sids) ? b.sids : []).slice(0, 6);
      if (!sids.length) return { status: 400, msg: "학생을 골라 주세요." };
      const reports = await Promise.all(sids.map((s) => one(String(s), from, to).catch((e) => ({ id: normId(s), error: String((e && e.message) || e).slice(0, 120) }))));
      return { status: 200, from, to, reports };
    }
    return { status: 400, msg: "action" };
  }
  return { teacher, one };
};
