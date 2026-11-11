// api/quiz.js — 강의 '문제 풀기'의 [AI 새 문제 더 풀기] (DeepSeek 중계)
// ------------------------------------------------------------------
// 학생 브라우저 → 이 함수(Vercel 서버) → DeepSeek → 새 문제(JSON)를 조금씩 흘려보냄
// API 키는 강의 HTML에 넣지 않고 Vercel 환경 변수에만 둡니다. (AI 조교 챗봇과 같은 키)
//
// Vercel → Project → Settings → Environment Variables
//   DEEPSEEK_API_KEY   (필수) DeepSeek 키 — 챗봇에 넣은 키를 그대로 씁니다
//   CHAT_CODE          (선택) 입장 코드. 챗봇과 같은 코드를 씁니다
//   QUIZ_DAILY_LIMIT   (선택) 기기(IP)당 하루 새 문제 세트 수. 기본 10
//   QUIZ_MODEL         (선택) 기본은 CHAT_MODEL, 없으면 deepseek-flash
//   QUIZ_OFF           (선택) "1"이면 AI 새 문제 잠시 끄기
// 이 파일은 일등급샘 AI강의 스튜디오가 만들었습니다. (문제 만드는 지시문이 스튜디오와 같아요)
// ------------------------------------------------------------------

