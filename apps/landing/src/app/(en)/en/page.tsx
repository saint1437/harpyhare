import type { Metadata } from "next";
import { LandingPage } from "@/components/LandingPage";
import { pageMetadata } from "@/lib/metadata";
import { fetchLatestRelease } from "@/lib/release-server";

export const revalidate = 1800;

export const metadata: Metadata = pageMetadata("en");

export default async function EnPage() {
  const release = await fetchLatestRelease();
  return <LandingPage locale="en" release={release} />;
}
