export type VerifyResponse = {
  verdict: "match" | "no_match" | "unsure";
  confidence: number;
  reason: string;
  hint?: string;
  fact?: string;
  streak?: { current: number; longest: number; increased: boolean };
};

/** GET, or POST when `body` is given. Throws an Error carrying the server's friendly message. */
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(
    path,
    body === undefined ? undefined : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
  return data as T;
}
