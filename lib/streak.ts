export type StreakState = { currentStreak: number; longestStreak: number; lastFindDay: string | null };

/** "YYYY-MM-DD" in the app timezone (default Asia/Kolkata). */
export function dayKey(d = new Date(), tz = process.env.APP_TIMEZONE || "Asia/Kolkata"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function isTz(tz: string): boolean {
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function prevDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** State after a verified find on `today`. Repeat finds on the same day change nothing. */
export function applyFind(s: StreakState, today: string): StreakState {
  if (s.lastFindDay === today) return s;
  const currentStreak = s.lastFindDay === prevDay(today) ? s.currentStreak + 1 : 1;
  return { currentStreak, longestStreak: Math.max(s.longestStreak, currentStreak), lastFindDay: today };
}

/** The streak to display: a streak older than yesterday has lapsed. */
export function shownStreak(s: StreakState, today: string): number {
  return s.lastFindDay === today || s.lastFindDay === prevDay(today) ? s.currentStreak : 0;
}
