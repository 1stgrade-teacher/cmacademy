// 입장 코드 확인 → 맞으면 쿠키(약 1년)를 심어 줌
const crypto = require("crypto");

const tries = new Map(); // 같은 기기(IP)의 연속 시도 제한
function limited(ip) {
  const now = Date.now(), e = tries.get(ip) || { n: 0, t: now };
  if (now - e.t > 10 * 60 * 1000) { e.n = 0; e.t = now; }
  e.n++; tries.set(ip, e);
  return e.n > 15;
}

function readBody(req) {
  return new Promise((resolve) => {
    if (req.body && typeof req.body === "object") return resolve(req.body);
    let d = "";
    req.on("data", (c) => { d += c; if (d.length > 2000) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(d || "{}")); } catch (e) { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

module.exports = async function handler(req, res) {
  const send = (s, o) => { res.statusCode = s; res.setHeader("Content-Type", "application/json; charset=utf-8"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(o)); };
  const site = String(process.env.SITE_CODE || "").trim();
  if (req.method === "GET") return send(200, { on: !!site });
  if (req.method !== "POST") return send(405, { error: "method" });
  if (!site) return send(200, { ok: true, off: true });
  const ip = String((req.headers["x-forwarded-for"] || "").split(",")[0] || "").trim() || "x";
  if (limited(ip)) return send(429, { ok: false, msg: "시도가 너무 많아요. 잠시 뒤에 다시 해 주세요." });
  const b = await readBody(req);
  const given = String(b.code || "").trim();
  const a = crypto.createHash("sha256").update(given).digest(), c = crypto.createHash("sha256").update(site).digest();
  if (!crypto.timingSafeEqual(a, c)) return send(401, { ok: false, msg: "코드가 맞지 않아요. 선생님께 받은 코드를 다시 확인해 주세요." });
  const tok = crypto.createHmac("sha256", site).update("cmacademy-site-v1").digest("hex");
  res.setHeader("Set-Cookie", "cm_site=" + tok + "; Path=/; Max-Age=" + 60 * 60 * 24 * 365 + "; HttpOnly; Secure; SameSite=Lax");
  return send(200, { ok: true });
};
