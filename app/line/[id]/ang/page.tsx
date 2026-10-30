import type { Metadata } from "next";
import { lineMetadata, linePage } from "@/components/line/linePage";

// A line in its whole ang (#146: scope "Ang"); /line/<id> is its shabad.
export const revalidate = 604800;
export function generateStaticParams() {
  return [];
}

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return lineMetadata((await params).id, "ang");
}

export default async function LineAngPage({ params }: Props) {
  return linePage((await params).id, "ang");
}
