import type { Metadata } from "next";
import { InfoPage } from "@/components/landing/InfoPage";
import { getLandingInfoPage } from "@/components/landing/infoContent";

export const metadata: Metadata = { title: "Access" };
export default function AccessPage() { return <InfoPage page={getLandingInfoPage("access")} />; }
