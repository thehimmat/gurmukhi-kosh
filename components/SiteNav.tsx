"use client";

import { usePathname } from "next/navigation";
import { NAV_LINKS, activeNavHref } from "@/lib/site";

// Header nav (#127). Plain <a> rather than <Link>: /, /browse and /about are
// served by different zones of the same domain (gurmukhi-search proxies the
// dictionary paths here), so client-side routing would not cross them.
export function SiteNav() {
  const active = activeNavHref(usePathname() ?? "");
  return (
    <nav aria-label="Site" style={{ display: "flex", flexWrap: "wrap", gap: "0.25rem 1.1rem", fontFamily: '"Inter", sans-serif', fontSize: "0.85rem" }}>
      {NAV_LINKS.map(({ href, label }) => {
        const current = href === active;
        return (
          <a
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            style={{
              color: current ? "var(--text-primary)" : "var(--text-secondary)",
              fontWeight: current ? 600 : 400,
              textDecoration: "none",
            }}
          >
            {label}
          </a>
        );
      })}
    </nav>
  );
}
