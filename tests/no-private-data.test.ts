/**
 * The repo is public. The granth catalogue and the Drive scans inventory live in the private
 * thehimmat/granth-catalogue repo, so ids of files in the user's Google Drive must not be committed
 * here: a link-shared file can be opened by anyone holding its id.
 * Run: npm test
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);

const DRIVE_ID = /drive\.google\.com\/(?:file\/d|drive\/folders|open\?id=)|"drive_id"\s*:|^\s*drive_id\s*:/m;

describe("private data", () => {
  it("keeps the catalogue and the scans inventory out of this repo", () => {
    const moved = tracked.filter((f) =>
      /^pipeline\/catalogue\/|^pipeline\/scans\/(manifest\.yaml|inventory\/|pilots\/)/.test(f),
    );
    expect(moved).toEqual([]);
  });

  it("commits no Google Drive file ids", () => {
    const thisFile = "tests/no-private-data.test.ts";
    const hits = tracked.filter((f) => {
      if (f === thisFile || f === "package-lock.json") return false;
      try {
        return DRIVE_ID.test(readFileSync(join(root, f), "utf8"));
      } catch {
        return false;
      }
    });
    expect(hits).toEqual([]);
  });
});
