import { z } from "zod";
import type { Store } from "./db";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

/** Wraps a route handler so every failure becomes a typed `{ error }` JSON response. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof z.ZodError) {
        const first = e.issues[0];
        console.warn("[validation]", first?.path.join("."), first?.message);
        const friendly: Record<string, string> = {
          nickname: "Nicknames are 2 to 20 letters, numbers, spaces, dots, dashes or underscores.",
          customName: "Plant names use letters and numbers, 2 to 60 characters.",
          q: "Type at least 2 letters to search.",
        };
        const field = String(first?.path[0] ?? "");
        return json({ error: friendly[field] ?? "That didn't look right. Please check what you entered and try again." }, 400);
      }
      console.error(e);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  };
}

export async function parseBody<T>(req: Request, schema: z.ZodType<T>, maxBytes = 3_000_000): Promise<T> {
  if (Number(req.headers.get("content-length") ?? 0) > maxBytes) throw new HttpError(413, "That photo is too large.");
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new HttpError(400, "Request body must be JSON.");
  }
  return schema.parse(raw);
}

/** The caller's address. Netlify sets x-nf-client-connection-ip at the edge; the others are fallbacks. */
export function clientIp(req: Request): string {
  return (
    req.headers.get("x-nf-client-connection-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown"
  );
}

/** Per-IP fixed-window limit. Throws 429 when exceeded. */
export async function limitIp(store: Store, req: Request, bucket: string, max: number, windowSec: number, message?: string) {
  if ((await store.hit(`${bucket}:${clientIp(req)}`, windowSec)) > max) {
    throw new HttpError(429, message ?? "Too many requests. Please slow down for a moment.");
  }
}

/** One shared budget for every model call, so a bot swarm cannot run up the bill. */
export async function llmBudget(store: Store) {
  const max = Number(process.env.LLM_BUDGET_PER_HOUR) || 400;
  if ((await store.hit("llm:all", 3600)) > max) {
    throw new HttpError(503, "The plant checker is very busy right now. Please try again in a little while.");
  }
}
