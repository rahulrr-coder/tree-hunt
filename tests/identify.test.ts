import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HuntCard, Plant } from "../lib/hunt";
import { enrich } from "../lib/identify";
import { identifyPlants, parseIdentifyReply } from "../lib/model";

const reply = (o: object) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(o) } }] }) });
const neem = { name: "Neem", scientific: "Azadirachta indica", kind: "tree" as const, confidence: 0.9, seen: "toothed leaflets" };

describe("parseIdentifyReply", () => {
  it("sorts by confidence, drops guesses and duplicates, and cleans names for the verify prompt", () => {
    const r = parseIdentifyReply(`Here you go:\n\`\`\`json\n${JSON.stringify({
      plants: [
        { name: "Grass", scientific: "Poaceae", kind: "herb", confidence: 0.2, seen: "" },
        { name: "Rain tree", scientific: "Samanea saman", kind: "tree", confidence: 0.6, seen: "pinnate leaves" },
        { name: "Neem*", scientific: "Azadirachta indica", kind: "tree", confidence: 90, seen: "toothed" },
        { name: "Neem again", scientific: "azadirachta indica", kind: "tree", confidence: 0.5, seen: "" },
      ],
      note: "",
    })}\n\`\`\``);
    expect(r?.plants.map((p) => [p.name, p.confidence])).toEqual([["Neem", 0.9], ["Rain tree", 0.6]]);
    expect(r?.note).toBe("");
  });
  it("falls back to the scientific name and an unknown kind to other", () => {
    const r = parseIdentifyReply('{"plants":[{"name":"","scientific":"Ficus","kind":"palm","confidence":0.5,"seen":null}],"note":null}');
    expect(r?.plants[0]).toMatchObject({ name: "Ficus", kind: "other", seen: "" });
  });
  it("gives a tip when nothing is identified", () => {
    expect(parseIdentifyReply('{"plants":[],"note":"Get closer to the leaves."}')).toEqual({ plants: [], note: "Get closer to the leaves." });
    expect(parseIdentifyReply('{"plants":[]}')?.note).toBeTruthy();
  });
  it("returns null for junk", () => {
    expect(parseIdentifyReply("I see a tree")).toBeNull();
  });
});

describe("identifyPlants", () => {
  beforeEach(() => {
    process.env.MODEL_API_KEY = "k";
    process.env.MODEL_BASE_URL = "http://model.test/v1";
    process.env.MODEL_NAME = "gemma-test";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends the photo with a prompt that names the place", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ plants: [neem], note: "" }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await identifyPlants({ imageDataUrl: "data:image/jpeg;base64,AAA", place: "Coimbatore" });
    expect(out.plants[0].name).toBe("Neem");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.messages[0].content[0].text).toContain("Coimbatore");
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/jpeg;base64,AAA");
  });

  it("retries an unreadable answer once, then reports nothing found", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: "?" } }] }) });
    vi.stubGlobal("fetch", fetchMock);
    const out = await identifyPlants({ imageDataUrl: "x" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.plants).toEqual([]);
  });
});

describe("enrich", () => {
  afterEach(() => vi.unstubAllGlobals());
  const card = {
    plants: [{ id: "1", name: "Neem", scientific: "Azadirachta indica" }, { id: "2", name: "Banyan", scientific: "Ficus benghalensis" }] as Plant[],
  } as HuntCard;

  it("adds the iNaturalist link and licensed photo, and links plants already on the card", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          { id: 99, name: "Azadirachta", iconic_taxon_name: "Plantae" },
          { id: 1, name: "Azadirachta indica", iconic_taxon_name: "Plantae", default_photo: { medium_url: "https://p/1.jpg", license_code: "cc-by", attribution: "(c) A" } },
        ],
      }),
    }));
    const [out] = await enrich([neem], card);
    expect(out).toMatchObject({ onCard: "1", taxonUrl: "https://www.inaturalist.org/taxa/1", photo: { url: "https://p/1.jpg", credit: "(c) A" } });
  });

  it("skips photos without a reusable licence and still answers when iNaturalist is down", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    const [out] = await enrich([{ ...neem, name: "Banyan", scientific: "Ficus benghalensis L." }], card);
    expect(out).toMatchObject({ name: "Banyan", onCard: "2" });
    expect(out.photo).toBeUndefined();
    expect(out.taxonUrl).toBeUndefined();

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ id: 5, name: "Mangifera indica", iconic_taxon_name: "Plantae", default_photo: { medium_url: "u", license_code: null } }] }),
    }));
    const [mango] = await enrich([{ ...neem, name: "Mango", scientific: "Mangifera indica" }], card);
    expect(mango.onCard).toBeUndefined();
    expect(mango.photo).toBeUndefined();
    expect(mango.taxonUrl).toBe("https://www.inaturalist.org/taxa/5");
  });
});
