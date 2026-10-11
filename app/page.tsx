"use client";
import { Hunt } from "@/components/Hunt";
import { useUser } from "@/components/UserProvider";
import { Welcome } from "@/components/Welcome";

export default function Home() {
  const { user, ready } = useUser();
  if (!ready) return null;
  return user ? <Hunt /> : <Welcome />;
}
