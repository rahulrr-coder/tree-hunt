"use client";
import { LoaderCircle, LocateFixed, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/api";
import { approxPlace, locateMe, searchPlaces } from "@/lib/places";

/** "Use my location" or search a town. If GPS fails, search stays right there and a network guess is offered. */
export function PlaceChooser({ onPick, picked }: { onPick: (p: Place) => void; picked?: Place | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const [approx, setApprox] = useState<Place | null>(null);
  const search = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    const ctl = new AbortController();
    const t = setTimeout(() => searchPlaces(query.trim(), ctl.signal).then(setResults, () => {}), 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  async function locate() {
    setNote("");
    setApprox(null);
    setLocating(true);
    try {
      onPick(await locateMe());
    } catch (e) {
      setNote((e as Error).message);
      search.current?.focus();
      setApprox(await approxPlace());
    } finally {
      setLocating(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={locate}
        disabled={locating}
        className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border border-leaf bg-card text-lg font-semibold text-leaf active:bg-paper"
      >
        {locating ? <LoaderCircle size={20} className="animate-spin" /> : <LocateFixed size={20} />}
        Use my location
      </button>

      <label className="mt-3 block">
        <span className="sr-only">Search for a town or city</span>
        <span className="relative block">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            ref={search}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="or search for a town or city"
            className="block h-12 w-full rounded-2xl border border-line bg-card pl-11 pr-4 text-base outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/30"
          />
        </span>
      </label>

      {results.length > 0 && (
        <ul className="mt-2 overflow-hidden rounded-2xl border border-line bg-card">
          {results.map((r, i) => (
            <li key={`${r.lat},${r.lng},${i}`} className="border-t border-line first:border-t-0">
              <button
                type="button"
                onClick={() => {
                  onPick(r);
                  setQuery("");
                  setResults([]);
                }}
                className="block min-h-11 w-full px-4 py-3 text-left active:bg-paper"
              >
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}

      {note && <p role="alert" className="mt-3 text-sm text-clay">{note}</p>}
      {approx && (
        <button
          type="button"
          onClick={() => onPick(approx)}
          className="mt-2 min-h-11 w-full rounded-2xl border border-line bg-card px-4 py-2 text-left text-sm active:bg-paper"
        >
          Use <strong>{approx.name}</strong> <span className="text-muted">(approximate, from your network)</span>
        </button>
      )}
      {picked && <p className="mt-3 text-sm font-medium text-leaf">Hunting near: {picked.name}</p>}
    </div>
  );
}
