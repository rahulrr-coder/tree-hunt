import { getStore } from "@/lib/db";
import { getCard } from "@/lib/huntCards";
import { HttpError, json, route } from "@/lib/http";
import { dayKey, shownStreak } from "@/lib/streak";

// Per-player state for a hunt card. The card itself is static data bundled with the client.
export const GET = route(async (req: Request, ctx: { params: Promise<{ cardId: string }> }) => {
  const { cardId } = await ctx.params;
  if (!getCard(cardId)) throw new HttpError(404, "Unknown hunt card.");
  const userId = new URL(req.url).searchParams.get("userId");
  const store = await getStore();
  const user = userId ? await store.getUser(userId) : null;
  return json({
    model: process.env.MODEL_NAME ?? null,
    found: user ? await store.foundByUser(user._id) : {}, // plantId -> findId (thumbnail at /api/finds/:id/thumb)
    streak: user && { current: shownStreak(user, dayKey()), longest: user.longestStreak },
  });
});
