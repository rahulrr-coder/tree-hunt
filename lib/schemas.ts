import { z } from "zod";
import { CELL_ID } from "./hunt";
import { round3 } from "./photo";
import { isTz } from "./streak";

const jpeg = (maxChars: number) => z.string().startsWith("data:image/jpeg;base64,").max(maxChars);
const coord = (limit: number) =>
  z.number().finite().min(-limit).max(limit).nullish().transform((v) => (v == null ? null : round3(v)));

export const UserBody = z.object({
  nickname: z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N} _.-]+$/u, "Letters, numbers, spaces, . _ - only"),
});

const tz = z.string().max(64).refine(isTz, "Unknown timezone").optional();

export const HuntBody = z.object({
  userId: z.string().min(1).max(64),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  tz,
});

export const VerifyBody = z.object({
  userId: z.string().min(1).max(64),
  cardId: z.string().regex(CELL_ID),
  plantId: z.string().regex(/^\d{1,10}$/),
  tz,
  image: jpeg(2_800_000), // ~2 MB once decoded
  thumb: jpeg(110_000),
  lat: coord(90),
  lng: coord(180),
});

export const FindsQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(200) });
