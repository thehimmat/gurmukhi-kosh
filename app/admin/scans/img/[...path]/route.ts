import { readFile } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_COOKIE, isCurator } from "@/lib/curator";
import { resolveScanImage } from "@/lib/scan-images";

// Page images for the scan viewer: curator only (the admin cookie is scoped to /admin), and never
// cached by a shared cache, since many scans may not be published (migration 093).
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  if (!isCurator(request.cookies.get(ADMIN_COOKIE)?.value)) return new NextResponse("Not found", { status: 404 });
  const file = resolveScanImage(process.env.SCAN_IMAGE_ROOT, (await params).path);
  if (!file) return new NextResponse("Not found", { status: 404 });
  return new NextResponse(new Uint8Array(await readFile(file)), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400" },
  });
}
