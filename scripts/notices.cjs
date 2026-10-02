'use strict';
const fs = require('node:fs');
const path = require('node:path');
const deps = ['hls.js', 'electron', 'electron-builder', 'eslint', '@playwright/test', 'playwright', 'playwright-core'];
fs.mkdirSync('third_party/dependencies', { recursive: true });
const inventory = [];
let text = '# Third-party notices\n\nNymora is an independent open-source application. It is not affiliated with or endorsed by Stremio.\n\nCopyright © 2026 Mohammed Alanazi applies to original Nymora code, modifications, branding and assets. Upstream work retains its original copyright and license.\n\n## Stremio addon-client\n\nRevision: 7c66830cfc1a8e749373d9df0bb105c7dad33bfd. MIT. Selected client and protocol primitives are reused. The complete notice follows:\n\n' + fs.readFileSync('vendor/stremio-addon-client/LICENSE.md', 'utf8') + '\n\n## Stremio addon-sdk protocol documentation\n\nRevision: ec4e0a49e61bac4f2285891d39414dfbafe93f58. MIT; Copyright © 2019 SmartCode OOD. Complete license in third_party/stremio-addon-sdk/LICENSE.md. No SDK executable code is bundled.\n\n## Bundled runtime and build dependencies\n\n';
for (const name of deps) {
  const dir = path.join('node_modules', name);
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const files = fs.readdirSync(dir).filter(f => /^(license|copying|notice)(\.|$)/i.test(f));
  if (!files.length) throw new Error(`No license file for ${name}`);
  const out = path.join('third_party/dependencies', name.replace('/', '-')); fs.mkdirSync(out, { recursive: true });
  let notices = '';
  for (const file of files) { const body = fs.readFileSync(path.join(dir, file), 'utf8'); fs.writeFileSync(path.join(out, file), body); notices += body + '\n'; }
  inventory.push({ name, version: pkg.version, license: pkg.license, repository: pkg.repository, usage: ['hls.js', 'electron'].includes(name) ? 'Shipped runtime' : 'Build or test only', licenseFiles: files });
  text += `### ${name} ${pkg.version}\n\nLicense: ${pkg.license}. ${['hls.js', 'electron'].includes(name) ? 'Shipped runtime.' : 'Build/test only; not application runtime code.'}\n\n${notices}\n\n`;
}
text += '## Apache License 2.0\n\nhls.js includes Copyright (c) 2017 Dailymotion and Copyright (c) 2013-2015 Brightcove notices above. It is distributed unmodified. The full applicable Apache license follows:\n\n' + fs.readFileSync('third_party/Apache-2.0.txt', 'utf8') + '\n\n';
text += '## NSIS Windows installer runtime\n\nNSIS 3.0.4.1 as packaged by electron-builder-binaries. Copyright (C) 1999-2018 Contributors in the included distribution. NSIS uses zlib/libpng, bzip2 and CPL-1.0 for the LZMA module with an explicit linking exception. Nymora does not modify those native modules. Original source and licensing: https://nsis.sourceforge.io/ and https://github.com/electron-userland/electron-builder-binaries. The complete distribution COPYING notice follows:\n\n' + fs.readFileSync('third_party/NSIS-COPYING.txt', 'utf8') + '\n\n';
text += '## Chromium and Electron subcomponents\n\nThe packaged Electron runtime retains LICENSE.electron.txt and LICENSES.chromium.html, including Chromium, FFmpeg and other third-party notices. Those files are distributed next to Nymora.exe. Electron is downloaded from its official distribution by electron-builder; it is not a locally modified runtime. No Qt, mpv, libass or Stremio streaming server is shipped.\n';
fs.writeFileSync('THIRD_PARTY_NOTICES.md', text);
fs.writeFileSync('third_party/dependency-inventory.json', JSON.stringify(inventory, null, 2) + '\n');
console.log('Dependency license texts and notices generated.');
