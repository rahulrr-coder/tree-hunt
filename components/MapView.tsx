"use client";
import "leaflet/dist/leaflet.css";
import { LoaderCircle, LocateFixed, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Place } from "@/lib/api";
import { CELL_DEGREES, cellFor } from "@/lib/cell";
import { approxPlace, locateMe, searchPlaces } from "@/lib/places";
import { useUser } from "./UserProvider";

type Pin = { id: string; nickname: string; plantId: string; plantName: string; lat: number; lng: number; createdAt: string };
type LeafletMap = import("leaflet").Map;
type Leaflet = typeof import("leaflet");

const COLORS = ["#2f6b3a", "#b5532e", "#3d6fb5", "#8a5a9e", "#c28a12", "#1f8a8a", "#a63d5a", "#5b6659"];
const hash = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (mins < 60) return rtf.format(-Math.max(mins, 0), "minute");
  if (mins < 1440) return rtf.format(-Math.round(mins / 60), "hour");
  return rtf.format(-Math.round(mins / 1440), "day");
}

// Popup is built from DOM nodes + textContent so nicknames can never inject markup.
function popup(pin: Pin): HTMLElement {
  const el = document.createElement("div");
  const img = document.createElement("img");
  img.src = `/api/finds/${pin.id}/thumb`;
  img.alt = pin.plantName;
  img.style.cssText = "width:160px;height:120px;object-fit:cover;border-radius:12px;display:block";
  const name = document.createElement("strong");
  name.textContent = pin.plantName;
  const who = document.createElement("div");
  who.textContent = `${pin.nickname} · ${ago(pin.createdAt)}`;
  el.append(img, name, who);
  return el;
}

export function MapView() {
  const { place, ready, setPlace } = useUser();
  const box = useRef<HTMLDivElement>(null);
  const lib = useRef<Leaflet | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const area = useRef<import("leaflet").Rectangle | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [emptyNote, setEmptyNote] = useState("");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const [approx, setApprox] = useState<Place | null>(null);

  // Create the map once the saved place is known, so it opens on the right town.
  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = (mod.default ?? mod) as Leaflet;
      if (cancelled || !box.current) return;
      lib.current = L;
      const m = L.map(box.current, { zoomControl: false }).setView(place ? [place.lat, place.lng] : [20, 0], place ? 12 : 2);
      L.control.zoom({ position: "bottomleft" }).addTo(m);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(m);
      map.current = m;
      setMapReady(true);
      try {
        const { finds } = await api<{ finds: Pin[] }>("/api/finds?limit=200");
        if (cancelled) return;
        if (!finds.length) setEmptyNote("No finds yet. Be the first.");
        for (const f of finds) {
          const icon = L.divIcon({ className: "", html: `<div class="pin" style="background:${COLORS[hash(f.plantId) % COLORS.length]}"></div>`, iconSize: [18, 18] });
          L.marker([f.lat, f.lng], { icon }).addTo(m).bindPopup(() => popup(f));
        }
      } catch (e) {
        if (!cancelled) setEmptyNote((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      setMapReady(false);
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Outline the ~28 km area the hunt card covers, so the map explains what "my hunt" is.
  useEffect(() => {
    const L = lib.current, m = map.current;
    if (!mapReady || !L || !m || !place) return;
    area.current?.remove();
    const c = cellFor(place.lat, place.lng), h = CELL_DEGREES / 2;
    area.current = L.rectangle([[c.lat - h, c.lng - h], [c.lat + h, c.lng + h]], {
      color: "#2f6b3a", weight: 2, dashArray: "6 6", fillColor: "#2f6b3a", fillOpacity: 0.06, interactive: false,
    }).addTo(m);
  }, [mapReady, place]);

  useEffect(() => {
    if (query.trim().length < 2) return setResults([]);
    const ctl = new AbortController();
    const t = setTimeout(() => searchPlaces(query.trim(), ctl.signal).then(setResults, () => {}), 300);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [query]);

  function go(p: Place) {
    setPlace(p); // the map and the hunt card share one "where am I hunting"
    map.current?.flyTo([p.lat, p.lng], 12);
    setQuery("");
    setResults([]);
    setNote("");
    setApprox(null);
  }

  async function locate() {
    setNote("");
    setApprox(null);
    setLocating(true);
    try {
      go(await locateMe());
    } catch (e) {
      setNote((e as Error).message);
      setApprox(await approxPlace());
    } finally {
      setLocating(false);
    }
  }

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 isolate z-0">
      <div ref={box} className="size-full" role="application" aria-label="Map of verified finds" />

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex flex-col gap-2 sm:right-auto sm:w-96">
        <div className="pointer-events-auto flex gap-2">
          <label className="relative block flex-1">
            <span className="sr-only">Search for a town or city</span>
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search a town or city"
              className="block h-12 w-full rounded-2xl border border-line bg-card pl-11 pr-3 text-base shadow-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/30"
            />
          </label>
          <button
            onClick={locate}
            disabled={locating}
            aria-label="Use my location"
            className="grid size-12 shrink-0 place-items-center rounded-2xl border border-line bg-card text-leaf shadow-sm active:bg-paper"
          >
            {locating ? <LoaderCircle size={20} className="animate-spin" /> : <LocateFixed size={20} />}
          </button>
        </div>

        {results.length > 0 && (
          <ul className="pointer-events-auto overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
            {results.map((r, i) => (
              <li key={`${r.lat},${r.lng},${i}`} className="border-t border-line first:border-t-0">
                <button onClick={() => go(r)} className="block min-h-11 w-full px-4 py-3 text-left active:bg-paper">
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        )}
        {note && <p role="alert" className="pointer-events-auto rounded-2xl border border-clay/40 bg-card px-4 py-3 text-sm text-clay shadow-sm">{note}</p>}
        {approx && (
          <button onClick={() => go(approx)} className="pointer-events-auto min-h-11 rounded-2xl border border-line bg-card px-4 py-2 text-left text-sm shadow-sm active:bg-paper">
            Use <strong>{approx.name}</strong> <span className="text-muted">(approximate, from your network)</span>
          </button>
        )}
        {emptyNote && !results.length && !note && (
          <p role="status" className="pointer-events-auto rounded-2xl border border-line bg-card px-4 py-3 text-center font-medium shadow-sm">
            {emptyNote}
          </p>
        )}
      </div>
    </div>
  );
}
