import { randomUUID } from "node:crypto";
import type { FindKind } from "./categories";
import type { HuntCard } from "./hunt";
import { HttpError } from "./http";
import type { StreakState } from "./streak";

// Everything the app needs from storage, as a handful of functions. MongoDB Atlas is the
// real implementation; the in-memory one (no MONGODB_URI) is for local dev and tests only.

export type User = StreakState & { _id: string; nickname: string; createdAt: Date; tz?: string };
export type Find = {
  _id: string; userId: string; nickname: string; cardId: string; plantId: string; plantName: string; kind: FindKind;
  lat: number | null; lng: number | null; thumb: string;
  confidence: number; verdict: "match"; reason: string; fact: string; createdAt: Date;
};
export type MapFind = Pick<Find, "_id" | "nickname" | "plantId" | "plantName" | "kind" | "createdAt"> & { lat: number; lng: number };
export type BoardRow = StreakState & { nickname: string; totalFinds: number; uniquePlants: number; tz?: string };
export type FoundRow = { plantId: string; plantName: string; findId: string };
export type Attempt = { userId: string; plantId: string; verdict: string; confidence: number; latencyMs: number; createdAt: Date };

export interface Store {
  createOrGetUser(nickname: string): Promise<User>;
  getUser(id: string): Promise<User | null>;
  setStreak(id: string, s: StreakState, tz?: string): Promise<void>;
  getCard(id: string): Promise<HuntCard | null>;
  /** First writer wins, so everyone in a cell shares one card. Returns the stored card. */
  saveCard(card: HuntCard): Promise<HuntCard>;
  addFind(f: Omit<Find, "_id" | "createdAt">): Promise<string>;
  /** Optimistic update: succeeds only if the stored card is still at `expectedRev`. Null means someone else got there first. */
  updateCard(card: HuntCard, expectedRev: number): Promise<HuntCard | null>;
  /** Latest find per plant for one user (their own thumbnails, and any plants they added themselves). */
  foundByUser(userId: string): Promise<FoundRow[]>;
  /** Fixed-window counter for rate limiting. Returns how many hits `key` has made in the current window. */
  hit(key: string, windowSec: number): Promise<number>;
  mapFinds(limit: number, kinds?: FindKind[] | null): Promise<MapFind[]>;
  thumb(findId: string): Promise<string | null>;
  /** Ranked by different plants (plants the player named themselves count up to CUSTOM_CAP), then total finds. */
  leaderboard(limit: number, kinds?: FindKind[] | null): Promise<BoardRow[]>;
  attemptsSince(userId: string, since: Date, verdict?: string): Promise<number>;
  logAttempt(a: Omit<Attempt, "createdAt">): Promise<void>;
}

/** A player can add many plants by name; only this many of them count towards the board. */
export const CUSTOM_CAP = 5;
const isCustom = (plantId: string) => plantId.startsWith("custom-");
const fresh = (nickname: string): User => ({
  _id: randomUUID(), nickname, createdAt: new Date(), currentStreak: 0, longestStreak: 0, lastFindDay: null,
});
const streakOf = (u: User): StreakState => ({ currentStreak: u.currentStreak, longestStreak: u.longestStreak, lastFindDay: u.lastFindDay });

function uniqueCapped(plantIds: string[]): number {
  const all = new Set(plantIds);
  const custom = [...all].filter(isCustom).length;
  return all.size - custom + Math.min(custom, CUSTOM_CAP);
}

