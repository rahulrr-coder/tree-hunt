import { beforeEach, describe, expect, it, vi } from "vitest";
import { colorOfKind, groupOf, kindsFor } from "../lib/categories";

describe("categories", () => {
  it("groups climbers with herbs and unknown kinds under other", () => {
    expect(groupOf("tree")).toBe("tree");
    expect(groupOf("climber")).toBe("herb");
    expect(groupOf("herb")).toBe("herb");
    expect(groupOf(undefined)).toBe("other");
  });
  it("maps a filter to stored kinds for database queries", () => {
    expect(kindsFor("all")).toBeNull();
    expect(kindsFor("herb")).toEqual(["herb", "climber"]);
    expect(colorOfKind("climber")).toBe(colorOfKind("herb"));
  });
});

describe("memory store: board filters and custom-plant cap", () => {
  beforeEach(() => {
    delete (globalThis as { __treehunt?: unknown }).__treehunt;
    vi.stubEnv("MONGODB_URI", "");
  });

  async function setup() {
    const { getStore } = await import("../lib/db");
    const store = await getStore();
    const user = await store.createOrGetUser("Cap Tester");
    const base = { userId: user._id, nickname: user.nickname, cardId: "1_1", verdict: "match" as const, reason: "", fact: "", confidence: 0.9, lat: 1, lng: 2, thumb: "t" };
    return { store, user, base };
  }

  it("counts at most CUSTOM_CAP of the plants a player named themselves", async () => {
    const { store, base } = await setup();
    await store.addFind({ ...base, plantId: "319135", plantName: "Neem", kind: "tree" });
    for (let i = 0; i < 9; i++) await store.addFind({ ...base, plantId: `custom-rose-${i}`, plantName: `Rose ${i}`, kind: "shrub" });
    const [row] = await store.leaderboard(20);
    expect(row.totalFinds).toBe(10);
    expect(row.uniquePlants).toBe(1 + 5); // 1 listed plant + custom capped at 5
  });

  it("filters the board and the map by kind", async () => {
    const { store, base } = await setup();
    await store.addFind({ ...base, plantId: "1", plantName: "A tree", kind: "tree" });
    await store.addFind({ ...base, plantId: "2", plantName: "A vine", kind: "climber" });
    expect((await store.leaderboard(20, ["tree"]))[0].totalFinds).toBe(1);
    expect((await store.leaderboard(20, ["herb", "climber"]))[0].totalFinds).toBe(1);
    expect(await store.leaderboard(20, ["shrub"])).toEqual([]);
    expect((await store.mapFinds(10, ["climber"])).map((f) => f.plantName)).toEqual(["A vine"]);
    expect(await store.mapFinds(10)).toHaveLength(2);
  });

  it("rate-limit counter increments within a window", async () => {
    const { store } = await setup();
    expect(await store.hit("t:1", 60)).toBe(1);
    expect(await store.hit("t:1", 60)).toBe(2);
    expect(await store.hit("t:2", 60)).toBe(1);
  });
});
