import { NextResponse } from "next/server";
import { setSessionCookie, clearSessionCookie } from "@/lib/auth";
import { bootstrapAdminIfNeeded, findUserByUsername, verifyPassword } from "@/lib/users";

export async function POST(req: Request) {
  const { username, password } = (await req.json().catch(() => ({}))) as {
    username?: string;
    password?: string;
  };
  if (!username || !password) {
    return NextResponse.json({ error: "Identifiants requis" }, { status: 400 });
  }

  const bootstrapped = await bootstrapAdminIfNeeded(username, password);
  let user = bootstrapped ?? (await findUserByUsername(username));
  if (!user) {
    return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
  }

  if (!bootstrapped) {
    const ok = verifyPassword(password, user.passwordHash, user.passwordSalt);
    if (!ok) {
      return NextResponse.json({ error: "Identifiants invalides" }, { status: 401 });
    }
  }

  await setSessionCookie(user.id);
  return NextResponse.json({ ok: true, username: user.username, isAdmin: user.isAdmin });
}

export async function DELETE() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
