import { graphGet } from "./client";
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
}

interface InsightApiRow {
  campaign_id?: string;
  campaign_name?: string;
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

export async function fetchCampaignInsights(brand: Brand): Promise<CampaignInsightRow[]> {
  const params: Record<string, string> = {
    level: "campaign",
    date_preset: "today",
    fields:
      "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpm,cpc,actions,cost_per_action_type",
    filtering: JSON.stringify([
      { field: "campaign.effective_status", operator: "IN", value: ["ACTIVE"] },
    ]),
    limit: "500",
  };

  const res = await graphGet<{ data: InsightApiRow[] }>(
    `/act_${brand.adAccountId}/insights`,
    params,
    brand.accessToken,
  );

  return (res.data ?? []).map((r) => {
    const spend = Number(r.spend ?? 0);
    const leads = pickActionValue(r.actions);
    const cpaFromApi = pickActionValue(r.cost_per_action_type);
    const cpa =
      cpaFromApi > 0 ? cpaFromApi : leads > 0 ? spend / leads : null;
    return {
      campaignId: r.campaign_id ?? "",
      name: r.campaign_name ?? "",
      spend,
      cpa,
      leads,
      ctr: Number(r.ctr ?? 0),
      cpm: Number(r.cpm ?? 0),
      cpc: Number(r.cpc ?? 0),
    };
  });
}
