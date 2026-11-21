-- 093: scan texts for the curator's scan viewer (/admin/scans).
--
-- thehimmat/scan-text-layer turns scans in Drive into a Unicode Gurmukhi text layer (one JSON per
-- page: numbered, typed lines) and translates selected commentaries into English (one JSON object
-- per translation unit, naming the pages it covers). The viewer shows, page by page, the page image,
-- its transcription and the translation units on it, each pane switchable.
--
-- Curator-only, and not by source_rights alone: many of these scans may not be published at all
-- (PDL-digitised files are for internal use, scan-text-layer RUNBOOK.md). So the API roles get no
-- grants and no policies on these tables; the curator reads through the service role
-- (lib/curator.ts curatorDb), which bypasses RLS. The source_rights row records the decision.
--
-- Rows are keyed by the text's slug (scan-text-layer's slug), page number and line number, so the
-- loader (pipeline/scans/text-layer/load.ts) writes them with plain upserts and no id lookups, and a
-- text reloads by deleting it (everything cascades) and inserting again.
--
-- scan_unit_lines links a unit to the transcription lines it translates, matched at load time
-- (pipeline/scans/text-layer/match.ts); the units themselves name only pages.
-- scan_lines.bbox is the line's box on the page image, [x, y, w, h] as fractions of the image, when
-- one has been found (a later step); null otherwise.

insert into source_rights (code, visibility, rights_status, notes) values
  ('scan_text_layer', 'curator', 'own',
   'Our transcriptions and translations of scans in Drive (thehimmat/scan-text-layer); the scans themselves are not ours to publish')
on conflict (code) do nothing;

create table if not exists scan_texts (
  slug        text primary key,
  title       text not null,
  source_note text,                      -- where the scan came from (Drive folder, archive.org id…)
  loaded_at   timestamptz not null default now()
);

create table if not exists scan_pages (
  text_slug  text not null references scan_texts (slug) on delete cascade,
  page       int  not null check (page > 0),
  image_path text,                       -- under the scan image root on the server, e.g. <slug>/0009.webp
  width      int,
  height     int,
  primary key (text_slug, page)
);

create table if not exists scan_lines (
  text_slug text not null,
  page      int  not null,
  n         int  not null check (n > 0),
  type      text not null check (type in ('body', 'gurbani', 'heading', 'running-head', 'pagenum', 'footnote', 'margin', 'rubric', 'catchword')),
  text      text not null,
  bbox      real[] check (bbox is null or array_length(bbox, 1) = 4),
  primary key (text_slug, page, n),
  foreign key (text_slug, page) references scan_pages (text_slug, page) on delete cascade
);

create table if not exists scan_units (
  text_slug   text not null references scan_texts (slug) on delete cascade,
  seq         int  not null check (seq > 0),  -- order in the translation file
  label       text not null,                  -- the unit's own name ("pauri 5, tuk 2")
  pages       int[] not null,
  source      text not null,
  translation text not null,
  literal     text,
  context     text,
  nuances     jsonb not null default '[]',
  doubts      jsonb not null default '[]',
  terms       jsonb not null default '[]',
  gurbani     jsonb not null default '[]',
  primary key (text_slug, seq)
);
create index if not exists scan_units_pages_idx on scan_units using gin (pages);

create table if not exists scan_unit_lines (
  text_slug text not null,
  seq       int  not null,
  page      int  not null,
  n         int  not null,
  primary key (text_slug, seq, page, n),
  foreign key (text_slug, seq) references scan_units (text_slug, seq) on delete cascade,
  foreign key (text_slug, page, n) references scan_lines (text_slug, page, n) on delete cascade
);
create index if not exists scan_unit_lines_line_idx on scan_unit_lines (text_slug, page, n);

alter table scan_texts      enable row level security;
alter table scan_pages      enable row level security;
alter table scan_lines      enable row level security;
alter table scan_units      enable row level security;
alter table scan_unit_lines enable row level security;

revoke all on scan_texts, scan_pages, scan_lines, scan_units, scan_unit_lines from anon, authenticated;
