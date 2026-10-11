import { z } from "zod";
import { getStore } from "@/lib/db";
import { json, limitIp, route } from "@/lib/http";

const Query = z.object({ q: z.string().trim().min(2).max(60) });

type Geo = { name: string; admin1?: string; country?: string; latitude: number; longitude: number; population?: number };

// Type-ahead city search (Open-Meteo geocoding, no key). Biggest places first, so "coim" finds
// Coimbatore before a village of the same prefix.
export const GET = route(async (req: Request) => {
  const { q } = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  await limitIp(await getStore(), req, "places", 90, 60);
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: q, count: "12", language: "en", format: "json" }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const data = (await res.json().catch(() => ({}))) as { results?: Geo[] };

  const seen = new Set<string>();
  const places = (data.results ?? [])
    .sort((a, b) => (b.population ?? 0) - (a.population ?? 0))
    .map((r) => ({ name: [r.name, r.admin1, r.country].filter(Boolean).join(", "), lat: r.latitude, lng: r.longitude }))
    .filter((p) => !seen.has(p.name) && seen.add(p.name))
    .slice(0, 6);
  return json({ places });
});
