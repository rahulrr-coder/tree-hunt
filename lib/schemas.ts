import { z } from "zod";
import { round3 } from "./photo";

const jpeg = (maxChars: number) => z.string().startsWith("data:image/jpeg;base64,").max(maxChars);
const coord = (limit: number) =>
  z.number().finite().min(-limit).max(limit).nullish().transform((v) => (v == null ? null : round3(v)));

export const UserBody = z.object({
  nickname: z.string().trim().min(2).max(20).regex(/^[\p{L}\p{N} _.-]+$/u, "Letters, numbers, spaces, . _ - only"),
});

export const VerifyBody = z.object({
  userId: z.string().min(1).max(64),
  plantId: z.string().min(1).max(40),
  image: jpeg(2_800_000), // ~2 MB once decoded
  thumb: jpeg(110_000),
  lat: coord(90),
  lng: coord(180),
});

export const FindsQuery = z.object({ limit: z.coerce.number().int().min(1).max(200).default(200) });
