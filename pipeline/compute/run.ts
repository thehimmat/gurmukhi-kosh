import { computeCollocationsCorpusWide } from './collocations';

async function main() {
  try {
    await computeCollocationsCorpusWide();
    console.log('✓ Collocations computation complete');
    process.exit(0);
  } catch (err) {
    console.error('✗ Collocations computation failed:', err);
    process.exit(1);
  }
}

main();
