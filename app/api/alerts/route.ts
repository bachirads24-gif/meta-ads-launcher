import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { getBrandWithToken, listBrandsPublic } from "@/lib/brands";
import { fetchCampaignInsightsAllAccounts, type AccountFetchError } from "@/lib/meta/insights";
import { adviceFor, isHighCpa, type HighCpaRow } from "@/lib/alerts";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const allBrands = await listBrandsPublic();
  const visible = user.isAdmin
    ? allBrands
    : allBrands.filter((b) => user.brandIds.includes(b.id));

  const result: {
    brandId: string;
    brandName: string;
    rows: HighCpaRow[];
    accountErrors: AccountFetchError[];
    error?: string;
  }[] = [];

  for (const pb of visible) {
    const brand = await getBrandWithToken(pb.id);
    if (!brand?.accessToken) {
      result.push({
        brandId: pb.id,
        brandName: pb.name,
        rows: [],
        accountErrors: [],
        error: "Token manquant",
      });
      continue;
    }
    try {
      const { rows: insights, errors } = await fetchCampaignInsightsAllAccounts(brand);
      const rows: HighCpaRow[] = insights.filter(isHighCpa).map((r) => ({
        ...r,
        advice: adviceFor(r),
      }));
      result.push({
        brandId: brand.id,
        brandName: brand.name,
        rows,
        accountErrors: errors,
      });
    } catch (e) {
      result.push({
        brandId: pb.id,
        brandName: pb.name,
        rows: [],
        accountErrors: [],
        error: e instanceof Error ? e.message : "Erreur Meta API",
      });
    }
  }

  return NextResponse.json({ brands: result });
}
