/**
 * Migration 069 (#258): sources that need permission are curator-only.
 *
 * `source_rights` says, per source code, whether its data is public or curator-only. RLS hides
 * curator-only rows from the API roles (anon, authenticated); the curator reads through the service
 * role, which bypasses RLS. A code with no `source_rights` row is hidden (fail closed), so a newly
 * crawled source never goes public by accident. Releasing a source is one update.
 */
import { describe, it, expect, beforeAll } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { freshDb } from "./replay";
import { linesLoadSql } from "../../pipeline/shared/load-sql";

let db: PGlite;

const dictId = (code: string) => `(select id from dict_sources where code = '${code}')`;

async function seed(d: PGlite) {
  // dict_sources rows that production has but the replay may not.
  await d.exec(`
    insert into dict_sources (code, name, language) values
      ('mahan_kosh_en_pu', 'English Mahan Kosh', 'en')
    on conflict (code) do nothing;
  `);
  await d.exec(linesLoadSql("sggs_banidb_v2", [
    { verse_id: 1, ang: 1, line_no: 1, shabad_id: null, gurmukhi: "ਨਾਮੁ ਜਪਿ" },
  ]).sql);
  await d.exec(`
    insert into words (id, gurmukhi, in_corpus, origin_source, roman_shackle, shackle_page) values
      (9001, 'ਸਚੁ', true, null, 'sacu', 12),
      (9002, 'ਖਾਸੁ', false, 'shackle', 'khāsu', 40),
      (9003, 'ਅਨਾਥੁ', false, null, null, null);

    insert into definitions (word_id, dict_source_id, definition_text) values
      (9001, ${dictId("mahan_kosh")}, 'mk sense'),
      (9001, ${dictId("shackle")}, 'shackle sense '),
      (9001, ${dictId("sikhri")}, 'sikhri sense'),
      (9001, ${dictId("mahan_kosh_en_pu")}, 'english mk sense');

    insert into etymology (word_id, order_index, origin_language, source_code) values
      (9001, 0, 'Sanskrit', null),
      (9001, 1, 'Persian', 'shackle');

    insert into word_grammar (word_id, pos, source_code) values
      (9001, 'noun', 'mahan_kosh'),
      (9001, 'noun', 'shackle'),
      (9001, 'noun', 'ss_padarth'),
      (9001, 'noun', 'not_registered');

    insert into lexemes (id, root_word_id, gloss_en) values (77, 9001, 'truth'), (78, 9001, 'uncited');
    insert into lexeme_citations (lexeme_id, source_code, citation_roman) values (77, 'shackle', 'sacu');
    insert into lexeme_relations (from_lexeme_id, to_lexeme_id, relation_type, source_code, label_raw)
      values (77, 78, 'see_also', 'shackle', 'cf.');
    insert into word_forms (word_id, lexeme_id, source_code) values (9001, 77, 'shackle');

    insert into dict_examples (word_id, dict_source_id, quote_roman) values (9001, ${dictId("shackle")}, 'sacu nāmu');
  `);
  const lineId = (await d.query<{ id: number }>("select id from lines limit 1")).rows[0].id;
  await d.exec(`
    insert into line_translations (line_id, source_code, language, body_unicode) values
      (${lineId}, 'faridkot', 'pa', 'faridkot teeka'),
      (${lineId}, 'ss_darpan', 'pa', 'darpan arth'),
      (${lineId}, 'ss_padarth', 'pa', 'padarth');
    insert into padarth_glosses (id, line_id, source_code, ordinal, kind, term, gloss)
      values (501, ${lineId}, 'ss_padarth', 1, 'entry', 'ਸਚੁ', 'ਸਦਾ ਕਾਇਮ ਰਹਿਣ ਵਾਲਾ');
    insert into padarth_case_evidence (gloss_id, gram_case, marker, basis) values (501, 'genitive', 'ਦਾ', 'test');
  `);
  const occ = (await d.query<{ id: number }>("select id from word_occurrences limit 1")).rows[0];
  if (occ) await d.exec(`insert into padarth_gloss_occurrences (gloss_id, word_occurrence_id, match) values (501, ${occ.id}, 'exact')`);
}

const asAnon = async <T,>(sql: string): Promise<T[]> => {
  await db.exec("set role anon");
  try {
    return (await db.query<T>(sql)).rows;
  } finally {
    await db.exec("reset role");
  }
};
const texts = (rows: { t: string }[]) => rows.map((r) => r.t).sort();

