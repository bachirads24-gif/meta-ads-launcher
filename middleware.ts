import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mal_session";
const PUBLIC_PATHS = ["/login", "/api/auth", "/api/alerts/cron"];

async function verify(value: string | undefined, secret: string): Promise<boolean> {
  if (!value) return false;
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return false;
  const userId = value.slice(0, idx);
  const provided = value.slice(idx + 1);

  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(userId));
  const expected = Array.from(new Uint8Array(sigBuf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return expected === provided;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const secret = process.env.SESSION_SECRET;
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  const ok = secret ? await verify(session, secret) : false;
  if (!ok) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)"],
};
