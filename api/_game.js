// api/_game.js — 🏆 단어 게임 랭킹: 게임 한 판 기록 → 주간/월간 포인트 랭킹 · ⚡ 60초 챌린지 최고 기록
// 노션: 🏆 단어 게임 기록 (한 줄 = 학생 한 명의 게임 한 판)
// 포인트는 서버가 다시 계산해요 (학생 화면이 보낸 숫자를 그대로 믿지 않음). 하루 최대 DAY_CAP점까지만 랭킹에 들어가요.
module.exports = function (ctx) {
  const { notion, queryAll, P, rt, sel, clip, uuid, normId, id32, getLastErr } = ctx;
  const DB = () => id32(process.env.NOTION_GAME_DB_ID || "3ef113187ca24388b1a68de4cc535144");
  const DAY_CAP = Number(process.env.GAME_DAY_CAP || 300);
  const GAMES = { card: "단어 카드", mean: "뜻 맞추기", word: "단어 고르기", spell: "철자 쓰기", listen: "듣고 쓰기", blank: "예문 빈칸", ctx: "문맥 고르기", match: "짝 맞추기", speed: "60초 챌린지" };
  const NAME2ID = Object.fromEntries(Object.entries(GAMES).map(([k, v]) => [v, k]));

  // 게임별 포인트: 고르기 1점, 쓰기·문맥 고르기 2점, 카드는 단어 2개에 1점, 짝 맞추기는 짝 1개에 1점
  function points(g, right, total) {
    if (g === "card") return Math.floor(Math.min(total, 100) / 2);
    if (g === "spell" || g === "listen" || g === "ctx") return right * 2;
    return right;
  }
  const kstDay = (ms) => new Date(ms + 9 * 3600e3).toISOString().slice(0, 10);
  function periodStart(period) { // 한국 시간 기준 이번 주 월요일 0시 / 이번 달 1일 0시
    const now = new Date(Date.now() + 9 * 3600e3);
    let d;
    if (period === "month") d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
    else { const dow = (now.getUTCDay() + 6) % 7; d = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - dow); }
    return new Date(d - 9 * 3600e3).toISOString();
  }

  async function save(who, b) {
    const g = GAMES[b.game] ? b.game : null; if (!g) return { status: 400, msg: "게임 종류가 맞지 않아요." };
    let total = Math.max(0, Math.min(200, Math.floor(Number(b.total) || 0))), right = Math.max(0, Math.min(total, Math.floor(Number(b.right) || 0)));
    const sec = Math.max(0, Math.min(3600, Math.round((Number(b.sec) || 0) * 10) / 10));
    if (g === "speed") { total = Math.min(total, 80); right = Math.min(right, total, 50); if (sec < 55) return { status: 400, msg: "60초를 다 채워야 기록돼요." }; }
    if (g === "match" && right < total) return { status: 400, msg: "짝을 다 맞춰야 기록돼요." };
    if (!total) return { status: 400, msg: "기록할 문제가 없어요." };
    const pt = points(g, right, total);
    const props = {
      "제목": { title: rt(who.name) }, "학생": { relation: [{ id: uuid(who.sid) }] }, "반": { rich_text: rt(who.cls) }, "게임": sel(GAMES[g]),
      "단어장": { rich_text: rt(clip(b.title, 150)) }, "포인트": { number: pt }, "맞힌 수": { number: right }, "문제 수": { number: total }, "걸린 초": { number: sec },
      "날짜": { date: { start: new Date().toISOString() } },
    };
    const pg = await notion("pages", "POST", { parent: { database_id: DB() }, properties: props });
    if (!pg) return { status: 502, msg: "기록을 저장하지 못했어요. 잠시 뒤 다시 해 주세요.", debug: getLastErr() };
    cache.clear();
    return { status: 200, points: pt };
  }

  // 랭킹: rows → 학생별 합계 (하루 DAY_CAP점까지), 60초 챌린지 최고 기록
  const cache = new Map();
  async function rank(b, me, teacher) {
    const period = b.period === "month" ? "month" : "week", scope = b.scope === "all" ? "all" : "cls", cls = clip(b.cls || (me && me.cls), 40);
    if (scope === "cls" && !cls) return { status: 400, msg: "반을 골라 주세요." };
    const key = period + "|" + scope + "|" + (scope === "cls" ? cls : "");
    let data = cache.get(key);
    if (!data || Date.now() - data.t > 20000) {
      const f = [{ property: "날짜", date: { on_or_after: periodStart(period) } }];
      if (scope === "cls") f.push({ property: "반", rich_text: { equals: cls } });
      const rows = await queryAll(DB(), { filter: { and: f } }, 20);
      if (!rows) return { status: 502, msg: "랭킹을 불러오지 못했어요.", debug: getLastErr() };
      const by = new Map();
      rows.forEach((p) => {
        const sid = P.rel(p, "학생")[0]; if (!sid) return;
        const s = by.get(sid) || { sid, name: P.title(p, "제목"), cls: P.text(p, "반"), days: {}, plays: 0, speed: 0, words: 0 };
        const at = Date.parse((P.date(p, "날짜") || {}).start || "") || 0, day = kstDay(at), pt = P.num(p, "포인트") || 0, g = NAME2ID[P.sel(p, "게임")];
        s.days[day] = (s.days[day] || 0) + pt; s.plays++; s.words += P.num(p, "문제 수") || 0;
        if (g === "speed") s.speed = Math.max(s.speed, P.num(p, "맞힌 수") || 0);
        by.set(sid, s);
      });
      const list = [...by.values()].map((s) => ({ sid: s.sid, name: s.name, cls: s.cls, plays: s.plays, words: s.words, speed: s.speed, points: Object.values(s.days).reduce((a, v) => a + Math.min(DAY_CAP, v), 0) }));
      data = { t: Date.now(), list };
      cache.set(key, data);
    }
    const mask = (n) => (n.length <= 1 ? n : n.length === 2 ? n[0] + "*" : n[0] + "*".repeat(n.length - 2) + n[n.length - 1]);
    const show = (s, i, val) => ({ rank: i, name: scope === "all" && !teacher && !(me && me.sid === s.sid) ? mask(s.name) : s.name, cls: scope === "all" ? s.cls : "", me: !!(me && me.sid === s.sid), val, plays: s.plays, words: teacher ? s.words : undefined });
    const ranked = (arr, f) => { let last = null, r = 0; return arr.map((s, i) => { const v = f(s); if (v !== last) { r = i + 1; last = v; } return show(s, r, v); }); };
    const pts = data.list.filter((s) => s.points > 0).sort((a, b) => b.points - a.points || b.plays - a.plays);
    const spd = data.list.filter((s) => s.speed > 0).sort((a, b) => b.speed - a.speed);
    const P1 = ranked(pts, (s) => s.points), S1 = ranked(spd, (s) => s.speed);
    const mine = (arr) => arr.find((x) => x.me) || null;
    return { status: 200, period, scope, cls: scope === "cls" ? cls : "", from: periodStart(period), cap: DAY_CAP,
      points: teacher ? P1 : P1.slice(0, 30), speed: teacher ? S1 : S1.slice(0, 30), myPoints: mine(P1), mySpeed: mine(S1), players: data.list.length };
  }

  return { save, rank, GAMES, _t: { points, periodStart } };
};
