import { Suspense } from "react";
import { ActiveNavLinks, NavLinks } from "@/components/nav";
import { logout } from "../(auth)/actions";

export default function AppLayout({ children }: LayoutProps<"/">) {
  const nav = (
    <Suspense fallback={<NavLinks />}>
      <ActiveNavLinks />
    </Suspense>
  );
  return (
    <div className="min-h-screen lg:flex">
      <aside className="border-b border-line bg-surface lg:sticky lg:top-0 lg:h-screen lg:w-56 lg:shrink-0 lg:border-r lg:border-b-0">
        <div className="flex items-center justify-between px-4 py-3 lg:py-5">
          <span className="flex items-center gap-2 font-semibold">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-sm font-bold text-accent-ink">J</span>
            Journal
          </span>
          <form action={logout} className="lg:hidden">
            <button className="text-sm text-ink-2 hover:text-ink">Sign out</button>
          </form>
        </div>
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
          {nav}
        </nav>
        <form action={logout} className="hidden px-3 lg:absolute lg:bottom-4 lg:block">
          <button className="rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink">Sign out</button>
        </form>
      </aside>
      <main className="mx-auto w-full max-w-6xl min-w-0 px-4 py-6 sm:px-6 lg:py-8">{children}</main>
    </div>
  );
}
