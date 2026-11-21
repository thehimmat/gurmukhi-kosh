import { notFound, redirect } from "next/navigation";
import { adminKey } from "@/lib/curator-session";
import { curatorDb } from "@/lib/curator";
import { fetchFirstPage } from "@/lib/scans";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ key?: string; show?: string }> };

/** A text opens at its first transcribed page. */
export default async function ScanTextPage({ params, searchParams }: Props) {
  const { key, show } = await searchParams;
  if (!(await adminKey(key))) notFound();
  const { slug } = await params;
  const first = await fetchFirstPage(curatorDb(true), slug);
  if (first == null) notFound();
  redirect(`/admin/scans/${slug}/${first}${show ? `?show=${encodeURIComponent(show)}` : ""}`);
}
