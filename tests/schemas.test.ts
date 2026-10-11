import { describe, expect, it } from "vitest";
import { round3 } from "../lib/photo";
import { VerifyBody } from "../lib/schemas";

const jpeg = "data:image/jpeg;base64,AAAA";
const base = { userId: "u", cardId: "142_1007", plantId: "319135", image: jpeg, thumb: jpeg };

describe("coordinates", () => {
  it("rounds to 3 decimals (~110 m)", () => {
    expect(round3(11.016844)).toBe(11.017);
    expect(round3(76.9558)).toBe(76.956);
  });
  it("is re-applied on the server, and missing location becomes null", () => {
    expect(VerifyBody.parse({ ...base, lat: 11.016844, lng: 76.95581 })).toMatchObject({ lat: 11.017, lng: 76.956 });
    expect(VerifyBody.parse(base)).toMatchObject({ lat: null, lng: null });
  });
});

describe("VerifyBody", () => {
  it("rejects non-JPEG data and out-of-range coordinates", () => {
    expect(VerifyBody.safeParse({ ...base, image: "data:image/png;base64,AAAA" }).success).toBe(false);
    expect(VerifyBody.safeParse({ ...base, lat: 123 }).success).toBe(false);
  });
  it("rejects images over ~2 MB", () => {
    expect(VerifyBody.safeParse({ ...base, image: jpeg + "A".repeat(2_800_000) }).success).toBe(false);
  });
  it("rejects a malformed card id, plant id or timezone", () => {
    expect(VerifyBody.safeParse({ ...base, cardId: "../x" }).success).toBe(false);
    expect(VerifyBody.safeParse({ ...base, plantId: "neem" }).success).toBe(false);
    expect(VerifyBody.safeParse({ ...base, tz: "Mars/Olympus" }).success).toBe(false);
    expect(VerifyBody.safeParse({ ...base, tz: "Asia/Kolkata" }).success).toBe(true);
  });
});
