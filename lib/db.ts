import { randomUUID } from "node:crypto";
import type { StreakState } from "./streak";

// Everything the app needs from storage, as a handful of functions. MongoDB Atlas is the
// real implementation; the in-memory one (no MONGODB_URI) is for local dev and tests only.

export type User = StreakState & { _id: string; nickname: string; createdAt: Date };
export type Find = {
  _id: string; userId: string; nickname: string; cardId: string; plantId: string;
  lat: number | null; lng: number | null; thumb: string;
  confidence: number; verdict: "match"; reason: string; fact: string; createdAt: Date;
};
export type MapFind = Pick<Find, "_id" | "nickname" | "plantId" | "createdAt"> & { lat: number; lng: number };
export type BoardRow = StreakState & { nickname: string; totalFinds: number; uniquePlants: number };
export type Attempt = { userId: string; plantId: string; verdict: string; confidence: number; latencyMs: number; createdAt: Date };

export interface Store {
  createOrGetUser(nickname: string): Promise<User>;
  getUser(id: string): Promise<User | null>;
  setStreak(id: string, s: StreakState): Promise<void>;
  addFind(f: Omit<Find, "_id" | "createdAt">): Promise<string>;
  /** Latest find id per plant for one user (used for the user's own tile thumbnails). */
  foundByUser(userId: string): Promise<Record<string, string>>;
  mapFinds(limit: number): Promise<MapFind[]>;
  thumb(findId: string): Promise<string | null>;
  leaderboard(limit: number): Promise<BoardRow[]>;
  attemptsSince(userId: string, since: Date): Promise<number>;
  logAttempt(a: Omit<Attempt, "createdAt">): Promise<void>;
}

const fresh = (nickname: string): User => ({
  _id: randomUUID(), nickname, createdAt: new Date(), currentStreak: 0, longestStreak: 0, lastFindDay: null,
});
const streakOf = (u: User): StreakState => ({ currentStreak: u.currentStreak, longestStreak: u.longestStreak, lastFindDay: u.lastFindDay });

function memoryStore(): Store {
  const users = new Map<string, User>();
  const finds: Find[] = [];
  const attempts: Attempt[] = [];
  const board = (limit: number): BoardRow[] => {
    const by = new Map<string, Find[]>();
    for (const f of finds) by.set(f.userId, [...(by.get(f.userId) ?? []), f]);
    return [...by.entries()]
      .map(([id, fs]) => ({ ...streakOf(users.get(id)!), nickname: users.get(id)!.nickname, totalFinds: fs.length, uniquePlants: new Set(fs.map((f) => f.plantId)).size }))
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
    async setStreak(id, s) {
      Object.assign(users.get(id)!, s);
    },
    async addFind(f) {
      const doc = { ...f, _id: randomUUID(), createdAt: new Date() };
      finds.push(doc);
      return doc._id;
    },
    async foundByUser(userId) {
      const out: Record<string, string> = {};
      for (const f of finds) if (f.userId === userId) out[f.plantId] = f._id; // later finds overwrite earlier
      return out;
    },
    async mapFinds(limit) {
      return finds
        .filter((f): f is Find & { lat: number; lng: number } => f.lat !== null && f.lng !== null)
        .slice(-limit).reverse()
        .map(({ _id, nickname, plantId, createdAt, lat, lng }) => ({ _id, nickname, plantId, createdAt, lat, lng }));
    },
    thumb: async (id) => finds.find((f) => f._id === id)?.thumb ?? null,
    leaderboard: async (limit) => board(limit),
    attemptsSince: async (userId, since) => attempts.filter((a) => a.userId === userId && a.createdAt >= since).length,
    async logAttempt(a) {
      attempts.push({ ...a, createdAt: new Date() });
    },
  };
}

async function mongoStore(uri: string, dbName: string): Promise<Store> {
  const { MongoClient } = await import("mongodb");
  const db = (await new MongoClient(uri).connect()).db(dbName);
  const users = db.collection<User>("users");
  const finds = db.collection<Find>("finds");
  const log = db.collection<Attempt>("verify_log");
  const ci = { locale: "en", strength: 2 } as const; // case-insensitive nicknames
  await Promise.all([
    users.createIndex({ nickname: 1 }, { unique: true, collation: ci }),
    finds.createIndex({ createdAt: -1 }),
    finds.createIndex({ userId: 1 }),
    log.createIndex({ userId: 1, createdAt: 1 }),
    log.createIndex({ createdAt: 1 }, { expireAfterSeconds: 7 * 86400 }), // keep the log from growing forever
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
    async setStreak(id, s) {
      await users.updateOne({ _id: id }, { $set: s });
    },
    async addFind(f) {
      const doc = { ...f, _id: randomUUID(), createdAt: new Date() };
      await finds.insertOne(doc);
      return doc._id;
    },
    async foundByUser(userId) {
      const rows = await finds.aggregate<{ _id: string; id: string }>([
        { $match: { userId } }, { $sort: { createdAt: 1 } }, { $group: { _id: "$plantId", id: { $last: "$_id" } } },
      ]).toArray();
      return Object.fromEntries(rows.map((r) => [r._id, r.id]));
    },
    async mapFinds(limit) {
      return (await finds
        .find({ lat: { $ne: null }, lng: { $ne: null } }, { projection: { nickname: 1, plantId: 1, createdAt: 1, lat: 1, lng: 1 } })
        .sort({ createdAt: -1 }).limit(limit).toArray()) as MapFind[];
    },
    async thumb(id) {
      return (await finds.findOne({ _id: id }, { projection: { thumb: 1 } }))?.thumb ?? null;
    },
    async leaderboard(limit) {
      const rows = await finds.aggregate<{ _id: string; nickname: string; totalFinds: number; plants: string[] }>([
        { $group: { _id: "$userId", nickname: { $first: "$nickname" }, totalFinds: { $sum: 1 }, plants: { $addToSet: "$plantId" } } },
        { $addFields: { uniquePlants: { $size: "$plants" } } },
        { $sort: { uniquePlants: -1, totalFinds: -1, nickname: 1 } },
        { $limit: limit },
      ]).toArray();
      const owners = await users.find({ _id: { $in: rows.map((r) => r._id) } }).toArray();
      const byId = new Map(owners.map((u) => [u._id, u]));
      return rows.map((r) => ({
        ...streakOf(byId.get(r._id)!), nickname: r.nickname, totalFinds: r.totalFinds, uniquePlants: r.plants.length,
      }));
    },
    attemptsSince: (userId, since) => log.countDocuments({ userId, createdAt: { $gte: since } }),
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
    if (!uri && process.env.NODE_ENV === "production") throw new Error("MONGODB_URI is required in production.");
    if (!uri) console.warn("[treehunt] MONGODB_URI not set: using the in-memory store (data resets on restart).");
    g.__treehunt = uri ? mongoStore(uri, process.env.MONGODB_DB || "treehunt") : Promise.resolve(memoryStore());
    g.__treehunt.catch(() => delete g.__treehunt); // let the next request retry a failed connect
  }
  return g.__treehunt;
}
