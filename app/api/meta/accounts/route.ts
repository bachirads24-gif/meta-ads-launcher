import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBrandWithToken } from "@/lib/brands";
import { graphGet, MetaApiError } from "@/lib/meta/client";
import { listAdAccounts } from "@/lib/meta/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface PixelsResponse {
  data?: { id: string; name: string }[];
}

function errMsg(e: unknown): string {
  if (e instanceof MetaApiError) return `${e.message} (HTTP ${e.status})`;
  if (e instanceof Error) return e.message;
  return String(e);
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const brandId = searchParams.get("brandId");
  const adAccountIdRaw = searchParams.get("adAccountId");

  if (!brandId) return NextResponse.json({ error: "brandId requis" }, { status: 400 });

  if (!user.isAdmin && !user.brandIds.includes(brandId)) {
    return NextResponse.json({ error: "Marque non autorisée" }, { status: 403 });
  }

  const brand = await getBrandWithToken(brandId);
  if (!brand) return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
  if (!brand.accessToken)
    return NextResponse.json({ error: "Token Meta non configuré pour cette marque" }, { status: 400 });

  try {
    if (adAccountIdRaw) {
      const adAccountId = adAccountIdRaw.trim().replace(/^act_/, "");
      const res = await graphGet<PixelsResponse>(
        `/act_${adAccountId}/adspixels`,
        { fields: "id,name", limit: "200" },
        brand.accessToken,
      );
      const pixels = (res.data ?? []).map((p) => ({ id: p.id, name: p.name }));
      return NextResponse.json({ pixels });
    }

    const adAccounts = await listAdAccounts(brand.accessToken);
    return NextResponse.json({ adAccounts });
  } catch (e) {
    return NextResponse.json({ error: errMsg(e) }, { status: 502 });
  }
}
