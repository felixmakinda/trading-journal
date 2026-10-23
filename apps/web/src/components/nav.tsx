"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "./ui";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/trades", label: "Trades" },
  { href: "/plans", label: "Plans" },
  { href: "/playbook", label: "Playbook" },
  { href: "/analytics", label: "Analytics" },
  { href: "/import", label: "Import" },
  { href: "/settings", label: "Settings" },
] as const;

export function NavLinks({ active }: { active?: string | null }) {
  return (
    <>
      {NAV_ITEMS.map((item) => {
        const isActive = active ? active === item.href || active.startsWith(`${item.href}/`) : false;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isActive ? "page" : undefined}
            className={cx(
              "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              isActive ? "bg-surface-2 text-ink" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

export function ActiveNavLinks() {
  return <NavLinks active={usePathname()} />;
}
