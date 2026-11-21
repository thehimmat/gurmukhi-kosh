import { existsSync } from "node:fs";
import { join } from "node:path";

// Page images for the curator's scan viewer, rendered once per text on the Mac
// (pipeline/scans/text-layer/render-pages.sh) and copied to SCAN_IMAGE_ROOT on the server.
// Only <slug>/<NNNN>.webp is served, so no path can leave the root.

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const FILE = /^\d{4}\.webp$/;

/** The image file for `segments` (["<slug>", "0009.webp"]) under `root`, or null. */
export function resolveScanImage(root: string | undefined, segments: string[]): string | null {
  if (!root || segments.length !== 2) return null;
  const [slug, file] = segments;
  if (!SLUG.test(slug) || !FILE.test(file)) return null;
  const path = join(root, slug, file);
  return existsSync(path) ? path : null;
}
