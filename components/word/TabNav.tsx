import Link from 'next/link';
import { curatorHref } from '@/lib/curator-href';
import { TabLabel } from './TabLabel';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'meanings', label: 'Meanings' },
  { id: 'grammar', label: 'Grammar' },
  { id: 'etymology', label: 'Etymology' },
  { id: 'pronunciation', label: 'Pronunciation' },
  { id: 'usage', label: 'Usage' },
  { id: 'occurrences', label: 'Occurrences' },
  { id: 'sources', label: 'Sources' },
  // Curator only: dictionary entries linked to the word, mostly unreviewed (089, 092).
  { id: 'dictionaries', label: 'Dictionaries', curatorOnly: true },
];

interface TabNavProps {
  gurmukhi: string;
  currentTab?: string;
  /** Set in curator mode (/admin/word) so switching tabs keeps it (#125). */
  curator?: boolean;
}

export function TabNav({ gurmukhi, currentTab = 'overview', curator = false }: TabNavProps) {
  return (
    <nav
      style={{
        borderBottom: '1px solid var(--border)',
        marginBottom: '1.5rem',
        display: 'flex',
        gap: '0',
        overflowX: 'auto',
      }}
    >
      {TABS.filter((tab) => curator || !('curatorOnly' in tab)).map((tab) => {
        const isActive = currentTab === tab.id;
        const href = curatorHref(`/word/${encodeURIComponent(gurmukhi)}?tab=${tab.id}`, curator);
        return (
          <Link
            key={tab.id}
            href={href}
            // The word page is dynamic, so a prefetch fetches nothing reusable,
            // and under search.atthebunga.com Next's segment prefetch doesn't
            // survive the shell's multi-zone rewrite: every tab's prefetch came
            // back a (CDN-cached) 404 (#202). Navigation still uses RSC.
            prefetch={false}
            style={{
              padding: '0.75rem 1.25rem',
              borderBottom: isActive ? '2px solid var(--text-primary)' : 'none',
              color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              textDecoration: 'none',
              fontSize: '0.9375rem',
              fontWeight: isActive ? 600 : 400,
              whiteSpace: 'nowrap',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
            }}
          >
            <TabLabel label={tab.label} />
          </Link>
        );
      })}
    </nav>
  );
}
