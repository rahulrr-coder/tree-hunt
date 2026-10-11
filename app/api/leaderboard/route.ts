import { getStore } from "@/lib/db";
import { kindsFor } from "@/lib/categories";
import { json, limitIp, route } from "@/lib/http";
import { BoardQuery } from "@/lib/schemas";
import { dayKey, shownStreak } from "@/lib/streak";

export const GET = route(async (req: Request) => {
  const store = await getStore();
  await limitIp(store, req, "read", 120, 60);
  const { kind } = BoardQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const rows = await store.leaderboard(20, kindsFor(kind));
  return json({
    rows: rows.map((r) => ({
      nickname: r.nickname, totalFinds: r.totalFinds, uniquePlants: r.uniquePlants, currentStreak: shownStreak(r, dayKey(new Date(), r.tz)),
    })),
  });
});
