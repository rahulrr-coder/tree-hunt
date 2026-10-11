"use client";
import { Camera, Check, ExternalLink, Flame, RotateCcw, X } from "lucide-react";
import { useRef, useState } from "react";
import { api, type VerifyResponse } from "@/lib/api";
import type { Plant } from "@/lib/hunt";
import { getLocation, processPhoto } from "@/lib/photo";
import { browserTz } from "@/lib/api";

type Stage =
  | { name: "detail" }
  | { name: "checking"; photo: string }
  | { name: "result"; photo: string; res: VerifyResponse }
  | { name: "error"; photo: string; message: string };

type Props = { plant: Plant; cardId: string; userId: string; found: boolean; onClose: () => void; onVerified: () => void };

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
    <div className="stamp rounded-md border-[6px] border-double border-leaf bg-card/90 px-4 py-1 shadow-lg font-serif text-3xl font-black uppercase tracking-widest text-leaf">
      Verified
    </div>
  );
}

export function PlantSheet({ plant, cardId, userId, found, onClose, onVerified }: Props) {
  const [stage, setStage] = useState<Stage>({ name: "detail" });
  const [noLocation, setNoLocation] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const location = useRef<ReturnType<typeof getLocation>>(Promise.resolve(null));

  function snap() {
    location.current = getLocation(); // start the GPS fix while the camera is open
    input.current?.click();
  }

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
        userId, cardId, plantId: plant.id, tz: browserTz(), image: out.image, thumb: out.thumb, lat: pos?.lat, lng: pos?.lng,
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

  const photo = stage.name === "detail" ? null : stage.photo;
  const miss = stage.name === "result" && stage.res.verdict !== "match";

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={plant.name}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5 pb-20"
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-serif text-3xl font-semibold capitalize">{plant.name}</h2>
            <p className="font-serif italic text-muted">{plant.scientific}</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="grid size-11 shrink-0 place-items-center rounded-full border border-line">
            <X size={20} />
          </button>
        </div>

        {photo && (
          <div className="relative mt-4 overflow-hidden rounded-2xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo} alt="Your photo" className="aspect-[4/3] w-full object-cover" />
            {stage.name === "checking" && <div className="pulse-veil absolute inset-0 bg-leaf" />}
            {stage.name === "result" && stage.res.verdict === "match" && (
              <div className="absolute inset-0 grid place-items-center"><Stamp /></div>
            )}
          </div>
        )}

        <input ref={input} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />

        {stage.name === "detail" && (
          <>
            <figure className="mt-4 overflow-hidden rounded-2xl border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={plant.photo.url} alt={`Sample photo of ${plant.name}`} className="aspect-[4/3] w-full object-cover" />
              <figcaption className="flex items-center justify-between gap-2 bg-paper px-3 py-1.5 text-[11px] leading-tight text-muted">
                <span className="truncate">{plant.photo.credit}</span>
                <a href={plant.taxonUrl} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center gap-0.5 font-medium text-leaf">
                  iNaturalist <ExternalLink size={11} aria-hidden />
                </a>
              </figcaption>
            </figure>
            <p className="mt-5 text-xl leading-snug">{plant.clue}</p>
            {plant.lookalikes && <p className="mt-3 text-sm text-muted">Don&rsquo;t confuse with: {plant.lookalikes}</p>}
            {found && (
              <p className="mt-3 flex items-center gap-1.5 text-sm font-medium text-leaf">
                <Check size={16} /> You&rsquo;ve found this one. Another snap still keeps your streak going.
              </p>
            )}
            <button onClick={snap} className="mt-6 flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-leaf text-lg font-semibold text-white active:bg-leaf-deep">
              <Camera size={22} /> Snap it
            </button>
          </>
        )}

        {stage.name === "checking" && (
          <p role="status" className="mt-5 text-center text-lg font-medium">
            Analysing your photo…
          </p>
        )}

        {stage.name === "result" && stage.res.verdict === "match" && (
          <>
            {stage.res.fact && <p className="mt-5 text-lg leading-snug">{stage.res.fact}</p>}
            {stage.res.streak?.increased && (
              <p className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-marigold px-3 py-1.5 font-semibold text-ink">
                <Flame size={18} /> +1 streak &middot; {stage.res.streak.current} day{stage.res.streak.current === 1 ? "" : "s"}
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
                    {stage.res.verdict === "unsure" ? "Not quite sure yet" : "That doesn’t look like " + plant.name}
                    {stage.res.confidence > 0 && ` (${Math.round(stage.res.confidence * 100)}% confident)`}
                  </p>
                  {stage.res.reason && <p className="mt-1">{stage.res.reason}</p>}
                  {stage.res.hint && <p className="mt-2 font-medium">Try this: {stage.res.hint}</p>}
                </>
              )}
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button onClick={snap} className="flex h-14 items-center justify-center gap-2 rounded-2xl bg-leaf font-semibold text-white active:bg-leaf-deep">
                <RotateCcw size={18} /> Retake
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
