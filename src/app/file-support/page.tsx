import type { Metadata } from "next";
import { InfoPage } from "@/components/landing/InfoPage";
import { getLandingInfoPage } from "@/components/landing/infoContent";

export const metadata: Metadata = { title: "File Support" };
export default function FileSupportPage() { return <InfoPage page={getLandingInfoPage("file-support")} />; }
