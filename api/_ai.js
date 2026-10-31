// api/_ai.js — 여러 AI를 한 가지 방법으로 부르기 (JSON 답 전용)
// ------------------------------------------------------------------
// Vercel 환경 변수에 넣은 키만 켜져요. 하나만 넣어도 되고, 여러 개 넣으면 하나가 실패할 때 다음 AI가 이어받아요.
//   DEEPSEEK_API_KEY   DeepSeek            (모델 바꾸기: DEEPSEEK_MODEL, 기본 deepseek-flash)
//   OPENAI_API_KEY     ChatGPT(OpenAI)     (모델 바꾸기: OPENAI_MODEL,   기본 gpt-4.1-mini)
//   ANTHROPIC_API_KEY  Claude(Anthropic)   (모델 바꾸기: CLAUDE_MODEL,   기본 claude-haiku-5-5)
//   GEMINI_API_KEY     Gemini(Google)      (모델 바꾸기: GEMINI_MODEL,   기본 gemini-2.5-flash)
//   AI_PROVIDER        (선택) 먼저 쓸 AI: deepseek / openai / claude / gemini
// 선생님 화면에서 고른 AI가 있으면 그 AI를 먼저 써요.
// ------------------------------------------------------------------
const { AsyncLocalStorage } = require("async_hooks");
const als = new AsyncLocalStorage();

const PROVIDERS = {
  deepseek: { label: "DeepSeek", env: "DEEPSEEK_API_KEY", model: () => process.env.DEEPSEEK_MODEL || process.env.CHAT_MODEL || "deepseek-flash" },
  openai: { label: "ChatGPT", env: "OPENAI_API_KEY", model: () => process.env.OPENAI_MODEL || "gpt-4.1-mini" },
  claude: { label: "Claude", env: "ANTHROPIC_API_KEY", model: () => process.env.CLAUDE_MODEL || "claude-haiku-5-5" },
  gemini: { label: "Gemini", env: "GEMINI_API_KEY", model: () => process.env.GEMINI_MODEL || "gemini-2.5-flash" },
};
const ORDER = ["deepseek", "openai", "claude", "gemini"];
// 화면에서 고를 수 있는 모델 (앞쪽일수록 가볍고 저렴). 목록에 없으면 '직접 입력'으로 아무 모델 이름이나 쓸 수 있어요.
const MODELS = {
  deepseek: [["deepseek-flash", "빠르고 저렴 (기본)"], ["deepseek-chat", "일반 대화"]],
  openai: [["gpt-4.1-mini", "빠르고 저렴 (기본)"], ["gpt-4.1", "더 똑똑함"], ["gpt-4o-mini", "가벼움"], ["gpt-4o", "균형"]],
  claude: [["claude-haiku-5-5", "빠르고 저렴 (기본)"], ["claude-sonnet-5-5", "균형"], ["claude-opus-5-5", "가장 똑똑함 · 비쌈"]],
  gemini: [["gemini-2.5-flash", "빠르고 저렴 (기본)"], ["gemini-2.5-flash-lite", "더 가벼움"], ["gemini-2.5-pro", "더 똑똑함"]],
};
const okModel = (m) => /^[A-Za-z0-9][A-Za-z0-9._:\-]{0,59}$/.test(String(m || ""));

const keyOf = (p) => String(process.env[PROVIDERS[p].env] || "").trim();
function available() { return ORDER.filter((p) => keyOf(p)); }
function list() { return available().map((p) => ({ id: p, label: PROVIDERS[p].label, model: PROVIDERS[p].model(), models: MODELS[p].map((m) => ({ id: m[0], note: m[1] })) })); }
// 선생님이 고른 모델이 있으면 그것, 없으면 Vercel 열쇠/기본값
const modelFor = (p) => { const st = als.getStore() || {}, m = st.models && st.models[p]; return okModel(m) ? m : PROVIDERS[p].model(); };
function norm(p) { p = String(p || "").toLowerCase().trim(); return p === "chatgpt" || p === "gpt" ? "openai" : p === "anthropic" ? "claude" : p === "google" ? "gemini" : p; }
function order(prefer) {
  const av = available(), first = [norm(prefer), norm(process.env.AI_PROVIDER)].filter((p) => av.includes(p));
  return [...new Set(first.concat(av))];
}
// 요청 하나 동안 "이 선생님은 이 AI를 먼저" 를 기억
function cleanModels(m) { const o = {}; if (m && typeof m === "object") for (const p of ORDER) if (okModel(m[p])) o[p] = String(m[p]); return o; }
function withPrefer(prefer, fn, models) { return als.run({ prefer: norm(prefer), models: cleanModels(models) }, fn); }
function setPrefer(prefer, models) { als.enterWith({ prefer: norm(prefer), models: cleanModels(models) }); }
function defaultId() { return order("")[0] || ""; }

