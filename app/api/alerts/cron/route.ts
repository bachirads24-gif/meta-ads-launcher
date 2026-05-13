import { NextResponse, type NextRequest } from "next/server";
import { Redis } from "@upstash/redis";
import { listUsers } from "@/lib/users";
import { getBrandWithToken, listBrandsPublic } from "@/lib/brands";
import { fetchCampaignInsights } from "@/lib/meta/insights";
import {
  adviceFor,
  buildTelegramMessage,
  isHighCpa,
  TELEGRAM_DEDUPE_WINDOW_MS,
  type HighCpaRow,
} from "@/lib/alerts";
import { sendTelegram } from "@/lib/telegram";

export const dynamic = "force-dynamic";

function dedupeKey(userId: string): string {
  return `alerts:lastSent:${userId}`;
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Forbidden" }, { status: 401 });
  }

  const redis = Redis.fromEnv();
  const allUsers = await listUsers();
  const allBrands = await listBrandsPublic();
  const now = Date.now();

  const summary: {
    userId: string;
    username: string;
    sent: boolean;
    campaignsAlerted: number;
    skippedByDedupe: number;
    error?: string;
  }[] = [];

  for (const user of allUsers) {
    if (!user.telegramChatId) continue;

    const brandIds = user.isAdmin ? allBrands.map((b) => b.id) : user.brandIds;
    if (brandIds.length === 0) continue;

    const lastSent = ((await redis.get(dedupeKey(user.id))) as Record<string, number> | null) ?? {};
    const perBrand: { brandName: string; rows: HighCpaRow[] }[] = [];
    let skipped = 0;
    let errorMsg: string | undefined;

    for (const brandId of brandIds) {
      const brand = await getBrandWithToken(brandId);
      if (!brand?.accessToken) continue;
      try {
        const insights = await fetchCampaignInsights(brand);
        const high = insights.filter(isHighCpa);
        const fresh: HighCpaRow[] = [];
        for (const r of high) {
          const last = lastSent[r.campaignId];
          if (last && now - last < TELEGRAM_DEDUPE_WINDOW_MS) {
            skipped++;
            continue;
          }
          fresh.push({ ...r, advice: adviceFor(r) });
        }
        if (fresh.length > 0) perBrand.push({ brandName: brand.name, rows: fresh });
      } catch (e) {
        errorMsg = e instanceof Error ? e.message : "Erreur Meta API";
      }
    }

    const flatRows = perBrand.flatMap((b) => b.rows);
    if (flatRows.length === 0) {
      summary.push({
        userId: user.id,
        username: user.username,
        sent: false,
        campaignsAlerted: 0,
        skippedByDedupe: skipped,
        error: errorMsg,
      });
      continue;
    }

    const message = buildTelegramMessage(user.username, perBrand);
    const ok = await sendTelegram(user.telegramChatId, message);

    if (ok) {
      const next = { ...lastSent };
      for (const r of flatRows) next[r.campaignId] = now;
      await redis.set(dedupeKey(user.id), next);
    }

    summary.push({
      userId: user.id,
      username: user.username,
      sent: ok,
      campaignsAlerted: flatRows.length,
      skippedByDedupe: skipped,
      error: errorMsg,
    });
  }

  return NextResponse.json({ ok: true, ranAt: new Date().toISOString(), users: summary });
}
