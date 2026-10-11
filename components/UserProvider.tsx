"use client";
import { createContext, useContext, useEffect, useState } from "react";
import type { Place } from "@/lib/api";

export type User = { userId: string; nickname: string };
type Ctx = {
  user: User | null;
  place: Place | null;
  ready: boolean;
  setUser: (u: User | null) => void;
  setPlace: (p: Place | null) => void;
};
const Context = createContext<Ctx>({ user: null, place: null, ready: false, setUser: () => {}, setPlace: () => {} });
export const useUser = () => useContext(Context);

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, value: unknown) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {}
}

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [place, setPlaceState] = useState<Place | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const u = read<User>("treehunt:user");
    const p = read<Place>("treehunt:place");
    setUserState(u && typeof u.userId === "string" && typeof u.nickname === "string" ? u : null);
    setPlaceState(p && typeof p.lat === "number" && typeof p.lng === "number" && typeof p.name === "string" ? p : null);
    setReady(true);
  }, []);

  const setUser = (u: User | null) => {
    setUserState(u);
    write("treehunt:user", u);
  };
  const setPlace = (p: Place | null) => {
    setPlaceState(p);
    write("treehunt:place", p);
  };

  return <Context.Provider value={{ user, place, ready, setUser, setPlace }}>{children}</Context.Provider>;
}
