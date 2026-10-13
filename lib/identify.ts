import { bestPhoto, UA, type HuntCard, type Photo } from "./hunt";
import type { Identified } from "./model";

// Grounds the model's names in iNaturalist: a real taxon, a licensed reference photo, a link,
// and whether the plant is already on the player's hunt card. Every lookup is best effort:
// if iNaturalist is slow or does not know the name, the model's answer is still shown.

export type IdentifiedPlant = Identified & {
  taxonUrl?: string;
  photo?: Photo;
  /** The id of the same plant on the player's hunt card, if it is there. */
  onCard?: string;
};

type Taxon = {
  id: number;
  name: string;
  iconic_taxon_name?: string;
  default_photo?: { medium_url?: string; license_code?: string | null; attribution?: string } | null;
};

async function lookupTaxon(scientific: string): Promise<Taxon | null> {
  if (!scientific) return null;
  const url = new URL("https://api.inaturalist.org/v1/taxa");
  for (const [k, v] of Object.entries({ q: scientific, is_active: "true", per_page: "5", locale: "en" })) url.searchParams.set(k, v);
  try {
    const res = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, signal: AbortSignal.timeout(6_000) });
    if (!res.ok) return null;
    const { results = [] } = (await res.json()) as { results?: Taxon[] };
    const plants = results.filter((t) => t.iconic_taxon_name === "Plantae");
    return plants.find((t) => t.name.toLowerCase() === scientific.toLowerCase()) ?? plants[0] ?? null;
  } catch {
    return null;
  }
}

/** True when two scientific names are the same species (ignores case, authors and infraspecific parts). */
const sameSpecies = (a: string, b: string) => {
  const two = (s: string) => s.toLowerCase().split(/\s+/).slice(0, 2).join(" ");
  return Boolean(a && b) && two(a) === two(b);
};

export async function enrich(plants: Identified[], card: HuntCard | null): Promise<IdentifiedPlant[]> {
  const taxa = await Promise.all(plants.map((p) => lookupTaxon(p.scientific)));
  return plants.map((p, i) => {
    const t = taxa[i];
    const photo = t?.default_photo ? bestPhoto([{ photo: t.default_photo }]) : null;
    const match = card?.plants.find(
      (c) => (t && c.id === String(t.id)) || sameSpecies(c.scientific, p.scientific) || c.name.toLowerCase() === p.name.toLowerCase(),
    );
    return {
      ...p,
      ...(t && { taxonUrl: `https://www.inaturalist.org/taxa/${t.id}` }),
      ...(photo && { photo }),
      ...(match && { onCard: match.id }),
    };
  });
}
