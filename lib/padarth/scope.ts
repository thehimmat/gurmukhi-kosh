// The pad-arth builder's scope, read from and written to its URL (/admin/padarth):
//   ?ang=N[&source=code]   an ang of one source (Guru Granth Sahib by default)
//   ?shabad=N              a shabad
//   ?bani=N&p=M            paragraph M of a bani (migration 059); Japji's paragraph 4 is Pauri 1
// Anything malformed is no scope, never a guess.

import type { DraftScope } from "./fetch";

type Params = Record<string, string | string[] | undefined>;

const DEFAULT_SOURCE = "sggs_banidb_v2";
const SOURCE_CODE = /^[a-z0-9_]+$/;

function positiveInt(v: string | string[] | undefined): number | null {
  if (typeof v !== "string" || !/^[1-9][0-9]{0,8}$/.test(v)) return null;
  return Number(v);
}

export function parseScope(params: Params): DraftScope | null {
  const bani = positiveInt(params.bani);
  if (params.bani !== undefined) {
    const p = positiveInt(params.p);
    return bani && p ? { kind: "paragraph", baniId: bani, ordinal: p } : null;
  }
  if (params.shabad !== undefined) {
    const id = positiveInt(params.shabad);
    return id ? { kind: "shabad", shabadId: id } : null;
  }
  if (params.ang !== undefined) {
    const ang = positiveInt(params.ang);
    const source = params.source ?? DEFAULT_SOURCE;
    if (!ang || typeof source !== "string" || !SOURCE_CODE.test(source)) return null;
    return { kind: "ang", sourceCode: source, ang };
  }
  return null;
}

/** The builder's URL for a scope. No key: /admin pages read it from the cookie (lib/curator.ts). */
export function scopeHref(scope: DraftScope): string {
  const q = new URLSearchParams();
  if (scope.kind === "paragraph") {
    q.set("bani", String(scope.baniId));
    q.set("p", String(scope.ordinal));
  } else if (scope.kind === "shabad") {
    q.set("shabad", String(scope.shabadId));
  } else if (scope.kind === "ang") {
    q.set("ang", String(scope.ang));
    if (scope.sourceCode !== DEFAULT_SOURCE) q.set("source", scope.sourceCode);
  } else {
    throw new Error("scopeHref: passage ids are not a page URL; use the bani paragraph");
  }
  return `/admin/padarth?${q}`;
}

/** The Google Slides export for a scope (app/admin/padarth/slides). */
export function slidesHref(scope: DraftScope): string {
  return scopeHref(scope).replace("/admin/padarth?", "/admin/padarth/slides?");
}

/** A scope's name, for a deck's title slide and its file name. */
export function scopeTitle(scope: DraftScope, baniName?: string): string {
  if (scope.kind === "paragraph") return `${baniName ?? `Bani ${scope.baniId}`}, paragraph ${scope.ordinal}`;
  if (scope.kind === "ang") return `Ang ${scope.ang}`;
  if (scope.kind === "shabad") return `Shabad ${scope.shabadId}`;
  return `Passage ${scope.passageId}`;
}
