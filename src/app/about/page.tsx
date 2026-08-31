import type { Metadata } from "next";
import { InfoPage } from "@/components/landing/InfoPage";
import { getLandingInfoPage } from "@/components/landing/infoContent";

export const metadata: Metadata = { title: "About" };
export default function AboutPage() { return <InfoPage page={getLandingInfoPage("about")} />; }
