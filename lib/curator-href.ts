// Links in curator mode (#125). Curator mode lives under /admin, behind the admin cookie
// (lib/curator.ts), so a link never carries the key: a curator's word link goes to /admin/word/<w>.
// Separate from lib/curator.ts so client components can import it without the server helpers.

export function curatorHref(href: string, curator: boolean): string {
  return curator && (href === "/word" || href.startsWith("/word/")) ? `/admin${href}` : href;
}
