import { graphPost } from "./client";

export interface CreateAdSetInput {
  adAccountId: string;
  accessToken: string;
  campaignId: string;
  pixelId: string;
  name: string;
  countries: string[];
  ageMin: number;
  ageMax: number;
  genders: number[];
  bidAmountCents?: number; // only when campaign uses LOWEST_COST_WITH_BID_CAP
  startTime?: string; // ISO 8601 with timezone; if omitted, Meta uses "now"
}

export async function createAdSet(input: CreateAdSetInput): Promise<string> {
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: input.countries },
    age_min: input.ageMin,
    age_max: input.ageMax,
    publisher_platforms: ["facebook", "instagram"],
  };
  if (input.genders.length > 0) targeting.genders = input.genders;

  const body: Record<string, unknown> = {
    name: input.name,
    campaign_id: input.campaignId,
    status: "PAUSED",
    optimization_goal: "OFFSITE_CONVERSIONS",
    billing_event: "IMPRESSIONS",
    promoted_object: { pixel_id: input.pixelId, custom_event_type: "LEAD" },
    targeting,
  };
  if (typeof input.bidAmountCents === "number") body.bid_amount = input.bidAmountCents;
  if (input.startTime) body.start_time = input.startTime;

  const res = await graphPost<{ id: string }>(`/act_${input.adAccountId}/adsets`, body, input.accessToken);
  return res.id;
}
