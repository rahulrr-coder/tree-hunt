import { z } from "zod";
import { HttpError } from "./http";
import { ask } from "./model";

// Hunt cards are built on demand for a ~28 km cell of the map and cached (see db.ts).
// Real sightings (iNaturalist) decide WHICH plants; the model only chooses among them and
// writes the clue text. It can never add a plant that nobody has photographed nearby.

export type Difficulty = "easy" | "medium" | "hard";
export type Photo = { url: string; license: string; credit: string };
export type Plant = {
  id: string; // iNaturalist taxon id
  name: string;
  scientific: string;
  difficulty: Difficulty;
  clue: string;
  traits: string;
  lookalikes: string;
  sightings: number;
  photo: Photo;
  taxonUrl: string;
};
export type HuntCard = {
  id: string;
  place: string;
  lat: number;
  lng: number;
  plants: Plant[];
  source: "ai" | "data"; // "data" = model unavailable, clues come straight from Wikipedia summaries
  createdAt: string;
};

export const HUNT_SIZE = 8;
const CELL_DEGREES = 0.25;
const RADIUS_KM = 20;
const CANDIDATES = 30; // the iNaturalist taxa endpoint accepts at most 30 ids
const UA = "TreeHunt/0.1 (+https://github.com/rahulrr-coder/tree-hunt)";
// Reusable licences, best first. "No derivatives" and all-rights-reserved photos are skipped.
const LICENSES = ["cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa"];

export const CELL_ID = /^\d+_\d+$/;

/** Snap a point to its cell, so everyone in the same area shares one hunt card. */
export function cellFor(lat: number, lng: number): { id: string; lat: number; lng: number } {
  const i = Math.floor((lat + 90) / CELL_DEGREES);
  const j = Math.floor((lng + 180) / CELL_DEGREES);
  const centre = (k: number, origin: number) => Math.round((origin + (k + 0.5) * CELL_DEGREES) * 1e4) / 1e4;
  return { id: `${i}_${j}`, lat: centre(i, -90), lng: centre(j, -180) };
}

