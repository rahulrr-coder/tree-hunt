"use client";
import { useRef } from "react";
import type { Place } from "@/lib/api";
import { usePlaceFlow } from "./usePlaceFlow";

export function Spinner({ small }: { small?: boolean }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${small ? "size-4" : "size-5"}`}
    />
  );
}

export function ConfirmPlace({ place, onYes, onNo }: { place: Place; onYes: () => void; onNo: () => void }) {
  return (
    <div className="rounded-2xl border border-leaf/40 bg-card p-4" role="group" aria-label="Confirm your place">
      <p className="text-xs font-semibold uppercase tracking-widest text-muted">Hunt near</p>
      <p className="mt-1 font-serif text-2xl font-semibold leading-tight">{place.name}</p>
      <p className="mt-1 text-sm text-muted">Plants and the map will be centred here. You can change it any time.</p>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button type="button" onClick={onYes} className="h-12 rounded-2xl bg-leaf font-semibold text-white active:bg-leaf-deep">
          Yes, hunt here
        </button>
        <button type="button" onClick={onNo} className="h-12 rounded-2xl border border-line font-semibold">
          Not here
        </button>
      </div>
    </div>
  );
}

/** Place names read "City, Region, Country": make the city stand out. */
export function PlaceName({ name }: { name: string }) {
  const [city, ...rest] = name.split(", ");
  return (
    <>
      <span className="font-semibold">{city}</span>
      {rest.length > 0 && <span className="text-muted">, {rest.join(", ")}</span>}
    </>
  );
}

/** "Use my location" or type-ahead search, then confirm. */
export function PlaceChooser({ onPick, picked }: { onPick: (p: Place) => void; picked?: Place | null }) {
  const flow = usePlaceFlow(onPick);
  const search = useRef<HTMLInputElement>(null);

  if (flow.pending) return <ConfirmPlace place={flow.pending} onYes={flow.confirm} onNo={flow.cancel} />;

  return (
    <div>
      <button
        type="button"
        onClick={async () => {
          await flow.locate();
          search.current?.focus();
        }}
        disabled={flow.locating}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-leaf bg-card text-lg font-semibold text-leaf active:bg-paper"
      >
        {flow.locating && <Spinner />}
        {flow.locating ? "Finding you…" : "Use my location"}
      </button>

      <label className="mt-3 block">
        <span className="sr-only">Search for a town or city</span>
        <span className="relative block">
          <input
            ref={search}
            value={flow.query}
            onChange={(e) => flow.setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && flow.results[0]) {
                e.preventDefault();
                flow.choose(flow.results[0]);
              }
            }}
            placeholder="or type a town or city"
            autoComplete="off"
            className="block h-12 w-full rounded-2xl border border-line bg-card px-4 text-base outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/30"
          />
          {flow.searching && <span className="absolute right-4 top-1/2 -translate-y-1/2 text-muted"><Spinner small /></span>}
        </span>
      </label>

      {flow.results.length > 0 && (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-card" role="listbox" aria-label="Matching places">
          {flow.results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`} className="border-t border-line first:border-t-0">
              <button type="button" onClick={() => flow.choose(r)} className="block min-h-12 w-full px-4 py-3 text-left active:bg-paper">
                <PlaceName name={r.name} />
              </button>
            </li>
          ))}
        </ul>
      )}
      {flow.noMatches && <p className="mt-2 text-sm text-muted">No places match that. Check the spelling or try a bigger nearby town.</p>}
      {flow.query.trim().length > 0 && flow.query.trim().length < 3 && <p className="mt-2 text-sm text-muted">Keep typing…</p>}

      {flow.note && <p role="alert" className="mt-3 text-sm text-clay">{flow.note}</p>}
      {flow.approx && (
        <button
          type="button"
          onClick={() => flow.choose(flow.approx!)}
          className="mt-2 min-h-11 w-full rounded-2xl border border-line bg-card px-4 py-2 text-left text-sm active:bg-paper"
        >
          Use <strong>{flow.approx.name}</strong> <span className="text-muted">(approximate, from your network)</span>
        </button>
      )}
      {picked && <p className="mt-3 text-sm font-medium text-leaf">Hunting near: {picked.name}</p>}
    </div>
  );
}
