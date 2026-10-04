'use strict';
// Original three ascending, softly interlocking tones; generated locally as PCM.
const fs = require('node:fs');
const rate = 48000, duration = .86, samples = Math.floor(rate * duration), data = Buffer.alloc(44 + samples * 2);
data.write('RIFF'); data.writeUInt32LE(data.length - 8, 4); data.write('WAVEfmt ', 8); data.writeUInt32LE(16, 16); data.writeUInt16LE(1, 20); data.writeUInt16LE(1, 22); data.writeUInt32LE(rate, 24); data.writeUInt32LE(rate * 2, 28); data.writeUInt16LE(2, 32); data.writeUInt16LE(16, 34); data.write('data', 36); data.writeUInt32LE(samples * 2, 40);
for (let i = 0; i < samples; i++) {
  const time = i / rate; let value = 0;
  for (const [start, frequency, amplitude] of [[0, 392, .29], [.14, 587.33, .21], [.29, 880, .16]]) {
    const age = time - start;
    if (age >= 0) { const attack = Math.min(1, age / .035), decay = Math.exp(-age * 7), tail = Math.min(1, (duration - time) / .08); value += amplitude * attack * decay * tail * (Math.sin(2 * Math.PI * frequency * age) + .12 * Math.sin(2 * Math.PI * frequency * 2.01 * age)); }
  }
  data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, value)) * 32767), 44 + 2 * i);
}
fs.writeFileSync('assets/nymora-cue.wav', data);
console.log('Original Nymora sonic logo: 0.86 seconds, local PCM.');
