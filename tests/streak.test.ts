import { describe, expect, it } from "vitest";
import { applyFind, dayKey, shownStreak } from "../lib/streak";

const s = (currentStreak: number, longestStreak: number, lastFindDay: string | null) => ({ currentStreak, longestStreak, lastFindDay });

describe("applyFind", () => {
  it("starts a streak on the first find", () => {
    expect(applyFind(s(0, 0, null), "2026-10-11")).toEqual(s(1, 1, "2026-10-11"));
  });
  it("ignores a second find on the same day", () => {
    const before = s(3, 5, "2026-10-11");
    expect(applyFind(before, "2026-10-11")).toEqual(before);
  });
  it("extends on consecutive days, across a month boundary", () => {
    expect(applyFind(s(2, 2, "2026-09-30"), "2026-10-01")).toEqual(s(3, 3, "2026-10-01"));
  });
  it("resets after a gap but keeps the longest streak", () => {
    expect(applyFind(s(4, 4, "2026-10-08"), "2026-10-11")).toEqual(s(1, 4, "2026-10-11"));
  });
});

describe("shownStreak", () => {
  it("shows the streak today and yesterday, zero once it lapsed", () => {
    expect(shownStreak(s(3, 3, "2026-10-11"), "2026-10-11")).toBe(3);
    expect(shownStreak(s(3, 3, "2026-10-10"), "2026-10-11")).toBe(3);
    expect(shownStreak(s(3, 3, "2026-10-09"), "2026-10-11")).toBe(0);
    expect(shownStreak(s(0, 0, null), "2026-10-11")).toBe(0);
  });
});

describe("dayKey", () => {
  it("rolls over at Asia/Kolkata midnight, not UTC", () => {
    // 18:29 UTC = 23:59 IST; 18:31 UTC = 00:01 IST next day
    expect(dayKey(new Date("2026-10-11T18:29:00Z"), "Asia/Kolkata")).toBe("2026-10-11");
    expect(dayKey(new Date("2026-10-11T18:31:00Z"), "Asia/Kolkata")).toBe("2026-10-12");
  });
});
