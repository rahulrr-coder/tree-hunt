import { z } from "zod";

// The ONLY file that talks to a model provider. It speaks the OpenAI-compatible
// /chat/completions protocol with an image_url part, which Google AI Studio, OpenRouter,
// Groq, Together, OpenAI, Ollama and vLLM all accept. Switch provider = change 3 env vars.

export type Verdict = "match" | "no_match" | "unsure";
export type VerifyResult = { verdict: Verdict; confidence: number; reason: string; hint?: string; fact?: string };
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
});

const MIN_MATCH_CONFIDENCE = 0.6;
const GENERIC_HINT = "Get closer, keep the leaves or flowers in focus, and shoot in good light.";

export function buildPrompt(p: PlantInfo): string {
  return `You are a careful field botanist checking a photo for a nature scavenger hunt in South India.
The player claims this photo shows: ${p.name} (${p.scientific}).
Identifying traits: ${p.traits}
Common lookalikes: ${p.lookalikes}

Look only at what is visible. Decide:
- "match": the claimed plant is clearly visible and its key traits are consistent.
- "no_match": the photo clearly shows something else, or no plant.
- "unsure": too blurry, too far, too dark, or the deciding traits are not visible.

Reply with ONLY this JSON, no markdown:
{"verdict":"match|no_match|unsure","confidence":0.0-1.0,"reason":"one short sentence on what you saw",
 "hint":"if not match: one short, specific tip on what to photograph or look for, else empty",
 "fact":"if match: one surprising, true, kid-friendly fact about this plant in under 25 words, else empty"}`;
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
  const { verdict: v, confidence, reason, hint, fact } = r.data;
  // A shaky "match" is not a match: streaks must mean something.
  const verdict: Verdict = v === "match" && confidence < MIN_MATCH_CONFIDENCE ? "unsure" : v;
  return verdict === "match"
    ? { verdict, confidence, reason, fact }
    : { verdict, confidence, reason, hint: hint || GENERIC_HINT };
}

// Some models (e.g. reasoning models) only accept the default temperature. Learn that from the
// first 400 and stop sending it, so "any model" really means any model.
let sendTemperature = true;

async function complete(prompt: string, imageDataUrl: string): Promise<string> {
  const { MODEL_API_KEY, MODEL_BASE_URL, MODEL_NAME } = process.env;
  if (!MODEL_API_KEY || !MODEL_BASE_URL || !MODEL_NAME) {
    throw new ModelError("MODEL_API_KEY, MODEL_BASE_URL and MODEL_NAME must be set.");
  }
  const post = () =>
    fetch(`${MODEL_BASE_URL.replace(/\/+$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${MODEL_API_KEY}` },
      body: JSON.stringify({
        model: MODEL_NAME,
        ...(sendTemperature && { temperature: 0.2 }),
        messages: [
          { role: "user", content: [{ type: "text", text: prompt }, { type: "image_url", image_url: { url: imageDataUrl } }] },
        ],
      }),
      signal: AbortSignal.timeout(25_000),
    });
  let res: Response;
  try {
    res = await post();
    if (res.status === 400 && sendTemperature && /temperature/i.test(await res.clone().text())) {
      sendTemperature = false;
      res = await post();
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

export async function verifyPlant(input: { imageDataUrl: string; plant: PlantInfo }): Promise<VerifyResult> {
  const prompt = buildPrompt(input.plant);
  let lastError: ModelError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const reply = parseReply(await complete(prompt, input.imageDataUrl));
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
