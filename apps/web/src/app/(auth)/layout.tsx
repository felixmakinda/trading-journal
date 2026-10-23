export default function AuthLayout({ children }: LayoutProps<"/">) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-accent text-lg font-bold text-accent-ink">
            J
          </div>
          <h1 className="text-xl font-semibold">Trading Journal</h1>
        </div>
        <div className="rounded-xl border border-line bg-surface p-6">{children}</div>
      </div>
    </main>
  );
}
