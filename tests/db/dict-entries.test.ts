/**
 * Migration 070 (plan Phase 0, #249): the raw dictionary-entry layer.
 *
 * `dict_entries` holds every entry a dictionary prints, whether or not the Kosh has the word yet.
 * `dict_entry_links` joins an entry to a word (or lexeme). Links made by matching are unreviewed,
 * so they stay curator-only (#137) until approved. Visibility follows `source_rights` (069).
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { dictEntriesLoadSql, dictEntriesVerifySql, entriesChecksum, type DictEntry } from "../../pipeline/shared/dict-entries";
import { foldGurmukhi } from "../../lib/gurmukhi-fold";
import { BY_DICT_SOURCE_ID } from "../../pipeline/teardown-tables";

const gur = (ref: string, headword: string, body: string): DictEntry => ({
  entry_ref: ref,
  headword_native: headword,
  script: "gurmukhi",
  headword_gurmukhi: headword,
  body_raw: body,
});

async function load(d: PGlite, code: string, entries: DictEntry[]) {
  for (const s of dictEntriesLoadSql(code, entries).statements) await d.exec(s);
}

async function seedWords(d: PGlite) {
  const words: Array<[number, string]> = [[9101, "ਨਾਮੁ"], [9102, "ਸਚੁ"], [9103, "ਸਚ"]];
  for (const [id, g] of words) {
    await d.query("insert into words (id, gurmukhi, search_fold) values ($1, $2, $3)", [id, g, foldGurmukhi(g)]);
  }
}

const SIKHRI = [
  gur("sikhri:wn1", "ਨਾਮੁ", "name"),
  gur("sikhri:wn2", "ਅਲਖੁ", "unseeable"), // no Kosh word
  { ...gur("sikhri:wn3", "cahu", "four"), script: "latin", headword_gurmukhi: null },
];
const MAHAN_KOSH = [gur("mahan_kosh:ਨਾਮੁ#1", "ਨਾਮੁ", "ਨਾਮ ਦਾ ਅਰਥ"), gur("mahan_kosh:ਸਚਿ#1", "ਸਚਿ", "ਸੱਚ ਵਿੱਚ")];

let db: PGlite;

const asRole = async <T,>(role: string, d: PGlite, sql: string): Promise<T[]> => {
  await d.exec(`set role ${role}`);
  try {
    return (await d.query<T>(sql)).rows;
  } finally {
    await d.exec("reset role");
  }
};
const refs = (rows: { entry_ref: string }[]) => rows.map((r) => r.entry_ref).sort();

beforeAll(async () => {
  db = await freshDb();
  await seedWords(db);
  await load(db, "sikhri", SIKHRI);
  await load(db, "mahan_kosh", MAHAN_KOSH);
}, 60_000);

describe("070: loading entries", () => {
  it("stores entries whether or not the Kosh has the word", async () => {
    const { rows } = await db.query<{ entry_ref: string }>(
      "select e.entry_ref from dict_entries e join dict_sources s on s.id = e.dict_source_id where s.code = 'sikhri'",
    );
    expect(refs(rows)).toEqual(["sikhri:wn1", "sikhri:wn2", "sikhri:wn3"]);
  });

  it("links an exact headword match to the word, unreviewed", async () => {
    const { rows } = await db.query(
      `select e.entry_ref, l.word_id, l.match_method, l.review_status from dict_entry_links l
         join dict_entries e on e.id = l.entry_id where e.entry_ref = 'sikhri:wn1'`,
    );
    expect(rows).toEqual([{ entry_ref: "sikhri:wn1", word_id: 9101, match_method: "exact", review_status: "unreviewed" }]);
  });

  it("links by the orthographic fold only when nothing matches exactly", async () => {
    const { rows } = await db.query<{ word_id: number; match_method: string }>(
      `select l.word_id, l.match_method from dict_entry_links l join dict_entries e on e.id = l.entry_id
        where e.entry_ref = 'mahan_kosh:ਸਚਿ#1' order by l.word_id`,
    );
    expect(rows).toEqual([{ word_id: 9102, match_method: "fold" }, { word_id: 9103, match_method: "fold" }]);
    const exact = await db.query("select 1 from dict_entry_links l join dict_entries e on e.id = l.entry_id where e.entry_ref = 'mahan_kosh:ਨਾਮੁ#1' and l.match_method = 'fold'");
    expect(exact.rows).toEqual([]);
  });

  it("verifies a load against the checksum", async () => {
    const { rows } = await db.query<{ n: number; checksum: string }>(dictEntriesVerifySql("sikhri"));
    expect(rows[0]).toEqual({ n: 3, checksum: entriesChecksum(SIKHRI) });
  });
});

describe("070: re-running a load", () => {
  it("keeps ids and refs, updates bodies, and drops entries the source no longer has", async () => {
    const d = await freshDb();
    await seedWords(d);
    await load(d, "sikhri", SIKHRI);
    const before = (await d.query<{ id: number; entry_ref: string }>("select id, entry_ref from dict_entries order by entry_ref")).rows;
    await load(d, "sikhri", [{ ...SIKHRI[0], body_raw: "name, renown" }, SIKHRI[2]]);
    const after = (await d.query<{ id: number; entry_ref: string; body_raw: string }>("select id, entry_ref, body_raw from dict_entries order by entry_ref")).rows;
    expect(after.map((r) => r.entry_ref)).toEqual(["sikhri:wn1", "sikhri:wn3"]);
    expect(after[0].id).toBe(before.find((r) => r.entry_ref === "sikhri:wn1")!.id);
    expect(after[0].body_raw).toBe("name, renown");
  }, 60_000);

  it("moves an unreviewed link when the headword changes, and keeps an approved one", async () => {
    const d = await freshDb();
    await seedWords(d);
    await load(d, "sikhri", SIKHRI);
    await d.exec("update dict_entry_links set review_status = 'approved' where word_id = 9101");
    await load(d, "sikhri", [{ ...SIKHRI[0], headword_native: "ਸਚੁ", headword_gurmukhi: "ਸਚੁ" }]);
    const { rows } = await d.query<{ word_id: number; review_status: string }>(
      "select word_id, review_status from dict_entry_links order by word_id",
    );
    expect(rows).toEqual([{ word_id: 9101, review_status: "approved" }, { word_id: 9102, review_status: "unreviewed" }]);
  }, 60_000);

  it("keeps entry refs immutable", async () => {
    await expect(db.exec("update dict_entries set entry_ref = 'sikhri:wn9' where entry_ref = 'sikhri:wn1'")).rejects.toThrow(/immutable/);
    await expect(db.exec(`update dict_entries set dict_source_id = (select id from dict_sources where code = 'shackle')
                           where entry_ref = 'sikhri:wn1'`)).rejects.toThrow(/immutable/);
  });

  it("refuses a ref that doesn't start with its source's code", async () => {
    await expect(db.exec(`insert into dict_entries (dict_source_id, entry_ref, headword_native, script, body_raw)
      values ((select id from dict_sources where code = 'sikhri'), 'shackle:x', 'x', 'latin', 'x')`)).rejects.toThrow(/sikhri:/);
  });
});

describe("070: visibility", () => {
  it("hides curator-only entries from anon and shows public ones", async () => {
    expect(refs(await asRole("anon", db, "select entry_ref from dict_entries"))).toEqual(["mahan_kosh:ਨਾਮੁ#1", "mahan_kosh:ਸਚਿ#1"]);
    expect(refs(await asRole("authenticated", db, "select entry_ref from dict_entries"))).toEqual(["mahan_kosh:ਨਾਮੁ#1", "mahan_kosh:ਸਚਿ#1"]);
  });

  it("shows anon only approved links on public entries", async () => {
    const d = await freshDb();
    await seedWords(d);
    await load(d, "sikhri", SIKHRI);
    await load(d, "mahan_kosh", MAHAN_KOSH);
    expect(await asRole("anon", d, "select 1 from dict_entry_links")).toEqual([]);
    await d.exec("update dict_entry_links set review_status = 'approved'");
    const visible = await asRole<{ entry_ref: string }>("anon", d,
      "select e.entry_ref from dict_entry_links l join dict_entries e on e.id = l.entry_id");
    expect([...new Set(refs(visible))]).toEqual(["mahan_kosh:ਨਾਮੁ#1", "mahan_kosh:ਸਚਿ#1"]);
  }, 60_000);

  it("keeps the linker away from the API roles", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select link_dict_entries('sikhri')")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("gives each new table exactly one SELECT policy, and not `true`", async () => {
    const { rows } = await db.query<{ tablename: string; n: number; qual: string }>(
      `select tablename, count(*)::int as n, max(qual) as qual from pg_policies
        where schemaname = 'public' and cmd in ('SELECT', 'ALL') and tablename in ('dict_entries', 'dict_entry_links')
        group by tablename order by tablename`,
    );
    expect(rows.map((r) => [r.tablename, r.n])).toEqual([["dict_entries", 1], ["dict_entry_links", 1]]);
    for (const r of rows) expect(r.qual).not.toBe("true");
  });
});

describe("070: teardown", () => {
  it("is covered by the teardown script", () => {
    expect(BY_DICT_SOURCE_ID).toContain("dict_entries");
  });

  it("removes one source's entries and their links, and nothing else", async () => {
    const d = await freshDb();
    await seedWords(d);
    await load(d, "sikhri", SIKHRI);
    await load(d, "mahan_kosh", MAHAN_KOSH);
    await d.exec("delete from dict_entries where dict_source_id = (select id from dict_sources where code = 'sikhri')");
    expect(refs((await d.query<{ entry_ref: string }>("select entry_ref from dict_entries")).rows)).toEqual(["mahan_kosh:ਨਾਮੁ#1", "mahan_kosh:ਸਚਿ#1"]);
    const orphans = await d.query("select 1 from dict_entry_links l where not exists (select 1 from dict_entries e where e.id = l.entry_id)");
    expect(orphans.rows).toEqual([]);
    expect((await d.query("select 1 from dict_entry_links")).rows.length).toBe(3);
  }, 60_000);
});
