import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WordPage, wordMetadata } from "@/components/word/WordPage";
import { adminKey } from "@/lib/curator-session";

// The word page in curator mode (#125): flag forms, provenance, curator-only sources (#258). Needs
// the admin cookie (proxy.ts swaps a ?key=ADMIN_KEY for it). Rendered per request, never cached.
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ gurmukhi: string }>;
  searchParams: Promise<{ tab?: string; page?: string; key?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { ...wordMetadata((await params).gurmukhi), robots: { index: false, follow: false } };
}

export default async function AdminWordPage({ params, searchParams }: Props) {
  const [{ gurmukhi }, { tab, page, key: keyParam }] = await Promise.all([params, searchParams]);
  const key = await adminKey(keyParam);
  if (!key) notFound();
  return <WordPage encoded={gurmukhi} tab={tab} page={page} curatorKey={key} />;
}
