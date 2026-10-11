import { z } from "zod";
import { HttpError } from "./http";
import { cellFor } from "./cell";
import { ask } from "./model";

export { CELL_ID, cellFor } from "./cell";

// Hunt cards are built on demand for a ~28 km cell of the map and cached (see db.ts).
// Real sightings (iNaturalist) decide WHICH plants; the model only chooses among them and
// writes the clue text. It can never add a plant that nobody has photographed nearby.

export type Difficulty = "easy" | "medium" | "hard";
export type Photo = { url: string; license: string; credit: string };
export type Kind = "tree" | "shrub" | "herb" | "climber";
export type Lang = { lexicon: string; code: string; label: string }; // iNaturalist lexicon, ISO 639-1, display name
export type LocalName = { code: string; label: string; name: string; ai?: boolean };
export type Plant = {
  id: string; // iNaturalist taxon id
  name: string;
  scientific: string;
  kind: Kind;
  batch: number; // 0 = the most common plants; each "show more" adds the next batch
  difficulty: Difficulty;
  clue: string;
  traits: string;
  lookalikes: string;
  sightings: number;
  photo: Photo;
  taxonUrl: string;
  local?: LocalName[]; // the plant's name in the languages spoken where the card is
};
export type Candidate = {
  id: number; name: string; scientific: string; sightings: number; summary: string; photo: Photo;
};
export type HuntCard = {
  id: string;
  place: string;
  lat: number;
  lng: number;
  plants: Plant[];
  languages?: Lang[]; // local languages for this area (absent on older cards)
  /** Real sightings not shown yet; "show more" draws the next batch from here. Absent on older cards. */
  pool?: Candidate[];
  rev: number; // bumped on every change, so two simultaneous "show more" requests can't both win
  source: "ai" | "data"; // "data" = model unavailable, clues come straight from Wikipedia summaries
  createdAt: string;
};

export const BATCH_SIZE = 8;
export const MAX_PLANTS = 56;
const RADIUS_KM = 20;
const TAXA_PER_CALL = 30; // the iNaturalist taxa endpoint accepts at most 30 ids
const CANDIDATES = 60;
const UA = "TreeHunt/0.1 (+https://github.com/rahulrr-coder/tree-hunt)";
// Reusable licences, best first. "No derivatives" and all-rights-reserved photos are skipped.
const LICENSES = ["cc0", "cc-by", "cc-by-sa", "cc-by-nc", "cc-by-nc-sa"];

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
    rank: "species", locale: "en", per_page: 100,
  });
  const top = counts.results.filter((r) => r.taxon.rank === "species" && r.taxon.preferred_common_name).slice(0, CANDIDATES);
  if (top.length < 5) throw new HttpError(404, "Not enough plants have been recorded near here yet. Try a nearby town.");

  type Detail = {
    id: number;
    wikipedia_summary?: string | null;
    taxon_photos?: { photo: { medium_url?: string; license_code?: string | null; attribution?: string } }[];
  };
  const chunks: (typeof top)[] = [];
  for (let i = 0; i < top.length; i += TAXA_PER_CALL) chunks.push(top.slice(i, i + TAXA_PER_CALL));
  const batches = await Promise.all(
    chunks.map((c) =>
      inat<{ results: Detail[] }>(`/v2/taxa/${c.map((r) => r.taxon.id).join(",")}`, {
        locale: "en",
        fields: "id,wikipedia_summary,taxon_photos.photo.medium_url,taxon_photos.photo.license_code,taxon_photos.photo.attribution",
      }),
    ),
  );
  const byId = new Map(batches.flatMap((b) => b.results).map((d) => [d.id, d]));

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

