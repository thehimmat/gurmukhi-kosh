-- Pad-arth builder (#23): pauri-level commentary. Alongside the per-word and per-line notes of 084,
-- the curator can set an introduction (usually before a pauri's first line) and a question (an
-- interstitial "Question:" before the line that answers it). Each sits before its line; one of each
-- kind per line. Commentary is human work, so deleting its line is refused, as for picks.
-- The curator's: RLS on, no policies, no API-role grants; the builder writes through the service role.

create table if not exists padarth_commentary (
  id            bigserial primary key,
  line_id       bigint not null references lines(id) on delete restrict,
  kind          text not null check (kind in ('introduction', 'question')),
  body_text     text not null check (btrim(body_text) <> ''),
  chosen_by     text not null,
  provenance    text not null default 'human_verified'
                check (provenance in ('scraped','imported','rule_derived','computed','ai_draft','human_verified')),
  review_status text not null default 'unreviewed'
                check (review_status in ('unreviewed','approved','needs_work','rejected')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (line_id, kind)
);
comment on table padarth_commentary is 'Pad-arth builder (#23): an introduction or a question set before a line.';

drop trigger if exists padarth_commentary_touch on padarth_commentary;
create trigger padarth_commentary_touch before update on padarth_commentary
  for each row execute function padarth_touch_updated_at();

alter table padarth_commentary enable row level security;
revoke all on padarth_commentary from anon, authenticated;
revoke all on sequence padarth_commentary_id_seq from anon, authenticated;
