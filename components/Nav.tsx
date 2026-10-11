"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "./UserProvider";

const tabs = [
  { href: "/", label: "Hunt" },
  { href: "/map", label: "Map" },
  { href: "/board", label: "Board" },
];

export function Nav() {
  const path = usePathname();
  const { user } = useUser();
  if (!user && path === "/") return null; // welcome screen has no nav

  return (
    <header className="sticky top-0 z-30 border-b border-line bg-card pt-[env(safe-area-inset-top)]">
      <div className="mx-auto flex h-14 w-full max-w-[430px] items-center justify-between px-4">
        <span className="font-serif text-xl font-semibold text-leaf-deep">Tree Hunt</span>
        <nav aria-label="Main" className="flex items-center gap-1">
          {tabs.map(({ href, label }) => {
            const active = path === href;
            return (
              <Link
                key={href}
                href={href}
                aria-current={active ? "page" : undefined}
                className={`inline-flex h-10 items-center rounded-full px-3.5 text-sm font-semibold ${
                  active ? "bg-leaf text-white" : "text-muted active:bg-paper"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
