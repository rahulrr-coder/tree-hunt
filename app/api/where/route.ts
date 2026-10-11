import { getStore } from "@/lib/db";
import { placeNameFor } from "@/lib/hunt";
import { json, limitIp, parseBody, route } from "@/lib/http";
import { WhereBody } from "@/lib/schemas";

const round2 = (n: number) => Math.round(n * 100) / 100;

// GET: city-level guess for when browser GPS fails. Netlify's edge already resolves the caller's
// network to a city and passes it in `x-nf-geo`; nothing is sent to a third party and nothing is stored.
export const GET = route(async (req: Request) => {
  await limitIp(await getStore(), req, "where", 20, 60);
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

// POST: "where is this point?" so a GPS fix can be shown as a place name for the player to confirm.
export const POST = route(async (req: Request) => {
  const { lat, lng } = await parseBody(req, WhereBody);
  await limitIp(await getStore(), req, "where", 20, 60);
  return json({ name: await placeNameFor({ lat, lng }) });
});
