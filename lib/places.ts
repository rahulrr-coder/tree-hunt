// Client helpers for choosing where to hunt. Positions are rounded to ~1 km: a hunt card needs no more.
import type { Place } from "./api";

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Browser GPS. Rejects with a message that tells the player what to do next. */
export function locateMe(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      return reject(new Error("This browser can't share its location. Search for your town instead."));
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ name: "Your location", lat: round2(p.coords.latitude), lng: round2(p.coords.longitude) }),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? "Location is blocked for this site. Allow it in your browser's site settings, or search for your town."
              : e.code === 3
                ? "Finding you took too long. Try again, or search for your town."
                : "Couldn't work out where you are (common on desktop computers). Search for your town instead.",
          ),
        ),
      { timeout: 12_000, maximumAge: 600_000 },
    );
  });
}

export async function searchPlaces(q: string, signal?: AbortSignal): Promise<Place[]> {
  const res = await fetch(`/api/places?q=${encodeURIComponent(q)}`, { signal });
  const data = (await res.json()) as { places?: Place[] };
  return (data.places ?? []).map((p) => ({ ...p, lat: round2(p.lat), lng: round2(p.lng) }));
}

/** Rough position from the player's network (city level), offered only after GPS has failed. */
export async function approxPlace(): Promise<Place | null> {
  try {
    const res = await fetch("/api/where");
    return ((await res.json()) as { place: Place | null }).place;
  } catch {
    return null;
  }
}

/** Turn a GPS fix into a place name the player can recognise and confirm. */
export async function nameFor(p: Place): Promise<string> {
  try {
    const res = await fetch("/api/where", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ lat: p.lat, lng: p.lng }),
    });
    const { name } = (await res.json()) as { name?: string };
    return name && name !== "Your area" ? name : p.name;
  } catch {
    return p.name;
  }
}
