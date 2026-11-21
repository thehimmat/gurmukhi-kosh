import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { adminKey } from "@/lib/curator-session";
import { curatorDb } from "@/lib/curator";
import { fetchScanTexts } from "@/lib/scans";
import { pageTitle } from "@/lib/site";

// The curator's scan texts (migration 093), loaded from thehimmat/scan-text-layer by
// pipeline/scans/text-layer/load.ts.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: pageTitle("Scans"), robots: { index: false, follow: false } };

export default async function ScansPage({ searchParams }: { searchParams: Promise<{ key?: string }> }) {
  if (!(await adminKey((await searchParams).key))) notFound();
  const texts = await fetchScanTexts(curatorDb(true));
  return (
    <div className="scan-index">
      <h1>Scans</h1>
      {texts.length === 0 ? (
        <p>No texts loaded yet. Load one with <code>npm run load:scan-text</code>.</p>
      ) : (
        <ul>
          {texts.map((t) => (
            <li key={t.slug}>
              <Link href={`/admin/scans/${t.slug}`}>{t.title}</Link>
              <span className="scan-index-meta">
                {t.pages} pages · {t.units ? `${t.units} translation units` : "not translated yet"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
