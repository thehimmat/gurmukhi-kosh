import type { Metadata } from "next";
import { lineMetadata, linePage } from "@/components/line/linePage";

// A line in its passage, the shabad or bani passage holding it (#146, #220); /line/<id>/ang shows its whole ang. A line's
// context changes only on an ingest, so each page is rendered on its first
// request and refreshed daily.
export const revalidate = 86400;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return lineMetadata((await params).id, "passage");
}

export default async function LinePage({ params }: Props) {
  return linePage((await params).id, "passage");
}
