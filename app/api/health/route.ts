import { computeHealth } from "@/lib/health";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const report = await computeHealth();
  return NextResponse.json(report);
}