const API_URL = "https://api.deepseek.com/chat/completions";
const PROMPT = "당신은 한국 중·고등학생에게 영문법을 가르치는 최고 수준의 학원 강사입니다. 학생이 아래 [오늘 강의]를 들은 뒤 푸는 '문제 풀기' 문제 {N}개를 만드세요.\n\n[대상] {LEVEL}\n[오늘 강의]\n{CTX}\n{AVOID}\n[문제 유형] t 값으로 구분합니다. {N}문제 안에서 유형을 고르게 섞고, 같은 유형을 연달아 두지 마세요. 아래 7가지 유형을 되도록 모두 한 번 이상 쓰되(문제 수가 7개보다 적으면 모두 서로 다른 유형으로), 오늘 문법에 어울리지 않는 유형은 빼도 됩니다.\n\n1. choose — 고르기. 보기(opts) 5개, 정답 번호 ans는 1부터 셉니다. 문제 세트에 정답이 2개인 문제를 하나 넣으세요. 오늘 문법에 쓰임 구분이 있으면 \"<보기>의 밑줄 친 부분과 쓰임이 같은 것 두 개를 고르세요.\"처럼 ref에 <보기> 문장을 넣고 비교할 부분을 ref와 opts에서 [[ ]]로 감쌉니다(밑줄로 보여요). 일반 고르기 문제는 ref를 빈 문자열로 둡니다.\n{\"t\":\"choose\",\"q\":\"다음 중 <보기>의 밑줄 친 used to와 쓰임이 같은 것 두 개를 고르세요.\",\"ref\":\"My mom [[used to]] clean the house every day.\",\"opts\":[\"Tomatoes are [[used to]] make soup.\",\"I [[used to]] exercise after dinner.\",\"Trees are [[used to]] build houses.\",\"They [[used to]] play board games in class.\",\"This machine is [[used to]] clean the room.\"],\"ans\":[2,4],\"exp\":\"<보기>와 ②④의 used to는 '~하곤 했다'(과거의 습관)이고, ①③⑤는 '~하는 데 사용되다'(be used to+동사원형)예요.\"}\n\n2. fix — 틀린 곳 하나 찾아 고치기. s에는 오늘 문법과 관련된 틀린 곳이 정확히 하나 있습니다. wrong은 s 안에 글자 그대로 한 번만 나오는 틀린 부분(단어 1~3개), right는 바르게 고친 말이며 가능한 답을 배열로 모두 적습니다.\n{\"t\":\"fix\",\"q\":\"다음 문장에서 틀린 곳을 하나 찾아 바르게 고치세요.\",\"s\":\"My sister got stung by a bee once and she was afraid of them ever since.\",\"wrong\":\"was afraid\",\"right\":[\"has been afraid\"],\"exp\":\"ever since(그 이후로 계속)가 있으므로 현재완료 has been을 써야 해요.\"}\n\n3. bank — <보기>에서 골라 빈칸 채우기. bank에 3~5개의 말, items에 3~6개 문장. 문장마다 빈칸 ____ 를 하나만 두고, a는 bank 안의 말과 글자가 똑같아야 합니다. 같은 말이 여러 번 답이 되어도 됩니다.\n{\"t\":\"bank\",\"q\":\"빈칸에 알맞은 것을 <보기>에서 고르세요.\",\"bank\":[\"and\",\"so\",\"but\",\"or\"],\"items\":[{\"s\":\"Which do you like better, beef ____ pork?\",\"a\":\"or\"},{\"s\":\"We expected many guests, ____ only a few people came.\",\"a\":\"but\"}],\"exp\":\"선택은 or, 대조는 but, 결과는 so, 나열은 and로 이어요.\"}\n\n4. match — 연결하기. 앞부분 l과 뒷부분 r 4~6쌍. 어법과 문맥상 짝이 하나씩만 맞도록 만듭니다.\n{\"t\":\"match\",\"q\":\"어법과 문맥상 자연스러운 문장이 되도록 알맞은 것끼리 연결하세요.\",\"pairs\":[{\"l\":\"I got a lot of birthday presents,\",\"r\":\"so I was very happy.\"},{\"l\":\"Is Adam coming in the morning\",\"r\":\"or in the evening?\"}],\"exp\":\"...\"}\n\n5. scene — 상황을 보고 <보기>처럼 문장 완성. 그림 대신 scene에 이모지 1~2개와 우리말 상황 한 줄을 씁니다. ex는 <보기> 문장(답 부분을 [[ ]]로)과 괄호 힌트. items는 1~2개이며 빈칸 앞 pre, 빈칸 뒤 post, 괄호 힌트 hint, 정답 a(가능한 답 모두 배열)를 적습니다.\n{\"t\":\"scene\",\"q\":\"상황을 보고 주어진 단어를 사용하여 <보기>와 같이 문장을 완성하세요.\",\"ex\":{\"s\":\"[[Eating popcorn]], Nari is watching a movie.\",\"hint\":\"(popcorn, eat)\"},\"items\":[{\"scene\":\"🧹😩 몇 시간 동안 방을 청소해서 지친 소녀\",\"pre\":\"\",\"post\":\" for hours, the girl got tired.\",\"hint\":\"(her room, clean)\",\"a\":[\"Cleaning her room\"]}],\"exp\":\"동시에 일어나는 일은 분사구문(동사원형+ing)으로 써요.\"}\n\n6. order — 우리말과 일치하도록 어구 배열. chunks는 정답 순서대로 3~6조각(한 조각 안의 단어는 붙여서), end는 문장 끝 문장부호, 순서가 다른 정답 문장이 있으면 alts에 문장으로 적습니다.\n{\"t\":\"order\",\"q\":\"우리말과 일치하도록 주어진 어구를 알맞게 배열하세요.\",\"ko\":\"그는 빗속에서 길을 따라 걷다가 벗겨진 샌들을 다시 신기 위해 가끔 멈춰야 했다.\",\"chunks\":[\"Walking along the road in the rain,\",\"he sometimes had to stop\",\"to recapture a sandal\",\"that had slipped free\"],\"end\":\".\",\"alts\":[],\"exp\":\"...\"}\n\n7. ox — 밑줄 친 부분이 어법상 옳으면 O, 틀리면 X를 고르고 바르게 고치기. s 안의 밑줄 부분을 [[ ]]로 한 번만 표시합니다. ok는 true(옳음) 또는 false(틀림), 틀리면 right에 밑줄 부분을 바르게 고친 말을 배열로 적습니다. 세트 안에서 O 문제와 X 문제를 섞어 주세요.\n{\"t\":\"ox\",\"q\":\"다음 밑줄 친 부분이 어법상 옳으면 O, 틀리면 X를 고르고 바르게 고치세요.\",\"s\":\"I [[am used to get]] up early.\",\"ok\":false,\"right\":[\"am used to getting\"],\"exp\":\"be used to(~에 익숙하다)의 to는 전치사라서 뒤에 동명사가 와요.\"}\n\n[지킬 것]\n- 오늘 강의의 문법 개념과 [대상] 수준 안에서 출제하고, 강의 예문을 그대로 베끼지 말고 새 문장을 만드세요.\n- 영어 문장은 자연스럽고 어법이 정확해야 하며, 정답은 분명히 하나여야 합니다(정답이 2개인 choose 문제는 정확히 2개).\n- 지시문 q, 해설 exp, scene, ko는 한국어로 씁니다. exp는 왜 그것이 답인지 1~2문장으로 쉽게 설명합니다.\n- 영어 문장 안에는 [[ ]] 말고 다른 표시(**, 괄호 번호, 밑줄 기호)를 쓰지 마세요. 빈칸은 bank 유형에만 ____ 로 씁니다.\n- 위 예시 문장을 그대로 쓰지 말고 오늘 문법으로 새로 만드세요.\n- 출력은 {\"items\":[ ... ]} 형태의 JSON 객체 하나만 씁니다.\n";

const hits = new Map(); // ip -> {day, n, t:[timestamps]}

