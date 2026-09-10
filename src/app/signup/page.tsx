import type { Metadata } from "next";
import { PrivateBetaView } from "@/components/auth/PrivateBetaView";

export const metadata: Metadata = {
  title: "Private beta access | Pliny",
  description: "Pliny is currently available to administrator-created private beta accounts.",
};

export default function SignupPage() {
  return <PrivateBetaView />;
}
