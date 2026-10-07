'use client';

import { useLinkStatus } from 'next/link';

// Tabs switch by ?tab= on the same route, which never triggers loading.tsx,
// so the clicked tab itself has to show that the server is working (#126).
export function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus();
  return (
    <span className={pending ? 'animate-pulse' : undefined} aria-busy={pending || undefined}>
      {label}
      {pending && <span aria-hidden="true" style={{ marginLeft: '0.35rem' }}>…</span>}
    </span>
  );
}
