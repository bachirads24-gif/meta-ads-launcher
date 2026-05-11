import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";
import { getUserById, type User } from "./users";

const COOKIE = "mal_session";
export const SESSION_COOKIE = COOKIE;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error("SESSION_SECRET is not set");
  return s;
}

export function signSession(userId: string): string {
  const sig = createHmac("sha256", secret()).update(userId).digest("hex");
  return `${userId}.${sig}`;
}

export function verifySession(value: string | undefined): string | null {
  if (!value) return null;
  const idx = value.lastIndexOf(".");
  if (idx <= 0) return null;
  const userId = value.slice(0, idx);
  const provided = value.slice(idx + 1);
  const expected = createHmac("sha256", secret()).update(userId).digest("hex");
  const a = Buffer.from(provided, "hex");
  const b = Buffer.from(expected, "hex");
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}

export async function getCurrentUser(): Promise<User | null> {
  const c = await cookies();
  const userId = verifySession(c.get(COOKIE)?.value);
  if (!userId) return null;
  return getUserById(userId);
}

export async function setSessionCookie(userId: string): Promise<void> {
  const c = await cookies();
  c.set(COOKIE, signSession(userId), {
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
