import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { assemble, canLoadMore, CELL_ID, cellFor, customId, generateCard, guessKind, languagesFor, parsePicks, publicCard } from "../lib/hunt";

const photo = { url: "https://static.inaturalist.org/photos/1/medium.jpg", license: "cc-by", credit: "(c) Someone, CC BY" };
const cand = (id: number, name: string, sightings = 10) => ({
  id, name, scientific: `Genus sp${id}`, sightings, summary: `${name} is a plant. It has leaves.`, photo,
});
const candidates = Array.from({ length: 12 }, (_, i) => cand(100 + i, `Plant ${i}`, 200 - i));

describe("cellFor", () => {
  it("puts nearby points in the same cell and far points in another", () => {
    expect(cellFor(11.0168, 76.9558).id).toBe(cellFor(11.05, 76.99).id);
    expect(cellFor(11.0168, 76.9558).id).not.toBe(cellFor(13.08, 80.27).id);
  });
  it("returns a centre within half a cell, and works for the southern/western hemispheres", () => {
    const c = cellFor(-33.8688, 151.2093);
    expect(c.id).toMatch(CELL_ID);
    expect(Math.abs(c.lat - -33.8688)).toBeLessThanOrEqual(0.125);
    expect(Math.abs(c.lng - 151.2093)).toBeLessThanOrEqual(0.125);
    expect(cellFor(40.7, -74.0).id).toMatch(CELL_ID);
  });
});

describe("parsePicks", () => {
  it("strips fences and keeps only known, unique ids", () => {
    const raw = '```json\n[{"id":100,"difficulty":"easy","clue":"Big leaves","traits":"t","lookalikes":null},{"id":100,"clue":"dup"},{"id":999,"clue":"invented"},{"id":101,"difficulty":"impossible","clue":"Red fruit"}]\n```';
    const picks = parsePicks(raw, candidates);
    expect(picks.map((p) => p.id)).toEqual([100, 101]);
    expect(picks[0].lookalikes).toBe("");
    expect(picks[1].difficulty).toBe("medium");
  });
  it("returns nothing for junk", () => {
    expect(parsePicks("sorry, no", candidates)).toEqual([]);
    expect(parsePicks('[{"id":100}]', candidates)).toEqual([]); // clue is required
  });
});

describe("assemble", () => {
  it("keeps the model's order, then tops up to 8 from the most-sighted plants", () => {
    const plants = assemble(candidates, [{ id: 105, difficulty: "hard", clue: "Look up", traits: "x", lookalikes: "" }], 0);
    expect(plants).toHaveLength(8);
    expect(plants[0]).toMatchObject({ id: "105", difficulty: "hard", clue: "Look up" });
    expect(plants[1].id).toBe("100");
    expect(new Set(plants.map((p) => p.id)).size).toBe(8);
    expect(plants[1].clue).toBe("Plant 0 is a plant."); // fallback clue from the summary
    expect(plants.every((p) => p.batch === 0)).toBe(true);
  });
  it("tags later batches and keeps the model's kind", () => {
    const plants = assemble(candidates, [{ id: 101, kind: "climber", difficulty: "easy", clue: "Twines", traits: "", lookalikes: "" }], 2, 3);
    expect(plants).toHaveLength(3);
    expect(plants[0]).toMatchObject({ kind: "climber", batch: 2 });
  });
});

describe("categories and show-more helpers", () => {
  it("guesses a kind from text", () => {
    expect(guessKind("A woody climber with tendrils")).toBe("climber");
    expect(guessKind("is a tree in the mahogany family")).toBe("tree");
    expect(guessKind("an annual herb")).toBe("herb");
  });
  it("hides the server-side pool from clients and knows when more can load", () => {
    const card = { id: "1_1", place: "X", lat: 0, lng: 0, plants: [], pool: [candidates[0]], rev: 0, source: "ai" as const, createdAt: "" };
    expect(publicCard(card)).not.toHaveProperty("pool");
    expect(canLoadMore(card)).toBe(true);
    expect(canLoadMore({ ...card, pool: [] })).toBe(false);
    expect(canLoadMore({ ...card, pool: undefined })).toBe(true); // legacy card: unknown, so allow a try
  });
  it("makes a stable id for a plant the player names", () => {
    expect(customId("Rain Tree")).toBe("custom-rain-tree");
    expect(customId("  Ficus  benghalensis. ")).toBe("custom-ficus-benghalensis");
    expect(customId("வேம்பு")).toMatch(/^custom-/);
  });
});

