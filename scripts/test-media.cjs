'use strict';
// Generated media is owned by its creator. FFmpeg is a development tool and is not redistributed.
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
fs.mkdirSync('.qa/media', { recursive: true });
const ffmpeg = process.env.FFMPEG_PATH || 'ffmpeg';
const input = ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc2=size=640x360:rate=24', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000', '-t', '90'];
function run(args) { const result = spawnSync(ffmpeg, args, { stdio: 'inherit' }); if (result.status !== 0) throw new Error('FFmpeg failed. Install FFmpeg or set FFMPEG_PATH. It is required only for generated QA media.'); }
if (!fs.existsSync('.qa/media/test.webm')) run([...input, '-c:v', 'libvpx', '-b:v', '250k', '-c:a', 'libvorbis', '-y', '.qa/media/test.webm']);
if (!fs.existsSync('.qa/media/test.mp4')) run([...input, '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p', '-b:v', '250k', '-c:a', 'aac', '-movflags', '+faststart', '-y', '.qa/media/test.mp4']);
if (!fs.existsSync('.qa/media/test.m3u8')) run(['-hide_banner', '-loglevel', 'error', '-i', '.qa/media/test.mp4', '-c', 'copy', '-hls_time', '4', '-hls_list_size', '0', '-hls_segment_filename', path.resolve('.qa/media/segment%03d.ts'), '-y', '.qa/media/test.m3u8']);
console.log('Original legal test media ready in .qa/media.');
