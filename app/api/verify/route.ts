import { getStore } from "@/lib/db";
import { customId } from "@/lib/hunt";
import { HttpError, json, limitIp, llmBudget, parseBody, route } from "@/lib/http";
import { ModelError, verifyPlant } from "@/lib/model";
import { VerifyBody } from "@/lib/schemas";
import { applyFind, dayKey, shownStreak } from "@/lib/streak";

export const POST = route(async (req: Request) => {
  const body = await parseBody(req, VerifyBody);
  const store = await getStore();
  await limitIp(store, req, "verify", 60, 3600, "That's a lot of photos from one place. Please try again later.");
  const card = await store.getCard(body.cardId);
  if (!card) throw new HttpError(400, "Unknown hunt card.");

  // A plant from the card, or one the player names themselves (verified the same way, just with no traits to go on).
  const typed = body.customName?.toLowerCase();
  const plant =
    body.plantId === "custom"
      ? (card.plants.find((p) => p.name.toLowerCase() === typed || p.scientific.toLowerCase() === typed) ?? {
          id: customId(body.customName!), name: body.customName!, scientific: "", traits: "", lookalikes: "",
        })
      : card.plants.find((p) => p.id === body.plantId);
  if (!plant) throw new HttpError(400, "Unknown plant.");

  const user = await store.getUser(body.userId);
  if (!user) throw new HttpError(404, "Please pick a nickname again.");

  const limit = Number(process.env.VERIFY_RATE_LIMIT_PER_HOUR) || 20;
  if ((await store.attemptsSince(user._id, new Date(Date.now() - 3_600_000))) >= limit) {
    throw new HttpError(429, "That's a lot of photos. Take a walk and try again in a little while.");
  }

  await llmBudget(store);
  const started = Date.now();
  let result;
  try {
    result = await verifyPlant({ imageDataUrl: body.image, plant, place: card.place });
  } catch (e) {
    await store.logAttempt({ userId: user._id, plantId: plant.id, verdict: "error", confidence: 0, latencyMs: Date.now() - started });
    console.error("[verify]", e instanceof ModelError ? e.message : e);
    throw new HttpError(502, "The plant checker is having a moment. Please try again.");
  }
  await store.logAttempt({ userId: user._id, plantId: plant.id, verdict: result.verdict, confidence: result.confidence, latencyMs: Date.now() - started });

  if (result.verdict !== "match") return json(result);

  await store.addFind({
    userId: user._id, nickname: user.nickname, cardId: card.id, plantId: plant.id, plantName: plant.name,
    kind: ("kind" in plant ? plant.kind : undefined) ?? result.kind ?? "other",
    lat: body.lat, lng: body.lng, thumb: body.thumb,
    confidence: result.confidence, verdict: "match", reason: result.reason, fact: result.fact ?? "",
  });
  const tz = body.tz ?? user.tz;
  const today = dayKey(new Date(), tz);
  const before = shownStreak(user, today);
  const next = applyFind(user, today);
  await store.setStreak(user._id, next, tz);
  return json({
    ...result,
    streak: { current: next.currentStreak, longest: next.longestStreak, increased: next.currentStreak > before },
  });
});
