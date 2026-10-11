// Pure grid maths, shared by the server (which builds one hunt card per cell) and the map (which draws the cell).
export const CELL_DEGREES = 0.25; // about 28 km
export const CELL_ID = /^\d+_\d+$/;

/** Snap a point to its cell, so everyone in the same area shares one hunt card. */
export function cellFor(lat: number, lng: number): { id: string; lat: number; lng: number } {
  const i = Math.floor((lat + 90) / CELL_DEGREES);
  const j = Math.floor((lng + 180) / CELL_DEGREES);
  const centre = (k: number, origin: number) => Math.round((origin + (k + 0.5) * CELL_DEGREES) * 1e4) / 1e4;
  return { id: `${i}_${j}`, lat: centre(i, -90), lng: centre(j, -180) };
}
