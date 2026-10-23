import type { Metadata } from "next";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return <LoginForm />;
}
