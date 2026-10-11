"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { defaultCardId, getCard } from "@/lib/huntCards";
import { useUser } from "./UserProvider";

export function Welcome() {
  const { setUser } = useUser();
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const count = getCard(defaultCardId)!.plants.length;

  async function start(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setUser(await api("/api/users", { nickname }));
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={start} className="flex min-h-dvh flex-col justify-center gap-6 px-6">
      <div>
        <p className="font-serif text-5xl font-semibold tracking-tight text-leaf-deep">Tree Hunt</p>
        <p className="mt-3 font-serif text-2xl leading-snug">Put the phone down. Go find {count} trees.</p>
      </div>
      <label className="block">
        <span className="text-sm font-medium text-muted">Pick a nickname</span>
        <input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          minLength={2}
          maxLength={20}
          required
          autoComplete="nickname"
          placeholder="e.g. Banyan Bandit"
          className="mt-1 block h-12 w-full rounded-2xl border border-line bg-card px-4 text-lg outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/30"
        />
      </label>
      {error && <p role="alert" className="rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-clay">{error}</p>}
      <button
        disabled={busy || nickname.trim().length < 2}
        className="h-14 rounded-2xl bg-leaf text-lg font-semibold text-white active:bg-leaf-deep disabled:opacity-50"
      >
        {busy ? "Starting…" : "Start hunting"}
      </button>
      <p className="text-center text-sm text-muted">No account, no password. Your photos are checked by an open AI model.</p>
    </form>
  );
}
