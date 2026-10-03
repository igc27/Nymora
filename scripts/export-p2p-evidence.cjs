'use strict';
const fs = require('node:fs');
const path = require('node:path');
for (const name of fs.readdirSync('.qa').filter(name => name.startsWith('p2p-e2e-')).sort().reverse()) {
  const file = path.join('.qa', name, 'evidence.json'); if (!fs.existsSync(file)) continue;
  const result = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!result.evidence.some(step => step.step === 'Complete legal P2P media flow' && step.result === 'PASS')) continue;
  result.executable = result.executablePath.includes('Programs\\Nymora') ? 'Installed Windows Setup application' : 'Packaged/development Windows application';
  delete result.executablePath;
  fs.writeFileSync('docs/p2p-qa-evidence.json', JSON.stringify(result, null, 2) + '\n');
  console.log('Exported sanitized P2P media-flow evidence.'); process.exit(0);
}
throw new Error('No passing P2P desktop evidence was found.');
