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

2. **Render the page images** and put them in `SCAN_IMAGE_ROOT` on the server (`/opt/kosh/scans`,
   mounted read-only into the app by atthebunga-server). The Mac has no poppler or Pillow, so render
   on the VM in a throwaway container, from PDFs copied up from Drive:

       rsync -a "<pdf>" pipeline/scans/text-layer/render-pages.py ubuntu@141.148.39.45:scan-render/
       ssh ubuntu@141.148.39.45 'cd ~/scan-render && docker run --rm --cpus 1 --memory 1g \
         -v "$HOME/scan-render:/w" -v /opt/kosh/scans:/out python:3.12-slim sh -c \
         "apt-get update -qq && apt-get install -y -qq poppler-utils && pip install -q pillow \
          && python3 /w/render-pages.py /w/<file>.pdf <slug> /out && chown -R $(id -u):$(id -g) /out"'
       ssh ubuntu@141.148.39.45 'rm -rf ~/scan-render; docker rmi python:3.12-slim'

   About 5 s a page on one core (Garab Ganjani, 180 pages: ~15 min; 22 MB). Pass `$(id -u)` from
   the VM's shell as above: uid 1000 there is `opc`, not `ubuntu`. With poppler and Pillow
   installed, `render-pages.py` also runs anywhere, followed by `rsync -av <outdir>/<slug>
   ubuntu@141.148.39.45:/opt/kosh/scans/`.

3. Open `/admin/scans` (with the server's `ADMIN_KEY`, from `/opt/infra/.env`).

Loaded so far (2026-11-21): garab-ganjani-teeka (180 pp, 429 units) and chanaka-niti-darpan (98 pp,
365 units), with images.

Not yet: line boxes on the page images (`scan_lines.bbox`), which light up a unit's lines on the
image too. The viewer already draws them where present.