const L = (lexicon: string, code: string, label: string): Lang => ({ lexicon, code, label });
const HINDI = L("hindi", "hi", "Hindi");
// India is many languages: the state decides. Names are iNaturalist's place names.
const INDIA: Record<string, Lang[]> = {
  "Tamil Nadu": [L("tamil", "ta", "Tamil")], Puducherry: [L("tamil", "ta", "Tamil")],
  Maharashtra: [L("marathi", "mr", "Marathi"), HINDI], Karnataka: [L("kannada", "kn", "Kannada")],
  Kerala: [L("malayalam", "ml", "Malayalam")], "Andhra Pradesh": [L("telugu", "te", "Telugu")],
  Telangana: [L("telugu", "te", "Telugu"), HINDI], "West Bengal": [L("bengali", "bn", "Bengali")],
  Gujarat: [L("gujarati", "gu", "Gujarati"), HINDI], Punjab: [L("punjabi", "pa", "Punjabi"), HINDI],
  Odisha: [L("oriya", "or", "Odia")], Assam: [L("assamese", "as", "Assamese")],
  Goa: [L("konkani", "kok", "Konkani"), L("marathi", "mr", "Marathi")],
};
const INDIA_HINDI_BELT = ["Delhi", "Uttar Pradesh", "Madhya Pradesh", "Rajasthan", "Bihar", "Haryana", "Himachal Pradesh",
  "Uttarakhand", "Jharkhand", "Chhattisgarh", "Chandigarh"];
const COUNTRIES: Record<string, Lang[]> = {
  "Sri Lanka": [L("sinhala", "si", "Sinhala"), L("tamil", "ta", "Tamil")], Nepal: [L("nepali", "ne", "Nepali")],
  Bangladesh: [L("bengali", "bn", "Bengali")], Pakistan: [L("urdu", "ur", "Urdu")],
  Japan: [L("japanese", "ja", "Japanese")], China: [L("chinese-simplified", "zh", "Chinese")],
  Taiwan: [L("chinese-traditional", "zh", "Chinese")], Thailand: [L("thai", "th", "Thai")],
  Indonesia: [L("indonesian", "id", "Indonesian")], Russia: [L("russian", "ru", "Russian")],
  Spain: [L("spanish", "es", "Spanish")], Mexico: [L("spanish", "es", "Spanish")], Argentina: [L("spanish", "es", "Spanish")],
  Colombia: [L("spanish", "es", "Spanish")], Chile: [L("spanish", "es", "Spanish")], Peru: [L("spanish", "es", "Spanish")],
  France: [L("french", "fr", "French")], Germany: [L("german", "de", "German")], Italy: [L("italian", "it", "Italian")],
  Portugal: [L("portuguese", "pt", "Portuguese")], Brazil: [L("portuguese", "pt", "Portuguese")],
  Netherlands: [L("dutch", "nl", "Dutch")], Poland: [L("polish", "pl", "Polish")], Turkey: [L("turkish", "tr", "Turkish")],
  Egypt: [L("arabic", "ar", "Arabic")], "Saudi Arabia": [L("arabic", "ar", "Arabic")],
  "United Arab Emirates": [L("arabic", "ar", "Arabic")], Korea: [L("korean", "ko", "Korean")],
  "South Korea": [L("korean", "ko", "Korean")], Vietnam: [L("vietnamese", "vi", "Vietnamese")],
  Philippines: [L("tagalog", "tl", "Tagalog")], Malaysia: [L("malay", "ms", "Malay")],
};

/** Local languages for a place, from its country and state. Empty means English only. */
export function languagesFor(country?: string, region?: string): Lang[] {
  if (country === "India") {
    if (region && INDIA[region]) return INDIA[region];
    if (region && INDIA_HINDI_BELT.includes(region)) return [HINDI];
    return [HINDI];
  }
  return (country && COUNTRIES[country]) || [];
}

type PlaceInfo = { name: string; region?: string; country?: string };

