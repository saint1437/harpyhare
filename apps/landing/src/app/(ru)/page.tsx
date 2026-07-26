import type { Metadata } from "next";
import { LandingPage } from "@/components/LandingPage";
import { pageMetadata } from "@/lib/metadata";
import { fetchLatestRelease } from "@/lib/release-server";

export const revalidate = 1800;

export const metadata: Metadata = pageMetadata("ru");

export default async function RuPage() {
  const release = await fetchLatestRelease();
  return <LandingPage locale="ru" release={release} />;
}
