// 사이트 전체 입장 코드 확인 (Vercel 환경변수 SITE_CODE 가 있을 때만 작동)
// - SITE_CODE 를 지우면 누구나 볼 수 있는 예전 상태로 돌아갑니다.
// - 어떤 오류가 나도 사이트가 멈추지 않도록, 오류 시에는 그냥 통과시킵니다.
export const config = { matcher: "/((?!api/|_vercel/).*)" };

const OPEN = ["/gate.html", "/manifest.json", "/favicon-32.png", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/icon-maskable-512.png"];

function pass() {
  return new Response(null, { headers: { "x-middleware-next": "1" } });
}

async function token(code) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(code), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode("cmacademy-site-v1"));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export default async function middleware(request) {
  try {
    // 문제은행(정답 포함)·관리 도구 폴더는 사이트에서 직접 열 수 없음 (서버만 읽음)
    const p0 = new URL(request.url).pathname;
    if (/^\/(exam-bank|tools|\.github)(\/|$)/i.test(p0)) return new Response("Not found", { status: 404 });
    const code = (typeof process !== "undefined" && process.env && process.env.SITE_CODE || "").trim();
    if (!code) return pass();
    const url = new URL(request.url);
    if (OPEN.indexOf(url.pathname) >= 0) return pass();
    const cookie = request.headers.get("cookie") || "";
    const m = cookie.match(/(?:^|;\s*)cm_site=([0-9a-f]{64})/);
    if (m && m[1] === (await token(code))) return pass();
    // 입장 전: 페이지 요청은 입장 화면으로, 그 밖의 파일 요청은 거절
    const wantsPage = request.method === "GET" && (request.headers.get("accept") || "").includes("text/html");
    if (wantsPage) {
      const to = new URL("/gate.html", url);
      to.searchParams.set("next", url.pathname + url.search);
      return Response.redirect(to.toString(), 302);
    }
    return new Response("입장 코드가 필요해요.", { status: 401, headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return pass();
  }
}