describe("languagesFor", () => {
  it("uses the state in India and the country elsewhere", () => {
    expect(languagesFor("India", "Tamil Nadu").map((l) => l.code)).toEqual(["ta"]);
    expect(languagesFor("India", "Maharashtra").map((l) => l.code)).toEqual(["mr", "hi"]);
    expect(languagesFor("India", "Delhi").map((l) => l.code)).toEqual(["hi"]);
    expect(languagesFor("Japan").map((l) => l.code)).toEqual(["ja"]);
    expect(languagesFor("Canada")).toEqual([]);
  });
});

describe("generateCard", () => {
  const taxa = candidates.map((c) => ({
    id: c.id,
    wikipedia_summary: `<b>${c.name}</b> is a plant.`,
    taxon_photos: [
      { photo: { medium_url: "https://x/all-rights.jpg", license_code: null, attribution: "(c) A, all rights reserved" } },
      { photo: { medium_url: `https://x/${c.id}.jpg`, license_code: "cc-by", attribution: "(c) B, CC BY" } },
    ],
  }));
  const counts = candidates.map((c) => ({ count: c.sightings, taxon: { id: c.id, rank: "species", name: c.scientific, preferred_common_name: c.name } }));
  const json = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body), clone() { return this; } });

  function mockFetch(modelReply: () => unknown) {
    return vi.fn(async (input: string | URL) => {
      const url = String(input);
      if (url.includes("species_counts")) return json({ results: counts });
      if (url.includes("/v2/taxa/")) return json({ results: taxa });
      if (url.includes("places/nearby")) return json({ results: { standard: [{ name: "India", admin_level: 0 }, { name: "Tamil Nadu", admin_level: 10 }, { name: "Coimbatore", admin_level: 20 }, { name: "Asia", admin_level: -10 }] } });
      if (url.includes("chat/completions")) return json({ choices: [{ message: { content: JSON.stringify(modelReply()) } }] });
      throw new Error("unexpected " + url);
    });
  }

  beforeEach(() => {
    process.env.MODEL_API_KEY = "k";
    process.env.MODEL_BASE_URL = "http://model.test/v1";
    process.env.MODEL_NAME = "m";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("builds a card from sightings, picks the licensed photo and names the place with its region", async () => {
    vi.stubGlobal("fetch", mockFetch(() => candidates.slice(0, 8).map((c) => ({ id: c.id, difficulty: "easy", clue: `Find ${c.name}`, traits: "t", lookalikes: "" }))));
    const card = await generateCard(11.0168, 76.9558);
    expect(card.place).toBe("Coimbatore, Tamil Nadu");
    expect(card.source).toBe("ai");
    expect(card.plants).toHaveLength(8);
    expect(card.plants[0].photo.url).toBe("https://x/100.jpg");
    expect(card.plants[0].photo.license).toBe("cc-by");
    expect(card.id).toMatch(CELL_ID);
    expect(card.pool?.length).toBe(4); // 12 candidates, 8 shown
    expect(card.rev).toBe(0);
  });

  it("falls back to sightings-only text when the model fails", async () => {
    const f = mockFetch(() => ({}));
    vi.stubGlobal("fetch", async (input: string | URL) => {
      if (String(input).includes("chat/completions")) return { ok: false, status: 401, text: async () => "no", clone() { return this; } };
      return f(input);
    });
    const card = await generateCard(11.0168, 76.9558);
    expect(card.source).toBe("data");
    expect(card.plants).toHaveLength(8);
  });

  it("refuses an area with too few sightings", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => json({ results: [] })));
    await expect(generateCard(0, -30)).rejects.toMatchObject({ status: 404 });
  });
});
