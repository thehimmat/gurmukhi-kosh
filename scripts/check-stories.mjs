#!/usr/bin/env node
// CI gate for user stories (issue #91): every story in user-stories/ that is
// not superseded (and not test_mode: manual) must be referenced by at least
// one test under tests/ — a describe/it name or comment containing its ID.
// Delivered stories keep their tests too; that is how they stay delivered.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const storiesDir = join(root, "user-stories");
const testsDir = join(root, "tests");

function frontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---/);
  const fm = {};
  if (!m) return fm;
  for (const line of m[1].split("\n")) {
    const kv = line.match(/^(\w[\w_]*):\s*(.*)$/);
    if (kv) fm[kv[1]] = kv[2].trim();
  }
  return fm;
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(test|spec)\.[jt]sx?$/.test(entry.name)) yield p;
  }
}

const testCorpus = [...walk(testsDir)].map((p) => readFileSync(p, "utf8")).join("\n");

const failures = [];
for (const file of readdirSync(storiesDir)) {
  if (!/^US-\d+.*\.md$/.test(file)) continue;
  const text = readFileSync(join(storiesDir, file), "utf8");
  const fm = frontmatter(text);
  const id = fm.id ?? file.match(/^(US-\d+)/)[1];
  if (fm.status === "superseded") continue;
  if (fm.test_mode === "manual") continue;
  if (!testCorpus.includes(id)) {
    failures.push(`${id} (${file}) has no test referencing it under tests/`);
  }
}

if (failures.length > 0) {
  console.error("check-stories FAILED — untested active stories:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("check-stories OK — every active story is referenced by a test.");