function clientIp(req) {
  const xf = (req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || req.headers["x-real-ip"] || (req.socket && req.socket.remoteAddress) || "?";
}
function kstDay() { return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); }
function checkRate(ip, limit) {
  const day = kstDay(), now = Date.now();
  let h = hits.get(ip);
  if (!h || h.day !== day) { h = { day, n: 0, t: [] }; hits.set(ip, h); }
  h.t = h.t.filter((x) => now - x < 60000);
  if (h.t.length >= 2) return { ok: false, why: "fast" };
  if (h.n >= limit) return { ok: false, why: "day" };
  h.n++; h.t.push(now);
  if (hits.size > 5000) hits.clear();
  return { ok: true, left: limit - h.n };
}
function clip(s, n) { s = typeof s === "string" ? s : ""; return s.length > n ? s.slice(0, n) : s; }
async function readBody(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch (e) { return {}; } }
  const chunks = [];
  for await (const c of req) chunks.push(c);
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch (e) { return {}; }
}
function sendJson(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

module.exports = async function handler(req, res) {
  if (req.method === "GET") {
    return sendJson(res, 200, { ok: true, ready: !!process.env.DEEPSEEK_API_KEY && process.env.QUIZ_OFF !== "1", needCode: !!process.env.CHAT_CODE });
  }
  if (req.method !== "POST") return sendJson(res, 405, { error: "method" });

  const origin = req.headers.origin || "";
  const host = req.headers["x-forwarded-host"] || req.headers.host || "";
  if (origin) {
    let oh = "";
    try { oh = new URL(origin).host; } catch (e) {}
    if (oh !== host) return sendJson(res, 403, { error: "origin", msg: "이 사이트에서만 쓸 수 있어요." });
  }
  if (process.env.QUIZ_OFF === "1") return sendJson(res, 503, { error: "off", msg: "AI 새 문제가 잠시 쉬는 중이에요. 강의 문제를 한 번 더 풀어 보세요." });
  const key = process.env.DEEPSEEK_API_KEY;
  if (!key) return sendJson(res, 503, { error: "nokey", msg: "AI 새 문제가 아직 준비되지 않았어요. (선생님: Vercel에 DEEPSEEK_API_KEY를 넣어 주세요)" });

  const b = await readBody(req);
  const code = process.env.CHAT_CODE;
  if (code && String(b.code || "").trim() !== code) return sendJson(res, 401, { error: "code", msg: "입장 코드가 필요해요. 선생님께 받은 코드를 넣어 주세요." });

  const ctx = clip(b.ctx, 3500).trim();
  if (ctx.length < 20) return sendJson(res, 400, { error: "ctx", msg: "이 강의에는 AI 새 문제를 만들 내용이 없어요." });
  const limit = parseInt(process.env.QUIZ_DAILY_LIMIT || "10", 10) || 10;
  const rate = checkRate(clientIp(req), limit);
  if (!rate.ok) {
    return sendJson(res, 429, { error: rate.why, msg: rate.why === "fast" ? "조금 전에 새 문제를 받았어요. 1분 뒤에 다시 눌러 주세요." : "오늘 AI 새 문제를 모두 사용했어요. 내일 다시 만나요!" });
  }

  const n = Math.max(3, Math.min(8, parseInt(b.n, 10) || 6));
  const avoid = (Array.isArray(b.avoid) ? b.avoid : []).slice(-30).map((x) => "- " + clip(String(x || ""), 100)).join("\n");
  const prompt = PROMPT.split("{N}").join(String(n)).replace("{LEVEL}", () => clip(b.level, 30) || "중·고등학생").replace("{CTX}", () => ctx)
    .replace("{AVOID}", () => (avoid ? "\n[이미 푼 문제 — 같은 문장이나 비슷한 문제는 내지 마세요]\n" + avoid + "\n" : ""));

  let up;
  try {
    up = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key },
      body: JSON.stringify({
        model: process.env.QUIZ_MODEL || process.env.CHAT_MODEL || "deepseek-flash",
        messages: [{ role: "system", content: "You output only valid JSON." }, { role: "user", content: prompt }],
        thinking: { type: "disabled" },
        response_format: { type: "json_object" },
        temperature: 0.8,
        max_tokens: 6000,
        stream: true,
      }),
    });
  } catch (e) {
    return sendJson(res, 502, { error: "net", msg: "AI 서버에 연결하지 못했어요. 잠시 뒤 다시 해 주세요." });
  }
  if (!up.ok) {
    const t = await up.text().catch(() => "");
    console.error("deepseek", up.status, t.slice(0, 300));
    const msg = up.status === 402 ? "AI 이용 금액이 모두 사용되었어요. 선생님께 알려 주세요." :
      up.status === 401 ? "AI 설정에 문제가 있어요. 선생님께 알려 주세요." :
      up.status === 429 ? "지금 요청이 많아요. 잠시 뒤에 다시 눌러 주세요." : "AI가 지금 문제를 만들기 어려워요. 잠시 뒤 다시 해 주세요.";
    return sendJson(res, 502, { error: "up" + up.status, msg });
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/plain; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("X-Quiz-Left", String(rate.left));
  const reader = up.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          const j = JSON.parse(data);
          const piece = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
          if (piece) res.write(piece);
        } catch (e) {}
      }
    }
  } catch (e) {}
  res.end();
};
