'use strict';
const fs = require('node:fs');
fs.mkdirSync('dist', { recursive: true });
for (const name of ['index.html', 'style.css']) fs.copyFileSync(`src/${name}`, `dist/${name}`);
fs.copyFileSync('assets/logo.svg', 'dist/logo.svg');
fs.copyFileSync('node_modules/hls.js/dist/hls.min.js', 'dist/hls.min.js');
fs.copyFileSync('src/renderer.js', 'dist/renderer.js');
console.log('Nymora renderer built.');
