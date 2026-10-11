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

// Top bar, not bottom: hosts like Netlify's free plan float a badge over the bottom-right corner.
export function Nav() {
  const path = usePathname();
  const { user } = useUser();
  if (!user && path === "/") return null; // welcome screen has no nav

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card">
      <div className="mx-auto flex h-14 w-full max-w-[430px] items-center justify-between px-4">
        <span className="font-serif text-xl font-semibold text-leaf-deep">Tree Hunt</span>
        <nav aria-label="Main" className="flex items-center gap-1">
          {tabs.map(({ href, label, Icon }) => {
            const active = path === href;
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 min-w-11 items-center justify-center gap-1.5 rounded-full text-sm font-semibold ${
                  active ? "bg-leaf px-4 text-white" : "text-muted"
                }`}
              >
                <Icon size={20} strokeWidth={active ? 2.25 : 1.75} aria-hidden />
                {active && label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
