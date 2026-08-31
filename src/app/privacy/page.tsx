import type { Metadata } from "next";
import { InfoPage } from "@/components/landing/InfoPage";
import { getLandingInfoPage } from "@/components/landing/infoContent";

export const metadata: Metadata = { title: "Privacy & Data" };
export default function PrivacyPage() { return <InfoPage page={getLandingInfoPage("privacy")} />; }
