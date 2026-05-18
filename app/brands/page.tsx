"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PublicBrand {
  id: string;
  name: string;
  adAccountId: string;
  pageId: string;
  hasToken: boolean;
}

interface Draft {
  id?: string;
  name: string;
  adAccountId: string;
  pageId: string;
  accessToken: string;
}

const empty: Draft = {
  name: "",
  adAccountId: "",
  pageId: "",
  accessToken: "",
};

export default function BrandsPage() {
  const router = useRouter();
  const [brands, setBrands] = useState<PublicBrand[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingHasToken, setEditingHasToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/me")
      .then((r) => r.json())
      .then((d) => {
        if (!d.isAdmin) router.replace("/");
      });
  }, [router]);

  async function load() {
    const res = await fetch("/api/brands");
    const data = await res.json();
    setBrands(data.brands || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/brands", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(editingId ? { ...draft, id: editingId } : draft),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erreur");
    } else {
      setDraft(empty);
      setEditingId(null);
      setEditingHasToken(false);
      await load();
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette marque ?")) return;
    await fetch(`/api/brands?id=${id}`, { method: "DELETE" });
    await load();
  }

  function edit(b: PublicBrand) {
    setDraft({
      name: b.name,
      adAccountId: b.adAccountId,
      pageId: b.pageId,
      accessToken: "",
    });
    setEditingId(b.id);
    setEditingHasToken(b.hasToken);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingHasToken(false);
    setDraft(empty);
  }

  const tokenPlaceholder = editingId
    ? editingHasToken
      ? "Laisser vide pour conserver le token actuel"
      : "Token Meta requis"
    : "Token d'accès Meta (System User long-lived)";

  return (
    <main className="min-h-screen max-w-4xl mx-auto p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Marques</h1>
        <Link href="/" className="text-accent-500 hover:underline text-sm">
          ← Retour au lanceur
        </Link>
      </header>

      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold mb-4">{editingId ? "Modifier la marque" : "Ajouter une marque"}</h2>
        <form onSubmit={save} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nom de la marque" value={draft.name} onChange={(v) => setDraft({ ...draft, name: v })} />
          <Field
            label="Compte de reporting (alertes)"
            value={draft.adAccountId}
            onChange={(v) => setDraft({ ...draft, adAccountId: v })}
            placeholder="123456789012345"
          />
          <Field
            label="ID de la page Facebook"
            value={draft.pageId}
            onChange={(v) => setDraft({ ...draft, pageId: v })}
          />
          <div className="sm:col-span-2">
            <label className="block">
              <span className="block text-xs text-ink-500 mb-1">Token d&apos;accès Meta</span>
              <input
                type="password"
                value={draft.accessToken}
                onChange={(e) => setDraft({ ...draft, accessToken: e.target.value })}
                placeholder={tokenPlaceholder}
                className="w-full rounded-lg border border-ink-200 px-3 py-2 focus:outline-none focus:border-accent-500 font-mono text-xs"
              />
            </label>
          </div>
          {error && <p className="text-sm text-err-500 sm:col-span-2">{error}</p>}
          <div className="sm:col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-accent-500 text-white px-4 py-2 font-medium hover:bg-accent-600 disabled:opacity-50"
            >
              {editingId ? "Enregistrer" : "Ajouter"}
            </button>
            {editingId && (
              <button type="button" onClick={cancelEdit} className="rounded-lg border border-ink-200 px-4 py-2">
                Annuler
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="bg-white rounded-2xl shadow-sm overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-ink-100 text-left">
            <tr>
              <th className="px-4 py-2">Nom</th>
              <th className="px-4 py-2">Compte reporting</th>
              <th className="px-4 py-2">Page</th>
              <th className="px-4 py-2">Token</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {brands.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-ink-500">
                  Aucune marque enregistrée
                </td>
              </tr>
            )}
            {brands.map((b) => (
              <tr key={b.id} className="border-t border-ink-100">
                <td className="px-4 py-2 font-medium">{b.name}</td>
                <td className="px-4 py-2 font-mono text-xs">{b.adAccountId}</td>
                <td className="px-4 py-2 font-mono text-xs">{b.pageId}</td>
                <td className="px-4 py-2 text-xs">
                  {b.hasToken ? (
                    <span className="text-ok-500">✓ Configuré</span>
                  ) : (
                    <span className="text-warn-500">⚠ Manquant</span>
                  )}
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button onClick={() => edit(b)} className="text-accent-500 hover:underline">
                    Modifier
                  </button>
                  <button onClick={() => remove(b.id)} className="text-err-500 hover:underline">
                    Supprimer
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="block text-xs text-ink-500 mb-1">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-ink-200 px-3 py-2 focus:outline-none focus:border-accent-500"
      />
    </label>
  );
}
