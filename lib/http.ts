import { z } from "zod";

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
      if (e instanceof z.ZodError) return json({ error: `Invalid request: ${e.issues[0]?.path.join(".") || "body"} ${e.issues[0]?.message}` }, 400);
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
