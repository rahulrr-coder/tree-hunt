import { getStore } from "@/lib/db";
import { cellFor, generateCard } from "@/lib/hunt";
import { HttpError, json, parseBody, route } from "@/lib/http";
import { HuntBody } from "@/lib/schemas";
import { dayKey, shownStreak } from "@/lib/streak";

const NEW_AREAS_PER_HOUR = 6; // building a card costs a model call: cap it per player

// POST because it carries the player's position. Returns the hunt card for their area (built
// and cached on first visit) plus this player's progress.
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, HuntBody);
  const store = await getStore();
  const user = await store.getUser(body.userId);
  if (!user) throw new HttpError(404, "Please pick a nickname again.");

  const cell = cellFor(body.lat, body.lng);
  let card = await store.getCard(cell.id);
  if (!card) {
    const since = new Date(Date.now() - 3_600_000);
    if ((await store.attemptsSince(user._id, since, "card")) >= NEW_AREAS_PER_HOUR) {
      throw new HttpError(429, "You've explored a lot of new areas. Try again in a little while.");
    }
    const started = Date.now();
    card = await store.saveCard(await generateCard(body.lat, body.lng));
    await store.logAttempt({ userId: user._id, plantId: `card:${cell.id}`, verdict: "card", confidence: 0, latencyMs: Date.now() - started });
  }

  return json({
    card,
    model: process.env.MODEL_NAME ?? null,
    found: await store.foundByUser(user._id), // plantId -> findId (thumbnail at /api/finds/:id/thumb)
    streak: { current: shownStreak(user, dayKey(new Date(), body.tz ?? user.tz)), longest: user.longestStreak },
  });
});
