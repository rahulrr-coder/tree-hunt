"use client";
import { useEffect, useRef, useState } from "react";
import { api, browserTz, type VerifyResponse } from "@/lib/api";
import type { Plant } from "@/lib/hunt";
import { getLocation, processPhoto } from "@/lib/photo";

type Stage =
  | { name: "detail" }
  | { name: "checking"; photo: string }
  | { name: "result"; photo: string; res: VerifyResponse }
  | { name: "error"; photo: string; message: string };

type Props = {
  /** A plant from the hunt card, or null to add a plant the player names themselves. */
  plant: Plant | null;
  cardId: string;
  userId: string;
  found: boolean;
  /** Open the camera straight away (the shortcut on a tile). */
  autoSnap?: boolean;
  onClose: () => void;
  onVerified: () => void;
};

const sleep = (ms: number) => new Promise<null>((r) => setTimeout(() => r(null), ms));

// Tell the player about missing location once, not on every photo.
function firstTime(key: string): boolean {
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch {}
  return true;
}

function Stamp() {
  return (
    <div className="stamp rounded-md border-[6px] border-double border-leaf bg-card/90 px-4 py-1 font-serif text-3xl font-black uppercase tracking-widest text-leaf shadow-lg">
      Verified
    </div>
  );
}

const NAME_OK = /^[\p{L}\p{N} '’().,-]{2,60}$/u;

export function PlantSheet({ plant, cardId, userId, found, autoSnap, onClose, onVerified }: Props) {
  const [stage, setStage] = useState<Stage>({ name: "detail" });
  const [noLocation, setNoLocation] = useState(false);
  const [typed, setTyped] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const location = useRef<ReturnType<typeof getLocation>>(Promise.resolve(null));
  const custom = plant === null;
  const customName = typed.trim();
  const canSnap = !custom || NAME_OK.test(customName);

  function snap() {
    if (!canSnap) return;
    location.current = getLocation(); // start the GPS fix while the camera is open
    input.current?.click();
  }

  useEffect(() => {
    if (autoSnap && !custom) snap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow retaking the same file name
    if (!file) return;
    let photo = "";
    try {
      const out = await processPhoto(file);
      photo = out.thumb;
      setStage({ name: "checking", photo });
      const pos = await Promise.race([location.current, sleep(4000)]);
      if (!pos && firstTime("treehunt:no-location-told")) setNoLocation(true);
      const res = await api<VerifyResponse>("/api/verify", {
        userId, cardId, tz: browserTz(), image: out.image, thumb: out.thumb, lat: pos?.lat, lng: pos?.lng,
        ...(custom ? { plantId: "custom", customName } : { plantId: plant.id }),
      });
      if (res.verdict === "match") {
        navigator.vibrate?.(30);
        onVerified();
      }
      setStage({ name: "result", photo, res });
    } catch (err) {
      setStage({ name: "error", photo, message: (err as Error).message });
    }
  }

  const title = custom ? "Add a plant" : plant.name;
  const photo = stage.name === "detail" ? null : stage.photo;
  const miss = stage.name === "result" && stage.res.verdict !== "match";
  const said = custom ? customName : plant.name;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-3xl font-semibold capitalize leading-tight">{title}</h2>
            {custom ? (
              <p className="mt-1 text-muted">Not on the list? Name it and snap it.</p>
            ) : (
              <>
                {plant.local?.map((l) => (
                  <p key={l.code} lang={l.code} className="text-lg font-medium text-leaf-deep">
                    {l.name} <span className="text-xs font-normal text-muted">{l.label}</span>
                  </p>
                ))}
                <p className="font-serif italic text-muted">{plant.scientific}</p>
              </>
            )}
          </div>
          <button onClick={onClose} className="h-11 shrink-0 rounded-full border border-line px-4 text-sm font-semibold">
            Close
          </button>
        </div>

        {photo && (
          <div className={`mt-4 grid gap-2 ${custom ? "" : "grid-cols-2"}`}>
            <figure className="relative overflow-hidden rounded-2xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo} alt="Your photo" className="aspect-[4/3] w-full object-cover" />
              {stage.name === "checking" && <div className="pulse-veil absolute inset-0 bg-leaf" />}
              {stage.name === "result" && stage.res.verdict === "match" && (
                <div className="absolute inset-0 grid place-items-center"><Stamp /></div>
              )}
              {!custom && <figcaption className="absolute bottom-1.5 left-1.5 rounded bg-card/90 px-1.5 py-0.5 text-[11px] font-semibold">Yours</figcaption>}
            </figure>
            {!custom && (
              <figure className="relative overflow-hidden rounded-2xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={plant.photo.url} alt={`Sample photo of ${plant.name}`} className="aspect-[4/3] w-full object-cover" />
                <figcaption className="absolute bottom-1.5 left-1.5 rounded bg-card/90 px-1.5 py-0.5 text-[11px] font-semibold">Sample</figcaption>
              </figure>
            )}
          </div>
        )}

        <input ref={input} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />

        {stage.name === "detail" && (
          <>
            {custom ? (
              <label className="mt-5 block">
                <span className="text-sm font-medium text-muted">What is it called?</span>
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  maxLength={60}
                  autoComplete="off"
                  placeholder="Common or scientific name"
                  className="mt-1 block h-12 w-full rounded-2xl border border-line bg-card px-4 text-lg outline-none focus:border-leaf focus:ring-2 focus:ring-leaf/30"
                />
                <span className="mt-2 block text-sm text-muted">
                  The checker looks at your photo and confirms it really shows this plant before it is added to your finds.
                </span>
              </label>
            ) : (
              <>
                <figure className="mt-4 overflow-hidden rounded-2xl border border-line">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={plant.photo.url} alt={`Sample photo of ${plant.name}`} className="aspect-[4/3] w-full object-cover" />
                  <figcaption className="flex items-center justify-between gap-2 bg-paper px-3 py-1.5 text-[11px] leading-tight text-muted">
                    <span className="truncate">{plant.photo.credit}</span>
                    <a href={plant.taxonUrl} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-leaf underline">
                      iNaturalist
                    </a>
                  </figcaption>
                </figure>
                <p className="mt-5 text-xl leading-snug">{plant.clue}</p>
                {plant.lookalikes && <p className="mt-3 text-sm text-muted">Don&rsquo;t confuse with: {plant.lookalikes}</p>}
                {found && <p className="mt-3 text-sm font-semibold text-leaf">You&rsquo;ve found this one. Another snap still keeps your streak going.</p>}
              </>
            )}
            <button
              onClick={snap}
              disabled={!canSnap}
              className="mt-6 h-14 w-full rounded-2xl bg-leaf text-lg font-semibold text-white active:bg-leaf-deep disabled:opacity-40"
            >
              Snap it
            </button>
          </>
        )}

        {stage.name === "checking" && (
          <p role="status" className="mt-5 text-center text-lg font-medium">Analysing your photo…</p>
        )}

        {stage.name === "result" && stage.res.verdict === "match" && (
          <>
            {custom && <p className="mt-5 font-serif text-xl font-semibold">Added to your finds: {said}</p>}
            {stage.res.fact && <p className="mt-3 text-lg leading-snug">{stage.res.fact}</p>}
            {stage.res.streak?.increased && (
              <p className="mt-4 inline-block rounded-full bg-marigold px-3 py-1.5 font-semibold text-ink">
                +1 streak &middot; {stage.res.streak.current} day{stage.res.streak.current === 1 ? "" : "s"}
              </p>
            )}
            <button onClick={onClose} className="mt-6 h-14 w-full rounded-2xl bg-leaf text-lg font-semibold text-white active:bg-leaf-deep">
              Back to the hunt
            </button>
          </>
        )}

        {(miss || stage.name === "error") && (
          <>
            <div role="alert" className="mt-5 rounded-2xl border border-clay/40 bg-clay/10 p-4 text-clay">
              {stage.name === "error" ? (
                <p className="font-medium">{stage.message}</p>
              ) : (
                <>
                  <p className="font-semibold">
                    {stage.res.verdict === "unsure" ? "Not quite sure yet" : `That doesn’t look like ${said}`}
                  </p>
                  {stage.res.reason && <p className="mt-1">{stage.res.reason}</p>}
                  {stage.res.hint && <p className="mt-2 font-medium">Try this: {stage.res.hint}</p>}
                </>
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={snap} className="h-14 rounded-2xl bg-leaf font-semibold text-white active:bg-leaf-deep">
                Retake
              </button>
              <button onClick={() => setStage({ name: "detail" })} className="h-14 rounded-2xl border border-line font-semibold">
                Back
              </button>
            </div>
          </>
        )}

        {noLocation && stage.name !== "detail" && (
          <p className="mt-4 text-sm text-muted">Location is off, so this find won&rsquo;t appear on the map. Everything else still works.</p>
        )}
      </div>
    </div>
  );
}
