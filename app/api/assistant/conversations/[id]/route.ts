import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getConversation } from "@/lib/assistant/store";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  const { id } = await params;
  const conv = await getConversation(user.id, id);
  if (!conv) return NextResponse.json({ error: "Conversation introuvable" }, { status: 404 });
  return NextResponse.json({ conversation: conv });
}
