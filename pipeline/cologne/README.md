# Cologne Sanskrit dictionaries

Plan Phase 1 (#249): the Cologne Digital Sanskrit Dictionaries
([csl-orig](https://github.com/sanskrit-lexicon/csl-orig)) loaded whole into `dict_entries` (089),
one row per Cologne record (`<code>:L<id>`).

| csl-orig | Dictionary | Code | Migration | Rights |
|---|---|---|---|---|
| `mw` | Monier-Williams 1899 | `cologne_mw` | 090 | open |
| `mw72` | Monier-Williams 1872 | `cologne_mw72` | 091 | open |
| `ap90` | Apte 1890 | `cologne_ap90` | 091 | open |
| `ap` | Apte 1957-59 | `cologne_ap` | 091 | pending |
| `md` | Macdonell 1893 | `cologne_md` | 091 | open |
| `ben` | Benfey 1866 | `cologne_ben` | 091 | open |
| `cae` | Cappeller 1891 | `cologne_cae` | 091 | open |
| `vei` | Vedic Index 1912 | `cologne_vei` | 091 | open |
| `pwg` | Böhtlingk & Roth 1855-75 | `cologne_pwg` | 091 | open |
| `gra` | Grassmann 1873 | `cologne_gra` | 091 | open |
| `vcp` | Vācaspatyam 1873-84 | `cologne_vcp` | 091 | open |
| `skd` | Śabdakalpadruma 1822-58 | `cologne_skd` | 091 | open |
| `shs` | Śabda-Sāgara 1900 | `cologne_shs` | 091 | open |
| `bhs` | Edgerton 1953 | `cologne_bhs` | 091 | pending |

All are curator-only: Cologne's digitization is CC BY-SA 4.0 (#273), so going public waits on how
the Kosh carries share-alike data. `pending` means the printed text itself may still be in copyright.

## Load

From your Mac, in this repo (csl-orig cloned beside it):

```sh
git clone --depth 1 https://github.com/sanskrit-lexicon/csl-orig ../csl-orig   # once
dicts="mw72 ap90 ap md ben cae vei pwg gra vcp skd shs bhs"
for d in $dicts; do npm run -s load:cologne -- --dict=$d --csl=../csl-orig; done
sh selfhost/scripts/load-entries.sh $(for d in $dicts; do echo pipeline/cologne/output/$d; done)
```

The loader writes `pipeline/cologne/output/<id>/` (numbered SQL, `verify.sql`, `expected.txt`);
`load-entries.sh` sends each to the server over SSH, checks n and checksum, and stops at the first
mismatch. Re-running is safe. Write down the csl-orig commit the loader prints in
`supabase/APPLIED.md` with the load.

## Linking

Headwords link on a Gurbani-style Gurmukhi spelling (`slp1-gurmukhi.ts`): tatsama forms only.
Every link is unreviewed, so curator-only. Tadbhava forms (ਗਿਆਨ for jñāna) and case endings on
consonant stems (ਨਾਮੁ for nāman) don't match yet.

## Adding a dictionary

Add its csl-orig id to `codes.ts`, and a migration registering its `dict_sources` and
`source_rights` rows (as 090 and 091 do). The parser is the same for every dictionary.
