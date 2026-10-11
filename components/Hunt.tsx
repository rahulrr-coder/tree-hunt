"use client";
import { Check, Flame, Leaf } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/api";
import { defaultCardId, getCard, type Plant } from "@/lib/huntCards";
import { PlantSheet } from "./PlantSheet";
import { useUser } from "./UserProvider";

type State = { model: string | null; found: Record<string, string>; streak: { current: number; longest: number } | null };
const DIFFICULTY = { easy: 1, medium: 2, hard: 3 } as const;
const card = getCard(defaultCardId)!;

function Ring({ done, total }: { done: number; total: number }) {
  const r = 24, c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${done} of ${total} found`}>
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-line)" strokeWidth="6" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke="var(--color-leaf)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - done / total)} transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" className="fill-ink font-serif text-[15px] font-semibold">{done}/{total}</text>
    </svg>
  );
}

export function Hunt() {
  const { user, setUser } = useUser();
  const [state, setState] = useState<State>({ model: null, found: {}, streak: null });
  const [open, setOpen] = useState<Plant | null>(null);
  const [loadError, setLoadError] = useState(false);

  const refresh = useCallback(async () => {
    if (!user) return;
    try {
      const s = await api<State>(`/api/hunt/${card.id}?userId=${encodeURIComponent(user.userId)}`);
      if (!s.streak) return setUser(null); // server no longer knows this player: start over
      setState(s);
      setLoadError(false);
    } catch {
      setLoadError(true);
    }
  }, [user, setUser]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const done = card.plants.filter((p) => state.found[p.id]).length;

  return (
    <div className="px-4 pb-10 pt-5">
      <header className="flex items-center gap-4">
        <Ring done={done} total={card.plants.length} />
        <div className="min-w-0 flex-1">
          <h1 className="font-serif text-2xl font-semibold leading-tight">{card.title}</h1>
          <p className="text-sm text-muted">Hi {user?.nickname}. Read a clue, then go look.</p>
        </div>
        <span className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-marigold px-3 font-semibold text-ink" aria-label={`Streak: ${state.streak?.current ?? 0} days`}>
          <Flame size={18} aria-hidden /> {state.streak?.current ?? 0}
        </span>
      </header>

      {loadError && <p role="alert" className="mt-4 rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-clay">Couldn&rsquo;t reach the server. Pull to refresh in a moment.</p>}

      <ul className="mt-5 grid grid-cols-2 gap-3">
        {card.plants.map((p) => {
          const findId = state.found[p.id];
          return (
            <li key={p.id}>
              <button
                onClick={() => setOpen(p)}
                className="block w-full overflow-hidden rounded-2xl border border-line bg-card text-left active:bg-paper"
              >
                <div className="relative grid aspect-[4/3] place-items-center bg-paper">
                  {findId ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={`/api/finds/${findId}/thumb`} alt={`Your ${p.name}`} className="size-full object-cover" />
                  ) : (
                    <Leaf size={40} strokeWidth={1.25} className="text-leaf/40" aria-hidden />
                  )}
                  {findId && (
                    <span className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-leaf text-white" aria-label="Found">
                      <Check size={14} strokeWidth={3} />
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-serif text-lg font-semibold leading-tight">{p.name}</p>
                  <p className="text-sm text-muted">{p.tamil}</p>
                  <span className="mt-2 flex gap-1" role="img" aria-label={`Difficulty: ${p.difficulty}`}>
                    {[1, 2, 3].map((i) => (
                      <span key={i} className={`size-2 rounded-full ${i <= DIFFICULTY[p.difficulty as keyof typeof DIFFICULTY] ? "bg-leaf" : "bg-line"}`} />
                    ))}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      {open && user && (
        <PlantSheet
          key={open.id}
          plant={open}
          userId={user.userId}
          model={state.model}
          found={Boolean(state.found[open.id])}
          onClose={() => setOpen(null)}
          onVerified={refresh}
        />
      )}
    </div>
  );
}
