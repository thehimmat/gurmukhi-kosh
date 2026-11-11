/**
 * selfhost/scripts/load-entries.sh: pipes each load directory (writeLoadDir) to the server's psql,
 * then checks verify.sql's n and checksum against expected.txt. Here KOSH_PSQL stands in for the
 * server: a stub that logs what it was sent and answers verify.sql with a fixed row.
 */
import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

const SCRIPT = path.resolve("selfhost/scripts/load-entries.sh");

function setup(verifyAnswer: string) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "load-script-"));
  const load = path.join(dir, "cologne_x");
  fs.mkdirSync(load);
  fs.writeFileSync(path.join(load, "0001.sql"), "insert one;\n");
  fs.writeFileSync(path.join(load, "0002.sql"), "select link_dict_entries('cologne_x');\n");
  fs.writeFileSync(path.join(load, "verify.sql"), "select count(*) from dict_entries;\n");
  fs.writeFileSync(path.join(load, "expected.txt"), "2|abc\n");
  const log = path.join(dir, "sent.log");
  const stub = path.join(dir, "psql.sh");
  fs.writeFileSync(
    stub,
    `#!/bin/sh\ninput=$(cat)\nprintf '%s\\n' "$input" >> ${log}\ncase "$input" in *"count(*)"*) echo '${verifyAnswer}' ;; *link_dict_entries*) echo 17 ;; esac\n`,
  );
  fs.chmodSync(stub, 0o755);
  return { load, log, env: { ...process.env, KOSH_PSQL: stub } };
}

const run = (args: string[], env: NodeJS.ProcessEnv) => {
  try {
    return { code: 0, out: execFileSync("sh", [SCRIPT, ...args], { env, encoding: "utf-8", stdio: "pipe" }) };
  } catch (e) {
    const err = e as { status: number; stdout: string; stderr: string };
    return { code: err.status, out: err.stdout + err.stderr };
  }
};

describe("load-entries.sh", () => {
  it("sends the statements in order, then passes when the database matches expected.txt", () => {
    const { load, log, env } = setup("2|abc");
    const { code, out } = run([load], env);
    expect(code).toBe(0);
    expect(fs.readFileSync(log, "utf-8")).toMatch(/insert one;\nselect link_dict_entries\('cologne_x'\);[\s\S]*count\(\*\)/);
    expect(out).toMatch(/cologne_x: n=2 checksum=abc OK/);
    expect(out).toMatch(/links proposed: 17/);
  });

  it("stops with a non-zero exit when the count or checksum differs", () => {
    const { load, env } = setup("1|zzz");
    const { code, out } = run([load, load], env);
    expect(code).toBe(1);
    expect(out).toMatch(/MISMATCH/);
    expect(out.match(/== /g)).toHaveLength(1); // didn't go on to the next directory
  });

  it("refuses a directory without expected.txt", () => {
    const { load, env } = setup("2|abc");
    fs.rmSync(path.join(load, "expected.txt"));
    expect(run([load], env).code).not.toBe(0);
  });
});
