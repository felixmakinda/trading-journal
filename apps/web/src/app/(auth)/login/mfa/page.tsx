import type { Metadata } from "next";
import { logout } from "../../actions";
import { MfaForm } from "../../forms";

export const metadata: Metadata = { title: "Verify" };

export default function MfaPage() {
  return (
    <>
      <MfaForm />
      <form action={logout} className="mt-4 text-center">
        <button className="text-xs text-muted hover:text-ink-2">Use a different account</button>
      </form>
    </>
  );
}