function parseJson(txt) {
  let s = String(txt || "").trim().replace(/^```(?:json)?\s*|\s*```$/g, "");
  try { return JSON.parse(s); } catch (e) {}
  const a = s.indexOf("{"), b = s.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (e) {} }
  return null;
}

async function callOne(p, system, user, maxTokens, temperature, signal) {
  const key = keyOf(p), model = modelFor(p), H = { "Content-Type": "application/json" };
  let url, body;
  if (p === "deepseek" || p === "openai") {
    url = p === "deepseek" ? "https://api.deepseek.com/chat/completions" : "https://api.openai.com/v1/chat/completions";
    H.Authorization = "Bearer " + key;
    body = { model, messages: [{ role: "system", content: system }, { role: "user", content: user }], response_format: { type: "json_object" } };
    if (p === "deepseek") Object.assign(body, { thinking: { type: "disabled" }, temperature, max_tokens: maxTokens });
    else if (/^(o\d|gpt-5)/.test(model)) body.max_completion_tokens = maxTokens + 2000; // 생각하는 모델은 온도 지정 불가·생각 몫 여유
    else Object.assign(body, { temperature, max_tokens: maxTokens });
  } else if (p === "claude") {
    url = "https://api.anthropic.com/v1/messages";
    H["x-api-key"] = key; H["anthropic-version"] = "2023-06-01";
    body = { model, system: system + "\n\n설명 없이 JSON 객체 하나만 출력해.", max_tokens: maxTokens, temperature, messages: [{ role: "user", content: user }] };
  } else {
    url = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent";
    H["x-goog-api-key"] = key;
    body = { systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: user }] }], generationConfig: { temperature, maxOutputTokens: maxTokens + 2000, responseMimeType: "application/json" } };
  }
  const r = await fetch(url, { method: "POST", signal, headers: H, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text().catch(() => ""); throw new Error(p + " " + r.status + " " + t.slice(0, 200)); }
  const j = await r.json();
  let txt = "";
  if (p === "claude") txt = (j.content || []).filter((c) => c.type === "text").map((c) => c.text).join("");
  else if (p === "gemini") txt = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map((x) => x.text || "").join("");
  else txt = (j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content) || "";
  const out = parseJson(txt);
  if (!out) throw new Error(p + " JSON 아님");
  return out;
}

let last = { used: "", model: "", errors: [] };
// 고른 AI → 실패하면 다음 AI. 전체 시간은 timeoutMs 안에서.
async function askAI(system, user, maxTokens, timeoutMs, opts) {
  opts = opts || {};
  const st = als.getStore() || {};
  const list = opts.only ? available().filter((p) => p === norm(opts.only)) : order(opts.prefer || st.prefer);
  last = { used: "", model: "", errors: [] };
  if (!list.length) return null;
  const end = Date.now() + (timeoutMs || 40000);
  for (const p of list) {
    const left = end - Date.now(); if (left < 4000) break;
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), left);
    try {
      const out = await callOne(p, system, user, maxTokens || 3000, opts.temperature == null ? 0.5 : opts.temperature, ctl.signal);
      last.used = p; last.model = modelFor(p); return out;
    } catch (e) { console.error("ai", e && e.message); last.errors.push(PROVIDERS[p].label + ": " + String((e && e.message) || e).slice(0, 160)); }
    finally { clearTimeout(t); }
  }
  return null;
}

module.exports = { askAI, available, list, withPrefer, setPrefer, defaultId, modelFor, label: (p) => (PROVIDERS[p] || {}).label || "", lastInfo: () => last, _t: { parseJson, order, callOne } };
