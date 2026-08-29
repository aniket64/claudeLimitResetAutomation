/**
 * Extension Asset Builder & Packager
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const srcDir = path.join(rootDir, 'src');
const distDir = path.join(rootDir, 'dist');

// Ensure dist directories exist
const distUiDir = path.join(distDir, 'ui');
const distIconsDir = path.join(distDir, 'icons');
const distInjectionsDir = path.join(distDir, 'content', 'injections');

fs.mkdirSync(distUiDir, { recursive: true });
fs.mkdirSync(distIconsDir, { recursive: true });
fs.mkdirSync(distInjectionsDir, { recursive: true });

// Copy manifest.json
fs.copyFileSync(path.join(srcDir, 'manifest.json'), path.join(distDir, 'manifest.json'));

// Copy UI assets
fs.copyFileSync(path.join(srcDir, 'ui', 'popup.html'), path.join(distUiDir, 'popup.html'));
fs.copyFileSync(path.join(srcDir, 'ui', 'styles.css'), path.join(distUiDir, 'styles.css'));

// Check if icons exist in ClaudeUsageTracker or create placeholder PNG icons
const sourceIconDir = '/Applications/ClaudeUsageTracker.app/Contents/PlugIns/ClaudeUsageTracker Extension.appex/Contents/Resources/icons';
if (fs.existsSync(sourceIconDir)) {
  for (const iconName of ['icon16.png', 'icon48.png', 'icon128.png']) {
    const srcIcon = path.join(sourceIconDir, iconName);
    if (fs.existsSync(srcIcon)) {
      fs.copyFileSync(srcIcon, path.join(distIconsDir, iconName));
    }
  }
  console.log('✅ Copied extension icons from system ClaudeUsageTracker.');
} else {
  // Create minimal valid 1x1 transparent PNGs as fallbacks if not present
  const dummyPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(path.join(distIconsDir, 'icon16.png'), dummyPng);
  fs.writeFileSync(path.join(distIconsDir, 'icon48.png'), dummyPng);
  fs.writeFileSync(path.join(distIconsDir, 'icon128.png'), dummyPng);
  console.log('✅ Created placeholder icons.');
}

console.log('🎉 Extension build and assets copied successfully to dist/');
