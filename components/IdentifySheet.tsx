"use client";
import { useRef, useState } from "react";
import { api, browserTz, type IdentifyResponse, type VerifyResponse } from "@/lib/api";
import type { Plant } from "@/lib/hunt";
import { getLocation, processPhoto } from "@/lib/photo";

// "What's this plant?" The player snaps or picks a photo without naming anything; the checker
// lists the plants it can see. Any of them can then be added to their finds, which sends the
// photo through the normal /api/verify check under that name.

type Photo = { image: string; thumb: string };
type Stage =
  | { name: "pick" }
  | { name: "checking"; photo: Photo }
  | { name: "results"; photo: Photo; res: IdentifyResponse }
  | { name: "error"; photo: Photo | null; message: string };
type AddState = { name: "checking" } | { name: "added"; res: VerifyResponse } | { name: "miss"; message: string };

type Props = {
  cardId: string;
  userId: string;
  /** The hunt card's plants, to say "No. 3 on your card". */
  plants: Plant[];
  found: Record<string, string>;
  onClose: () => void;
  onVerified: () => void;
};

const KIND_LABEL = { tree: "Tree", shrub: "Shrub", herb: "Herb", climber: "Climber", other: "Plant" } as const;
const sureness = (c: number) => (c >= 0.75 ? "Likely" : c >= 0.5 ? "Possibly" : "Maybe");