/** "Coimbatore, Tamil Nadu" plus its state and country, from iNaturalist's places around a point. */
export async function placeInfoFor(point: { lat: number; lng: number }): Promise<PlaceInfo> {
  try {
    // A tiny box, so only the places that contain the point come back (a wide one pulls in the neighbouring district).
    const d = 0.005;
    const r = await inat<{ results: { standard?: { name: string; admin_level: number | null }[] } }>("/v1/places/nearby", {
      nelat: point.lat + d, nelng: point.lng + d, swlat: point.lat - d, swlng: point.lng - d, per_page: 10,
    });
    const all = (r.results.standard ?? []).filter((p) => p.admin_level != null);
    const named = all.filter((p) => p.admin_level! >= 10);
    const local = [...named].sort((a, b) => b.admin_level! - a.admin_level!)[0];
    const region = named.find((p) => p.admin_level === 10)?.name;
    const country = all.find((p) => p.admin_level === 0)?.name;
    if (!local) return { name: "Your area", region, country };
    return { name: region && region !== local.name ? `${local.name}, ${region}` : local.name, region, country };
  } catch {
    return { name: "Your area" };
  }
}
export const placeNameFor = async (point: { lat: number; lng: number }) => (await placeInfoFor(point)).name;

/** iNaturalist's own names for these plants in the given languages, keyed by taxon id then lexicon. */
async function inatLocalNames(ids: number[], langs: Lang[]): Promise<Map<number, Record<string, string>>> {
  const out = new Map<number, Record<string, string>>();
  if (!ids.length || !langs.length) return out;
  try {
    const r = await inat<{ results: { id: number; names?: { name: string; lexicon: string }[] }[] }>(
      `/v1/taxa/${ids.join(",")}`,
      { all_names: "true", locale: "en" },
    );
    for (const t of r.results) {
      const found: Record<string, string> = {};
      for (const l of langs) {
        const hit = t.names?.find((n) => n.lexicon === l.lexicon);
        if (hit) found[l.lexicon] = hit.name;
      }
      out.set(t.id, found);
    }
  } catch {
    // names are a bonus: the hunt works without them
  }
  return out;
}

/** Attach local names: iNaturalist's where it has them, the model's suggestion (marked `ai`) otherwise. */
async function addLocalNames(
  plants: Plant[],
  langs: Lang[],
  suggestions: Map<string, Record<string, string>> = new Map(),
  prefetched?: Promise<Map<number, Record<string, string>>>, // started while the model was thinking
) {
  if (!langs.length) return plants;
  const real = (await prefetched) ?? (await inatLocalNames(plants.map((p) => Number(p.id)), langs));
  return plants.map((p) => {
    const local: LocalName[] = [];
    for (const l of langs) {
      const known = real.get(Number(p.id))?.[l.lexicon];
      const guess = suggestions.get(p.id)?.[l.label]?.trim();
      if (known) local.push({ code: l.code, label: l.label, name: known });
      else if (guess && guess.toLowerCase() !== p.name.toLowerCase()) local.push({ code: l.code, label: l.label, name: guess, ai: true });
    }
    return local.length ? { ...p, local: local.slice(0, 2) } : p;
  });
}

const Pick = z.array(
  z.object({
    id: z.coerce.number(),
    difficulty: z.enum(["easy", "medium", "hard"]).catch("medium"),
    kind: z.enum(["tree", "shrub", "herb", "climber"]).optional().catch(undefined),
    clue: z.string().trim().min(1),
    traits: z.string().nullish().transform((v) => (v ?? "").trim()),
    lookalikes: z.string().nullish().transform((v) => (v ?? "").trim()),
    local: z.record(z.string(), z.string().nullish()).nullish().catch(undefined),
  }),
);

