import type { Metadata } from "next";
import { AuthView } from "@/components/auth/AuthView";

export const metadata: Metadata = {
  title: "Create your account",
  description: "Create a Pliny account and confirm your email address before signing in to source-backed workspaces.",
};

export default function SignupPage() {
  return <AuthView mode="signup" />;
}
