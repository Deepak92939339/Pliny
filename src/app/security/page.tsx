import type { Metadata } from "next";
import { InfoPage } from "@/components/landing/InfoPage";
import { getLandingInfoPage } from "@/components/landing/infoContent";

export const metadata: Metadata = { title: "Security" };
export default function SecurityPage() { return <InfoPage page={getLandingInfoPage("security")} />; }
