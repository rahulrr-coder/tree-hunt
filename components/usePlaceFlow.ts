"use client";
import { useEffect, useState } from "react";
import type { Place } from "@/lib/api";
import { approxPlace, locateMe, nameFor, searchPlaces } from "@/lib/places";

/**
 * One place-picking flow for every screen: type-ahead search or GPS, then an explicit
 * "is this right?" confirmation before anything changes.
 */
export function usePlaceFlow(onConfirm: (p: Place) => void) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Place[]>([]);
  const [answered, setAnswered] = useState(""); // the query the current results belong to
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState("");
  const [approx, setApprox] = useState<Place | null>(null);
  const [pending, setPending] = useState<Place | null>(null);

  const q = query.trim();
  const searching = q.length >= 3 && answered !== q;

  // Type-ahead: suggestions appear from the third letter, without pressing anything.
  useEffect(() => {
    if (q.length < 3) return setResults([]);
    const ctl = new AbortController();
    const t = setTimeout(() => {
      searchPlaces(q, ctl.signal).then(
        (r) => {
          setResults(r);
          setAnswered(q);
        },
        () => {},
      );
    }, 250);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [q]);

  function choose(p: Place) {
    setPending(p);
    setQuery("");
    setResults([]);
    setNote("");
    setApprox(null);
  }

  async function locate() {
    setNote("");
    setApprox(null);
    setLocating(true);
    try {
      const fix = await locateMe();
      choose({ ...fix, name: await nameFor(fix) });
    } catch (e) {
      setNote((e as Error).message);
      setApprox(await approxPlace());
    } finally {
      setLocating(false);
    }
  }

  return {
    query, setQuery, results, searching,
    noMatches: q.length >= 3 && answered === q && results.length === 0,
    locating, locate, note, approx, pending,
    choose,
    cancel: () => setPending(null),
    confirm: () => {
      if (!pending) return;
      onConfirm(pending);
      setPending(null);
    },
  };
}
