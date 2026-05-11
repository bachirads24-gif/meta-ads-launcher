"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { upload } from "@vercel/blob/client";

interface Brand {
  id: string;
  name: string;
  adAccountId: string;
  pageId: string;
  pixelId: string;
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
    if (!brandId || files.length === 0 || !headline || !primaryText) return;
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
    files.length > 0 &&
    headline.trim() &&
    primaryText.trim() &&
    (hasCsv || landingUrl.trim());

  return (
    <main className="min-h-screen max-w-3xl mx-auto p-6 space-y-6">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-semibold">Lanceur de campagnes Meta</h1>
        <nav className="flex items-center gap-4 text-sm">
          {me?.isAdmin && (
            <>
              <Link href="/brands" className="text-accent-500 hover:underline">
                Marques
              </Link>
              <Link href="/users" className="text-accent-500 hover:underline">
                Utilisateurs
              </Link>
            </>
          )}
          {me && <span className="text-ink-500">{me.username}</span>}
          <button onClick={logout} className="text-ink-500 hover:text-err-500">
            Déconnexion
          </button>
        </nav>
      </header>

      {brands.length === 0 && (
        <div className="rounded-xl border border-warn-500/30 bg-warn-500/10 p-4 text-sm">
          {me?.isAdmin ? (
            <>
              Aucune marque enregistrée.{" "}
              <Link href="/brands" className="underline text-accent-500">
                Ajoutez-en une
              </Link>{" "}
              pour commencer.
            </>
          ) : (
            "Aucune marque ne vous est assignée. Contactez votre administrateur."
          )}
        </div>
      )}

      <section className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
        <Row label="Marque">
          <select
            value={brandId}
            onChange={(e) => setBrandId(e.target.value)}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          >
            {brands.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Row>

        <Row label="Mapping URL (CSV, optionnel)">
          <div className="flex items-center gap-3 flex-wrap">
            <label className="inline-flex items-center gap-2 cursor-pointer rounded-lg border border-ink-200 px-3 py-2 text-sm hover:bg-ink-100">
              <input type="file" accept=".csv,text/csv" onChange={onCsv} className="hidden" />
              <span>Choisir un fichier CSV</span>
            </label>
            {csvName && (
              <span className="text-sm">
                <span className="font-mono">{csvName}</span>{" "}
                <span className="text-ink-500">
                  · {Object.keys(urlMap).length} ligne{Object.keys(urlMap).length > 1 ? "s" : ""}
                </span>
                <button onClick={clearCsv} className="ml-2 text-err-500 hover:underline">
                  retirer
                </button>
              </span>
            )}
          </div>
          {csvError && <p className="text-xs text-err-500 mt-1">{csvError}</p>}
          {hasCsv && files.length > 0 && (
            <p className="text-xs text-ink-500 mt-1">
              {matchedCount}/{files.length} vidéo{files.length > 1 ? "s" : ""} avec URL correspondante
              {unmatchedCount > 0 && <span className="text-warn-500"> · {unmatchedCount} sans URL</span>}
            </p>
          )}
          <p className="text-xs text-ink-500 mt-1">
            Format : deux colonnes <code>filename,url</code>. Le nom de fichier est comparé sans extension.
          </p>
        </Row>

        <Row label={hasCsv ? "URL de destination (ignorée, CSV utilisé)" : "URL de destination"}>
          <input
            value={landingUrl}
            onChange={(e) => setLandingUrl(e.target.value)}
            placeholder="https://…"
            disabled={hasCsv}
            className="w-full rounded-lg border border-ink-200 px-3 py-2 disabled:bg-ink-100 disabled:text-ink-500"
          />
        </Row>

        <Row label="Titre (headline)">
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={40}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
          <span className="text-xs text-ink-500 mt-1 block">{headline.length}/40</span>
        </Row>

        <Row label="Texte principal">
          <textarea
            value={primaryText}
            onChange={(e) => setPrimaryText(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
        </Row>

        <Row label="Date de début (optionnel)">
          <input
            type="datetime-local"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full rounded-lg border border-ink-200 px-3 py-2"
          />
          <span className="text-xs text-ink-500 mt-1 block">
            Laisser vide pour démarrer dès l&apos;activation. S&apos;applique à toutes les vidéos du lot.
          </span>
        </Row>

        <button
          type="button"
          onClick={() => setShowAdvanced((s) => !s)}
          className="text-sm text-accent-500 hover:underline"
        >
          {showAdvanced ? "− Masquer" : "+ Options avancées"}
        </button>

        {showAdvanced && (
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-ink-100">
            <NumField label="Budget quotidien (USD)" value={dailyBudget} onChange={setDailyBudget} step={1} />
            <Row label="Stratégie d'enchère">
              <select
                value={bidStrategy}
                onChange={(e) => setBidStrategy(e.target.value as typeof bidStrategy)}
                className="w-full rounded-lg border border-ink-200 px-3 py-2"
              >
                <option value="LOWEST_COST_WITH_BID_CAP">Plafond d&apos;enchère</option>
                <option value="LOWEST_COST_WITHOUT_CAP">Volume le plus élevé</option>
              </select>
            </Row>
            {bidStrategy === "LOWEST_COST_WITH_BID_CAP" && (
              <NumField label="Plafond d'enchère (USD)" value={bidCap} onChange={setBidCap} step={0.1} />
            )}
            <NumField label="Âge min" value={ageMin} onChange={setAgeMin} step={1} />
            <NumField label="Âge max" value={ageMax} onChange={setAgeMax} step={1} />
            <Row label="Genre">
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value as typeof gender)}
                className="w-full rounded-lg border border-ink-200 px-3 py-2"
              >
                <option value="all">Tous</option>
                <option value="male">Hommes</option>
                <option value="female">Femmes</option>
              </select>
            </Row>
          </div>
        )}
      </section>

      <section
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        className="bg-white rounded-2xl shadow-sm p-6 border-2 border-dashed border-ink-200"
      >
        <label className="block text-center cursor-pointer">
          <input type="file" multiple accept="video/*" onChange={onFiles} className="hidden" />
          <p className="text-sm text-ink-700">
            Glissez-déposez vos vidéos ici, ou <span className="text-accent-500 underline">cliquez pour parcourir</span>
          </p>
          <p className="text-xs text-ink-500 mt-1">Une campagne sera créée par vidéo</p>
        </label>
        {files.length > 0 && (
          <ul className="mt-4 space-y-1 text-sm">
            {files.map((f) => {
              const stem = stripExt(f.name);
              const mappedUrl = urlMap[stem];
              const isUnmatched = hasCsv && !mappedUrl;
              return (
                <li key={f.name} className="flex justify-between items-center gap-3">
                  <span className="font-mono text-xs truncate">[REVIEW] {stem}</span>
                  {hasCsv && (
                    <span
                      className={`text-xs truncate flex-1 text-right ${
                        isUnmatched ? "text-warn-500" : "text-ink-500"
                      }`}
                    >
                      {mappedUrl ?? "(aucune URL)"}
                    </span>
                  )}
                  <span className="text-ink-500 text-xs shrink-0">
                    {(f.size / 1024 / 1024).toFixed(1)} Mo
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <button
        onClick={launch}
        disabled={!canLaunch}
        className="w-full rounded-xl bg-accent-500 text-white py-3 font-semibold hover:bg-accent-600 disabled:opacity-50"
      >
        {running ? "Lancement en cours…" : `Lancer ${files.length || ""} campagne${files.length > 1 ? "s" : ""}`}
      </button>

      {videos.length > 0 && (
        <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-ink-100 text-left">
              <tr>
                <th className="px-4 py-2">Vidéo</th>
                <th className="px-4 py-2">État</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {videos.map((v) => (
                <tr key={v.name} className="border-t border-ink-100">
                  <td className="px-4 py-2 font-mono text-xs">{v.name}</td>
                  <td className="px-4 py-2">
                    {v.status === "pending" && <span className="text-ink-500">En attente</span>}
                    {v.status === "uploading" && (
                      <span className="text-accent-500">
                        Téléversement… {v.uploadProgress != null ? `${Math.round(v.uploadProgress)}%` : ""}
                      </span>
                    )}
                    {v.status === "running" && <span className="text-accent-500">{v.step || "…"}</span>}
                    {v.status === "done" && <span className="text-ok-500">✓ Créée</span>}
                    {v.status === "error" && <span className="text-err-500">✗ {v.error}</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {v.status === "done" && v.campaignId && v.adAccountId && (
                      <a
                        href={adsManagerUrl(v.adAccountId, v.campaignId)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-accent-500 hover:underline"
                      >
                        Ouvrir dans Ads Manager →
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step: number;
}) {
  return (
    <Row label={label}>
      <input
        type="number"
        value={value}
        step={step}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-full rounded-lg border border-ink-200 px-3 py-2"
      />
    </Row>
  );
}
