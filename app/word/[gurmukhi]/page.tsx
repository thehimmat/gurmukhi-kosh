import type { Metadata } from "next";
import { WordPage, wordMetadata } from "@/components/word/WordPage";

// The public word page. Curator mode is /admin/word/<w> (proxy.ts sends /word/<w>?key=… there).
export const dynamic = "force-dynamic";

type Props = {
  params: Promise<{ gurmukhi: string }>;
  searchParams: Promise<{ tab?: string; page?: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return wordMetadata((await params).gurmukhi);
}

export default async function PublicWordPage({ params, searchParams }: Props) {
  const [{ gurmukhi }, { tab, page }] = await Promise.all([params, searchParams]);
  return <WordPage encoded={gurmukhi} tab={tab} page={page} curatorKey={null} />;
}
