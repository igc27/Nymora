'use strict';
function timestamp(value) {
  const parts = value.trim().replace(',', '.').split(':').map(Number);
  if (parts.some(v => !Number.isFinite(v))) return NaN;
  return parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts.length === 2 ? parts[0] * 60 + parts[1] : NaN;
}
function plainText(value) {
  return value.replace(/<[^>]*>/g, '').replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ').trim();
}
function parseSubtitles(source) {
  const text = source.replace(/^\uFEFF/, '').replace(/\r/g, '');
  const cues = [];
  if (/\[Events\]/i.test(text)) {
    let format = ['layer', 'start', 'end', 'style', 'name', 'marginl', 'marginr', 'marginv', 'effect', 'text'];
    for (const line of text.split('\n')) {
      if (/^Format:/i.test(line)) format = line.slice(line.indexOf(':') + 1).split(',').map(v => v.trim().toLowerCase());
      if (!/^Dialogue:/i.test(line)) continue;
      const raw = line.slice(line.indexOf(':') + 1).split(',');
      const start = timestamp(raw[format.indexOf('start')] || ''), end = timestamp(raw[format.indexOf('end')] || '');
      const content = plainText(raw.slice(format.indexOf('text')).join(','));
      if (Number.isFinite(start) && end > start) cues.push({ start, end, text: content });
    }
  } else {
    for (const block of text.split(/\n\s*\n/)) {
      const lines = block.split('\n'), i = lines.findIndex(l => l.includes('-->'));
      if (i < 0) continue;
      const [a, b] = lines[i].split('-->');
      const start = timestamp(a), end = timestamp(b.trim().split(/\s/)[0]);
      if (Number.isFinite(start) && end > start) cues.push({ start, end, text: plainText(lines.slice(i + 1).join('\n')) });
    }
  }
  if (!cues.length) throw new Error('No readable subtitle cues. Supported formats: UTF-8 SRT, WebVTT and plain ASS/SSA.');
  return cues.sort((a, b) => a.start - b.start);
}
module.exports = { timestamp, plainText, parseSubtitles };
