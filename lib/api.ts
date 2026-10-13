export type VerifyResponse = {
  verdict: "match" | "no_match" | "unsure";
  confidence: number;
  reason: string;
  hint?: string;
  fact?: string;
  streak?: { current: number; longest: number; increased: boolean };
};

export type IdentifyResponse = { plants: import("./identify").IdentifiedPlant[]; note: string };

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

/** GET, or POST when `body` is given. Throws an ApiError carrying the server's friendly message. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    path,
    body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? "Something went wrong. Please try again.", res.status);
  return data as T;
}

export type Place = { name: string; lat: number; lng: number };
export type HuntState = {
  card: import("./hunt").PublicCard;
  canLoadMore: boolean;
  found: Record<string, string>; // plantId -> findId
  extras: { plantId: string; plantName: string; findId: string }[]; // plants the player added by name
  streak: { current: number; longest: number };
};
export const browserTz = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
