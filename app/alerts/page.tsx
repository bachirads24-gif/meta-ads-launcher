"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, type Variants } from "framer-motion";

interface AlertRow {
  campaignId: string;
  name: string;
  spend: number;
  cpa: number;
  leads: number;
  ctr: number;
  cpm: number;
  cpc: number;
  adAccountId: string;
  adAccountName: string;
  advice: string[];
}

interface AccountError {
  adAccountId: string;
  adAccountName: string;
  error: string;
}

interface BrandAlerts {
  brandId: string;
  brandName: string;
  rows: AlertRow[];
  accountErrors: AccountError[];
  error?: string;
}

interface AlertsResponse {
  brands: BrandAlerts[];
}

const CPA_THRESHOLD = 2.8;

function adsManagerUrl(adAccountId: string, campaignId: string): string {
  return `https://business.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${campaignId}`;
}

export default function AlertsPage() {
  const [data, setData] = useState<AlertsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/alerts", { cache: "no-store" });
      if (!res.ok) throw new Error((await res.json()).error || "Erreur");
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const totalRows = data?.brands.reduce((n, b) => n + b.rows.length, 0) ?? 0;

  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
  };
  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 30, scale: 0.96, filter: "blur(8px)" },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: { type: "spring", stiffness: 150, damping: 18 },
    },
  };

  return (
    <div className="min-h-screen relative text-ink-50 p-6 sm:p-10 font-sans selection:bg-accent-500/30 overflow-hidden bg-background">
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img src="/dashboard_bg.png" alt="" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-err-500/20 blur-[100px] animate-blob mix-blend-overlay"></div>
        <div className="absolute top-[20%] right-[-10%] w-[35vw] h-[35vw] rounded-full bg-warn-500/15 blur-[100px] animate-blob animation-delay-2000 mix-blend-overlay"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[45vw] h-[45vw] rounded-full bg-accent-500/10 blur-[120px] animate-blob animation-delay-4000 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px]"></div>
      </div>

      <motion.div
        className="max-w-6xl mx-auto space-y-8 relative z-10"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        <motion.header variants={cardVariants} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-surface-border">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-ink-50 bg-clip-text text-transparent bg-gradient-to-r from-ink-50 to-ink-400">
              Alertes CPA
            </h1>
            <p className="text-ink-500 text-sm mt-0.5 font-medium tracking-wide uppercase">
              Temps réel · Seuil ${CPA_THRESHOLD.toFixed(2)}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button
              onClick={load}
              disabled={loading}
              className="text-sm font-bold bg-white hover:bg-surface-hover transition-colors border border-surface-border px-5 py-2.5 rounded-xl text-ink-100 shadow-md disabled:opacity-50"
            >
              {loading ? "Chargement…" : "Rafraîchir"}
            </button>
            <Link href="/assistant" className="text-accent-500 hover:text-accent-600 transition-colors text-sm font-semibold">
              Assistant
            </Link>
            <Link href="/" className="text-accent-500 hover:text-accent-600 transition-colors text-sm font-semibold">
              ← Lanceur
            </Link>
          </div>
        </motion.header>

        {error && (
          <motion.div variants={cardVariants} className="rounded-2xl border border-err-500/30 bg-err-500/10 p-5 text-sm text-err-600 backdrop-blur-md">
            {error}
          </motion.div>
        )}

        {!loading && !error && totalRows === 0 && (
          <motion.div
            variants={cardVariants}
            className="rounded-3xl border border-ok-500/30 bg-ok-500/10 p-8 text-center backdrop-blur-md shadow-xl"
          >
            <div className="inline-flex p-3 bg-ok-500/20 rounded-2xl mb-3">
              <svg className="w-8 h-8 text-ok-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 className="text-2xl font-black text-ink-50">Aucune campagne au-dessus du seuil</h2>
            <p className="text-ink-500 mt-2 font-medium">Tout est sous contrôle pour le moment.</p>
          </motion.div>
        )}

        {data?.brands.map((b) => (
          <motion.section key={b.brandId} variants={cardVariants} className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-black text-ink-50 flex items-center gap-3">
                <span className="w-2.5 h-2.5 rounded-full bg-err-500 animate-pulse"></span>
                {b.brandName}
                <span className="text-sm font-semibold text-ink-500">
                  {b.rows.length} alerte{b.rows.length > 1 ? "s" : ""}
                </span>
              </h2>
            </div>

            {b.error && (
              <div className="rounded-2xl border border-warn-500/30 bg-warn-500/10 p-4 text-sm text-warn-600">
                {b.error}
              </div>
            )}

            {b.accountErrors.length > 0 && (
              <div className="rounded-2xl border border-warn-500/30 bg-warn-500/10 p-4 text-sm text-warn-600 space-y-1">
                {b.accountErrors.map((ae) => (
                  <div key={ae.adAccountId}>
                    <span className="font-bold">{ae.adAccountName}</span> — {ae.error}
                  </div>
                ))}
              </div>
            )}

            {b.rows.length === 0 && !b.error && (
              <p className="text-sm text-ink-500 italic">Aucune campagne au-dessus du seuil.</p>
            )}

            <div className="grid gap-4">
              {b.rows.map((r) => (
                <div
                  key={r.campaignId}
                  className="bg-white/60 backdrop-blur-2xl rounded-3xl shadow-xl shadow-ink-200/30 border border-white p-6 relative overflow-hidden"
                >
                  <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-err-500 via-err-500 to-warn-500"></div>

                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="inline-flex items-center gap-2 mb-1.5 px-2.5 py-1 rounded-lg bg-surface border border-surface-border text-[10px] font-black uppercase tracking-wider text-ink-500">
                        {r.adAccountName}
                      </div>
                      <h3 className="text-lg font-black text-ink-50 truncate">{r.name}</h3>
                      <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                        <Stat label="CPA" value={`$${r.cpa.toFixed(2)}`} highlight />
                        <Stat label="Spend" value={`$${r.spend.toFixed(2)}`} />
                        <Stat label="Leads" value={`${r.leads}`} />
                        <Stat label="CTR" value={`${r.ctr.toFixed(2)}%`} />
                      </div>
                    </div>
                    <a
                      href={adsManagerUrl(r.adAccountId, r.campaignId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 text-sm font-bold bg-accent-500 hover:bg-accent-600 text-white px-4 py-2.5 rounded-xl shadow-md transition-colors"
                    >
                      Ads Manager →
                    </a>
                  </div>

                  <div className="mt-5 pt-4 border-t border-surface-border">
                    <p className="text-xs font-black uppercase tracking-wider text-accent-500 mb-2">
                      Conseils
                    </p>
                    <ul className="space-y-1.5 text-sm text-ink-100">
                      {r.advice.map((tip, i) => (
                        <li key={i} className="flex gap-2">
                          <span className="text-accent-500 font-bold">→</span>
                          <span>{tip}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </motion.section>
        ))}
      </motion.div>
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div>
      <div className="text-[10px] font-black uppercase tracking-wider text-ink-400">{label}</div>
      <div className={`text-base font-black mt-0.5 ${highlight ? "text-err-500" : "text-ink-50"}`}>
        {value}
      </div>
    </div>
  );
}