export function buildSelectionPrompt(place: string, c: Candidate[], first: boolean, langs: Lang[] = [], count = BATCH_SIZE): string {
  const list = c.map((p) => `${p.id} | ${p.name} | ${p.scientific} | ${p.sightings} sightings | ${p.summary}`).join("\n");
  const brief = first
    ? `Pick exactly ${count} of the MOST COMMON ones that a curious beginner can find outdoors and recognise from a photo.
Prefer trees and shrubs with a distinctive leaf, flower, fruit or bark. Mix difficulty: about half easy, the rest medium, at most one hard.`
    : `These are further plants for players who already found the common ones. Pick up to ${count} that add VARIETY:
a spread of trees, flowering shrubs, herbs and climbers, each recognisable from a photo. Mix difficulty.`;
  return `You design a nature scavenger hunt for people walking near ${place}.
Below are plants that people have really photographed within about ${RADIUS_KM} km, most sighted first. Each has an id.

${brief}
Avoid look-alike groups and anything a beginner could not tell apart. Use only ids from the list.

For each pick write:
- "clue": one or two sentences, under 30 words, telling the player what to look for (leaf shape, flower, fruit, bark, habitat).
- "traits": one sentence of visible features a botanist would check in a photo.
- "lookalikes": the commonly confused plants and how to tell them apart, or "" if you are not sure.
- "difficulty": "easy", "medium" or "hard".
- "kind": "tree" (palms too), "shrub" (flowering bushes too), "herb" (small plants, grasses) or "climber" (vines).${
    langs.length
      ? `\n- "local": an object with the plant's everyday name in each of these languages, written in that language's own script: ${langs.map((l) => l.label).join(", ")}. Use "" when you do not know it.`
      : ""
  }
Only state facts you are confident about. Do not invent anything.

Reply with ONLY a JSON array, no markdown:
[{"id":123,"kind":"tree","difficulty":"easy","clue":"...","traits":"...","lookalikes":"..."${langs.length ? `,"local":{${langs.map((l) => `"${l.label}":"..."`).join(",")}}` : ""}}]

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
  return parsed.data.filter((p) => known.has(p.id) && !seen.has(p.id) && seen.add(p.id)).slice(0, BATCH_SIZE);
}

export function guessKind(text: string): Kind {
  if (/\b(climb\w*|vine|creeper|liana)\b/i.test(text)) return "climber";
  if (/\b(tree|palm)\b/i.test(text)) return "tree";
  if (/\b(herb|grass|weed)\b/i.test(text)) return "herb";
  return "shrub";
}

/** Pure assembly step: model picks first, then top up from the most-sighted candidates. */
export function assemble(candidates: Candidate[], picks: z.infer<typeof Pick>, batch: number, size = BATCH_SIZE): Plant[] {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  const plants: Plant[] = [];
  const used = new Set<number>();
  const add = (c: Candidate, p?: (typeof picks)[number]) => {
    used.add(c.id);
    plants.push({
      id: String(c.id), name: c.name, scientific: c.scientific, sightings: c.sightings, photo: c.photo, batch,
      taxonUrl: `https://www.inaturalist.org/taxa/${c.id}`,
      kind: p?.kind ?? guessKind(`${c.name}. ${c.summary}`),
      difficulty: p?.difficulty ?? "medium",
      clue: p?.clue ?? (firstSentence(c.summary) || `Look for ${c.name}.`),
      traits: p?.traits || c.summary,
      lookalikes: p?.lookalikes ?? "",
    });
  };
  for (const p of picks) add(byId.get(p.id)!, p);
  for (const c of candidates) if (plants.length < size && !used.has(c.id)) add(c);
  return plants;
}

async function choose(place: string, window: Candidate[], first: boolean, langs: Lang[]) {
  try {
    return parsePicks(await ask(buildSelectionPrompt(place, window, first, langs), undefined, 35_000), window);
  } catch (e) {
    console.error("[hunt] model selection failed, using sightings only:", (e as Error).message);
    return [];
  }
}

