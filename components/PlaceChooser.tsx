"use client";
import { LoaderCircle, LocateFixed, Search } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type Place } from "@/lib/api";

const round2 = (n: number) => Math.round(n * 100) / 100; // ~1 km: all a hunt card needs

/** "Use my location" or search a town. Calls onPick with a coarse position, never the exact fix. */
export function PlaceChooser({ onPick, picked }: { onPick: (p: Place) => void; picked?: Place | null }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places?q=${encodeURIComponent(query.trim())}`, { signal: ctl.signal });
        setResults(((await res.json()) as { places?: Place[] }).places ?? []);
      } catch {}
    }, 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  function locate() {
    setNote("");
    if (!navigator.geolocation) return setNote("This browser can't share location. Search for your town instead.");
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLocating(false);
        onPick({ name: "Your location", lat: round2(p.coords.latitude), lng: round2(p.coords.longitude) });
      },
      () => {
        setLocating(false);
        setNote("Location is blocked. Search for your town instead.");
      },
      { timeout: 10_000, maximumAge: 600_000 },
    );
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
        <span className="sr-only">Search for a town</span>
        <span className="relative block">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="or search for a town"
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
                  onPick({ ...r, lat: round2(r.lat), lng: round2(r.lng) });
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
      {picked && <p className="mt-3 text-sm font-medium text-leaf">Hunting near: {picked.name}</p>}
    </div>
  );
}
