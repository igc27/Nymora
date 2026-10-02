'use strict';
// Export only Git-tracked project files. Build artifacts, upstream checkouts,
// local viewing data and credentials are excluded by .gitignore and this scan.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const paths = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
const denied = /(^|\/)(?:\.qa|\.upstream|node_modules|release|dist|\.env)(\/|$)|\.(?:pfx|p12|pem|key)$/i;
const patterns = [/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, /gh[pousr]_[A-Za-z0-9]{30,}/, /github_pat_[A-Za-z0-9_]{40,}/, /AKIA[0-9A-Z]{16}/];
const entries = [];
for (const file of paths) {
  if (denied.test(file)) throw new Error(`Non-public path in tracked source: ${file}`);
  const bytes = fs.readFileSync(file), binary = /\.(png|ico)$/i.test(file);
  if (!binary && patterns.some(pattern => pattern.test(bytes.toString('utf8')))) throw new Error(`Potential secret in ${file}`);
  entries.push({ path: file, mode: '100644', type: 'blob', encoding: binary ? 'base64' : 'utf-8', content: binary ? bytes.toString('base64') : bytes.toString('utf8').replace(/\r\n/g, '\n') });
}
fs.mkdirSync('.qa', { recursive: true });
fs.writeFileSync('.qa/publication.json', JSON.stringify(entries));
console.log(`Secret/path scan passed; ${entries.length} tracked source files exported.`);
