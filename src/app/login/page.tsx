import type { Metadata } from "next";
import { AuthView } from "@/components/auth/AuthView";

export const metadata: Metadata = {
  title: "Sign in",
  description: "Sign in to a private Pliny workspace.",
};

export default function LoginPage() {
  return <AuthView />;
}
