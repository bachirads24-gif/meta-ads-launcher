import { cookies } from "next/headers";

const COOKIE = "mal_session";

export async function isAuthenticated(): Promise<boolean> {
  const c = await cookies();
  const v = c.get(COOKIE)?.value;
  return !!v && v === expectedToken();
}

export function expectedToken(): string {
  const pw = process.env.APP_PASSWORD;
  if (!pw) throw new Error("APP_PASSWORD is not set");
  // The cookie value is just the password hash-ish token; since we have one shared
  // password, storing it directly is acceptable for a personal/team tool. We base64
  // the value to keep it opaque in DevTools.
  return Buffer.from(pw).toString("base64");
}

export async function setSessionCookie(): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, expectedToken(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(COOKIE);
}

export function checkPassword(input: string): boolean {
  return input === process.env.APP_PASSWORD;
}

export const SESSION_COOKIE = COOKIE;
