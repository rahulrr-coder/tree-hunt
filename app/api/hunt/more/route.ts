import { getStore } from "@/lib/db";
import { canLoadMore, extendCard, normalizeCard, publicCard } from "@/lib/hunt";
import { HttpError, json, limitIp, llmBudget, parseBody, route } from "@/lib/http";
import { MoreBody } from "@/lib/schemas";

const MORE_PER_HOUR = 12;

// "Show more plants": adds the next batch from the real sightings not shown yet.
export const POST = route(async (req: Request) => {
  const { userId, cardId } = await parseBody(req, MoreBody);
  const store = await getStore();
  await limitIp(store, req, "more", 10, 60);
  const user = await store.getUser(userId);
  if (!user) throw new HttpError(404, "Please pick a nickname again.");
  const stored = await store.getCard(cardId);
  if (!stored) throw new HttpError(404, "That hunt card no longer exists.");
  let card = normalizeCard(stored);
  if (!canLoadMore(card)) return json({ card: publicCard(card), canLoadMore: false });

  if ((await store.attemptsSince(user._id, new Date(Date.now() - 3_600_000), "more")) >= MORE_PER_HOUR) {
    throw new HttpError(429, "That's a lot of new plants. Try again in a little while.");
  }
  await llmBudget(store);
  const started = Date.now();
  const next = await extendCard(card);
  // If another player extended the card first, keep theirs instead of overwriting it.
  const saved = (await store.updateCard(next, card.rev)) ?? (await store.getCard(cardId)) ?? next;
  card = normalizeCard(saved);
  await store.logAttempt({ userId: user._id, plantId: `more:${cardId}`, verdict: "more", confidence: 0, latencyMs: Date.now() - started });
  return json({ card: publicCard(card), canLoadMore: canLoadMore(card) });
});
