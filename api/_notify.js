// api/_notify.js — 학부모님께 카카오 알림톡(안 되면 문자) 보내기 · 솔라피(SOLAPI) 사용
// ------------------------------------------------------------------
// Vercel 환경 변수
//   SOLAPI_API_KEY, SOLAPI_API_SECRET   솔라피 콘솔 → 개발/연동 → API Key
//   SOLAPI_FROM                         솔라피에 등록한 발신번호 (예: 0321234567) — 알림톡 실패 시 문자로 대신 보낼 때 필요
//   KAKAO_PFID                          카카오톡 채널을 솔라피에 연동하면 나오는 채널 ID (KA01PF…)
//   KAKAO_TEMPLATE_ID                   심사 통과한 알림톡 템플릿 ID (KA01TP…)
//   ACADEMY_NAME                        (선택) 문구 맨 앞 학원 이름, 기본 '청명학원'
// 템플릿 ID가 없으면 같은 문구를 문자(SMS/LMS)로 보내요. 키가 없으면 보내지 않고 '발송 설정 전'으로 남겨요.
// ------------------------------------------------------------------
const crypto = require("crypto");

const ACADEMY = () => String(process.env.ACADEMY_NAME || "청명학원").trim();
// 알림톡 템플릿에 그대로 등록할 문구 (#{…}는 변수). 바꾸면 템플릿도 다시 심사받아야 해요.
const TEMPLATE = "[#{학원}] 과제 미제출 안내\n\n#{학생} 학생이 아래 과제를 마감까지 제출하지 않았습니다.\n\n■ 과제: #{과제}\n■ 마감: #{마감}\n\n가정에서 한 번 확인 부탁드립니다. 문의는 학원으로 연락 주세요.";

const keyOk = () => !!(process.env.SOLAPI_API_KEY && process.env.SOLAPI_API_SECRET);
// opt: { template: 문구, tplEnv: 템플릿 ID가 든 환경 변수 이름 } — 없으면 과제 미제출 안내
const tplId = (opt) => String(process.env[(opt && opt.tplEnv) || "KAKAO_TEMPLATE_ID"] || "").trim();
const mode = (opt) => (!keyOk() ? "off" : process.env.KAKAO_PFID && tplId(opt) ? "kakao" : process.env.SOLAPI_FROM ? "sms" : "off");
function phone(s) { const d = String(s || "").replace(/\D/g, ""); return /^01[016789]\d{7,8}$/.test(d) ? d : ""; }
function fill(vars, template) { return String(template || TEMPLATE).replace(/#\{([^}]+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m)); }
function auth() {
  const date = new Date().toISOString().replace(/\.\d{3}Z$/, "Z"), salt = crypto.randomBytes(16).toString("hex");
  const sig = crypto.createHmac("sha256", String(process.env.SOLAPI_API_SECRET)).update(date + salt).digest("hex");
  return "HMAC-SHA256 apiKey=" + process.env.SOLAPI_API_KEY + ", date=" + date + ", salt=" + salt + ", signature=" + sig;
}

// list: [{ to, vars:{학생,과제,마감} }] → [{ ok, how, msg }] (같은 순서)
async function sendMany(list, opt) {
  const m = mode(opt), T = (opt && opt.template) || TEMPLATE;
  const prepared = list.map((x) => ({ to: phone(x.to), vars: Object.assign({ 학원: ACADEMY() }, x.vars) }));
  if (m === "off") return prepared.map((x) => ({ ok: false, how: "off", msg: "발송 설정 전 (보낼 문구: " + fill(x.vars, T).replace(/\n+/g, " ") + ")" }));
  const out = prepared.map((x) => (x.to ? null : { ok: false, how: m, msg: "연락처 형식이 맞지 않아요" }));
  const msgs = [], idx = [];
  prepared.forEach((x, i) => {
    if (!x.to) return;
    const text = fill(x.vars, T), one = { to: x.to, text };
    if (process.env.SOLAPI_FROM) one.from = String(process.env.SOLAPI_FROM).replace(/\D/g, "");
    if (m === "kakao") { one.type = "ATA"; one.kakaoOptions = { pfId: process.env.KAKAO_PFID, templateId: tplId(opt), variables: Object.fromEntries(Object.entries(x.vars).map(([k, v]) => ["#{" + k + "}", String(v)])), disableSms: !process.env.SOLAPI_FROM }; }
    msgs.push(one); idx.push(i);
  });
  for (let s = 0; s < msgs.length; s += 100) {
    const part = msgs.slice(s, s + 100), pi = idx.slice(s, s + 100);
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 20000);
      const r = await fetch("https://api.solapi.com/messages/v4/send-many/detail", { method: "POST", signal: ctl.signal, headers: { "Content-Type": "application/json", Authorization: auth() }, body: JSON.stringify({ messages: part, showMessageList: true }) });
      clearTimeout(t);
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { pi.forEach((i) => (out[i] = { ok: false, how: m, msg: "발송 실패: " + String(j.errorMessage || j.message || r.status).slice(0, 120) })); continue; }
      const failed = new Map((j.failedMessageList || []).map((f) => [String(f.to || "").replace(/\D/g, ""), f]));
      pi.forEach((i) => { const f = failed.get(prepared[i].to); out[i] = f ? { ok: false, how: m, msg: "발송 실패: " + String(f.statusMessage || f.statusCode || "").slice(0, 120) } : { ok: true, how: m, msg: m === "kakao" ? "알림톡 보냄" : "문자 보냄" }; });
    } catch (e) { pi.forEach((i) => (out[i] = { ok: false, how: m, msg: "발송 실패: " + String((e && e.message) || e).slice(0, 120) })); }
  }
  return out;
}

module.exports = { sendMany, mode, phone, fill, TEMPLATE, ACADEMY, _t: { auth } };
