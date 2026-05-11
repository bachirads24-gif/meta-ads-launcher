import { graphPost } from "./client";

export interface CreateVideoCreativeInput {
  adAccountId: string;
  accessToken: string;
  pageId: string;
  videoId: string;
  thumbnailUrl: string;
  headline: string;
  primaryText: string;
  landingUrl: string;
  name: string;
}

export async function createVideoCreative(input: CreateVideoCreativeInput): Promise<string> {
  const res = await graphPost<{ id: string }>(
    `/act_${input.adAccountId}/adcreatives`,
    {
      name: input.name,
      object_story_spec: {
        page_id: input.pageId,
        video_data: {
          video_id: input.videoId,
          image_url: input.thumbnailUrl,
          title: input.headline,
          message: input.primaryText,
          call_to_action: {
            type: "ORDER_NOW",
            value: { link: input.landingUrl },
          },
        },
      },
    },
    input.accessToken,
  );
  return res.id;
}
