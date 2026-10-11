"use client";
import "leaflet/dist/leaflet.css";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { defaultCardId, getCard } from "@/lib/huntCards";

type Pin = { id: string; nickname: string; plantId: string; lat: number; lng: number; createdAt: string };

const card = getCard(defaultCardId)!;
const COLORS = ["#2f6b3a", "#b5532e", "#3d6fb5", "#8a5a9e", "#c28a12", "#1f8a8a", "#a63d5a", "#5b6659"];
const COIMBATORE: [number, number] = [11.0168, 76.9558];

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });
  if (mins < 60) return rtf.format(-Math.max(mins, 0), "minute");
  if (mins < 1440) return rtf.format(-Math.round(mins / 60), "hour");
  return rtf.format(-Math.round(mins / 1440), "day");
}

// Popup is built from DOM nodes + textContent so nicknames can never inject markup.
function popup(pin: Pin): HTMLElement {
  const plant = card.plants.find((p) => p.id === pin.plantId);
  const el = document.createElement("div");
  const img = document.createElement("img");
  img.src = `/api/finds/${pin.id}/thumb`;
  img.alt = plant?.name ?? "Find";
  img.style.cssText = "width:160px;height:120px;object-fit:cover;border-radius:12px;display:block";
  const name = document.createElement("strong");
  name.textContent = plant?.name ?? pin.plantId;
  const who = document.createElement("div");
  who.textContent = `${pin.nickname} · ${ago(pin.createdAt)}`;
  el.append(img, name, who);
  return el;
}

export function MapView() {
  const box = useRef<HTMLDivElement>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let map: import("leaflet").Map | undefined;
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = (mod.default ?? mod) as typeof mod;
      if (cancelled || !box.current) return;
      map = L.map(box.current).setView(COIMBATORE, 13);
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(map);
      try {
        const { finds } = await api<{ finds: Pin[] }>("/api/finds?limit=200");
        if (cancelled) return;
        if (!finds.length) setNote("No finds yet. Be the first.");
        for (const f of finds) {
          const color = COLORS[Math.max(0, card.plants.findIndex((p) => p.id === f.plantId)) % COLORS.length];
          const icon = L.divIcon({ className: "", html: `<div class="pin" style="background:${color}"></div>`, iconSize: [18, 18] });
          L.marker([f.lat, f.lng], { icon }).addTo(map).bindPopup(() => popup(f));
        }
      } catch (e) {
        if (!cancelled) setNote((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
  }, []);

  return (
    <div className="relative">
      <div ref={box} className="h-[calc(100dvh-3.5rem)] w-full" role="application" aria-label="Map of verified finds" />
      {note && (
        <p role="status" className="absolute left-16 right-4 top-4 z-[1000] rounded-2xl border border-line bg-card px-4 py-3 text-center font-medium shadow-sm">
          {note}
        </p>
      )}
    </div>
  );
}
