# Cologne Sanskrit dictionaries

Plan Phase 1 (#249): the Cologne Digital Sanskrit Dictionaries
([csl-orig](https://github.com/sanskrit-lexicon/csl-orig)) loaded whole into `dict_entries` (089),
one row per Cologne record (`<code>:L<id>`).

| csl-orig | Code | Migration | Visibility |
|---|---|---|---|
| `mw` (Monier-Williams 1899) | `cologne_mw` | 090 | curator (CC BY-SA 4.0, #273) |

## Load

```sh
git clone --depth 1 https://github.com/sanskrit-lexicon/csl-orig ../csl-orig
npm run load:cologne -- --dict=mw --csl=../csl-orig
```

This writes `pipeline/cologne/output/mw/0001.sql…` and `verify.sql`. Run them in order with psql
against the database, then `verify.sql`: n and checksum must match the printed ones. Re-running is
safe. Write down the csl-orig commit it prints in `supabase/APPLIED.md` with the load.

## Linking

Headwords link on a Gurbani-style Gurmukhi spelling (`slp1-gurmukhi.ts`): tatsama forms only.
Every link is unreviewed, so curator-only. Tadbhava forms (ਗਿਆਨ for jñāna) and case endings on
consonant stems (ਨਾਮੁ for nāman) don't match yet.

## Adding a dictionary

Add its csl-orig id to `COLOGNE_CODES` in `load-entries.ts`, and a migration registering its
`dict_sources` and `source_rights` rows (as 090 does). The parser is the same for every dictionary.
