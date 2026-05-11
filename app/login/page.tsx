"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    if (res.ok) {
      router.replace(params.get("next") || "/");
    } else {
      const data = await res.json().catch(() => ({}));
      setError(data.error || "Erreur");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-3 bg-white rounded-2xl shadow-sm p-8">
      <h1 className="text-xl font-semibold">Meta Ads Launcher</h1>
      <p className="text-sm text-ink-500">Connectez-vous pour accéder à l&apos;application.</p>
      <input
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Nom d'utilisateur"
        autoComplete="username"
        className="w-full rounded-lg border border-ink-200 px-3 py-2 focus:outline-none focus:border-accent-500"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mot de passe"
        autoComplete="current-password"
        className="w-full rounded-lg border border-ink-200 px-3 py-2 focus:outline-none focus:border-accent-500"
      />
      {error && <p className="text-sm text-err-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-accent-500 text-white py-2 font-medium hover:bg-accent-600 disabled:opacity-50"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
    </main>
  );
}
