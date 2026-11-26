// api/_push.js — 🔔 웹 푸시(무료): 학부모님 휴대폰에 알림을 보내요. 외부 서비스·추가 설치 없이 Node 기본 crypto만 써요.
//   표준: RFC 8291(내용 암호화 aes128gcm) · RFC 8292(VAPID 서명)
//   VAPID 열쇠는 따로 만들 필요 없이 사이트 비밀값(secret)에서 늘 같은 값으로 만들어요. (비밀값을 바꾸면 부모님이 알림을 다시 켜야 해요)
const crypto = require("crypto");

const b64u = (buf) => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64u = (s) => Buffer.from(String(s || "").replace(/-/g, "+").replace(/_/g, "/"), "base64");
const N_P256 = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

let VK = null;
function vapid(secret) {
  if (VK && VK.s === secret) return VK;
  let d = crypto.createHmac("sha256", String(secret)).update("cm-vapid-v1").digest();
  let n = BigInt("0x" + d.toString("hex")) % (N_P256 - 1n) + 1n; // 1 … n-1
  d = Buffer.from(n.toString(16).padStart(64, "0"), "hex");
  const ec = crypto.createECDH("prime256v1"); ec.setPrivateKey(d);
  const pub = ec.getPublicKey(); // 65바이트 (04 || x || y)
  const key = crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: b64u(d), x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
  VK = { s: secret, pub, pubB64: b64u(pub), key };
  return VK;
}
const publicKey = (secret) => vapid(secret).pubB64;

function jwt(aud, v, sub) {
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: sub || "https://cmacademy.vercel.app" }));
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key: v.key, dsaEncoding: "ieee-p1363" });
  return head + "." + body + "." + b64u(sig);
}

// RFC 8291: 구독(p256dh, auth)으로 내용을 암호화 → 보낼 몸통
function encrypt(payload, p256dh, auth) {
  const ua = unb64u(p256dh), sec = unb64u(auth);
  if (ua.length !== 65 || sec.length < 16) throw new Error("구독 열쇠 형식이 맞지 않아요");
  const ec = crypto.createECDH("prime256v1"), as = ec.generateKeys(), shared = ec.computeSecret(ua);
  const hmac = (k, d) => crypto.createHmac("sha256", k).update(d).digest();
  const prkKey = hmac(sec, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from("WebPush: info\0"), ua, as, Buffer.from([1])])).subarray(0, 32);
  const salt = crypto.randomBytes(16), prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01")).subarray(0, 12);
  const c = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const ct = Buffer.concat([c.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), c.final(), c.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([as.length]), as, ct]);
}

// sub: { endpoint, keys: { p256dh, auth } } · msg: 객체(JSON으로 보냄) → { ok, gone, status, msg }
async function send(secret, sub, msg, opt) {
  try {
    const ep = String(sub && sub.endpoint || "");
    if (!/^https:\/\//.test(ep)) return { ok: false, gone: true, msg: "구독 주소가 없어요" };
    const v = vapid(secret), body = encrypt(JSON.stringify(msg), sub.keys.p256dh, sub.keys.auth);
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 10000);
    const r = await fetch(ep, { method: "POST", signal: ctl.signal, headers: {
      Authorization: "vapid t=" + jwt(new URL(ep).origin, v, opt && opt.sub) + ", k=" + v.pubB64,
      "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", TTL: String((opt && opt.ttl) || 4 * 86400), Urgency: (opt && opt.urgency) || "high",
    }, body });
    clearTimeout(t);
    if (r.status === 201 || r.status === 200 || r.status === 202) return { ok: true, status: r.status };
    const txt = await r.text().catch(() => "");
    return { ok: false, gone: r.status === 404 || r.status === 410, status: r.status, msg: (r.status + " " + txt).slice(0, 160) };
  } catch (e) { return { ok: false, msg: String((e && e.message) || e).slice(0, 160) }; }
}

module.exports = { publicKey, send, _t: { encrypt, jwt, vapid, b64u, unb64u } };
