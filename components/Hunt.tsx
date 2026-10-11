"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, ApiError, browserTz, type HuntState, type Place } from "@/lib/api";
import { groupOf, KIND_FILTERS } from "@/lib/categories";
import type { Plant } from "@/lib/hunt";
import { InstallHint } from "./InstallHint";
import { PlaceChooser, Spinner } from "./PlaceChooser";
import { PlantSheet } from "./PlantSheet";
import { useUser } from "./UserProvider";

const DIFFICULTY = { easy: 1, medium: 2, hard: 3 } as const;

type FilterId = "common" | "all" | "tree" | "shrub" | "herb" | "other" | "found";
const FILTERS: { id: FilterId; label: string; color?: string; test: (p: Plant, found: boolean) => boolean }[] = [
  { id: "common", label: "Most common", test: (p) => p.batch === 0 },
  ...KIND_FILTERS.map((f) => ({
    id: f.id as FilterId,
    label: f.label,
    color: f.id === "all" ? undefined : f.color,
    test: (p: Plant) => f.id === "all" || groupOf(p.kind) === f.id,
  })),
  { id: "found", label: "Found", test: (_p: Plant, found: boolean) => found },
];

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
  const [open, setOpen] = useState<{ plant: Plant | "custom"; snap?: boolean } | null>(null);
  const [changing, setChanging] = useState(false);
  const [filter, setFilter] = useState<FilterId>("common");
  const [more, setMore] = useState(false);

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

  async function showMore() {
    if (!user || !state) return;
    setMore(true);
    try {
      const r = await api<{ card: HuntState["card"]; canLoadMore: boolean }>("/api/hunt/more", {
        userId: user.userId, cardId: state.card.id,
      });
      setState({ ...state, card: r.card, canLoadMore: r.canLoadMore });
      setFilter("all");
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setMore(false);
    }
  }

  const counts = useMemo(() => {
    if (!state) return {} as Record<FilterId, { total: number; found: number }>;
    const out = {} as Record<FilterId, { total: number; found: number }>;
    for (const f of FILTERS) {
      const inGroup = state.card.plants.filter((p) => f.test(p, Boolean(state.found[p.id])));
      out[f.id] = { total: inGroup.length, found: inGroup.filter((p) => state.found[p.id]).length };
    }
    return out;
  }, [state]);

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
  const foundCount = card.plants.filter((p) => state.found[p.id]).length;
  const active = FILTERS.find((f) => f.id === filter)!;
  const group = filter === "found" ? counts.all : counts[filter]; // per-category progress, steadier than one moving total
  const visible = card.plants
    .map((p, i) => ({ p, n: i + 1 }))
    .filter(({ p }) => active.test(p, Boolean(state.found[p.id])));
  const anyAi = card.plants.some((p) => p.local?.some((l) => l.ai));

  return (
    <div className="px-4 pb-10 pt-5">
      <header>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">Hunt card</p>
        <div className="mt-0.5 flex items-start justify-between gap-3">
          <h1 className="font-serif text-[1.7rem] font-semibold leading-tight">{card.place}</h1>
          <span
            className="mt-1 shrink-0 rounded-full bg-marigold px-3 py-1.5 text-sm font-semibold text-ink"
            aria-label={`Streak: ${state.streak.current} days`}
          >
            {state.streak.current > 0 ? `${state.streak.current}-day streak` : "No streak yet"}
          </span>
        </div>
        <button onClick={() => setChanging(true)} className="mt-1 min-h-9 text-sm font-semibold text-leaf underline underline-offset-4">
          Change place
        </button>

        <div className="mt-3" role="img" aria-label={`${group.found} of ${group.total} found in ${active.label}`}>
          <div className="flex items-baseline justify-between text-sm">
            <span className="font-semibold">{foundCount} found in total</span>
            <span className="text-muted">
              {filter === "found" ? "All plants" : active.label}: {group.found} of {group.total}
            </span>
          </div>
          <div className="mt-1.5 h-2.5 overflow-hidden rounded-full bg-line">
            <div className="h-full rounded-full bg-leaf transition-[width] duration-500" style={{ width: `${group.total ? (group.found / group.total) * 100 : 0}%` }} />
          </div>
        </div>
      </header>

      {error && <p role="alert" className="mt-4 rounded-2xl border border-clay/40 bg-clay/10 px-4 py-3 text-clay">{error}</p>}

      <div className="-mx-4 mt-4 flex gap-2 overflow-x-auto px-4 pb-1" role="tablist" aria-label="Plant categories">
        {FILTERS.filter((f) => ["common", "all", "found"].includes(f.id) || counts[f.id].total > 0).map((f) => {
          const c = counts[f.id];
          const on = f.id === filter;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={on}
              onClick={() => setFilter(f.id)}
              className={`h-10 shrink-0 rounded-full border px-4 text-sm font-semibold ${
                on ? "border-leaf bg-leaf text-white" : "border-line bg-card text-ink"
              }`}
            >
              {f.color && <span className="mr-1.5 inline-block size-2.5 rounded-full align-middle" style={{ background: f.color }} aria-hidden />}
              {f.label}{" "}
              <span className={on ? "text-white/80" : "text-muted"}>{f.id === "found" ? c.total : `${c.found}/${c.total}`}</span>
            </button>
          );
        })}
      </div>

      {visible.length === 0 ? (
        <p className="mt-8 text-center text-muted">
          {filter === "found" ? "Nothing found yet. Open a plant, find it outside, and snap it." : "No plants in this category yet."}
        </p>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3">
          {visible.map(({ p, n }) => {
            const findId = state.found[p.id];
            return (
              <li key={p.id} className="relative">
                <button
                  onClick={() => setOpen({ plant: p })}
                  className={`block w-full overflow-hidden rounded-2xl bg-card text-left active:bg-paper ${
                    findId ? "border-2 border-leaf" : "border border-line"
                  }`}
                >
                  <div className="relative aspect-[4/3] overflow-hidden bg-paper">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={findId ? `/api/finds/${findId}/thumb` : p.photo.url}
                      alt={findId ? `Your ${p.name}` : `Sample photo of ${p.name}`}
                      loading="lazy"
                      className="size-full object-cover"
                    />
                    <span className="absolute left-2 top-2 rounded-md bg-card/90 px-1.5 py-0.5 text-[11px] font-semibold tracking-wide">
                      No. {n}
                    </span>
                    {findId && (
                      <span className="absolute right-2 top-2 -rotate-6 rounded border-2 border-double border-leaf bg-card/90 px-1.5 py-0.5 font-serif text-xs font-black uppercase tracking-widest text-leaf">
                        Found
                      </span>
                    )}
                  </div>
                  <div className="p-3">
                    <p className="font-serif text-lg font-semibold capitalize leading-tight">{p.name}</p>
                    {p.local?.map((l) => (
                      <p key={l.code} lang={l.code} className="mt-0.5 text-[15px] font-medium leading-snug text-leaf-deep">
                        {l.name}
                      </p>
                    ))}
                    <p className="mt-0.5 truncate font-serif text-sm italic text-muted">{p.scientific}</p>
                    <div className="mt-2 flex items-center justify-between">
                      <span className="flex gap-1" role="img" aria-label={`Difficulty: ${p.difficulty}`}>
                        {[1, 2, 3].map((i) => (
                          <span key={i} className={`size-2 rounded-full ${i <= DIFFICULTY[p.difficulty] ? "bg-leaf" : "bg-line"}`} />
                        ))}
                      </span>
                      <span className="text-xs text-muted">{findId ? "Found by you" : `${p.sightings} seen nearby`}</span>
                    </div>
                  </div>
                </button>
                {!findId && (
                  <button
                    onClick={() => setOpen({ plant: p, snap: true })}
                    aria-label={`Snap ${p.name} now`}
                    className="absolute right-2 top-2 h-9 rounded-full bg-leaf px-3.5 text-sm font-semibold text-white shadow active:bg-leaf-deep"
                  >
                    Snap
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {state.canLoadMore && filter !== "found" && (
        <button
          onClick={showMore}
          disabled={more}
          className="mt-4 flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-leaf bg-card text-lg font-semibold text-leaf active:bg-paper disabled:opacity-70"
        >
          {more && <Spinner />}
          {more ? "Finding more plants…" : "Show more plants"}
        </button>
      )}

      <button
        onClick={() => setOpen({ plant: "custom" })}
        className="mt-3 h-14 w-full rounded-2xl border-2 border-dashed border-line bg-card text-lg font-semibold active:bg-paper"
      >
        Found something not listed? Add it
      </button>

      {state.extras.length > 0 && (
        <section className="mt-8" aria-label="Plants you added">
          <h2 className="font-serif text-xl font-semibold">Plants you added</h2>
          <ul className="mt-3 grid grid-cols-3 gap-2">
            {state.extras.map((x) => (
              <li key={x.plantId} className="overflow-hidden rounded-xl border-2 border-leaf bg-card">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/finds/${x.findId}/thumb`} alt={x.plantName} loading="lazy" className="aspect-square w-full object-cover" />
                <p className="truncate px-2 py-1.5 text-sm font-semibold capitalize">{x.plantName}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      <InstallHint />

      <p className="mt-8 text-center text-xs text-muted">
        Plants and photos come from{" "}
        <a href="https://www.inaturalist.org" className="underline" target="_blank" rel="noreferrer">iNaturalist</a>{" "}
        community sightings.{card.source === "ai" ? " Clues were written by AI from those sightings." : ""}
        {anyAi ? " Local names come from iNaturalist where it has them, otherwise they are AI suggestions." : ""}
      </p>

      {open && user && (
        <PlantSheet
          key={open.plant === "custom" ? "custom" : `${open.plant.id}:${open.snap ? "snap" : ""}`}
          plant={open.plant === "custom" ? null : open.plant}
          autoSnap={open.snap}
          cardId={card.id}
          userId={user.userId}
          found={open.plant !== "custom" && Boolean(state.found[open.plant.id])}
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
        className="max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
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
