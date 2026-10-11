import { json, route } from "@/lib/http";

const round2 = (n: number) => Math.round(n * 100) / 100;

// City-level fallback for when browser GPS fails. Netlify's edge already resolves the caller's
// network to a city and passes it in `x-nf-geo`; nothing is sent to a third party and nothing is stored.
export const GET = route(async (req: Request) => {
  const raw = req.headers.get("x-nf-geo");
  if (raw) {
    try {
      const g = JSON.parse(Buffer.from(raw, "base64").toString("utf8")) as {
        city?: string; country?: { name?: string }; latitude?: number; longitude?: number;
      };
      if (typeof g.latitude === "number" && typeof g.longitude === "number") {
        const name = [g.city, g.country?.name].filter(Boolean).join(", ") || "Near you";
        return json({ place: { name, lat: round2(g.latitude), lng: round2(g.longitude) } });
      }
    } catch {}
  }
  return json({ place: null });
});
