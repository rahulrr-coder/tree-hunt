"use client";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import "leaflet.markercluster/dist/MarkerCluster.Default.css";
import { useEffect, useRef, useState } from "react";
import { api, type Place } from "@/lib/api";
import { CELL_DEGREES, cellFor } from "@/lib/cell";
import { colorOfKind, KIND_FILTERS, type FindKind, type KindFilter } from "@/lib/categories";
import { ConfirmPlace, PlaceName, Spinner } from "./PlaceChooser";
import { usePlaceFlow } from "./usePlaceFlow";
import { useUser } from "./UserProvider";

type Pin = { id: string; nickname: string; plantId: string; plantName: string; kind: FindKind; lat: number; lng: number; createdAt: string };
type LeafletMap = import("leaflet").Map;
type Leaflet = typeof import("leaflet");


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
  const { user, place, ready, setPlace } = useUser();
  const box = useRef<HTMLDivElement>(null);
  const lib = useRef<Leaflet | null>(null);
  const map = useRef<LeafletMap | null>(null);
  const area = useRef<import("leaflet").Rectangle | null>(null);
  const cluster = useRef<import("leaflet").MarkerClusterGroup | null>(null);
  const [kind, setKind] = useState<KindFilter>("all");
  const [mine, setMine] = useState(false);
  const [pins, setPins] = useState<Pin[] | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [emptyNote, setEmptyNote] = useState("");
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
      (window as unknown as { L: Leaflet }).L = L; // the cluster plugin looks for a global L
      await import("leaflet.markercluster");
      if (cancelled) return;
      cluster.current = L.markerClusterGroup({ maxClusterRadius: 45, showCoverageOnHover: false }).addTo(m);
      map.current = m;
      setMapReady(true);
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      cluster.current = null;
      setMapReady(false);
    };
  }, [ready]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load pins whenever the category changes.
  useEffect(() => {
    if (!mapReady) return;
    let stale = false;
    api<{ finds: Pin[] }>(`/api/finds?limit=200&kind=${kind}`).then(
      ({ finds }) => {
        if (stale) return;
        setPins(finds);
        setEmptyNote("");
      },
      (e: Error) => {
        if (!stale) setEmptyNote(e.message);
      },
    );
    return () => {
      stale = true;
    };
  }, [mapReady, kind]);

  // Draw them (clustered), optionally only the player's own.
  useEffect(() => {
    const L = lib.current, group = cluster.current;
    if (!L || !group || !pins) return;
    group.clearLayers();
    const mineName = user?.nickname.toLowerCase();
    const shown = pins.filter((f) => !mine || f.nickname.toLowerCase() === mineName);
    for (const f of shown) {
      const icon = L.divIcon({ className: "", html: `<div class="pin" style="background:${colorOfKind(f.kind)}"></div>`, iconSize: [18, 18] });
      group.addLayer(L.marker([f.lat, f.lng], { icon }).bindPopup(() => popup(f)));
    }
    if (!shown.length) setEmptyNote(mine ? "You have no pinned finds yet." : kind === "all" ? "No finds yet. Be the first." : "No finds in this category yet.");
    else setEmptyNote("");
  }, [pins, mine, user, kind]);

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

  function go(p: Place) {
    setPlace(p); // the map and the hunt card share one "where am I hunting"
    map.current?.flyTo([p.lat, p.lng], 12);
  }
  const flow = usePlaceFlow(go);

  // Preview a candidate place on the map while the player decides whether to confirm it.
  useEffect(() => {
    if (flow.pending) map.current?.flyTo([flow.pending.lat, flow.pending.lng], 11);
  }, [flow.pending]);

  return (
    <div className="fixed inset-x-0 bottom-0 top-14 isolate z-0">
      <div ref={box} className="size-full" role="application" aria-label="Map of verified finds" />

      <div className="pointer-events-none absolute inset-x-3 top-3 z-[1000] flex flex-col gap-2 sm:right-auto sm:w-96">
        {flow.pending ? (
          <div className="pointer-events-auto">
            <ConfirmPlace place={flow.pending} onYes={flow.confirm} onNo={flow.cancel} />
          </div>
        ) : (
          <>
            <div className="pointer-events-auto flex gap-2">
              <label className="relative block flex-1">
                <span className="sr-only">Search for a town or city</span>
                <input
                  value={flow.query}
                  onChange={(e) => flow.setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && flow.results[0]) {
                      e.preventDefault();
                      flow.choose(flow.results[0]);
                    }
                  }}
                  placeholder="Search a town or city"
                  autoComplete="off"
                  className="block h-12 w-full rounded-2xl border border-line bg-card px-4 text-base shadow-sm outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/30"
                />
                {flow.searching && <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted"><Spinner small /></span>}
              </label>
              <button
                onClick={flow.locate}
                disabled={flow.locating}
                className="flex h-12 shrink-0 items-center gap-2 rounded-2xl border border-leaf bg-card px-4 text-sm font-semibold text-leaf shadow-sm active:bg-paper"
              >
                {flow.locating && <Spinner small />}
                {flow.locating ? "Finding…" : "Locate me"}
              </button>
            </div>

            <div className="pointer-events-auto -mx-3 flex gap-2 overflow-x-auto px-3 pb-1" role="tablist" aria-label="Plant categories">
              {KIND_FILTERS.map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={kind === f.id}
                  onClick={() => setKind(f.id)}
                  className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold shadow-sm ${
                    kind === f.id ? "border-leaf bg-leaf text-white" : "border-line bg-card text-ink"
                  }`}
                >
                  {f.id !== "all" && <span className="size-2.5 rounded-full" style={{ background: f.color }} aria-hidden />}
                  {f.label}
                </button>
              ))}
              {user && (
                <button
                  aria-pressed={mine}
                  onClick={() => setMine((v) => !v)}
                  className={`h-9 shrink-0 rounded-full border px-3 text-sm font-semibold shadow-sm ${
                    mine ? "border-marigold bg-marigold text-ink" : "border-line bg-card text-ink"
                  }`}
                >
                  My finds
                </button>
              )}
            </div>

            {flow.results.length > 0 && (
              <ul className="pointer-events-auto overflow-hidden rounded-2xl border border-line bg-card shadow-sm">
                {flow.results.map((r, i) => (
                  <li key={`${r.lat},${r.lng},${i}`} className="border-t border-line first:border-t-0">
                    <button onClick={() => flow.choose(r)} className="block min-h-12 w-full px-4 py-3 text-left active:bg-paper">
                      <PlaceName name={r.name} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {flow.noMatches && <p className="pointer-events-auto rounded-2xl border border-line bg-card px-4 py-3 text-sm text-muted shadow-sm">No places match that. Check the spelling or try a bigger nearby town.</p>}
            {flow.note && <p role="alert" className="pointer-events-auto rounded-2xl border border-clay/40 bg-card px-4 py-3 text-sm text-clay shadow-sm">{flow.note}</p>}
            {flow.approx && (
              <button onClick={() => flow.choose(flow.approx!)} className="pointer-events-auto min-h-11 rounded-2xl border border-line bg-card px-4 py-2 text-left text-sm shadow-sm active:bg-paper">
                Use <strong>{flow.approx.name}</strong> <span className="text-muted">(approximate, from your network)</span>
              </button>
            )}
            {emptyNote && !flow.results.length && !flow.note && (
              <p role="status" className="pointer-events-auto rounded-2xl border border-line bg-card px-4 py-3 text-center font-medium shadow-sm">
                {emptyNote}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
