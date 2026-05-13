"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface PublicUser {
  id: string;
  username: string;
  brandIds: string[];
  isAdmin: boolean;
  telegramChatId?: string;
  createdAt: number;
}

interface PublicBrand {
  id: string;
  name: string;
}

interface Draft {
  id?: string;
  username: string;
  password: string;
  brandIds: string[];
  isAdmin: boolean;
  telegramChatId: string;
}

const empty: Draft = { username: "", password: "", brandIds: [], isAdmin: false, telegramChatId: "" };

export default function UsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<PublicUser[]>([]);
  const [brands, setBrands] = useState<PublicBrand[]>([]);
  const [draft, setDraft] = useState<Draft>(empty);
  const [editingId, setEditingId] = useState<string | null>(null);
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
    const [u, b] = await Promise.all([
      fetch("/api/users").then((r) => r.json()),
      fetch("/api/brands").then((r) => r.json()),
    ]);
    setUsers(u.users || []);
    setBrands(b.brands || []);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const res = await fetch("/api/users", {
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
      await load();
    }
    setSaving(false);
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cet utilisateur ?")) return;
    const res = await fetch(`/api/users?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert(data.error || "Erreur");
    }
    await load();
  }

  function edit(u: PublicUser) {
    setDraft({
      username: u.username,
      password: "",
      brandIds: u.brandIds,
      isAdmin: u.isAdmin,
      telegramChatId: u.telegramChatId ?? "",
    });
    setEditingId(u.id);
  }

  function cancelEdit() {
    setDraft(empty);
    setEditingId(null);
    setError(null);
  }

  function toggleBrand(id: string) {
    setDraft((d) =>
      d.brandIds.includes(id)
        ? { ...d, brandIds: d.brandIds.filter((x) => x !== id) }
        : { ...d, brandIds: [...d.brandIds, id] },
    );
  }

  return (
    <main className="min-h-screen max-w-4xl mx-auto p-6 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Utilisateurs</h1>
        <Link href="/" className="text-accent-500 hover:underline text-sm">
          ← Retour au lanceur
        </Link>
      </header>

      <section className="bg-white rounded-2xl shadow-sm p-6">
        <h2 className="font-semibold mb-4">
          {editingId ? "Modifier l'utilisateur" : "Ajouter un utilisateur"}
        </h2>
        <form onSubmit={save} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs text-ink-500 mb-1">Nom d&apos;utilisateur</span>
              <input
                value={draft.username}
                onChange={(e) => setDraft({ ...draft, username: e.target.value })}
                className="w-full rounded-lg border border-ink-200 px-3 py-2"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-ink-500 mb-1">Mot de passe</span>
              <input
                type="password"
                value={draft.password}
                onChange={(e) => setDraft({ ...draft, password: e.target.value })}
                placeholder={editingId ? "Laisser vide pour conserver" : "Mot de passe"}
                className="w-full rounded-lg border border-ink-200 px-3 py-2"
              />
            </label>
          </div>

          <label className="block">
            <span className="block text-xs text-ink-500 mb-1">
              Telegram Chat ID (optionnel — pour les alertes CPA)
            </span>
            <input
              value={draft.telegramChatId}
              onChange={(e) => setDraft({ ...draft, telegramChatId: e.target.value })}
              placeholder="ex: 123456789"
              className="w-full rounded-lg border border-ink-200 px-3 py-2"
            />
          </label>

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isAdmin}
              onChange={(e) => setDraft({ ...draft, isAdmin: e.target.checked })}
            />
            <span>Administrateur (accès à toutes les marques + gestion)</span>
          </label>

          {!draft.isAdmin && (
            <div>
              <span className="block text-xs text-ink-500 mb-2">Marques assignées</span>
              {brands.length === 0 ? (
                <p className="text-sm text-ink-500">Aucune marque enregistrée</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {brands.map((b) => (
                    <label key={b.id} className="inline-flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={draft.brandIds.includes(b.id)}
                        onChange={() => toggleBrand(b.id)}
                      />
                      <span>{b.name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && <p className="text-sm text-err-500">{error}</p>}

          <div className="flex gap-2">
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
              <th className="px-4 py-2">Utilisateur</th>
              <th className="px-4 py-2">Rôle</th>
              <th className="px-4 py-2">Marques</th>
              <th className="px-4 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-ink-500">
                  Aucun utilisateur
                </td>
              </tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-t border-ink-100">
                <td className="px-4 py-2 font-medium">{u.username}</td>
                <td className="px-4 py-2 text-xs">
                  {u.isAdmin ? (
                    <span className="text-accent-500">Admin</span>
                  ) : (
                    <span className="text-ink-500">Utilisateur</span>
                  )}
                </td>
                <td className="px-4 py-2 text-xs">
                  {u.isAdmin ? "—" : `${u.brandIds.length} marque${u.brandIds.length > 1 ? "s" : ""}`}
                </td>
                <td className="px-4 py-2 text-right space-x-3">
                  <button onClick={() => edit(u)} className="text-accent-500 hover:underline">
                    Modifier
                  </button>
                  <button onClick={() => remove(u.id)} className="text-err-500 hover:underline">
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
