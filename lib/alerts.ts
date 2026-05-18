import type { CampaignInsightRow } from "./meta/insights";

export const CPA_THRESHOLD_USD = 2.8;
export const TELEGRAM_DEDUPE_WINDOW_MS = 6 * 60 * 60 * 1000;

export interface HighCpaRow extends CampaignInsightRow {
  cpa: number;
  advice: string[];
}

export function isHighCpa(row: CampaignInsightRow): row is CampaignInsightRow & { cpa: number } {
  return row.cpa !== null && row.cpa >= CPA_THRESHOLD_USD;
}

export function adviceFor(row: CampaignInsightRow & { cpa: number }): string[] {
  const tips: string[] = [];
  if (row.ctr < 1) tips.push("CTR faible (<1%) — testez de nouvelles accroches / créatifs.");
  if (row.cpm > 20) tips.push("CPM élevé (>$20) — élargissez l'audience ou changez de placements.");
  if (row.cpc > 1) tips.push("CPC élevé (>$1) — affinez le ciblage ou améliorez la miniature.");
  if (row.leads < 5) tips.push("Peu de leads (<5) — laissez 24–48h de plus avant de juger.");
  if (row.spend > 50 && row.leads === 0)
    tips.push("Dépense significative sans lead — vérifiez le pixel et le tracking.");
  if (tips.length === 0)
    tips.push("Coupez la campagne ou réduisez le budget de 30% pour laisser respirer l'algo.");
  return tips;
}

export function buildTelegramMessage(
  username: string,
  perBrand: { brandName: string; rows: HighCpaRow[] }[],
): string {
  const lines: string[] = [];
  lines.push(`🚨 *Alerte CPA* — ${username}`);
  lines.push(`Seuil: $${CPA_THRESHOLD_USD.toFixed(2)} · Fenêtre: aujourd'hui`);
  for (const b of perBrand) {
    lines.push("");
    lines.push(`*${b.brandName}*`);
    const uniqueAccounts = new Set(b.rows.map((r) => r.adAccountName));
    const showAccount = uniqueAccounts.size > 1;
    for (const r of b.rows) {
      const prefix = showAccount ? `[${r.adAccountName}] ` : "";
      lines.push(
        `• ${prefix}${r.name} — CPA $${r.cpa.toFixed(2)} (spend $${r.spend.toFixed(2)}, ${r.leads} lead${r.leads === 1 ? "" : "s"})`,
      );
      lines.push(`   ↳ ${r.advice[0]}`);
    }
  }
  return lines.join("\n");
}
