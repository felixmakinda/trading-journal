import { redirect } from "next/navigation";

/** No marketing home page (ADR 010): the dashboard is home. The proxy sends guests to /login. */
export default function Home() {
  redirect("/dashboard");
}