export function IdentifySheet({ cardId, userId, plants, found, onClose, onVerified }: Props) {
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [adds, setAdds] = useState<Record<number, AddState>>({});
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const location = useRef<ReturnType<typeof getLocation>>(Promise.resolve(null));

  function choose(from: "camera" | "gallery") {
    location.current = getLocation(); // start the GPS fix while the picker is open
    (from === "camera" ? camera : gallery).current?.click();
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!file) return;
    let photo: Photo | null = null;
    setAdds({});
    try {
      photo = await processPhoto(file);
      setStage({ name: "checking", photo });
      const res = await api<IdentifyResponse>("/api/identify", { userId, cardId, image: photo.image });
      setStage({ name: "results", photo, res });
    } catch (err) {
      setStage({ name: "error", photo, message: (err as Error).message });
    }
  }

  async function add(i: number) {
    if (stage.name !== "results") return;
    const p = stage.res.plants[i];
    setAdds((a) => ({ ...a, [i]: { name: "checking" } }));
    try {
      const pos = await Promise.race([location.current, new Promise<null>((r) => setTimeout(() => r(null), 4000))]);
      const res = await api<VerifyResponse>("/api/verify", {
        userId, cardId, tz: browserTz(), image: stage.photo.image, thumb: stage.photo.thumb, lat: pos?.lat, lng: pos?.lng,
        ...(p.onCard ? { plantId: p.onCard } : { plantId: "custom", customName: p.name }),
      });
      if (res.verdict === "match") {
        navigator.vibrate?.(30);
        onVerified();
        setAdds((a) => ({ ...a, [i]: { name: "added", res } }));
      } else {
        const message = [res.reason, res.hint && `Try this: ${res.hint}`].filter(Boolean).join(" ");
        setAdds((a) => ({ ...a, [i]: { name: "miss", message: message || "The checker couldn't confirm it from this photo." } }));
      }
    } catch (err) {
      setAdds((a) => ({ ...a, [i]: { name: "miss", message: (err as Error).message } }));
    }
  }

  const photo = stage.name === "pick" ? null : stage.photo;

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Identify plants from a photo"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92dvh] w-full max-w-[430px] overflow-y-auto rounded-t-3xl border-t border-line bg-card p-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-serif text-3xl font-semibold leading-tight">What&rsquo;s this plant?</h2>
            <p className="mt-1 text-muted">Snap a tree or plant you don&rsquo;t know. We&rsquo;ll tell you what it is.</p>
          </div>
          <button onClick={onClose} className="h-11 shrink-0 rounded-full border border-line px-4 text-sm font-semibold">
            Close
          </button>
        </div>

        {photo && (
          <figure className="relative mt-4 overflow-hidden rounded-2xl border border-line">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.thumb} alt="Your photo" className="aspect-[4/3] w-full object-cover" />
            {stage.name === "checking" && <div className="pulse-veil absolute inset-0 bg-leaf" />}
          </figure>
        )}

        <input ref={camera} type="file" accept="image/*" capture="environment" onChange={onFile} className="hidden" />
        <input ref={gallery} type="file" accept="image/*" onChange={onFile} className="hidden" />

        {stage.name === "pick" && (
          <>
            <ul className="mt-5 space-y-2 text-[15px] leading-snug">
              <li>Get the leaves, flowers or fruit in frame. A whole tree from far away is hard to name.</li>
              <li className="text-muted">Anything we name can be added to your finds. Plants on your hunt card are marked.</li>
            </ul>
            <div className="mt-6 grid gap-3">
              <button onClick={() => choose("camera")} className="h-14 rounded-2xl bg-leaf text-lg font-semibold text-white active:bg-leaf-deep">
                Take a photo
              </button>
              <button onClick={() => choose("gallery")} className="h-14 rounded-2xl border border-line text-lg font-semibold active:bg-paper">
                Choose from gallery
              </button>
            </div>
          </>
        )}

        {stage.name === "checking" && (
          <p role="status" className="mt-5 text-center text-lg font-medium">Looking for plants in your photo…</p>
        )}

        {stage.name === "error" && (
          <div role="alert" className="mt-5 rounded-2xl border border-clay/40 bg-clay/10 p-4 font-medium text-clay">{stage.message}</div>
        )}

        {stage.name === "results" && (
          stage.res.plants.length === 0 ? (
            <div role="alert" className="mt-5 rounded-2xl border border-clay/40 bg-clay/10 p-4 text-clay">
              <p className="font-semibold">No plant we could name with confidence</p>
              {stage.res.note && <p className="mt-1">Try this: {stage.res.note}</p>}
            </div>
          ) : (
            <>
              <p className="mt-5 text-sm font-semibold uppercase tracking-widest text-muted">
                {stage.res.plants.length === 1 ? "We think it is" : `We spotted ${stage.res.plants.length} plants`}
              </p>
              <ul className="mt-2 space-y-3">
                {stage.res.plants.map((p, i) => {
                  const n = p.onCard ? plants.findIndex((c) => c.id === p.onCard) + 1 : 0;
                  const already = p.onCard ? Boolean(found[p.onCard]) : false;
                  const st = adds[i];
                  return (
                    <li key={`${p.scientific}:${i}`} className="overflow-hidden rounded-2xl border border-line">
                      <div className="flex gap-3 p-3">
                        {p.photo && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.photo.url} alt={`Sample photo of ${p.name}`} loading="lazy" className="size-20 shrink-0 rounded-xl object-cover" />
                        )}
                        <div className="min-w-0">
                          <p className="font-serif text-xl font-semibold capitalize leading-tight">{p.name}</p>
                          {p.scientific && <p className="truncate font-serif text-sm italic text-muted">{p.scientific}</p>}
                          <p className="mt-1 text-xs font-semibold">
                            <span className={p.confidence >= 0.75 ? "text-leaf" : "text-muted"}>{sureness(p.confidence)}</span>
                            <span className="text-muted"> &middot; {KIND_LABEL[p.kind]}</span>
                            {n > 0 && <span className="ml-1.5 rounded bg-marigold px-1.5 py-0.5 text-ink">No. {n} on your card</span>}
                          </p>
                        </div>
                      </div>
                      {p.seen && <p className="px-3 pb-2 text-sm leading-snug text-muted">{p.seen}</p>}
                      {(p.photo || p.taxonUrl) && (
                        <p className="flex items-center justify-between gap-2 bg-paper px-3 py-1.5 text-[11px] leading-tight text-muted">
                          <span className="truncate">{p.photo ? `Sample: ${p.photo.credit}` : ""}</span>
                          {p.taxonUrl && (
                            <a href={p.taxonUrl} target="_blank" rel="noreferrer" className="shrink-0 font-medium text-leaf underline">
                              iNaturalist
                            </a>
                          )}
                        </p>
                      )}
                      <div className="p-3 pt-2">
                        {st?.name === "added" ? (
                          <p className="font-semibold text-leaf">
                            Added to your finds{st.res.streak?.increased ? ` · +1 streak, ${st.res.streak.current} day${st.res.streak.current === 1 ? "" : "s"}` : ""}
                            {st.res.fact && <span className="mt-1 block font-normal text-ink">{st.res.fact}</span>}
                          </p>
                        ) : (
                          <>
                            <button
                              onClick={() => add(i)}
                              disabled={st?.name === "checking"}
                              className="h-11 w-full rounded-xl border border-leaf font-semibold text-leaf active:bg-paper disabled:opacity-60"
                            >
                              {st?.name === "checking" ? "Checking…" : already ? "Snap it again for your streak" : "Add to my finds"}
                            </button>
                            {st?.name === "miss" && <p role="alert" className="mt-2 text-sm text-clay">{st.message}</p>}
                          </>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-muted">Names are AI suggestions from your photo, checked against iNaturalist where it knows them.</p>
            </>
          )
        )}

        {(stage.name === "results" || stage.name === "error") && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            <button onClick={() => choose("camera")} className="h-14 rounded-2xl bg-leaf font-semibold text-white active:bg-leaf-deep">
              New photo
            </button>
            <button onClick={() => choose("gallery")} className="h-14 rounded-2xl border border-line font-semibold">
              From gallery
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
