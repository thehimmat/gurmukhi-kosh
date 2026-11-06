import { cookies } from "next/headers";
import { ADMIN_COOKIE, isCurator } from "./curator";

// Server-side reads of the admin cookie (lib/curator.ts, proxy.ts). Kept apart from lib/curator.ts
// so modules that only need isCurator don't pull in next/headers.

/** The admin key, from the cookie, or from a ?key the proxy hasn't swapped yet. Null if neither is valid. */
export async function adminKey(param?: unknown): Promise<string | null> {
  const fromCookie = (await cookies()).get(ADMIN_COOKIE)?.value;
  if (isCurator(fromCookie)) return fromCookie!;
  return typeof param === "string" && isCurator(param) ? param : null;
}

/** For server actions: the cookie only, so the key is never an action argument. */
export async function requireAdmin(): Promise<void> {
  if (!isCurator((await cookies()).get(ADMIN_COOKIE)?.value)) throw new Error("Unauthorized");
}
