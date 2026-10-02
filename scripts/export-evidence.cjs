'use strict';
const fs = require('node:fs');
const path = require('node:path');
const folders = fs.readdirSync('.qa').filter(name => name.startsWith('e2e-')).sort().reverse();
for (const folder of folders) {
  const file = path.join('.qa', folder, 'evidence.json');
  if (!fs.existsSync(file)) continue;
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!raw.evidence.some(step => step.step === 'End-to-end core media flow' && step.result === 'PASS')) continue;
  const result = { application: 'Nymora', version: '1.0.0', timestamp: raw.timestamp, executable: raw.executablePath.includes('Programs\\Nymora') ? 'Installed Windows Setup application' : 'Packaged/development Windows application', runner: require('@playwright/test/package.json').version, legalMedia: 'Original developer-generated 90-second motion/color/tone video; original English and Arabic test subtitles', evidence: raw.evidence };
  fs.writeFileSync('docs/qa-evidence.json', JSON.stringify(result, null, 2) + '\n');
  console.log(`Exported ${raw.evidence.filter(step => step.result === 'PASS').length} passing desktop checks, with local machine paths omitted.`);
  process.exit(0);
}
throw new Error('No successful desktop media-flow evidence was found.');
