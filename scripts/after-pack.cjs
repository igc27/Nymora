'use strict';
const fs = require('node:fs');
const path = require('node:path');
// Grant RX only to paths in the distribution manifest. Never change unrelated
// files recursively or disable Chromium's sandbox. User data lives elsewhere.
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const entries = [''];
  function visit(directory, relative = '') {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(relative, entry.name); entries.push(file);
      if (entry.isDirectory()) visit(path.join(directory, entry.name), file);
    }
  }
  visit(context.appOutDir);
  entries.push('resources\\elevate.exe');
  const lines = ['!macro nymoraRuntimeAccess'];
  [...new Set(entries)].forEach((entry, index) => {
    const target = '$INSTDIR' + (entry ? '\\' + entry.replaceAll('/', '\\').replaceAll('$', '$$') : '');
    const label = `nymora_access_done_${index}`;
    lines.push(`IfFileExists "${target}" 0 ${label}`, `nsExec::ExecToLog '\"$SYSDIR\\icacls.exe\" \"${target}\" /grant \"*S-1-15-2-1:(RX)\"'`, 'Pop $R0', `StrCmp $R0 "0" ${label}`, 'MessageBox MB_ICONSTOP|MB_OK "Nymora could not prepare runtime read permissions. Choose a writable installation folder and retry." /SD IDOK', 'Abort', `${label}:`);
  });
  lines.push('!macroend');
  fs.writeFileSync(path.join(context.packager.projectDir, 'assets/runtime-access.nsh'), lines.join('\n') + '\n');
};
