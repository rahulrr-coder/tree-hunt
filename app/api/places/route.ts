import { z } from "zod";
import { json, route } from "@/lib/http";

const Query = z.object({ q: z.string().trim().min(2).max(60) });

// City search for players who would rather type a town than share GPS (Open-Meteo geocoding, no key).
export const GET = route(async (req: Request) => {
  const { q } = Query.parse(Object.fromEntries(new URL(req.url).searchParams));
  const url = new URL("https://geocoding-api.open-meteo.com/v1/search");
  url.search = new URLSearchParams({ name: q, count: "6", language: "en", format: "json" }).toString();
  const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
  const data = (await res.json().catch(() => ({}))) as {
    results?: { name: string; admin1?: string; country?: string; latitude: number; longitude: number }[];
  };
  return json({
    places: (data.results ?? []).map((r) => ({
      name: [r.name, r.admin1, r.country].filter(Boolean).join(", "),
      lat: r.latitude,
      lng: r.longitude,
    })),
  });
});
