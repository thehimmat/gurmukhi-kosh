import { adminLinePage } from "@/components/line/linePage";

// The curator's copy of /line/<id>/ang (see ../page.tsx).
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string }> };

export default async function AdminLineAngPage({ params, searchParams }: Props) {
  return adminLinePage((await params).id, "ang", (await searchParams).key);
}