export async function generateCard(lat: number, lng: number): Promise<HuntCard> {
  const cell = cellFor(lat, lng);
  const [candidates, info] = await Promise.all([candidatesFor(cell), placeInfoFor(cell)]);
  const languages = languagesFor(info.country, info.region);
  const place = info.name;

  // The first card is built from the 30 most-sighted plants: "the most common ones".
  const window = candidates.slice(0, TAXA_PER_CALL);
  const names = inatLocalNames(window.map((c) => c.id), languages); // runs while the model thinks
  const picks = await choose(place, window, true, languages);
  const plants = await addLocalNames(assemble(window, picks, 0), languages, suggestionsOf(picks), names);
  const shown = new Set(plants.map((p) => p.id));
  return {
    id: cell.id, place, lat: cell.lat, lng: cell.lng, plants, languages, rev: 0,
    pool: candidates.filter((c) => !shown.has(String(c.id))),
    source: picks.length ? "ai" : "data", createdAt: new Date().toISOString(),
  };
}

/** The next batch of plants for a card ("show more"). Same card, one revision later. */
export async function extendCard(card: HuntCard): Promise<HuntCard> {
  let pool = card.pool;
  if (!pool) {
    // Card was built before pools existed: rebuild the candidate list, minus what is already shown.
    const have = new Set(card.plants.map((p) => p.id));
    pool = (await candidatesFor(cellFor(card.lat, card.lng))).filter((c) => !have.has(String(c.id)));
  }
  if (!pool.length || card.plants.length >= MAX_PLANTS) return { ...card, pool: [], rev: card.rev + 1 };

  const languages = card.languages ?? languagesFor(...regionOf(await placeInfoFor(cellFor(card.lat, card.lng))));
  const window = pool.slice(0, TAXA_PER_CALL);
  const names = inatLocalNames(window.map((c) => c.id), languages);
  const picks = await choose(card.place, window, false, languages);
  const batch = Math.max(0, ...card.plants.map((p) => p.batch ?? 0)) + 1;
  const added = await addLocalNames(assemble(window, picks, batch), languages, suggestionsOf(picks), names);
  const used = new Set(added.map((p) => p.id));
  return {
    ...card,
    languages,
    plants: [...card.plants, ...added],
    pool: pool.filter((c) => !used.has(String(c.id))),
    rev: card.rev + 1,
  };
}

/** Cards saved before categories existed get safe defaults. */
export function normalizeCard(card: HuntCard): HuntCard {
  return {
    ...card,
    rev: card.rev ?? 0,
    plants: card.plants.map((p) => ({
      ...p,
      batch: p.batch ?? 0,
      kind: p.kind ?? guessKind(`${p.name}. ${p.traits}`),
    })),
  };
}

export type PublicCard = Omit<HuntCard, "pool">;
/** What the client receives: the card without the (large, server-side) pool of unshown plants. */
export const publicCard = ({ pool: _pool, ...rest }: HuntCard): PublicCard => rest;
export const canLoadMore = (c: HuntCard) => c.plants.length < MAX_PLANTS && (c.pool === undefined || c.pool.length > 0);

/** Stable id for a plant the player adds by name, e.g. "Rain tree" -> "custom-rain-tree". */
export function customId(name: string): string {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return `custom-${slug || "plant"}`;
}

const regionOf = (i: PlaceInfo): [string | undefined, string | undefined] => [i.country, i.region];

function suggestionsOf(picks: z.infer<typeof Pick>): Map<string, Record<string, string>> {
  const m = new Map<string, Record<string, string>>();
  for (const p of picks) {
    if (!p.local) continue;
    const clean: Record<string, string> = {};
    for (const [k, v] of Object.entries(p.local)) if (v && v.trim()) clean[k] = v.trim();
    m.set(String(p.id), clean);
  }
  return m;
}

/** One-off upgrade for cards saved before local names existed: iNaturalist names only (no model call). */
export async function localizeCard(card: HuntCard): Promise<HuntCard> {
  const languages = languagesFor(...regionOf(await placeInfoFor(cellFor(card.lat, card.lng))));
  const plants = await addLocalNames(card.plants, languages);
  return { ...card, languages, plants, rev: card.rev + 1 };
}
