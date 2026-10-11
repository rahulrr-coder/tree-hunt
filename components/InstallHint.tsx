"use client";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void> };
const KEY = "treehunt:install-dismissed";

/** Android/desktop Chrome: a real Install button. iOS Safari has no prompt, so show the two taps once. */
export function InstallHint() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = Boolean(localStorage.getItem(KEY));
    } catch {}
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent));
    setHidden(dismissed || standalone);
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  function dismiss() {
    setHidden(true);
    try {
      localStorage.setItem(KEY, "1");
    } catch {}
  }

  if (hidden || (!event && !ios)) return null;
  return (
    <aside className="mt-6 rounded-2xl border border-line bg-card p-4" aria-label="Install Tree Hunt">
      <p className="font-serif text-lg font-semibold">Keep Tree Hunt on your phone</p>
      {event ? (
        <p className="mt-1 text-sm text-muted">Install it like an app: full screen, one tap from your home screen.</p>
      ) : (
        <p className="mt-1 text-sm text-muted">
          In Safari, tap the Share button, then <strong>Add to Home Screen</strong>.
        </p>
      )}
      <div className="mt-3 flex gap-2">
        {event && (
          <button
            onClick={async () => {
              await event.prompt();
              dismiss();
            }}
            className="h-11 rounded-full bg-leaf px-5 text-sm font-semibold text-white active:bg-leaf-deep"
          >
            Install app
          </button>
        )}
        <button onClick={dismiss} className="h-11 rounded-full border border-line px-5 text-sm font-semibold">
          Not now
        </button>
      </div>
    </aside>
  );
}
