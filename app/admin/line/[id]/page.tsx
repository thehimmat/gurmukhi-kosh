import { adminLinePage } from "@/components/line/linePage";

// The curator's copy of /line/<id>: it reads through the service role, so a line of a
// curator-only corpus (migration 070) shows here and nowhere public. Needs ?key=ADMIN_KEY.
export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ key?: string }> };

export default async function AdminLinePage({ params, searchParams }: Props) {
  return adminLinePage((await params).id, "passage", (await searchParams).key);
}
