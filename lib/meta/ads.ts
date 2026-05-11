import { graphPost } from "./client";

export interface CreateAdInput {
  adAccountId: string;
  accessToken: string;
  adsetId: string;
  creativeId: string;
  name: string;
}

export async function createAd(input: CreateAdInput): Promise<string> {
  const res = await graphPost<{ id: string }>(
    `/act_${input.adAccountId}/ads`,
    {
      name: input.name,
      adset_id: input.adsetId,
      creative: { creative_id: input.creativeId },
      status: "PAUSED",
    },
    input.accessToken,
  );
  return res.id;
}
