// Client-only helpers (except round3, which the server reuses). Re-encoding through a
// canvas drops EXIF, so GPS and device data in the original file never leave the phone.

/** ~110 m precision. Applied on the client before sending and again on the server. */
export const round3 = (n: number) => Math.round(n * 1000) / 1000;

export async function processPhoto(file: File): Promise<{ image: string; thumb: string }> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const draw = (scale: number, quality: number) => {
    const c = document.createElement("canvas");
    c.width = Math.round(bmp.width * Math.min(1, scale));
    c.height = Math.round(bmp.height * Math.min(1, scale));
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    return c.toDataURL("image/jpeg", quality);
  };
  const out = {
    image: draw(1024 / Math.max(bmp.width, bmp.height), 0.8),
    thumb: draw(480 / bmp.width, 0.7),
  };
  bmp.close();
  return out;
}

export function getLocation(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: round3(p.coords.latitude), lng: round3(p.coords.longitude) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  });
}
