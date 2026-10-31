// api/_drive.js — 구글 드라이브 '문제은행 폴더' 읽기 (서비스 계정, 읽기 전용)
// Vercel 환경 변수
//   GOOGLE_SERVICE_ACCOUNT  서비스 계정 키(JSON 파일 내용 전체를 그대로 붙여 넣기)
//   DRIVE_FOLDER_ID         문제은행 폴더 주소 또는 ID (https://drive.google.com/drive/folders/여기)
// 폴더 구조:  문제은행 폴더 / 교재 / 단원 / 문제지.docx + 문제지_정답.docx
const crypto = require("crypto");

const MIME_EXPORT = {
  "application/vnd.google-apps.document": { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: "docx" },
  "application/vnd.google-apps.spreadsheet": { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: "xlsx" },
};
const OK_EXT = /\.(docx|hwpx|hwp|pdf|xlsx|txt)$/i;
const MAX_BYTES = 3 * 1024 * 1024; // 응답 한도(4.5MB) 안에 들어가도록

function account() {
  let raw = String(process.env.GOOGLE_SERVICE_ACCOUNT || "").trim();
  if (!raw) return null;
  if (!raw.startsWith("{")) { try { raw = Buffer.from(raw, "base64").toString("utf8"); } catch (e) { return null; } }
  try {
    const j = JSON.parse(raw);
    if (!j.client_email || !j.private_key) return null;
    j.private_key = String(j.private_key).replace(/\\n/g, "\n");
    return j;
  } catch (e) { return null; }
}
function folderId() {
  const v = String(process.env.DRIVE_FOLDER_ID || "").trim();
  const m = v.match(/folders\/([A-Za-z0-9_-]{10,})/) || v.match(/[?&]id=([A-Za-z0-9_-]{10,})/) || v.match(/^([A-Za-z0-9_-]{10,})$/);
  return m ? m[1] : "";
}
const configured = () => !!(account() && folderId());
const b64u = (b) => Buffer.from(b).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

let tok = null;
async function token() {
  if (tok && tok.exp > Date.now() + 60000) return tok.v;
  const sa = account(); if (!sa) throw new Error("no-account");
  const now = Math.floor(Date.now() / 1000);
  const head = b64u(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64u(JSON.stringify({ iss: sa.client_email, scope: "https://www.googleapis.com/auth/drive.readonly", aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const sig = b64u(crypto.createSign("RSA-SHA256").update(head + "." + body).sign(sa.private_key));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=" + encodeURIComponent("urn:ietf:params:oauth:grant-type:jwt-bearer") + "&assertion=" + head + "." + body + "." + sig,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) throw new Error("token: " + (j.error_description || j.error || r.status));
  tok = { v: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return tok.v;
}
async function api(path, raw) {
  const r = await fetch("https://www.googleapis.com/drive/v3/" + path, { headers: { Authorization: "Bearer " + (await token()) } });
  if (!r.ok) {
    const t = await r.text().catch(() => "");
    const e = new Error("drive " + r.status + ": " + t.slice(0, 200)); e.status = r.status; throw e;
  }
  return raw ? Buffer.from(await r.arrayBuffer()) : r.json();
}

// 문제은행 폴더 안을 교재/단원 깊이까지 훑어 파일 목록을 만듦
async function list() {
  const root = folderId();
  const meta = await api("files/" + root + "?supportsAllDrives=true&fields=id,name,mimeType");
  if (meta.mimeType !== "application/vnd.google-apps.folder") throw new Error("not-folder");
  const out = [], queue = [{ id: root, path: [] }];
  let calls = 0;
  while (queue.length && calls < 60) {
    const cur = queue.shift(); let pageToken = "";
    do {
      calls++;
      const q = encodeURIComponent("'" + cur.id + "' in parents and trashed=false");
      const j = await api("files?q=" + q + "&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true&fields=nextPageToken,files(id,name,mimeType,modifiedTime,size,lastModifyingUser(displayName))" + (pageToken ? "&pageToken=" + pageToken : ""));
      (j.files || []).forEach((f) => {
        if (f.mimeType === "application/vnd.google-apps.folder") { if (cur.path.length < 3) queue.push({ id: f.id, path: cur.path.concat(f.name) }); return; }
        const exp = MIME_EXPORT[f.mimeType];
        if (!exp && !OK_EXT.test(f.name)) return;
        out.push({ id: f.id, name: exp ? f.name + "." + exp.ext : f.name, mime: f.mimeType, modified: f.modifiedTime, size: +f.size || 0, path: cur.path, by: f.lastModifyingUser && f.lastModifyingUser.displayName || "" });
      });
      pageToken = j.nextPageToken || "";
    } while (pageToken && calls < 60);
  }
  return { root: meta.name, files: out };
}
// 파일 하나 내려받기 (구글 문서·시트는 워드·엑셀로 바꿔서)
async function get(id) {
  if (!/^[A-Za-z0-9_-]{10,}$/.test(id)) throw new Error("bad-id");
  const f = await api("files/" + id + "?supportsAllDrives=true&fields=id,name,mimeType,size,modifiedTime,parents");
  const exp = MIME_EXPORT[f.mimeType];
  if (!exp && +f.size > MAX_BYTES) { const e = new Error("too-big"); e.size = +f.size; throw e; }
  const buf = exp ? await api("files/" + id + "/export?mimeType=" + encodeURIComponent(exp.mime), true) : await api("files/" + id + "?alt=media&supportsAllDrives=true", true);
  if (buf.length > MAX_BYTES) { const e = new Error("too-big"); e.size = buf.length; throw e; }
  return { id: f.id, name: exp ? f.name + "." + exp.ext : f.name, modified: f.modifiedTime, b64: buf.toString("base64") };
}

module.exports = { configured, account, folderId, list, get };