function memoryStore(): Store {
  const users = new Map<string, User>();
  const finds: Find[] = [];
  const attempts: Attempt[] = [];
  const cards = new Map<string, HuntCard>();
  const counters = new Map<string, number>();
  const board = (limit: number, kinds?: FindKind[] | null): BoardRow[] => {
    const by = new Map<string, Find[]>();
    for (const f of finds) {
      if (kinds && !kinds.includes(f.kind ?? "other")) continue;
      by.set(f.userId, [...(by.get(f.userId) ?? []), f]);
    }
    return [...by.entries()]
      .map(([id, fs]) => ({ ...streakOf(users.get(id)!), tz: users.get(id)!.tz, nickname: users.get(id)!.nickname, totalFinds: fs.length, uniquePlants: uniqueCapped(fs.map((f) => f.plantId)) }))
      .sort((a, b) => b.uniquePlants - a.uniquePlants || b.totalFinds - a.totalFinds || a.nickname.localeCompare(b.nickname))
      .slice(0, limit);
  };
  return {
    async createOrGetUser(nickname) {
      const hit = [...users.values()].find((u) => u.nickname.toLowerCase() === nickname.toLowerCase());
      if (hit) return hit;
      const u = fresh(nickname);
      users.set(u._id, u);
      return u;
    },
    getUser: async (id) => users.get(id) ?? null,
    async setStreak(id, s, tz) {
      Object.assign(users.get(id)!, s, tz && { tz });
    },
    getCard: async (id) => cards.get(id) ?? null,
    async saveCard(card) {
      if (!cards.has(card.id)) cards.set(card.id, card);
      return cards.get(card.id)!;
    },
    async updateCard(card, expectedRev) {
      if ((cards.get(card.id)?.rev ?? 0) !== expectedRev) return null;
      cards.set(card.id, card);
      return card;
    },
    async hit(key, windowSec) {
      const k = `${key}:${Math.floor(Date.now() / (windowSec * 1000))}`;
      counters.set(k, (counters.get(k) ?? 0) + 1);
      return counters.get(k)!;
    },
    async addFind(f) {
      const doc = { ...f, _id: randomUUID(), createdAt: new Date() };
      finds.push(doc);
      return doc._id;
    },
    async foundByUser(userId) {
      const out = new Map<string, FoundRow>();
      for (const f of finds) if (f.userId === userId) out.set(f.plantId, { plantId: f.plantId, plantName: f.plantName, findId: f._id });
      return [...out.values()]; // later finds overwrite earlier
    },
    async mapFinds(limit, kinds) {
      return finds
        .filter((f): f is Find & { lat: number; lng: number } => f.lat !== null && f.lng !== null)
        .filter((f) => !kinds || kinds.includes(f.kind ?? "other"))
        .slice(-limit).reverse()
        .map(({ _id, nickname, plantId, plantName, kind, createdAt, lat, lng }) => ({ _id, nickname, plantId, plantName, kind: kind ?? "other", createdAt, lat, lng }));
    },
    thumb: async (id) => finds.find((f) => f._id === id)?.thumb ?? null,
    leaderboard: async (limit, kinds) => board(limit, kinds),
    attemptsSince: async (userId, since, verdict) =>
      attempts.filter((a) => a.userId === userId && a.createdAt >= since && (!verdict || a.verdict === verdict)).length,
    async logAttempt(a) {
      attempts.push({ ...a, createdAt: new Date() });
    },
  };
}