beforeAll(async () => {
  db = await freshDb();
  await seed(db);
}, 60_000);

describe("069: source_rights registry", () => {
  it("seeds every existing source code with a visibility", async () => {
    const { rows } = await db.query<{ code: string; visibility: string }>(
      "select code, visibility from source_rights order by code",
    );
    const vis = Object.fromEntries(rows.map((r) => [r.code, r.visibility]));
    expect(vis).toMatchObject({
      mahan_kosh: "public",
      mahan_kosh_1930: "public",
      manual: "public",
      faridkot: "public",
      shackle: "curator",
      sikhri: "curator",
      mahan_kosh_en_pu: "curator",
      ss_darpan: "curator",
      ss_padarth: "curator",
    });
  });

  it("is readable by anon but not writable", async () => {
    expect((await asAnon("select code from source_rights")).length).toBeGreaterThan(0);
    await db.exec("set role anon");
    try {
      await expect(db.exec("update source_rights set visibility = 'public' where code = 'shackle'")).rejects.toThrow();
    } finally {
      await db.exec("reset role");
    }
  });

  it("only accepts known visibility and rights values", async () => {
    await expect(db.exec("insert into source_rights (code, visibility, rights_status) values ('x', 'secret', 'pd')")).rejects.toThrow();
    await expect(db.exec("insert into source_rights (code, visibility, rights_status) values ('x', 'public', 'maybe')")).rejects.toThrow();
  });
});

