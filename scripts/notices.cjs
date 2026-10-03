'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const runtimeDirs = execFileSync(process.platform === 'win32' ? 'cmd.exe' : 'npm', process.platform === 'win32' ? ['/d', '/s', '/c', 'npm ls --omit=dev --omit=optional --parseable --all'] : ['ls', '--omit=dev', '--omit=optional', '--parseable', '--all'], { encoding: 'utf8' }).trim().split(/\r?\n/).slice(1);
const buildNames = ['electron', 'electron-builder', 'eslint', '@playwright/test', 'playwright', 'playwright-core'];
const dirs = [...runtimeDirs, ...buildNames.map(name => path.resolve('node_modules', name))];
fs.mkdirSync('third_party/dependencies', { recursive: true });
const inventory = [];
let text = '# Third-party notices\n\nNymora is an independent open-source application. It is not affiliated with or endorsed by Stremio.\n\nCopyright © 2026 Mohammed Alanazi applies to original Nymora code, modifications, branding and assets. Upstream work retains its original copyright and license.\n\n## Stremio addon-client\n\nRevision: 7c66830cfc1a8e749373d9df0bb105c7dad33bfd. MIT. Selected client and protocol primitives are reused. The complete notice follows:\n\n' + fs.readFileSync('vendor/stremio-addon-client/LICENSE.md', 'utf8') + '\n\n## Stremio addon-sdk protocol documentation\n\nRevision: ec4e0a49e61bac4f2285891d39414dfbafe93f58. MIT; Copyright © 2019 SmartCode OOD. Complete license in third_party/stremio-addon-sdk/LICENSE.md. No SDK executable code is bundled.\n\n## Bundled runtime and build dependencies\n\n';
for (const dir of [...new Set(dirs)].sort()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
  const name = pkg.name;
  const files = fs.readdirSync(dir).filter(f => /^(licen[sc]e|copying|notice)([.-]|$)/i.test(f));
  const out = path.join('third_party/dependencies', name.replace('/', '-') + '-' + pkg.version); fs.mkdirSync(out, { recursive: true });
  let notices = '';
  for (const file of files) { const body = fs.readFileSync(path.join(dir, file), 'utf8'); fs.writeFileSync(path.join(out, file), body); notices += body + '\n'; }
  if (!files.length) {
    const supplement = path.join('third_party/license-supplements', name.replace('/', '-'));
    if (fs.existsSync(supplement)) {
      for (const file of fs.readdirSync(supplement)) { const body = fs.readFileSync(path.join(supplement, file), 'utf8'); fs.writeFileSync(path.join(out, file), body); notices += body + '\n'; files.push(file); }
    } else {
      if (!['MIT', 'BSD-2-Clause'].includes(pkg.license)) throw new Error(`No license evidence for ${name}`);
      // Some npm distributions declare their license in package.json/README,
      // without shipping a separate license file. Keep that original evidence
      // and provide the full standard terms, without inventing copyright dates.
      const file = `STANDARD-${pkg.license}.txt`;
      const body = fs.readFileSync(`third_party/${pkg.license}.txt`, 'utf8');
      fs.writeFileSync(path.join(out, file), body); files.push(file);
      notices += `Package-declared license; author attribution: ${JSON.stringify(pkg.author || pkg.contributors || 'See original package source')}. Original metadata and README are preserved below. The following is the standard license text, not an invented upstream notice.\n\n${body}\n`;
    }
    fs.copyFileSync(path.join(dir, 'package.json'), path.join(out, 'upstream-package.json'));
    const readme = fs.readdirSync(dir).find(file => /^readme/i.test(file));
    if (readme) { const body = fs.readFileSync(path.join(dir, readme), 'utf8'); fs.writeFileSync(path.join(out, readme), body); notices += '\nOriginal upstream README:\n\n' + body + '\n'; }
  }
  const shipped = runtimeDirs.includes(dir) || name === 'electron';
  inventory.push({ name, version: pkg.version, license: pkg.license, repository: pkg.repository, author: pkg.author, usage: shipped ? 'Shipped runtime' : 'Build or test only', licenseFiles: files });
  text += `### ${name} ${pkg.version}\n\nLicense: ${pkg.license}. ${shipped ? 'Shipped runtime.' : 'Build/test only; not application runtime code.'}\n\n${notices}\n\n`;
}
text += '## Native BitTorrent engine\n\n' + fs.readFileSync('third_party/rqbit/LICENSE', 'utf8') + '\n\n' + fs.readFileSync('third_party/rqbit/DEPENDENCY_NOTICES.md', 'utf8') + '\n\nWebTorrent and the vendored tracker are development-only local fixture dependencies. They are not the application backend or bundled production dependencies in 1.0.2. Their historical licensing evidence remains in third_party.\n\n';
text += '## Native WebRTC dependency notices and corresponding source\n\n' + fs.readFileSync('third_party/NATIVE_SOURCE.md', 'utf8') + '\n\n';
for (const file of fs.readdirSync('third_party/native-licenses').sort()) text += `### ${file}\n\n${fs.readFileSync(path.join('third_party/native-licenses', file), 'utf8')}\n\n`;
text += '## Apache License 2.0\n\nhls.js includes Copyright (c) 2017 Dailymotion and Copyright (c) 2013-2015 Brightcove notices above. It is distributed unmodified. The full applicable Apache license follows:\n\n' + fs.readFileSync('third_party/Apache-2.0.txt', 'utf8') + '\n\n';
text += '## NSIS Windows installer runtime\n\nNSIS 3.0.4.1 as packaged by electron-builder-binaries. Copyright (C) 1999-2018 Contributors in the included distribution. NSIS uses zlib/libpng, bzip2 and CPL-1.0 for the LZMA module with an explicit linking exception. Nymora does not modify those native modules. Original source and licensing: https://nsis.sourceforge.io/ and https://github.com/electron-userland/electron-builder-binaries. The complete distribution COPYING notice follows:\n\n' + fs.readFileSync('third_party/NSIS-COPYING.txt', 'utf8') + '\n\n';
text += '## Chromium and Electron subcomponents\n\nThe packaged Electron runtime retains LICENSE.electron.txt and LICENSES.chromium.html, including Chromium, FFmpeg and other third-party notices. Those files are distributed next to Nymora.exe. Electron is downloaded from its official distribution by electron-builder; it is not a locally modified runtime. No Qt, mpv, libass or Stremio streaming server is shipped.\n';
fs.writeFileSync('THIRD_PARTY_NOTICES.md', text);
fs.writeFileSync('third_party/dependency-inventory.json', JSON.stringify(inventory, null, 2) + '\n');
console.log('Dependency license texts and notices generated.');