async function mongoStore(uri: string, dbName: string): Promise<Store> {
  const { MongoClient } = await import("mongodb");
  // Small pool: every serverless instance opens its own, and Atlas free tier caps connections.
  const db = (await new MongoClient(uri, { maxPoolSize: 5 }).connect()).db(dbName);
  const users = db.collection<User>("users");
  const finds = db.collection<Find>("finds");
  const log = db.collection<Attempt>("verify_log");
  const cards = db.collection<HuntCard & { _id: string }>("hunt_cards");
  const limits = db.collection<{ _id: string; n: number; expireAt: Date }>("rate_limits");
  const ci = { locale: "en", strength: 2 } as const; // case-insensitive nicknames
  await Promise.all([
    users.createIndex({ nickname: 1 }, { unique: true, collation: ci }),
    finds.createIndex({ createdAt: -1 }),
    finds.createIndex({ userId: 1 }),
    log.createIndex({ userId: 1, createdAt: 1 }),
    log.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 86400 }), // keep the log from growing forever
    limits.createIndex({ expireAt: 1 }, { expireAfterSeconds: 0 }),
  ]);
  return {
    async createOrGetUser(nickname) {
      const { nickname: _, ...rest } = fresh(nickname); // nickname comes from the filter on insert
      const u = await users.findOneAndUpdate(
        { nickname },
        { $setOnInsert: rest },
        { upsert: true, returnDocument: "after", collation: ci },
      );
      return u!;
    },
    getUser: (id) => users.findOne({ _id: id }),
    async setStreak(id, s, tz) {
      await users.updateOne({ _id: id }, { $set: { ...s, ...(tz && { tz }) } });
    },
    async getCard(id) {
      const doc = await cards.findOne({ _id: id });
      if (!doc) return null;
      const { _id, ...card } = doc;
      return card;
    },
    async saveCard(card) {
      const doc = await cards.findOneAndUpdate(
        { _id: card.id },
        { $setOnInsert: card },
        { upsert: true, returnDocument: "after" },
      );
      const { _id, ...stored } = doc!;
      return stored;
    },
    async updateCard(card, expectedRev) {
      const doc = await cards.findOneAndUpdate(
        { _id: card.id, $or: [{ rev: expectedRev }, ...(expectedRev === 0 ? [{ rev: { $exists: false } }] : [])] },
        { $set: card },
        { returnDocument: "after" },
      );
      if (!doc) return null;
      const { _id, ...stored } = doc;
      return stored;
    },
    async hit(key, windowSec) {
      const window = Math.floor(Date.now() / (windowSec * 1000));
      const doc = await limits.findOneAndUpdate(
        { _id: `${key}:${window}` },
        { $inc: { n: 1 }, $setOnInsert: { expireAt: new Date((window + 2) * windowSec * 1000) } },
        { upsert: true, returnDocument: "after" },
      );
      return doc!.n;
    },
    async addFind(f) {
      const doc = { ...f, _id: randomUUID(), createdAt: new Date() };
      await finds.insertOne(doc);
      return doc._id;
    },
    async foundByUser(userId) {
      const rows = await finds.aggregate<{ _id: string; id: string; name: string }>([
        { $match: { userId } }, { $sort: { createdAt: 1 } },
        { $group: { _id: "$plantId", id: { $last: "$_id" }, name: { $last: "$plantName" } } },
      ]).toArray();
      return rows.map((r) => ({ plantId: r._id, plantName: r.name, findId: r.id }));
    },
    async mapFinds(limit, kinds) {
      const rows = await finds
        .find(
          { lat: { $ne: null }, lng: { $ne: null }, ...(kinds && { kind: { $in: kinds } }) },
          { projection: { nickname: 1, plantId: 1, plantName: 1, kind: 1, createdAt: 1, lat: 1, lng: 1 } },
        )
        .sort({ createdAt: -1 }).limit(limit).toArray();
      return rows.map((r) => ({ ...r, kind: r.kind ?? "other" })) as MapFind[];
    },
    async thumb(id) {
      return (await finds.findOne({ _id: id }, { projection: { thumb: 1 } }))?.thumb ?? null;
    },
    async leaderboard(limit, kinds) {
      const rows = await finds.aggregate<{ _id: string; nickname: string; totalFinds: number; uniquePlants: number }>([
        ...(kinds ? [{ $match: { kind: { $in: kinds } } }] : []),
        { $group: { _id: "$userId", nickname: { $first: "$nickname" }, totalFinds: { $sum: 1 }, plants: { $addToSet: "$plantId" } } },
        {
          $addFields: {
            custom: {
              $size: { $filter: { input: "$plants", cond: { $regexMatch: { input: "$$this", regex: "^custom-" } } } },
            },
          },
        },
        {
          $addFields: {
            uniquePlants: { $add: [{ $subtract: [{ $size: "$plants" }, "$custom"] }, { $min: ["$custom", CUSTOM_CAP] }] },
          },
        },
        { $sort: { uniquePlants: -1, totalFinds: -1, nickname: 1 } },
        { $limit: limit },
      ]).toArray();
      const owners = await users.find({ _id: { $in: rows.map((r) => r._id) } }).toArray();
      const byId = new Map(owners.map((u) => [u._id, u]));
      return rows.map((r) => ({
        ...streakOf(byId.get(r._id)!), tz: byId.get(r._id)!.tz, nickname: r.nickname, totalFinds: r.totalFinds, uniquePlants: r.uniquePlants,
      }));
    },
    attemptsSince: (userId, since, verdict) =>
      log.countDocuments({ userId, createdAt: { $gte: since }, ...(verdict && { verdict }) }),
    async logAttempt(a) {
      await log.insertOne({ ...a, createdAt: new Date() });
    },
  };
}

const g = globalThis as { __treehunt?: Promise<Store> };

/** One store per process (survives dev hot-reloads). */
export function getStore(): Promise<Store> {
  if (!g.__treehunt) {
    const uri = process.env.MONGODB_URI;
    if (!uri && process.env.NODE_ENV === "production") throw new HttpError(503, "The hunt database is not connected yet. Please try again soon.");
    if (!uri) console.warn("[treehunt] MONGODB_URI not set: using the in-memory store (data resets on restart).");
    g.__treehunt = uri ? mongoStore(uri, process.env.MONGODB_DB || "treehunt") : Promise.resolve(memoryStore());
    g.__treehunt.catch(() => delete g.__treehunt); // let the next request retry a failed connect
  }
  return g.__treehunt;
}
