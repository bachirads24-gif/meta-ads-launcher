export function adsManagerUrl(adAccountId: string, campaignId: string): string {
  return `https://business.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${campaignId}`;
}
