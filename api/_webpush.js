// api/_webpush.js — 🔔 웹 푸시 (휴대폰·컴퓨터 브라우저 알림) — 추가 프로그램 없이 Node 기본 기능만으로
// ------------------------------------------------------------------
// · VAPID 열쇠는 사이트 비밀값(REPORT_SECRET 또는 NOTION_TOKEN)에서 늘 같은 값으로 만들어요 → 환경 변수 추가 필요 없음.
//   (따로 정하고 싶으면 VAPID_PRIVATE_KEY = base64url 32바이트 비밀 열쇠)
// · 내용 암호화: RFC 8291 (aes128gcm), 보낸 사람 확인: RFC 8292 (VAPID, ES256)
// · send(sub, {title, body, url, tag}) → { ok, status, gone }  — gone이면 그 기기는 알림을 끈 것이라 지우면 돼요.
// ------------------------------------------------------------------
const crypto = require("crypto");

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
// P-256 곡선의 차수 n (비밀 열쇠는 1..n-1)
const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

module.exports = function (secret) {
  let K = null;
  function keys() {
    if (K) return K;
    let d = process.env.VAPID_PRIVATE_KEY ? unb64u(process.env.VAPID_PRIVATE_KEY) : null;
    if (!d || d.length !== 32) {
      const n = (BigInt("0x" + hmac("cm-vapid-v1|" + secret(), "p256").toString("hex")) % (N - 1n)) + 1n;
      d = Buffer.from(n.toString(16).padStart(64, "0"), "hex");
    }
    const ecdh = crypto.createECDH("prime256v1"); ecdh.setPrivateKey(d);
    const pub = ecdh.getPublicKey(); // 65바이트 (0x04 + x + y)
    const priv = crypto.createPrivateKey({ format: "jwk", key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
    K = { pub, pubB64: b64u(pub), priv };
    return K;
  }

  function vapid(endpoint, subject) {
    const k = keys(), aud = new URL(endpoint).origin;
    const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
    const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject || "mailto:noreply@cmacademy.vercel.app" }));
    const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: k.priv, dsaEncoding: "ieee-p1363" });
    return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + k.pubB64;
  }

  // RFC 8291 — 받는 기기만 풀 수 있게 암호화
  function encrypt(sub, text) {
    const ua = unb64u(sub.keys && sub.keys.p256dh), auth = unb64u(sub.keys && sub.keys.auth);
    if (ua.length !== 65 || auth.length < 16) throw new Error("bad subscription keys");
    const as = crypto.createECDH("prime256v1"); as.generateKeys();
    const asPub = as.getPublicKey(), shared = as.computeSecret(ua);
    const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from("WebPush: info\0"), ua, asPub, Buffer.from([1])]));
    const salt = crypto.randomBytes(16), prk = hmac(salt, ikm);
    const cek = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: aes128gcm\0"), Buffer.from([1])])).subarray(0, 16);
    const nonce = hmac(prk, Buffer.concat([Buffer.from("Content-Encoding: nonce\0"), Buffer.from([1])])).subarray(0, 12);
    const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
    const enc = Buffer.concat([c.update(Buffer.concat([Buffer.from(text, "utf8"), Buffer.from([2])])), c.final(), c.getAuthTag()]);
    const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
    return Buffer.concat([salt, rs, Buffer.from([asPub.length]), asPub, enc]);
  }

  async function send(sub, msg, opt) {
    opt = opt || {};
    try {
      if (!sub || !/^https:\/\//.test(sub.endpoint || "")) return { ok: false, status: 0, msg: "주소 없음" };
      const body = encrypt(sub, JSON.stringify(msg || {}));
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), opt.timeout || 10000);
      let r;
      try {
        r = await fetch(sub.endpoint, { method: "POST", signal: ctl.signal, body,
          headers: { "Content-Type": "application/octet-stream", "Content-Encoding": "aes128gcm", TTL: String(opt.ttl || 86400), Urgency: opt.urgency || "high", Authorization: vapid(sub.endpoint, opt.subject), ...(msg && msg.tag ? { Topic: b64u(crypto.createHash("sha256").update(String(msg.tag)).digest()).slice(0, 32) } : {}) } });
      } finally { clearTimeout(timer); }
      const gone = r.status === 404 || r.status === 410;
      let txt = ""; if (!r.ok) { try { txt = (await r.text()).slice(0, 160); } catch (e) {} }
      return { ok: r.ok, status: r.status, gone, msg: r.ok ? "보냄" : gone ? "알림이 꺼진 기기" : "실패(" + r.status + ") " + txt };
    } catch (e) { return { ok: false, status: 0, msg: "실패: " + String(e && e.message || e).slice(0, 120) }; }
  }

  return { publicKey: () => keys().pubB64, send, _t: { encrypt, keys, vapid, b64u, unb64u } };
};
