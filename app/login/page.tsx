"use client";

import { Suspense, useState } from "react";
import { motion } from "framer-motion";
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
    <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 bg-surface backdrop-blur-xl rounded-2xl shadow-2xl shadow-ink-200/50 border border-surface-border p-8 relative overflow-hidden">
      <div className="absolute top-0 inset-x-0 h-1.5 bg-gradient-to-r from-accent-400 via-accent-500 to-accent-600"></div>
      <div className="flex justify-center mb-6">
        <img src="/logo.png" alt="EWYCOM Logo" className="h-24 sm:h-28 w-auto object-contain" />
      </div>
      <h1 className="text-2xl font-black text-center text-ink-50 tracking-tight">EWYCOM Launcher</h1>
      <p className="text-sm text-center text-ink-400 mb-6 font-medium">Connectez-vous pour accéder à l'application.</p>
      <input
        autoFocus
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Nom d'utilisateur"
        autoComplete="username"
        className="form-input"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Mot de passe"
        autoComplete="current-password"
        className="form-input"
      />
      {error && <p className="text-sm text-err-500">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="relative w-full rounded-xl py-3.5 text-base font-bold transition-all duration-300 flex items-center justify-center gap-3 bg-accent-500 text-white shadow-xl shadow-accent-500/30 hover:bg-accent-400 transform hover:-translate-y-0.5 disabled:opacity-50"
      >
        {loading ? "Connexion…" : "Se connecter"}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 relative overflow-hidden selection:bg-accent-500/30">
      {/* Animated Background Elements */}
      <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
        <img src="/dashboard_bg.png" alt="Background" className="absolute inset-0 w-full h-full object-cover opacity-60" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]"></div>
        <div className="absolute top-[-20%] left-[-10%] w-[50vw] h-[50vw] rounded-full bg-accent-400/20 blur-[100px] animate-blob mix-blend-overlay"></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-accent-600/20 blur-[120px] animate-blob animation-delay-4000 mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-background/20 backdrop-blur-[2px]"></div>
      </div>
      <motion.div initial={{ opacity: 0, scale: 0.95, y: 30 }} animate={{ opacity: 1, scale: 1, y: 0 }} transition={{ type: "spring", stiffness: 300, damping: 25 }} className="w-full max-w-sm relative z-10">
      <Suspense fallback={null}>
        <LoginForm />
      </Suspense>
      </motion.div>
    </main>
  );
}
