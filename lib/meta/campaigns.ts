import { graphPost } from "./client";

export interface CreateCampaignInput {
  adAccountId: string;
  accessToken: string;
  name: string;
  dailyBudgetCents: number;
}

export async function createCampaign(input: CreateCampaignInput): Promise<string> {
  const res = await graphPost<{ id: string }>(
    `/act_${input.adAccountId}/campaigns`,
    {
      name: input.name,
      objective: "OUTCOME_LEADS",
      status: "PAUSED",
      special_ad_categories: [],
      buying_type: "AUCTION",
      bid_strategy: "LOWEST_COST_WITH_BID_CAP",
      daily_budget: input.dailyBudgetCents,
    },
    input.accessToken,
  );
  return res.id;
}
