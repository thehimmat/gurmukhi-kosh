import { config } from 'dotenv';
import { computeCollocationsCorpusWide } from './collocations';

config({ path: '.env.local' });

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
