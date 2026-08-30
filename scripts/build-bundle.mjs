/**
 * Extension Asset Builder & Packager
 * Bundles TypeScript sources into standalone, self-contained Safari MV3 scripts via esbuild.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as esbuild from 'esbuild';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

// Ensure dist directories exist
const distUiDir = path.join(distDir, 'ui');
const distIconsDir = path.join(distDir, 'icons');
const distContentDir = path.join(distDir, 'content');
const distInjectionsDir = path.join(distDir, 'content', 'injections');
const distBgDir = path.join(distDir, 'background');

fs.mkdirSync(distUiDir, { recursive: true });
fs.mkdirSync(distIconsDir, { recursive: true });
fs.mkdirSync(distContentDir, { recursive: true });
fs.mkdirSync(distInjectionsDir, { recursive: true });
fs.mkdirSync(distBgDir, { recursive: true });

// Copy manifest.json
fs.copyFileSync(path.join(srcDir, 'manifest.json'), path.join(distDir, 'manifest.json'));

// Copy UI assets
fs.copyFileSync(path.join(srcDir, 'ui', 'popup.html'), path.join(distUiDir, 'popup.html'));
fs.copyFileSync(path.join(srcDir, 'ui', 'styles.css'), path.join(distUiDir, 'styles.css'));

// Copy dedicated custom icons from src/icons
const srcIconsDir = path.join(srcDir, 'icons');
if (fs.existsSync(srcIconsDir)) {
  for (const iconName of ['icon16.png', 'icon48.png', 'icon128.png']) {
    const iconPath = path.join(srcIconsDir, iconName);
    if (fs.existsSync(iconPath)) {
      fs.copyFileSync(iconPath, path.join(distIconsDir, iconName));
    }
  }
  console.log('✅ Copied dedicated custom icons from src/icons/.');
}

async function bundleExtensionScripts() {
  console.log('📦 Bundling Safari extension entry points with esbuild...');

  // 1. Background Service Worker (Self-contained IIFE bundle)
  await esbuild.build({
    entryPoints: [path.join(srcDir, 'background', 'service-worker.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['safari16'],
    outfile: path.join(distBgDir, 'service-worker.js'),
    sourcemap: false,
  });

  // 2. Content Script (Self-contained IIFE bundle)
  await esbuild.build({
    entryPoints: [path.join(srcDir, 'content', 'content-script.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['safari16'],
    outfile: path.join(distContentDir, 'content-script.js'),
    sourcemap: false,
  });

  // 3. Stream Watcher Injection (Self-contained IIFE bundle)
  await esbuild.build({
    entryPoints: [path.join(srcDir, 'content', 'injections', 'stream-watcher.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['safari16'],
    outfile: path.join(distInjectionsDir, 'stream-watcher.js'),
    sourcemap: false,
  });

  // 4. Popup Script (Self-contained IIFE bundle)
  await esbuild.build({
    entryPoints: [path.join(srcDir, 'ui', 'popup.ts')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['safari16'],
    outfile: path.join(distUiDir, 'popup.js'),
    sourcemap: false,
  });

  console.log('🎉 All Safari Web Extension entry points bundled successfully into self-contained standalone files.');
}

bundleExtensionScripts().catch((err) => {
  console.error('❌ Error during bundling:', err);
  process.exit(1);
});