describe("069: anon sees only public sources", () => {
  it("hides curator-only definitions", async () => {
    expect(texts(await asAnon("select definition_text as t from definitions where word_id = 9001"))).toEqual(["mk sense"]);
  });

  it("keeps unsourced etymology and hides Shackle's", async () => {
    expect(texts(await asAnon("select origin_language as t from etymology where word_id = 9001"))).toEqual(["Sanskrit"]);
  });

  it("hides Shackle and pad-arth grammar, and fails closed on an unregistered source", async () => {
    expect(texts(await asAnon("select source_code as t from word_grammar where word_id = 9001"))).toEqual(["mahan_kosh"]);
  });

  it("hides Shackle lexemes, citations, form links and examples", async () => {
    expect(await asAnon("select 1 from lexeme_citations")).toEqual([]);
    expect(await asAnon("select 1 from word_forms")).toEqual([]);
    expect(await asAnon("select 1 from dict_examples")).toEqual([]);
    expect(await asAnon("select 1 from lexemes")).toEqual([]);
  });

  it("hides Shackle's abbreviation tables", async () => {
    expect(await asAnon("select 1 from citation_sigla where source_code = 'shackle'")).toEqual([]);
    expect(await asAnon("select 1 from dict_mappings where source_code = 'shackle'")).toEqual([]);
    expect(await asAnon("select 1 from pos_mappings where source_code = 'shackle'")).toEqual([]);
  });

  it("hides Darpan line translations and keeps the rest", async () => {
    expect(texts(await asAnon("select source_code as t from line_translations"))).toEqual(["faridkot"]);
  });

  it("hides pad-arth glosses and everything hung on them", async () => {
    expect(await asAnon("select 1 from padarth_glosses")).toEqual([]);
    expect(await asAnon("select 1 from padarth_case_evidence")).toEqual([]);
    expect(await asAnon("select 1 from padarth_gloss_occurrences")).toEqual([]);
  });

  it("keeps the words policy `true`, so anon searches still use the trigram and LIKE indexes", async () => {
    const { rows } = await db.query<{ qual: string }>(
      "select qual from pg_policies where schemaname = 'public' and tablename = 'words' and cmd = 'SELECT'",
    );
    expect(rows).toEqual([{ qual: "true" }]);
  });

  it("withholds Shackle-derived columns of words from anon", async () => {
    await db.exec("set role anon");
    try {
      for (const col of ["roman_shackle", "shackle_page", "spelling_candidate", "spelling_review_note"]) {
        await expect(db.query(`select ${col} from words limit 1`)).rejects.toThrow(/permission denied/);
      }
    } finally {
      await db.exec("reset role");
    }
  });

  it("still lets anon read every other words column (a new column needs its own grant)", async () => {
    const { rows } = await db.query<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'words'
          and column_name not in ('roman_shackle', 'shackle_page', 'spelling_candidate', 'spelling_review_note')`,
    );
    const cols = rows.map((r) => r.column_name).join(", ");
    expect((await asAnon(`select ${cols} from words where id = 9001`)).length).toBe(1);
  });
});

describe("069: curator and release", () => {
  it("lets the service role (curator) read everything", async () => {
    await db.exec("set role service_role");
    try {
      const { rows } = await db.query<{ n: number }>("select count(*)::int as n from definitions where word_id = 9001");
      expect(rows[0].n).toBe(4);
      expect((await db.query("select roman_shackle from words where id = 9001")).rows).toEqual([{ roman_shackle: "sacu" }]);
    } finally {
      await db.exec("reset role");
    }
  });

  it("releases a source with one update", async () => {
    const fresh = await freshDb();
    await seed(fresh);
    await fresh.exec("update source_rights set visibility = 'public', rights_status = 'permitted' where code = 'shackle'");
    await fresh.exec("set role anon");
    const defs = (await fresh.query<{ t: string }>("select definition_text as t from definitions where word_id = 9001")).rows;
    const lex = (await fresh.query("select id from lexemes")).rows;
    await fresh.exec("reset role");
    expect(texts(defs)).toEqual(["mk sense", "shackle sense "]);
    expect(lex).toEqual([{ id: 77 }]); // the uncited lexeme stays hidden: a lexeme is public through a public citation
  }, 60_000);
});

describe("069: the other ways in", () => {
  it("hides Shackle's lexeme relations", async () => {
    expect(await asAnon("select 1 from lexeme_relations")).toEqual([]);
  });

  it("definitions_with_pua (security definer) returns only public sources", async () => {
    expect(await asAnon("select id from definitions_with_pua('shackle')")).toEqual([]);
  });

  it("keeps the materialized views that ignore RLS away from anon", async () => {
    await db.exec("set role anon");
    try {
      await expect(db.query("select 1 from word_source_stats limit 1")).rejects.toThrow(/permission denied/);
      await expect(db.query("select 1 from word_stem_groups limit 1")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("shows anon which codes are public, but not the notes or outreach issue", async () => {
    expect((await asAnon("select code, visibility from source_rights")).length).toBeGreaterThan(0);
    await db.exec("set role anon");
    try {
      await expect(db.query("select notes from source_rights")).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec("reset role");
    }
  });

  it("gives each policed table exactly one SELECT policy, so no stray `true` policy can undo the gate", async () => {
    const policed = [
      "definitions", "dict_examples", "etymology", "word_grammar", "word_forms", "lexemes", "lexeme_citations",
      "lexeme_relations", "citation_sigla", "dict_mappings", "pos_mappings", "line_translations",
      "padarth_glosses", "padarth_gloss_occurrences", "padarth_case_evidence",
    ];
    const { rows } = await db.query<{ tablename: string; n: number; qual: string }>(
      `select tablename, count(*)::int as n, max(qual) as qual from pg_policies
        where schemaname = 'public' and cmd in ('SELECT', 'ALL') and tablename = any($1) group by tablename`,
      [policed],
    );
    expect(rows.map((r) => r.tablename).sort()).toEqual([...policed].sort());
    for (const r of rows) {
      expect(r.n, r.tablename).toBe(1);
      expect(r.qual, r.tablename).not.toBe("true");
    }
  });

  it("applies the same gate to the authenticated role", async () => {
    await db.exec("set role authenticated");
    try {
      const defs = (await db.query<{ t: string }>("select definition_text as t from definitions where word_id = 9001")).rows;
      expect(texts(defs)).toEqual(["mk sense"]);
      expect((await db.query("select 1 from line_translations where source_code = 'ss_darpan'")).rows).toEqual([]);
    } finally {
      await db.exec("reset role");
    }
  });

  it("releasing ss_padarth exposes its glosses and everything hung on them", async () => {
    const fresh = await freshDb();
    await seed(fresh);
    await fresh.exec("update source_rights set visibility = 'public' where code = 'ss_padarth'");
    await fresh.exec("set role anon");
    const glosses = (await fresh.query("select id from padarth_glosses")).rows;
    const evidence = (await fresh.query("select gloss_id from padarth_case_evidence")).rows;
    await fresh.exec("reset role");
    expect(glosses).toEqual([{ id: 501 }]);
    expect(evidence).toEqual([{ gloss_id: 501 }]);
  }, 60_000);
});
