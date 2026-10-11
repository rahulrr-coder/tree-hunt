import { getStore } from "@/lib/db";
import { canLoadMore, cellFor, generateCard, localizeCard, normalizeCard, publicCard } from "@/lib/hunt";
import { HttpError, json, limitIp, llmBudget, parseBody, route } from "@/lib/http";
import { HuntBody } from "@/lib/schemas";
import { dayKey, shownStreak } from "@/lib/streak";

const NEW_AREAS_PER_HOUR = 6; // building a card costs a model call: cap it per player

// POST because it carries the player's position. Returns the hunt card for their area (built
// and cached on first visit) plus this player's progress.
export const POST = route(async (req: Request) => {
  const body = await parseBody(req, HuntBody);
  const store = await getStore();
  await limitIp(store, req, "hunt", 30, 60);
  const user = await store.getUser(body.userId);
  if (!user) throw new HttpError(404, "Please pick a nickname again.");

  const cell = cellFor(body.lat, body.lng);
  let card = await store.getCard(cell.id);
  if (!card) {
    const since = new Date(Date.now() - 3_600_000);
    if ((await store.attemptsSince(user._id, since, "card")) >= NEW_AREAS_PER_HOUR) {
      throw new HttpError(429, "You've explored a lot of new areas. Try again in a little while.");
    }
    await llmBudget(store);
    const started = Date.now();
    card = await store.saveCard(await generateCard(body.lat, body.lng));
    await store.logAttempt({ userId: user._id, plantId: `card:${cell.id}`, verdict: "card", confidence: 0, latencyMs: Date.now() - started });
  }
  card = normalizeCard(card);
  if (!card.languages) {
    // Saved before local names existed: add them once. If someone else beat us to it, use theirs.
    const upgraded = await localizeCard(card);
    card = normalizeCard((await store.updateCard(upgraded, card.rev)) ?? (await store.getCard(cell.id)) ?? upgraded);
  }

  const rows = await store.foundByUser(user._id);
  return json({
    card: publicCard(card),
    canLoadMore: canLoadMore(card),
    found: Object.fromEntries(rows.map((r) => [r.plantId, r.findId])), // plantId -> findId (thumbnail at /api/finds/:id/thumb)
    extras: rows.filter((r) => r.plantId.startsWith("custom-")), // plants the player added by name
    streak: { current: shownStreak(user, dayKey(new Date(), body.tz ?? user.tz)), longest: user.longestStreak },
  });
});