async function inat<T>(path: string, params: Record<string, string | number>): Promise<T> {
  const url = new URL(`https://api.inaturalist.org${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  let res: Response;
  try {
    res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new HttpError(502, "The plant database is not answering right now. Please try again.");
  }
  if (!res.ok) throw new HttpError(502, "The plant database is not answering right now. Please try again.");
  return (await res.json()) as T;
}

type Candidate = {
  id: number; name: string; scientific: string; sightings: number; summary: string; photo: Photo;
};

const plain = (html: string) => html.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
const firstSentence = (s: string) => s.match(/^.*?[.!?](\s|$)/)?.[0].trim() ?? s;

function bestPhoto(photos: { photo: { medium_url?: string; license_code?: string | null; attribution?: string } }[]): Photo | null {
  const ranked = photos
    .map((p) => p.photo)
    .filter((p) => p.medium_url && p.license_code && LICENSES.includes(p.license_code))
    .sort((a, b) => LICENSES.indexOf(a.license_code!) - LICENSES.indexOf(b.license_code!));
  const p = ranked[0];
  return p ? { url: p.medium_url!, license: p.license_code!, credit: p.attribution ?? "iNaturalist contributor" } : null;
}

async function candidatesFor(cell: { lat: number; lng: number }): Promise<Candidate[]> {
  const counts = await inat<{
    results: { count: number; taxon: { id: number; rank: string; name: string; preferred_common_name?: string } }[];
  }>("/v1/observations/species_counts", {
    lat: cell.lat, lng: cell.lng, radius: RADIUS_KM, iconic_taxa: "Plantae", quality_grade: "research",
    rank: "species", locale: "en", per_page: 45,
  });
  const top = counts.results.filter((r) => r.taxon.rank === "species" && r.taxon.preferred_common_name).slice(0, CANDIDATES);
  if (top.length < 5) throw new HttpError(404, "Not enough plants have been recorded near here yet. Try a nearby town.");

  const details = await inat<{
    results: { id: number; wikipedia_summary?: string | null; taxon_photos?: { photo: { medium_url?: string; license_code?: string | null; attribution?: string } }[] }[];
  }>(`/v2/taxa/${top.map((r) => r.taxon.id).join(",")}`, {
    locale: "en",
    fields: "id,wikipedia_summary,taxon_photos.photo.medium_url,taxon_photos.photo.license_code,taxon_photos.photo.attribution",
  });
  const byId = new Map(details.results.map((d) => [d.id, d]));

  const out: Candidate[] = [];
  for (const r of top) {
    const d = byId.get(r.taxon.id);
    const photo = d && bestPhoto(d.taxon_photos ?? []);
    if (!photo) continue; // no reusable photo, nothing to show as a sample
    out.push({
      id: r.taxon.id, name: r.taxon.preferred_common_name!, scientific: r.taxon.name, sightings: r.count,
      summary: plain(d.wikipedia_summary ?? "").slice(0, 260), photo,
    });
  }
  if (out.length < 5) throw new HttpError(404, "Not enough plants have been recorded near here yet. Try a nearby town.");
  return out;
}

/** "Coimbatore, Tamil Nadu": the most specific named place around the cell, plus its region. */
async function placeNameFor(cell: { lat: number; lng: number }): Promise<string> {
  try {
    const d = 0.1;
    const r = await inat<{ results: { standard?: { name: string; admin_level: number | null }[] } }>("/v1/places/nearby", {
      nelat: cell.lat + d, nelng: cell.lng + d, swlat: cell.lat - d, swlng: cell.lng - d, per_page: 10,
    });
    const named = (r.results.standard ?? []).filter((p) => p.admin_level != null && p.admin_level >= 10);
    const local = named.sort((a, b) => b.admin_level! - a.admin_level!)[0];
    const region = named.find((p) => p.admin_level === 10);
    if (!local) return "Your area";
    return region && region.name !== local.name ? `${local.name}, ${region.name}` : local.name;
  } catch {
    return "Your area";
  }
}

const Pick = z.array(
  z.object({
    id: z.coerce.number(),
    difficulty: z.enum(["easy", "medium", "hard"]).catch("medium"),
    clue: z.string().trim().min(1),
    traits: z.string().nullish().transform((v) => (v ?? "").trim()),
    lookalikes: z.string().nullish().transform((v) => (v ?? "").trim()),
  }),
);

export function buildSelectionPrompt(place: string, c: Candidate[]): string {
  const list = c.map((p) => `${p.id} | ${p.name} | ${p.scientific} | ${p.sightings} sightings | ${p.summary}`).join("\n");
  return `You design a nature scavenger hunt for people walking near ${place}.
Below are plants that people have really photographed within about ${RADIUS_KM} km, most sighted first. Each has an id.

Pick exactly ${HUNT_SIZE} that a curious beginner can find outdoors and recognise from a photo. Prefer trees and shrubs
with a distinctive leaf, flower, fruit or bark. Avoid grasses, crops, water plants, tiny weeds and look-alike groups.
Mix difficulty: about 4 easy, 3 medium, 1 hard. Use only ids from the list.

For each pick write:
- "clue": one or two sentences, under 30 words, telling the player what to look for (leaf shape, flower, fruit, bark, habitat).
- "traits": one sentence of visible features a botanist would check in a photo.
- "lookalikes": the commonly confused plants and how to tell them apart, or "" if you are not sure.
- "difficulty": "easy", "medium" or "hard".
Only state facts you are confident about. Do not invent anything.

Reply with ONLY a JSON array, no markdown:
[{"id":123,"difficulty":"easy","clue":"...","traits":"...","lookalikes":"..."}]

Plants:
${list}`;
}

/** Accepts only ids from the candidate list; ignores duplicates and malformed entries. */
export function parsePicks(raw: string, candidates: Candidate[]): z.infer<typeof Pick> {
  const body = raw.replace(/```(?:json)?/gi, "").match(/\[[\s\S]*\]/)?.[0];
  if (!body) return [];
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return [];
  }
  const parsed = Pick.safeParse(json);
  if (!parsed.success) return [];
  const known = new Set(candidates.map((c) => c.id));
  const seen = new Set<number>();
  return parsed.data.filter((p) => known.has(p.id) && !seen.has(p.id) && seen.add(p.id)).slice(0, HUNT_SIZE);
}

/** Pure assembly step: model picks first, then top up from the most-sighted candidates. */
export function assemble(candidates: Candidate[], picks: z.infer<typeof Pick>): Plant[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const plants: Plant[] = [];
  const used = new Set<number>();
  const add = (c: Candidate, p?: (typeof picks)[number]) => {
    used.add(c.id);
    plants.push({
      id: String(c.id), name: c.name, scientific: c.scientific, sightings: c.sightings, photo: c.photo,
      taxonUrl: `https://www.inaturalist.org/taxa/${c.id}`,
      difficulty: p?.difficulty ?? "medium",
      clue: p?.clue ?? (firstSentence(c.summary) || `Look for ${c.name}.`),
      traits: p?.traits || c.summary,
      lookalikes: p?.lookalikes ?? "",
    });
  };
  for (const p of picks) add(byId.get(p.id)!, p);
  for (const c of candidates) if (plants.length < HUNT_SIZE && !used.has(c.id)) add(c);
  return plants;
}

export async function generateCard(lat: number, lng: number): Promise<HuntCard> {
  const cell = cellFor(lat, lng);
  const [candidates, place] = await Promise.all([candidatesFor(cell), placeNameFor(cell)]);

  let picks: z.infer<typeof Pick> = [];
  try {
    picks = parsePicks(await ask(buildSelectionPrompt(place, candidates), undefined, 40_000), candidates);
  } catch (e) {
    console.error("[hunt] model selection failed, using sightings only:", (e as Error).message);
  }
  return {
    id: cell.id, place, lat: cell.lat, lng: cell.lng, plants: assemble(candidates, picks),
    source: picks.length ? "ai" : "data", createdAt: new Date().toISOString(),
  };
}
