import Link from 'next/link';
import { withCuratorKey } from '@/lib/curator';
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
];

interface TabNavProps {
  gurmukhi: string;
  currentTab?: string;
  /** Set in curator mode so switching tabs keeps it (#125). */
  curatorKey?: string | null;
}

export function TabNav({ gurmukhi, currentTab = 'overview', curatorKey = null }: TabNavProps) {
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
      {TABS.map((tab) => {
        const isActive = currentTab === tab.id;
        const href = withCuratorKey(`/word/${encodeURIComponent(gurmukhi)}?tab=${tab.id}`, curatorKey);
        return (
          <Link
            key={tab.id}
            href={href}
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
