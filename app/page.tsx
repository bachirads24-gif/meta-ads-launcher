"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upload } from "@vercel/blob/client";
import { motion, AnimatePresence, type Variants } from "framer-motion";

interface Brand {
  id: string;
  name: string;
}

interface AdAccountOption {
  id: string;
  name: string;
  accountStatus: number;
}

interface PixelOption {
  id: string;
  name: string;
}

interface PageOption {
  id: string;
  name: string;
}

interface VideoState {
  name: string;
  status: "pending" | "uploading" | "running" | "done" | "error";
  step?: string;
  uploadProgress?: number;
  campaignId?: string;
  adAccountId?: string;
  error?: string;
}

const DEFAULTS = {
  dailyBudgetUsd: 350,
  bidCapUsd: 3.5,
  ageMin: 18,
  ageMax: 65,
  genders: [] as number[], // empty = all
};

function stripExt(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return idx > 0 ? filename.slice(0, idx) : filename;
}

function adsManagerUrl(adAccountId: string, campaignId: string): string {
  return `https://business.facebook.com/adsmanager/manage/campaigns?act=${adAccountId}&selected_campaign_ids=${campaignId}`;
}

function parseCsvMapping(text: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i].trim();
    if (!raw) continue;
    const commaIdx = raw.indexOf(",");
    if (commaIdx < 0) continue;
    const filename = raw.slice(0, commaIdx).trim().replace(/^"|"$/g, "");
    const url = raw.slice(commaIdx + 1).trim().replace(/^"|"$/g, "");
    if (i === 0 && filename.toLowerCase() === "filename") continue;
    if (!filename || !url) continue;
    map[stripExt(filename)] = url;
  }
  return map;
}

