import { NextResponse, type NextRequest } from "next/server";

const SESSION_COOKIE = "mal_session";
const PUBLIC_PATHS = ["/login", "/api/auth"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const expected = process.env.APP_PASSWORD
    ? Buffer.from(process.env.APP_PASSWORD).toString("base64")
    : null;
  const session = req.cookies.get(SESSION_COOKIE)?.value;
  if (!expected || session !== expected) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
