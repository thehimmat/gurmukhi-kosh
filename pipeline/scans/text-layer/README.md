# Scan viewer data (thehimmat/scan-text-layer → /admin/scans)

The curator's scan viewer shows a scanned page, its transcription and its translation side by side,
each pane switchable. It is curator-only: migration 093's tables have no API-role grants, and the
page images are served only to the admin cookie.

1. **Load a text** from a checkout of scan-text-layer (replaces what was loaded for that slug):

       npm run load:scan-text -- ../scan-text-layer garab-ganjani-teeka "Garab Ganjani Teeka" --dry-run
       npm run load:scan-text -- ../scan-text-layer garab-ganjani-teeka "Garab Ganjani Teeka"

   Pages come from `out/<slug>/final/` (manuscripts) or `out/<slug>/pages/`; units from
   `translations/<slug>.jsonl`, if any. Each unit is linked to the transcription lines it was
   taken from (`match.ts`); all 429 Garab Ganjani and 365 Chanakya Niti Darpan units link.

2. **Render the page images** on the Mac, where the PDFs are, and copy them to the server:

       python3 pipeline/scans/text-layer/render-pages.py "<pdf>" garab-ganjani-teeka ~/scan-images
       rsync -av ~/scan-images/garab-ganjani-teeka ubuntu@141.148.39.45:/opt/kosh/scans/

   The app reads them from `SCAN_IMAGE_ROOT` (`<root>/<slug>/NNNN.webp`, PDF page numbers).

3. Open `/admin/scans`.

Not yet: line boxes on the page images (`scan_lines.bbox`), which light up a unit's lines on the
image too. The viewer already draws them where present.
