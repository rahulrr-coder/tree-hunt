import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ModelError, parseReply, verifyPlant } from "../lib/model";

const plant = { name: "Neem", scientific: "Azadirachta indica", traits: "toothed leaflets", lookalikes: "curry leaf" };
const reply = (o: object) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify(o) } }] }) });
const raw = (content: string) => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content } }] }) });

describe("parseReply", () => {
  it("strips code fences and surrounding chatter", () => {
    const r = parseReply('Sure!\n```json\n{"verdict":"match","confidence":0.9,"reason":"toothed","hint":"","fact":"Neem twigs clean teeth."}\n```');
    expect(r).toEqual({ verdict: "match", confidence: 0.9, reason: "toothed", fact: "Neem twigs clean teeth." });
  });
  it("downgrades a low-confidence match to unsure with a hint", () => {
    const r = parseReply('{"verdict":"match","confidence":0.5,"reason":"maybe","hint":"","fact":""}');
    expect(r?.verdict).toBe("unsure");
    expect(r?.hint).toBeTruthy();
  });
  it("accepts null hint/fact and a percentage confidence", () => {
    const r = parseReply('{"verdict":"no_match","confidence":85,"reason":"smooth edges","hint":null,"fact":null}');
    expect(r?.confidence).toBe(0.85);
  });
  it("returns null for junk", () => {
    expect(parseReply("I cannot tell")).toBeNull();
    expect(parseReply('{"verdict":"maybe"}')).toBeNull();
  });
});

describe("verifyPlant", () => {
  beforeEach(() => {
    process.env.MODEL_API_KEY = "k";
    process.env.MODEL_BASE_URL = "http://model.test/v1/";
    process.env.MODEL_NAME = "gemma-test";
  });
  afterEach(() => vi.unstubAllGlobals());

  it("sends an OpenAI-compatible vision request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply({ verdict: "match", confidence: 0.9, reason: "r", hint: "", fact: "f" }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await verifyPlant({ imageDataUrl: "data:image/jpeg;base64,AAA", plant });
    expect(out.verdict).toBe("match");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://model.test/v1/chat/completions");
    const body = JSON.parse(init.body);
    expect(body.model).toBe("gemma-test");
    expect(body.messages[0].content[1].image_url.url).toBe("data:image/jpeg;base64,AAA");
  });

  it("retries once after an unreadable answer, then returns unsure", async () => {
    const fetchMock = vi.fn().mockResolvedValue(raw("no json here"));
    vi.stubGlobal("fetch", fetchMock);
    const out = await verifyPlant({ imageDataUrl: "x", plant });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(out.verdict).toBe("unsure");
  });

  it("retries once on a 5xx, then throws", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 503, text: async () => "down" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyPlant({ imageDataUrl: "x", plant })).rejects.toBeInstanceOf(ModelError);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not retry a 401", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => "bad key" });
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyPlant({ imageDataUrl: "x", plant })).rejects.toBeInstanceOf(ModelError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("drops temperature when the model only supports its default, then succeeds", async () => {
    vi.resetModules(); // temperature opt-out is module state
    const { verifyPlant: fresh } = await import("../lib/model");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false, status: 400,
        text: async () => "temperature does not support 0.2",
        clone() { return this; },
      })
      .mockResolvedValue(reply({ verdict: "no_match", confidence: 0.9, reason: "r", hint: "h", fact: "" }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await fresh({ imageDataUrl: "x", plant });
    expect(out.verdict).toBe("no_match");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).temperature).toBe(0.2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("temperature");
  });
});
