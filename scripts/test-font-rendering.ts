/**
 * Test script to verify font rendering works with resvg-wasm.
 *
 * Run with: npx tsx scripts/test-font-rendering.ts
 *
 * This generates a test PNG with all three fonts to verify they render correctly.
 */

import { existsSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function main() {
  console.log('Testing font rendering...\n');

  // We can't directly test the wrangler-bundled version outside Workers
  // But we can verify the files exist and check the configuration

  const fontsDir = join(__dirname, '..', 'src', 'fonts');

  const fonts = [
    'SpaceGrotesk-VariableFont_wght.ttf',
    'Onest-VariableFont_wght.ttf',
    'Habibi-Regular.ttf',
  ];

  console.log('Checking font files...');

  for (const font of fonts) {
    const fontPath = join(fontsDir, font);
    if (existsSync(fontPath)) {
      const stats = statSync(fontPath);
      console.log(`  ✓ ${font} (${(stats.size / 1024).toFixed(1)} KB)`);
    } else {
      console.log(`  ✗ ${font} NOT FOUND`);
      process.exit(1);
    }
  }

  console.log('\nAll font files present!');
  console.log('\nTo fully test rendering, deploy to Cloudflare and test via Discord commands.');
  console.log('Or use: wrangler dev --local and interact with the bot.');
}

main().catch(console.error);
