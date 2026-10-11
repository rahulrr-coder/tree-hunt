"use client";
import { Check, Flame, Leaf, MapPin } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { api, ApiError, browserTz, type HuntState, type Place } from "@/lib/api";
import type { Plant } from "@/lib/hunt";
import { PlaceChooser } from "./PlaceChooser";
import { PlantSheet } from "./PlantSheet";
import { useUser } from "./UserProvider";

const DIFFICULTY = { easy: 1, medium: 2, hard: 3 } as const;

function Ring({ done, total }: { done: number; total: number }) {
  const r = 24, c = 2 * Math.PI * r;
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" role="img" aria-label={`${done} of ${total} found`} className="shrink-0">
      <circle cx="32" cy="32" r={r} fill="none" stroke="var(--color-line)" strokeWidth="6" />
      <circle
        cx="32" cy="32" r={r} fill="none" stroke="var(--color-leaf)" strokeWidth="6" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - (total ? done / total : 0))} transform="rotate(-90 32 32)"
      />
      <text x="32" y="37" textAnchor="middle" className="fill-ink font-serif text-[15px] font-semibold">{done}/{total}</text>
    </svg>
  );
}

function Skeleton({ place }: { place: string }) {
  return (
    <div className="px-4 pt-6" aria-busy="true">
      <p role="status" className="font-serif text-2xl font-semibold">Building your hunt…</p>
      <p className="mt-1 text-muted">
        Checking what people have really spotted growing near {place === "Your location" ? "you" : place}. The first
        hunt in a new area takes a few seconds.
      </p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="pulse-veil h-52 rounded-2xl bg-line" />
        ))}
      </div>
    </div>
  );
}

export function Hunt() {
  const { user, place, setUser, setPlace } = useUser();
  const [state, setState] = useState<HuntState | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<Plant | null>(null);
  const [changing, setChanging] = useState(false);

  const load = useCallback(async () => {
    if (!user || !place) return;
    try {
      setState(await api<HuntState>("/api/hunt", { userId: user.userId, lat: place.lat, lng: place.lng, tz: browserTz() }));
      setError("");
    } catch (e) {
      if (e instanceof ApiError && e.status === 404 && /nickname/i.test(e.message)) return setUser(null); // server forgot this player
      setError((e as Error).message);
    }
  }, [user, place, setUser]);

  useEffect(() => {
    setState(null);
    load();
  }, [load]);

  function pickPlace(p: Place) {
    setChanging(false);
    setPlace(p);
  }

  if (!place) return null;
  if (error && !state) {
    return (
      <div className="px-4 pt-6">
        <p role="alert" className="rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-clay">{error}</p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button onClick={() => { setError(""); load(); }} className="h-12 rounded-2xl bg-leaf font-semibold text-white">Try again</button>
          <button onClick={() => setChanging(true)} className="h-12 rounded-2xl border border-line font-semibold">Change place</button>
        </div>
        {changing && <PlaceSheet onPick={pickPlace} onClose={() => setChanging(false)} />}
      </div>
    );
  }
  if (!state) return <Skeleton place={place.name} />;

  const { card } = state;
  const done = card.plants.filter((p) => state.found[p.id]).length;

  return (
    <div className="px-4 pb-10 pt-5">
      <header className="flex items-center gap-4">
        <Ring done={done} total={card.plants.length} />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted">Hunt card</p>
          <h1 className="truncate font-serif text-2xl font-semibold leading-tight">{card.place}</h1>
          <button onClick={() => setChanging(true)} className="mt-0.5 inline-flex min-h-8 items-center gap-1 text-sm font-medium text-leaf">
            <MapPin size={14} aria-hidden /> Change place
          </button>
        </div>
        <span className="flex h-11 min-w-11 items-center justify-center gap-1 rounded-full bg-marigold px-3 font-semibold text-ink" aria-label={`Streak: ${state.streak.current} days`}>
          <Flame size={18} aria-hidden /> {state.streak.current}
        </span>
      </header>

      {error && <p role="alert" className="mt-4 rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-clay">{error}</p>}

      <ul className="mt-5 grid grid-cols-2 gap-3">
        {card.plants.map((p) => {
          const findId = state.found[p.id];
          return (
            <li key={p.id}>
              <button
                onClick={() => setOpen(p)}
                className="block w-full overflow-hidden rounded-2xl border border-line bg-card text-left active:bg-paper"
              >
                <div className="relative aspect-[4/3] overflow-hidden bg-paper">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={findId ? `/api/finds/${findId}/thumb` : p.photo.url}
                    alt={findId ? `Your ${p.name}` : `Sample photo of ${p.name}`}
                    loading="lazy"
                    className={`size-full object-cover ${findId ? "" : "opacity-90"}`}
                  />
                  {findId ? (
                    <span className="absolute right-2 top-2 grid size-7 place-items-center rounded-full bg-leaf text-white shadow" aria-label="Found">
                      <Check size={16} strokeWidth={3} />
                    </span>
                  ) : (
                    <span className="absolute left-2 top-2 flex items-center gap-1 rounded-full bg-card/90 px-2 py-0.5 text-xs font-semibold text-leaf">
                      <Leaf size={12} aria-hidden /> Find it
                    </span>
                  )}
                </div>
                <div className="p-3">
                  <p className="font-serif text-lg font-semibold capitalize leading-tight">{p.name}</p>
                  <p className="truncate font-serif text-sm italic text-muted">{p.scientific}</p>
                  <div className="mt-2 flex items-center justify-between">
                    <span className="flex gap-1" role="img" aria-label={`Difficulty: ${p.difficulty}`}>
                      {[1, 2, 3].map((i) => (
                        <span key={i} className={`size-2 rounded-full ${i <= DIFFICULTY[p.difficulty] ? "bg-leaf" : "bg-line"}`} />
                      ))}
                    </span>
                    <span className="text-xs text-muted">{p.sightings} seen nearby</span>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <p className="mt-6 text-center text-xs text-muted">
        Plants and photos come from{" "}
        <a href="https://www.inaturalist.org" className="underline" target="_blank" rel="noreferrer">iNaturalist</a>{" "}
        community sightings.{card.source === "ai" ? " Clues were written by AI from those sightings." : ""}
      </p>

      {open && user && (
        <PlantSheet
          key={open.id}
          plant={open}
          cardId={card.id}
          userId={user.userId}
          found={Boolean(state.found[open.id])}
          onClose={() => setOpen(null)}
          onVerified={load}
        />
      )}
      {changing && <PlaceSheet onPick={pickPlace} onClose={() => setChanging(false)} />}
    </div>
  );
}

function PlaceSheet({ onPick, onClose }: { onPick: (p: Place) => void; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Change place"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] rounded-t-3xl border-t border-line bg-card p-5 pb-20"
      >
        <h2 className="font-serif text-2xl font-semibold">Where are you hunting?</h2>
        <div className="mt-4">
          <PlaceChooser onPick={onPick} />
        </div>
        <button onClick={onClose} className="mt-5 h-12 w-full rounded-2xl border border-line font-semibold">Cancel</button>
      </div>
    </div>
  );
}
