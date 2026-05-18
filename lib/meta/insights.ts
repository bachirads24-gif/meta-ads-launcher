import { graphGet } from "./client";
import { listAdAccounts } from "./accounts";
import type { Brand } from "../brands";

export interface CampaignInsightRow {
  campaignId: string;
  name: string;
  spend: number;
  cpa: number | null;
  leads: number;
  ctr: number;
  cpm: number;
  cpc: number;
  adAccountId: string;
  adAccountName: string;
  adsetId?: string;
  adsetName?: string;
  adId?: string;
  adName?: string;
}

export interface AccountFetchError {
  adAccountId: string;
  adAccountName: string;
  error: string;
}

export interface AllAccountsInsights {
  rows: CampaignInsightRow[];
  errors: AccountFetchError[];
}

interface InsightApiRow {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpm?: string;
  cpc?: string;
  actions?: { action_type: string; value: string }[];
  cost_per_action_type?: { action_type: string; value: string }[];
}

const LEAD_ACTION_TYPES = new Set([
  "lead",
  "onsite_conversion.lead_grouped",
  "offsite_conversion.fb_pixel_lead",
]);

function pickActionValue(rows: { action_type: string; value: string }[] | undefined): number {
  if (!rows) return 0;
  for (const r of rows) {
    if (LEAD_ACTION_TYPES.has(r.action_type)) {
      const n = Number(r.value);
      if (Number.isFinite(n) && n > 0) return n;
    }
  }
  return 0;
}

export type InsightLevel = "campaign" | "adset" | "ad";
export type DatePreset = "today" | "yesterday" | "last_3d" | "last_7d" | "last_14d" | "last_30d" | "last_90d" | "this_month" | "last_month" | "maximum";

export async function fetchInsightsForAccount(
  adAccountId: string,
  adAccountName: string,
  token: string,
  opts: { level?: InsightLevel; datePreset?: DatePreset; activeOnly?: boolean } = {},
): Promise<CampaignInsightRow[]> {
  const level = opts.level ?? "campaign";
  const datePreset = opts.datePreset ?? "today";
  const activeOnly = opts.activeOnly ?? true;

  const baseFields = "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpm,cpc,actions,cost_per_action_type";
  const levelExtra =
    level === "adset"
      ? ",adset_id,adset_name"
      : level === "ad"
        ? ",adset_id,adset_name,ad_id,ad_name"
        : "";

  const params: Record<string, string> = {
    level,
    date_preset: datePreset,
    fields: baseFields + levelExtra,
    limit: "500",
  };

  if (activeOnly) {
    params.filtering = JSON.stringify([
      { field: "campaign.effective_status", operator: "IN", value: ["ACTIVE"] },
    ]);
  }

  const res = await graphGet<{ data: InsightApiRow[] }>(
    `/act_${adAccountId}/insights`,
    params,
    token,
  );

  return (res.data ?? []).map((r) => {
    const spend = Number(r.spend ?? 0);
    const leads = pickActionValue(r.actions);
    const cpaFromApi = pickActionValue(r.cost_per_action_type);
    const cpa = cpaFromApi > 0 ? cpaFromApi : leads > 0 ? spend / leads : null;
    return {
      campaignId: r.campaign_id ?? "",
      name: r.campaign_name ?? "",
      spend,
      cpa,
      leads,
      ctr: Number(r.ctr ?? 0),
      cpm: Number(r.cpm ?? 0),
      cpc: Number(r.cpc ?? 0),
      adAccountId,
      adAccountName,
      adsetId: r.adset_id,
      adsetName: r.adset_name,
      adId: r.ad_id,
      adName: r.ad_name,
    };
  });
}

export async function fetchCampaignInsightsAllAccounts(brand: Brand): Promise<AllAccountsInsights> {
  const accounts = await listAdAccounts(brand.accessToken);
  const active = accounts.filter((a) => a.accountStatus === 1);

  const settled = await Promise.allSettled(
    active.map((a) => fetchInsightsForAccount(a.id, a.name, brand.accessToken)),
  );

  const rows: CampaignInsightRow[] = [];
  const errors: AccountFetchError[] = [];

  settled.forEach((result, i) => {
    const acc = active[i];
    if (result.status === "fulfilled") {
      rows.push(...result.value);
    } else {
      errors.push({
        adAccountId: acc.id,
        adAccountName: acc.name,
        error: result.reason instanceof Error ? result.reason.message : String(result.reason),
      });
    }
  });

  return { rows, errors };
}
