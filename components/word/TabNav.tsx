import Link from 'next/link';

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
}

export function TabNav({ gurmukhi, currentTab = 'overview' }: TabNavProps) {
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
        const href = `/word/${encodeURIComponent(gurmukhi)}?tab=${tab.id}`;
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
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
