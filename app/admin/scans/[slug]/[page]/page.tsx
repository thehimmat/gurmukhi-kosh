import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { adminKey } from "@/lib/curator-session";
import { curatorDb } from "@/lib/curator";
import { fetchScanPage } from "@/lib/scans";
import { pageTitle } from "@/lib/site";
import { ScanViewer } from "@/components/scans/ScanViewer";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageTitle("Scan"), robots: { index: false, follow: false } };

type Props = {
  params: Promise<{ slug: string; page: string }>;
  searchParams: Promise<{ key?: string; show?: string }>;
};

export default async function ScanPage({ params, searchParams }: Props) {
  const { key, show } = await searchParams;
  if (!(await adminKey(key))) notFound();
  const { slug, page } = await params;
  const n = Number(page);
  if (!Number.isInteger(n) || n < 1) notFound();
  const view = await fetchScanPage(curatorDb(true), slug, n);
  if (!view) notFound();
  return <ScanViewer view={view} showParam={show ?? null} />;
}
