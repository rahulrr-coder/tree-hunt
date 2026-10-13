import { getStore } from "@/lib/db";
import { enrich } from "@/lib/identify";
import { HttpError, json, limitIp, llmBudget, parseBody, route } from "@/lib/http";
import { identifyPlants, ModelError } from "@/lib/model";
import { IdentifyBody } from "@/lib/schemas";

// Names the plants in a photo the player took, without them saying what it is. Nothing is saved:
// to add one to their finds, the player sends it through /api/verify like any other plant.
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, IdentifyBody);
  const store = await getStore();
  await limitIp(store, req, "identify", 60, 3600, "That's a lot of photos from one place. Please try again later.");
  const user = await store.getUser(body.userId);
  if (!user) throw new HttpError(404, "Please pick a nickname again.");
  const card = body.cardId ? await store.getCard(body.cardId) : null;

  // Shares the per-player photo allowance with /api/verify: every attempt is logged in the same place.
  const limit = Number(process.env.VERIFY_RATE_LIMIT_PER_HOUR) || 20;
  if ((await store.attemptsSince(user._id, new Date(Date.now() - 3_600_000))) >= limit) {
    throw new HttpError(429, "That's a lot of photos. Take a walk and try again in a little while.");
  }

  await llmBudget(store);
  const started = Date.now();
  let result;
  try {
    result = await identifyPlants({ imageDataUrl: body.image, place: card?.place });
  } catch (e) {
    await store.logAttempt({ userId: user._id, plantId: "identify", verdict: "error", confidence: 0, latencyMs: Date.now() - started });
    console.error("[identify]", e instanceof ModelError ? e.message : e);
    throw new HttpError(502, "The plant checker is having a moment. Please try again.");
  }
  await store.logAttempt({
    userId: user._id, plantId: "identify", verdict: "identify", confidence: result.plants[0]?.confidence ?? 0, latencyMs: Date.now() - started,
  });
  return json({ plants: await enrich(result.plants, card), note: result.note });
});
