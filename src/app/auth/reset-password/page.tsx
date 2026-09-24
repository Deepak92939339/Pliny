import type { Metadata } from "next";
import { ResetPasswordView } from "@/components/auth/ResetPasswordView";

export const metadata: Metadata = {
  title: "Choose a new password",
  description: "Set a new password for your Pliny account using a valid recovery link.",
};

export default function ResetPasswordPage() {
  return <ResetPasswordView />;
}
