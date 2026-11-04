import { computeHealth, HealthStatsUnavailableError } from "@/lib/health";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const report = await computeHealth();
    return NextResponse.json(report);
  } catch (e) {
    if (!(e instanceof HealthStatsUnavailableError)) throw e;
    // A missing result is a temporary outage (#254), not a server bug.
    return NextResponse.json(
      { error: "Health stats unavailable, try again shortly", detail: e.message },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