export default function Home() {
  const router = useRouter();
  const [me, setMe] = useState<{ username: string; isAdmin: boolean } | null>(null);
  const [brands, setBrands] = useState<Brand[]>([]);
  const [brandId, setBrandId] = useState<string>("");
  const [adAccounts, setAdAccounts] = useState<AdAccountOption[]>([]);
  const [adAccountId, setAdAccountId] = useState<string>("");
  const [loadingAdAccounts, setLoadingAdAccounts] = useState(false);
  const [adAccountsError, setAdAccountsError] = useState<string | null>(null);
  const [pixels, setPixels] = useState<PixelOption[]>([]);
  const [pixelId, setPixelId] = useState<string>("");
  const [loadingPixels, setLoadingPixels] = useState(false);
  const [pixelsError, setPixelsError] = useState<string | null>(null);
  const [pages, setPages] = useState<PageOption[]>([]);
  const [pageId, setPageId] = useState<string>("");
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [headline, setHeadline] = useState("");
  const [primaryText, setPrimaryText] = useState("");
  const [landingUrl, setLandingUrl] = useState("");
  const [dailyBudget, setDailyBudget] = useState(DEFAULTS.dailyBudgetUsd);
  const [bidStrategy, setBidStrategy] = useState<"LOWEST_COST_WITH_BID_CAP" | "LOWEST_COST_WITHOUT_CAP">(
    "LOWEST_COST_WITH_BID_CAP",
  );
  const [bidCap, setBidCap] = useState(DEFAULTS.bidCapUsd);
  const [ageMin, setAgeMin] = useState(DEFAULTS.ageMin);
  const [ageMax, setAgeMax] = useState(DEFAULTS.ageMax);
  const [gender, setGender] = useState<"all" | "male" | "female">("all");
  const [startDate, setStartDate] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [urlMap, setUrlMap] = useState<Record<string, string>>({});
  const [csvName, setCsvName] = useState<string | null>(null);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [videos, setVideos] = useState<VideoState[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  const hasCsv = csvName !== null && Object.keys(urlMap).length > 0;
  const matchedCount = files.filter((f) => urlMap[stripExt(f.name)]).length;
  const unmatchedCount = files.length - matchedCount;

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => setMe({ username: d.username, isAdmin: !!d.isAdmin }))
      .catch(() => {});
    fetch("/api/brands")
      .then((r) => r.json())
      .then((d) => {
        setBrands(d.brands || []);
        if (d.brands?.[0]) setBrandId(d.brands[0].id);
      });
  }, []);

  useEffect(() => {
    setAdAccounts([]);
    setAdAccountId("");
    setPixels([]);
    setPixelId("");
    setAdAccountsError(null);
    if (!brandId) return;
    const ctrl = new AbortController();
    setLoadingAdAccounts(true);
    fetch(`/api/meta/accounts?brandId=${encodeURIComponent(brandId)}`, { signal: ctrl.signal })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erreur de chargement");
        return d as { adAccounts: AdAccountOption[] };
      })
      .then((d) => setAdAccounts(d.adAccounts || []))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setAdAccountsError(e instanceof Error ? e.message : "Erreur de chargement");
      })
      .finally(() => setLoadingAdAccounts(false));
    return () => ctrl.abort();
  }, [brandId]);

  useEffect(() => {
    setPages([]);
    setPageId("");
    setPagesError(null);
    if (!brandId) return;
    const ctrl = new AbortController();
    setLoadingPages(true);
    fetch(`/api/meta/accounts?brandId=${encodeURIComponent(brandId)}&resource=pages`, {
      signal: ctrl.signal,
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erreur de chargement");
        return d as { pages: PageOption[] };
      })
      .then((d) => setPages(d.pages || []))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setPagesError(e instanceof Error ? e.message : "Erreur de chargement");
      })
      .finally(() => setLoadingPages(false));
    return () => ctrl.abort();
  }, [brandId]);

  useEffect(() => {
    setPixels([]);
    setPixelId("");
    setPixelsError(null);
    if (!brandId || !adAccountId) return;
    const ctrl = new AbortController();
    setLoadingPixels(true);
    fetch(
      `/api/meta/accounts?brandId=${encodeURIComponent(brandId)}&adAccountId=${encodeURIComponent(adAccountId)}`,
      { signal: ctrl.signal },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || "Erreur de chargement");
        return d as { pixels: PixelOption[] };
      })
      .then((d) => setPixels(d.pixels || []))
      .catch((e) => {
        if (e.name === "AbortError") return;
        setPixelsError(e instanceof Error ? e.message : "Erreur de chargement");
      })
      .finally(() => setLoadingPixels(false));
    return () => ctrl.abort();
  }, [brandId, adAccountId]);

  async function logout() {
    await fetch("/api/auth", { method: "DELETE" });
    router.replace("/login");
  }

  function onFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const list = Array.from(e.target.files ?? []);
    setFiles(list);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const list = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("video/"));
    setFiles(list);
  }

  async function onCsv(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCsvError(null);
    try {
      const text = await file.text();
      const map = parseCsvMapping(text);
      if (Object.keys(map).length === 0) {
        setCsvError("Aucune ligne valide trouvée");
        setUrlMap({});
        setCsvName(null);
        return;
      }
      setUrlMap(map);
      setCsvName(file.name);
    } catch (err) {
      setCsvError(err instanceof Error ? err.message : "Erreur de lecture");
    }
  }

  function clearCsv() {
    setUrlMap({});
    setCsvName(null);
    setCsvError(null);
  }

  async function launch() {
    if (!brandId || !adAccountId || !pixelId || !pageId || files.length === 0 || !headline || !primaryText) return;
    if (!hasCsv && !landingUrl) return;
    setRunning(true);
    setVideos(files.map((f) => ({ name: stripExt(f.name), status: "pending" })));

    const uploaded: { filename: string; blobUrl: string }[] = [];
    for (const f of files) {
      const name = stripExt(f.name);
      try {
        setVideos((prev) =>
          prev.map((v) => (v.name === name ? { ...v, status: "uploading", uploadProgress: 0 } : v)),
        );
        const blob = await upload(f.name, f, {
          access: "public",
          handleUploadUrl: "/api/blob/upload",
          onUploadProgress: (p) => {
            setVideos((prev) =>
              prev.map((v) => (v.name === name ? { ...v, uploadProgress: p.percentage } : v)),
            );
          },
        });
        uploaded.push({ filename: f.name, blobUrl: blob.url });
        setVideos((prev) =>
          prev.map((v) => (v.name === name ? { ...v, status: "pending", uploadProgress: undefined } : v)),
        );
      } catch (e) {
        setVideos((prev) =>
          prev.map((v) =>
            v.name === name
              ? { ...v, status: "error", error: e instanceof Error ? e.message : "Upload échoué" }
              : v,
          ),
        );
      }
    }

    if (uploaded.length === 0) {
      setRunning(false);
      return;
    }

    const genders = gender === "all" ? [] : gender === "male" ? [1] : [2];
    const startTime = startDate ? new Date(startDate).toISOString() : undefined;
    const basePayload = {
      brandId,
      adAccountId,
      pixelId,
      pageId,
      headline,
      primaryText,
      landingUrl: hasCsv ? "" : landingUrl,
      urlMap: hasCsv ? urlMap : {},
      dailyBudgetCents: Math.round(dailyBudget * 100),
      bidStrategy,
      bidCapCents:
        bidStrategy === "LOWEST_COST_WITH_BID_CAP" ? Math.round(bidCap * 100) : undefined,
      ageMin,
      ageMax,
      genders,
      startTime,
    };

    await runWithConcurrency(uploaded, 5, async (video) => {
      const res = await fetch("/api/launch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...basePayload, video }),
      });
      if (!res.ok || !res.body) {
        const name = stripExt(video.filename);
        const error = await res.text().catch(() => "Erreur réseau");
        setVideos((prev) =>
          prev.map((v) => (v.name === name ? { ...v, status: "error", error } : v)),
        );
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n\n");
        buf = lines.pop() || "";
        for (const block of lines) {
          const line = block.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const evt = JSON.parse(line.slice(6));
          applyEvent(evt);
        }
      }
    });

    setRunning(false);
  }

  async function runWithConcurrency<T>(items: T[], limit: number, fn: (item: T) => Promise<void>) {
    let cursor = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (true) {
        const i = cursor++;
        if (i >= items.length) return;
        await fn(items[i]);
      }
    });
    await Promise.all(workers);
  }

  function applyEvent(evt: { type: string; videoName?: string; step?: string; campaignId?: string; adAccountId?: string; error?: string }) {
    setVideos((prev) =>
      prev.map((v) => {
        if (v.name !== evt.videoName) return v;
        if (evt.type === "video") return { ...v, status: "running", step: evt.step };
        if (evt.type === "video-done")
          return { ...v, status: "done", step: undefined, campaignId: evt.campaignId, adAccountId: evt.adAccountId };
        if (evt.type === "video-error") return { ...v, status: "error", step: undefined, error: evt.error };
        return v;
      }),
    );
  }

  const canLaunch =
    !running &&
    brandId &&
    adAccountId &&
    pixelId &&
    pageId &&
    files.length > 0 &&
    headline.trim() &&
    primaryText.trim() &&
    (hasCsv || landingUrl.trim());
  
  const containerVariants: Variants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.1,
      },
    },
  };

  const cardVariants: Variants = {
    hidden: { opacity: 0, y: 40, scale: 0.95, filter: "blur(10px)" },
    show: {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      transition: { type: "spring", stiffness: 150, damping: 18 },
    },
  };

  const headerVariants: Variants = {
    hidden: { opacity: 0, y: -20 },
    show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 200, damping: 20 } },
  };

  return (
    <div className="min-h-screen relative text-ink-50 p-6 sm:p-10 font-sans selection:bg-accent-500/30 overflow-hidden bg-background">
      
      {/* Animated Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img src="/dashboard_bg.png" alt="Background" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        {/* Subtle Grid */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        
        {/* Glowing Blobs */}
        <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-accent-400/20 blur-[100px] animate-blob mix-blend-overlay"></div>
        <div className="absolute top-[20%] right-[-10%] w-[35vw] h-[35vw] rounded-full bg-accent-600/15 blur-[100px] animate-blob animation-delay-2000 mix-blend-overlay"></div>
        <div className="absolute bottom-[-20%] left-[20%] w-[45vw] h-[45vw] rounded-full bg-accent-500/10 blur-[120px] animate-blob animation-delay-4000 mix-blend-overlay"></div>
        
        {/* Glass overlay */}
        <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px]"></div>
      </div>

      <motion.div 
        className="max-w-7xl mx-auto space-y-8 relative z-10"
        variants={containerVariants}
        initial="hidden"
        animate="show"
      >
        
        {/* Header */}
        <motion.header variants={headerVariants} className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-surface-border">
          <div className="flex items-center gap-4">
            <motion.div 
              whileHover={{ scale: 1.05 }}
              transition={{ type: "spring", stiffness: 200, damping: 10 }}
              className="cursor-pointer flex items-center"
            >
               <img src="/logo.png" alt="EWYCOM Logo" className="h-20 sm:h-24 w-auto object-contain" />
            </motion.div>
            <div>
              <h1 className="text-3xl font-black tracking-tight text-ink-50 bg-clip-text text-transparent bg-gradient-to-r from-ink-50 to-ink-400">EWYCOM Launcher</h1>
              <p className="text-ink-500 text-sm mt-0.5 font-medium tracking-wide uppercase">Automatisation Meta Ads</p>
            </div>
          </div>
          <nav className="flex items-center gap-6 text-sm font-semibold">
            <Link href="/assistant" className="text-accent-500 hover:text-accent-600 transition-colors">Assistant</Link>
            <Link href="/alerts" className="text-accent-500 hover:text-accent-600 transition-colors">Alertes</Link>
            {me?.isAdmin && (
              <>
                <Link href="/brands" className="text-accent-500 hover:text-accent-600 transition-colors">Marques</Link>
                <Link href="/users" className="text-accent-500 hover:text-accent-600 transition-colors">Utilisateurs</Link>
              </>
            )}
            {me && <span className="text-ink-50 py-1.5 px-4 bg-white/50 backdrop-blur-md rounded-full border border-surface-border shadow-sm flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-ok-500 animate-pulse"></span>
              {me.username}
            </span>}
            <button onClick={logout} className="text-err-500 hover:text-err-600 transition-colors flex items-center gap-1">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </nav>
        </motion.header>

        {brands.length === 0 && (
          <motion.div variants={cardVariants} className="rounded-2xl border border-warn-500/30 bg-warn-500/10 p-5 text-sm text-warn-600 flex items-center gap-4 shadow-lg backdrop-blur-md">
            <div className="p-2 bg-warn-500/20 rounded-full">
              <svg className="w-6 h-6 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <span className="font-medium text-base">
              {me?.isAdmin ? (
                <>Aucune marque enregistrée. <Link href="/brands" className="underline font-bold hover:text-warn-500">Ajoutez-en une</Link> pour commencer.</>
              ) : (
                "Aucune marque ne vous est assignée. Contactez votre administrateur."
              )}
            </span>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Configuration */}
          <motion.section variants={cardVariants} className="lg:col-span-5 space-y-6">
            <div className="bg-white/60 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-ink-200/40 border border-white p-8 space-y-6 relative overflow-hidden">
              <div className="absolute top-0 inset-x-0 h-2 bg-gradient-to-r from-accent-400 via-accent-500 to-accent-600"></div>
              <div className="absolute -top-24 -right-24 w-48 h-48 bg-accent-400/10 rounded-full blur-3xl pointer-events-none"></div>
              
              <h2 className="text-2xl font-black mb-6 flex items-center gap-3 text-ink-50">
                <div className="p-2 bg-accent-500/10 rounded-xl">
                  <svg className="w-6 h-6 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                </div>
                Configuration
              </h2>

              <Row label="Marque cible">
                <select value={brandId} onChange={(e) => setBrandId(e.target.value)} className="form-input bg-white/80 focus:bg-white">
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </Row>

              <Row label="Compte publicitaire">
                <select
                  value={adAccountId}
                  onChange={(e) => setAdAccountId(e.target.value)}
                  disabled={!brandId || loadingAdAccounts || adAccounts.length === 0}
                  className="form-input bg-white/80 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {loadingAdAccounts
                      ? "Chargement…"
                      : adAccounts.length === 0
                        ? adAccountsError ?? "Aucun compte disponible"
                        : "— Sélectionner —"}
                  </option>
                  {adAccounts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} (act_{a.id})
                    </option>
                  ))}
                </select>
                {adAccountsError && (
                  <p className="text-xs text-err-500 mt-1">{adAccountsError}</p>
                )}
              </Row>

              <Row label="Pixel Meta">
                <select
                  value={pixelId}
                  onChange={(e) => setPixelId(e.target.value)}
                  disabled={!adAccountId || loadingPixels || pixels.length === 0}
                  className="form-input bg-white/80 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {!adAccountId
                      ? "Choisissez un compte d'abord"
                      : loadingPixels
                        ? "Chargement…"
                        : pixels.length === 0
                          ? pixelsError ?? "Aucun pixel disponible"
                          : "— Sélectionner —"}
                  </option>
                  {pixels.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
                {pixelsError && (
                  <p className="text-xs text-err-500 mt-1">{pixelsError}</p>
                )}
              </Row>

              <Row label="Page Facebook">
                <select
                  value={pageId}
                  onChange={(e) => setPageId(e.target.value)}
                  disabled={!brandId || loadingPages || pages.length === 0}
                  className="form-input bg-white/80 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <option value="">
                    {loadingPages
                      ? "Chargement…"
                      : pages.length === 0
                        ? pagesError ?? "Aucune page disponible"
                        : "— Sélectionner —"}
                  </option>
                  {pages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
                {pagesError && <p className="text-xs text-err-500 mt-1">{pagesError}</p>}
              </Row>

              <Row label={hasCsv ? "URL de destination (ignorée, CSV actif)" : "URL de destination globale"}>
                <input value={landingUrl} onChange={(e) => setLandingUrl(e.target.value)} placeholder="https://..." disabled={hasCsv} className="form-input bg-white/80 focus:bg-white disabled:opacity-50 disabled:cursor-not-allowed" />
              </Row>

              <Row label="Titre de l'annonce (Headline)">
                <div className="relative">
                  <input value={headline} onChange={(e) => setHeadline(e.target.value)} maxLength={40} className="form-input bg-white/80 focus:bg-white pr-12" placeholder="Accroche principale..." />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-ink-400">{headline.length}/40</span>
                </div>
              </Row>

              <Row label="Texte principal (Primary Text)">
                <textarea value={primaryText} onChange={(e) => setPrimaryText(e.target.value)} rows={4} className="form-input bg-white/80 focus:bg-white resize-none" placeholder="Description de l'offre..." />
              </Row>

              <div className="pt-4 border-t border-surface-border">
                <button type="button" onClick={() => setShowAdvanced((s) => !s)} className="flex items-center gap-2 text-sm text-accent-500 hover:text-accent-600 transition-colors w-full py-2 font-black uppercase tracking-wider">
                  <motion.svg animate={{ rotate: showAdvanced ? 180 : 0 }} className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </motion.svg>
                  Paramètres avancés
                </button>
              </div>

              {showAdvanced && (
                <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="grid grid-cols-2 gap-4 pt-2 overflow-hidden">
                  <NumField label="Budget/jour (USD)" value={dailyBudget} onChange={setDailyBudget} step={1} />
                  <Row label="Stratégie d'enchère">
                    <select value={bidStrategy} onChange={(e) => setBidStrategy(e.target.value as any)} className="form-input bg-white/80 focus:bg-white">
                      <option value="LOWEST_COST_WITH_BID_CAP">Plafond (Bid Cap)</option>
                      <option value="LOWEST_COST_WITHOUT_CAP">Volume max</option>
                    </select>
                  </Row>
                  {bidStrategy === "LOWEST_COST_WITH_BID_CAP" && (
                    <NumField label="Plafond (USD)" value={bidCap} onChange={setBidCap} step={0.1} />
                  )}
                  <NumField label="Âge min" value={ageMin} onChange={setAgeMin} step={1} />
                  <NumField label="Âge max" value={ageMax} onChange={setAgeMax} step={1} />
                  <Row label="Ciblage Genre">
                    <select value={gender} onChange={(e) => setGender(e.target.value as any)} className="form-input bg-white/80 focus:bg-white">
                      <option value="all">Tous genres</option>
                      <option value="male">Hommes</option>
                      <option value="female">Femmes</option>
                    </select>
                  </Row>
                  <div className="col-span-2">
                    <Row label="Date de lancement planifié">
                      <input type="datetime-local" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="form-input bg-white/80 focus:bg-white" />
                    </Row>
                  </div>
                </motion.div>
              )}
            </div>
          </motion.section>

          {/* Right Column: Files & Actions */}
          <motion.section variants={cardVariants} className="lg:col-span-7 flex flex-col gap-8">
            
            {/* CSV Mapping */}
            <div className="bg-white/60 backdrop-blur-2xl rounded-3xl shadow-xl shadow-ink-200/30 border border-white p-8 flex flex-col justify-center relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-accent-400/20 to-transparent rounded-bl-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"></div>
              
              <div className="flex flex-wrap items-start justify-between mb-4 gap-4 relative z-10">
                <div>
                  <h3 className="text-lg font-black text-ink-50 flex items-center gap-2">
                    <div className="p-1.5 bg-accent-500/10 rounded-lg">
                      <svg className="w-5 h-5 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                    </div>
                    Mapping CSV
                  </h3>
                  <p className="text-sm text-ink-500 mt-1 font-medium">Liez vos vidéos à des liens uniques.</p>
                </div>
                <label className="shrink-0 cursor-pointer text-sm font-bold bg-white hover:bg-surface-hover transition-colors border border-surface-border px-5 py-2.5 rounded-xl text-ink-100 shadow-md flex items-center gap-2 transform hover:-translate-y-0.5">
                  <input type="file" accept=".csv,text/csv" onChange={onCsv} className="hidden" />
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                  Importer
                </label>
              </div>
              
              {csvError && <p className="text-sm text-err-600 mt-2 bg-err-900/50 p-3 rounded-xl border border-err-500/20">{csvError}</p>}
              
              {csvName && (
                <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 flex items-center justify-between bg-white rounded-xl p-4 border border-surface-border shadow-sm">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-ok-900 rounded-xl">
                      <svg className="w-5 h-5 text-ok-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-base font-bold text-ink-50">{csvName}</p>
                      <p className="text-sm text-ink-400 font-medium">{Object.keys(urlMap).length} URLs mappées</p>
                    </div>
                  </div>
                  <button onClick={clearCsv} className="p-2.5 text-ink-400 hover:text-err-500 hover:bg-err-900/30 rounded-xl transition-colors" title="Retirer le CSV">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </motion.div>
              )}
            </div>

            {/* Video Dropzone */}
            <motion.div 
              whileHover={{ scale: 1.015, rotateX: 2 }}
              whileTap={{ scale: 0.98 }}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={(e) => { e.preventDefault(); setIsDragging(false); }}
              onDrop={(e) => { setIsDragging(false); onDrop(e as any); }}
              className={`relative flex-1 min-h-[260px] bg-white/60 backdrop-blur-2xl rounded-3xl shadow-xl shadow-ink-200/30 border-2 transition-all duration-300 flex flex-col items-center justify-center p-8 text-center group cursor-pointer ${isDragging ? "border-accent-500 bg-accent-500/10 shadow-accent-500/20" : "border-dashed border-accent-400/40 hover:border-accent-500 hover:bg-accent-500/5 hover:shadow-2xl"}`}
              style={{ perspective: "1000px" }}
            >
              <input type="file" multiple accept="video/*" onChange={onFiles as any} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" />
              
              <motion.div 
                animate={{ y: isDragging ? -10 : 0, scale: isDragging ? 1.1 : 1 }} 
                className={`w-20 h-20 mb-6 rounded-3xl border flex items-center justify-center transition-all duration-500 shadow-xl ${isDragging ? "bg-accent-500 text-white border-accent-400 shadow-accent-500/40" : "bg-white border-surface-border text-ink-300 group-hover:bg-accent-500 group-hover:text-white group-hover:border-accent-400 group-hover:shadow-accent-500/40"}`}
              >
                <svg className="w-10 h-10 transition-transform duration-500 group-hover:-translate-y-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </motion.div>
              <h3 className="text-2xl font-black text-ink-50 bg-clip-text text-transparent bg-gradient-to-r from-ink-50 to-ink-400">{isDragging ? "Relâchez !" : "Déposez vos vidéos"}</h3>
              <p className="text-base text-ink-500 mt-2 max-w-sm font-medium">Ou cliquez pour parcourir. Chaque vidéo deviendra une campagne distincte.</p>
            </motion.div>

            {/* Files List */}
            {files.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-xl shadow-ink-200/30 border border-white overflow-hidden">
                <div className="px-6 py-4 border-b border-surface-border flex items-center justify-between bg-white">
                  <h3 className="text-base font-black text-ink-50 flex items-center gap-3">
                    <span className="w-8 h-8 rounded-xl bg-gradient-to-br from-accent-400 to-accent-600 text-white flex items-center justify-center text-sm font-black shadow-lg shadow-accent-500/40">{files.length}</span>
                    Vidéos importées
                  </h3>
                  {hasCsv && (
                     <div className="text-sm flex items-center gap-4 font-bold bg-surface-hover px-4 py-1.5 rounded-full">
                       <span className="flex items-center gap-1.5 text-ok-500"><div className="w-2.5 h-2.5 rounded-full bg-ok-500 shadow-md shadow-ok-500/50"></div> {matchedCount}</span>
                       {unmatchedCount > 0 && <span className="flex items-center gap-1.5 text-warn-600"><div className="w-2.5 h-2.5 rounded-full bg-warn-500 shadow-md shadow-warn-500/50 animate-pulse"></div> {unmatchedCount}</span>}
                     </div>
                  )}
                </div>
                <div className="max-h-[320px] overflow-y-auto p-3">
                  <ul className="space-y-2">
                    {files.map((f, i) => {
                      const stem = stripExt(f.name);
                      const mappedUrl = urlMap[stem];
                      const isUnmatched = hasCsv && !mappedUrl;
                      return (
                        <motion.li initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: i * 0.05 }} key={f.name} className="flex items-center justify-between gap-4 p-4 rounded-2xl bg-surface hover:bg-surface-solid border border-transparent hover:border-surface-border shadow-sm hover:shadow-md transition-all group">
                          <div className="flex items-center gap-4 min-w-0">
                            <div className="w-10 h-10 rounded-xl bg-white border border-surface-border flex items-center justify-center shrink-0 shadow-sm group-hover:bg-accent-50 transition-colors">
                              <svg className="w-5 h-5 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </div>
                            <div className="min-w-0">
                              <p className="text-base font-bold text-ink-50 truncate">{stem}</p>
                              <p className="text-sm text-ink-400 font-semibold truncate">{(f.size / 1024 / 1024).toFixed(1)} Mo</p>
                            </div>
                          </div>
                          {hasCsv && (
                            <div className={`text-xs font-bold max-w-[220px] truncate px-3 py-1.5 rounded-lg border shadow-sm ${isUnmatched ? "bg-warn-500/10 border-warn-500/30 text-warn-600" : "bg-white border-surface-border text-ink-500"}`}>
                              {mappedUrl ?? "Lien manquant"}
                            </div>
                          )}
                        </motion.li>
                      );
                    })}
                  </ul>
                </div>
              </motion.div>
            )}

            {/* Launch Button */}
            <motion.div variants={cardVariants} className="mt-auto relative group pt-4">
              <div className={`absolute inset-0 bg-gradient-to-r from-accent-400 to-accent-600 rounded-2xl blur-xl opacity-50 group-hover:opacity-80 transition duration-500 ${!canLaunch ? "hidden" : ""}`}></div>
              <button
                onClick={launch}
                disabled={!canLaunch}
                className={`relative w-full rounded-2xl py-5 text-xl font-black tracking-wide transition-all duration-300 flex items-center justify-center gap-4
                  ${canLaunch 
                    ? "bg-gradient-to-r from-accent-500 to-accent-600 text-white shadow-2xl hover:shadow-accent-500/50 transform hover:-translate-y-1 border border-white/20" 
                    : "bg-surface-solid text-ink-300 border-2 border-surface-border cursor-not-allowed shadow-sm"
                  }`}
              >
                {running ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-6 w-6 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Lancement de {files.length} campagne{files.length > 1 ? "s" : ""}...
                  </>
                ) : (
                  <>
                    <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Lancer {files.length || ""} campagne{files.length > 1 ? "s" : ""}
                  </>
                )}
              </button>
            </motion.div>

          </motion.section>
        </div>

        {/* Video Status Board */}
        {videos.length > 0 && (
          <motion.section variants={cardVariants} className="bg-white/80 backdrop-blur-2xl rounded-3xl shadow-2xl shadow-ink-200/40 border border-white overflow-hidden mt-12">
            <div className="px-8 py-6 border-b border-surface-border bg-gradient-to-r from-white to-surface-hover">
              <h2 className="text-xl font-black flex items-center gap-3 text-ink-50">
                <div className="p-2 bg-accent-500/10 rounded-xl">
                  <svg className="w-6 h-6 text-accent-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                État des lancements
              </h2>
            </div>
            <div className="overflow-x-auto p-2">
              <table className="w-full text-sm text-left border-separate border-spacing-y-2 px-6">
                <thead className="text-ink-400 text-xs uppercase tracking-wider font-bold">
                  <tr>
                    <th className="px-6 py-3">Vidéo Source</th>
                    <th className="px-6 py-3">Statut & Progression</th>
                    <th className="px-6 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {videos.map((v) => (
                    <tr key={v.name} className="bg-white rounded-2xl shadow-sm hover:shadow-md transition-shadow">
                      <td className="px-6 py-5 font-bold text-ink-50 flex items-center gap-4 rounded-l-2xl border-y border-l border-surface-border">
                        <div className="w-10 h-10 rounded-xl bg-surface border border-surface-border flex items-center justify-center">
                          <svg className="w-5 h-5 text-accent-500" fill="currentColor" viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4zM14 13h-3v3H9v-3H6v-2h3V8h2v3h3v2z"/></svg>
                        </div>
                        <span className="truncate max-w-[220px] text-base">{v.name}</span>
                      </td>
                      <td className="px-6 py-5 border-y border-surface-border">
                        <div className="flex items-center gap-3">
                          {v.status === "pending" && <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-surface-border text-ink-500 text-xs font-black shadow-sm"><div className="w-2 h-2 rounded-full bg-ink-400 animate-pulse"></div> En attente</span>}
                          {v.status === "uploading" && (
                            <div className="flex flex-col gap-2 w-full max-w-[250px]">
                              <span className="text-xs font-black text-accent-500 flex justify-between uppercase tracking-wide">Téléversement... <span>{Math.round(v.uploadProgress || 0)}%</span></span>
                              <div className="h-2 w-full bg-surface-border rounded-full overflow-hidden shadow-inner">
                                <motion.div initial={{ width: 0 }} animate={{ width: `${v.uploadProgress || 0}%` }} className="h-full bg-gradient-to-r from-accent-400 to-accent-600 transition-all duration-300 ease-out"></motion.div>
                              </div>
                            </div>
                          )}
                          {v.status === "running" && <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-accent-50 border border-accent-200 text-accent-600 text-xs font-black shadow-sm"><svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25"></circle><path fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" className="opacity-75"></path></svg> {v.step || "Création..."}</span>}
                          {v.status === "done" && <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-ok-900 border border-ok-500/30 text-ok-600 text-xs font-black shadow-sm"><svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> Terminé</span>}
                          {v.status === "error" && <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-err-900 border border-err-500/30 text-err-600 text-xs font-black shadow-sm truncate max-w-[300px]" title={v.error}><svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" /></svg> {v.error}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right rounded-r-2xl border-y border-r border-surface-border">
                        {v.status === "done" && v.campaignId && v.adAccountId && (
                          <a href={adsManagerUrl(v.adAccountId, v.campaignId)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-accent-500 to-accent-600 hover:from-accent-400 hover:to-accent-500 transition-all duration-300 text-xs font-black text-white shadow-lg shadow-accent-500/30 hover:shadow-accent-500/50 hover:-translate-y-0.5">
                            Ads Manager
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>
        )}
        
      </motion.div>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-black text-ink-100 mb-2 uppercase tracking-wide">{label}</span>
      {children}
    </label>
  );
}

function NumField({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step: number; }) {
  return (
    <Row label={label}>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="form-input bg-white/80"
      />
    </Row>
  );
}
