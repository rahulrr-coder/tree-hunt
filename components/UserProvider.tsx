"use client";
import { createContext, useContext, useEffect, useState } from "react";

export type User = { userId: string; nickname: string };
const KEY = "treehunt:user";
const Ctx = createContext<{ user: User | null; ready: boolean; setUser: (u: User | null) => void }>({
  user: null, ready: false, setUser: () => {},
});
export const useUser = () => useContext(Ctx);

export function UserProvider({ children }: { children: React.ReactNode }) {
  const [user, setUserState] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setUserState(JSON.parse(raw));
    } catch {}
    setReady(true);
  }, []);

  const setUser = (u: User | null) => {
    setUserState(u);
    try {
      if (u) localStorage.setItem(KEY, JSON.stringify(u));
      else localStorage.removeItem(KEY);
    } catch {}
  };

  return <Ctx.Provider value={{ user, ready, setUser }}>{children}</Ctx.Provider>;
}
