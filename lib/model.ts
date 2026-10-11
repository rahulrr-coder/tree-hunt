import { z } from "zod";

// The ONLY file that talks to a model provider. It speaks the OpenAI-compatible
// /chat/completions protocol with an image_url part, which Google AI Studio, OpenRouter,
// Groq, Together, OpenAI, Ollama and vLLM all accept. Switch provider = change 3 env vars.

export type Verdict = "match" | "no_match" | "unsure";
export type PlantKind = "tree" | "shrub" | "herb" | "climber" | "other";
export type VerifyResult = { verdict: Verdict; confidence: number; reason: string; hint?: string; fact?: string; kind?: PlantKind };
type PlantInfo = { name: string; scientific: string; traits: string; lookalikes: string };

/** `retryable` = timeout, network error, 429 or 5xx. Anything else (bad key, bad model) fails fast. */
export class ModelError extends Error {
  constructor(message: string, public retryable = false) {
    super(message);
  }
}

const text = z.string().nullish().transform((v) => (v ?? "").trim());
const Reply = z.object({
  verdict: z.enum(["match", "no_match", "unsure"]),
  confidence: z.coerce.number().transform((n) => Math.min(1, Math.max(0, n > 1 ? n / 100 : n))),
  reason: text,
  hint: text,
  fact: text,
  kind: z.enum(["tree", "shrub", "herb", "climber", "other"]).optional().catch(undefined),
  best_guess: text,
});

const MIN_MATCH_CONFIDENCE = 0.6;
const GENERIC_HINT = "Get closer, keep the leaves or flowers in focus, and shoot in good light.";

export function buildPrompt(p: PlantInfo, place = ""): string {
  return `You are a careful field botanist checking a photo for a nature scavenger hunt${place ? ` near ${place}` : ""}.
The player says this photo shows: ${p.name}${p.scientific ? ` (${p.scientific})` : ""}.
Field marks to look for: ${p.traits || "use your own botanical knowledge of this plant"}
Commonly confused with: ${p.lookalikes || "none listed"}

Work from the photo only, in two steps:
1. Note the diagnostic features you can actually see: leaf shape and arrangement, leaf edges, flowers, fruit, bark, how the plant grows.
   Phone photos outdoors are often dim, shaded, slightly soft or a close part of the plant. That is normal: judge what is visible and do not mark a photo down for it.
2. Decide what plant it most likely is, then whether that is the claimed plant.

Verdict:
- "match": the visible features fit the claimed plant and do not fit its lookalikes. Two or three diagnostic features are enough; you do not need every trait.
- "no_match": only when the visible features positively point to a different plant, which you name in "best_guess", or there is no plant in the photo.
- "unsure": when the features that would settle it cannot be made out (far away, nearly black, badly blurred, a close-up of bark only), or the claimed plant and a lookalike cannot be told apart. Not seeing the claimed plant's features is "unsure", never "no_match".

"confidence" is how sure you are of your verdict, from 0 to 1.

Reply with ONLY this JSON, no markdown:
{"seen":"the features you can see, one sentence",
 "best_guess":"the plant you think it is, or \"unknown\"",
 "verdict":"match|no_match|unsure",
 "confidence":0.0-1.0,
 "reason":"one short sentence naming the features that decided it",
 "hint":"if not match: one short, specific tip on what to photograph or look for, else empty",
 "fact":"if match: one surprising, true, kid-friendly fact about this plant in under 25 words, else empty",
 "kind":"if match: tree (palms too), shrub (flowering bushes too), herb (small plants, grasses), climber (vines) or other, else omit"}`;
}

/** Tolerates code fences and chatter around the JSON. Returns null when nothing usable. */
export function parseReply(raw: string): VerifyResult | null {
  const body = raw.replace(/```(?:json)?/gi, "").match(/\{[\s\S]*\}/)?.[0];
  if (!body) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(body);
  } catch {
    return null;
  }
  const r = Reply.safeParse(obj);
  if (!r.success) return null;
  const { verdict: v, confidence, reason, hint, fact, kind, best_guess } = r.data;
  // A shaky "match" is not a match: streaks must mean something. And "not that plant" needs a named alternative:
  // failing to see the features (dim, blurry) is "unsure", not proof of a different plant.
  const named = best_guess && !/^(unknown|unclear|unidentified|can.?t|cannot|not sure|unsure)/i.test(best_guess);
  const verdict: Verdict = v === "match" && confidence < MIN_MATCH_CONFIDENCE ? "unsure" : v === "no_match" && !named ? "unsure" : v;
  return verdict === "match"
    ? { verdict, confidence, reason, fact, ...(kind && { kind }) }
    : { verdict, confidence, reason, hint: hint || GENERIC_HINT };
}

// Some models (e.g. reasoning models) only accept the default temperature. Learn that from the
// first 400 and stop sending it, so "any model" really means any model.
let sendTemperature = true;

/** One chat completion. Text-only when `imageDataUrl` is omitted. Returns the raw reply text. */
export async function ask(prompt: string, imageDataUrl?: string, timeoutMs = 25_000): Promise<string> {
  const { MODEL_API_KEY, MODEL_BASE_URL, MODEL_NAME } = process.env;
  if (!MODEL_API_KEY || !MODEL_BASE_URL || !MODEL_NAME) {
    throw new ModelError("MODEL_API_KEY, MODEL_BASE_URL and MODEL_NAME must be set.");
  }
  const post = (withTemperature: boolean) =>
    fetch(`${MODEL_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${MODEL_API_KEY}` },
      body: JSON.stringify({
        model: MODEL_NAME,
        ...(withTemperature && { temperature: 0.2 }),
        messages: [
          {
            role: "user",
            content: imageDataUrl
              ? [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUrl } }]
              : prompt,
          },
        ],
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  let res: Response;
  try {
    const sentTemperature = sendTemperature; // decide from what THIS request sent: concurrent calls may flip the flag
    res = await post(sentTemperature);
    if (res.status === 400 && sentTemperature && /temperature/i.test(await res.clone().text())) {
      sendTemperature = false;
      res = await post(false);
    }
  } catch (e) {
    throw new ModelError(`Model request failed: ${(e as Error).message}`, true);
  }
  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    throw new ModelError(`Model API ${res.status}: ${detail}`, res.status >= 500 || res.status === 429);
  }
  const data = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[] } | null;
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p: { text?: string }) => p?.text ?? "").join("");
  return "";
}

export async function verifyPlant(input: { imageDataUrl: string; plant: PlantInfo; place?: string }): Promise<VerifyResult> {
  const prompt = buildPrompt(input.plant, input.place);
  let lastError: ModelError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = parseReply(await ask(prompt, input.imageDataUrl));
      if (reply) return reply;
      lastError = null; // unreadable answer: retry once, then fall through to "unsure"
    } catch (e) {
      if (!(e instanceof ModelError) || !e.retryable) throw e;
      lastError = e;
    }
  }
  if (lastError) throw lastError;
  return { verdict: "unsure", confidence: 0, reason: "The checker's answer could not be read.", hint: GENERIC_HINT };
}
