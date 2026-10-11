import { getStore } from "@/lib/db";
import { json, route } from "@/lib/http";
import { dayKey, shownStreak } from "@/lib/streak";

export const GET = route(async () => {
  const rows = await (await getStore()).leaderboard(20);
  return json({
    rows: rows.map((r) => ({
      nickname: r.nickname, totalFinds: r.totalFinds, uniquePlants: r.uniquePlants, currentStreak: shownStreak(r, dayKey(new Date(), r.tz)),
    })),
  });
});
