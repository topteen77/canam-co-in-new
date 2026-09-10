#!/usr/bin/env node

// Script to copy essential files to dist after build
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rootPath = path.join(__dirname, '..');
const distPath = path.resolve(rootPath, process.env.DIST_DIR || 'dist');

// Files to copy from root to dist
const filesToCopy = [
  { from: 'public/sw.js', to: 'sw.js' },
  { from: 'sw.js', to: 'sw.js' },
  { from: 'public/manifest.json', to: 'manifest.json' },
  { from: 'manifest.json', to: 'manifest.json' },
  { from: 'public/offline.html', to: 'offline.html' }
];

try {
  // Ensure dist folder exists
  if (!fs.existsSync(distPath)) {
    console.error('❌ dist folder does not exist. Run vite build first.');
    process.exit(1);
  }

  // Copy files
  let copiedCount = 0;
  filesToCopy.forEach(({ from, to }) => {
    const sourcePath = path.join(rootPath, from);
    const destPath = path.join(distPath, to);

    if (fs.existsSync(sourcePath)) {
      fs.copyFileSync(sourcePath, destPath);
      console.log(`✅ Copied ${from} to dist/${to}`);
      copiedCount++;
    } else {
      console.warn(`⚠️ Source file not found: ${from}`);
    }
  });

  console.log(`✅ Build files copy complete: ${copiedCount} file(s) copied`);

} catch (error) {
  console.error('❌ Failed to copy build files:', error);
  process.exit(1);
}



