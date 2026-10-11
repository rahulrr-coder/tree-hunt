"use client";
import { Leaf, MapPin, Trophy } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "./UserProvider";

const tabs = [
  { href: "/", label: "Hunt", Icon: Leaf },
  { href: "/map", label: "Map", Icon: MapPin },
  { href: "/board", label: "Board", Icon: Trophy },
];

export function BottomNav() {
  const path = usePathname();
  const { user } = useUser();
  if (!user && path === "/") return null; // welcome screen has no nav

  return (
    <nav aria-label="Main" className="fixed bottom-0 left-1/2 z-30 flex h-16 w-full max-w-[430px] -translate-x-1/2 border-t border-line bg-card">
      {tabs.map(({ href, label, Icon }) => {
        const active = path === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? "page" : undefined}
            className={`flex flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active ? "text-leaf" : "text-muted"}`}
          >
            <Icon size={22} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
