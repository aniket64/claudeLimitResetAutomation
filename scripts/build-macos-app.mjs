/**
 * Persistent macOS Safari Web Extension Packager
 * Builds native host app and app extension, embeds bundled dist assets, codesigns, and registers the single canonical app in /Applications.
 */
import fs from 'fs';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

const appName = 'Claude 5-Hour Reset Automation';
const canonicalAppPath = path.join('/Applications', `${appName}.app`);
const stagingDir = path.join(rootDir, 'macos', 'build');
const stagingAppDir = path.join(stagingDir, `${appName}.app`);

const contentsDir = path.join(stagingAppDir, 'Contents');
const macosDir = path.join(contentsDir, 'MacOS');
const pluginsDir = path.join(contentsDir, 'PlugIns');
const resourcesDir = path.join(contentsDir, 'Resources');

const appexName = `${appName} Extension.appex`;
const appexDir = path.join(pluginsDir, appexName);
const appexContents = path.join(appexDir, 'Contents');
const appexMacOS = path.join(appexContents, 'MacOS');
const appexResources = path.join(appexContents, 'Resources');

async function buildMacOSApp() {
  console.log('====================================================');
  console.log(`🔨 BUILDING SINGLE CANONICAL SAFARI EXTENSION APP`);
  console.log('====================================================\n');

  // 1. Build and bundle latest dist assets
  console.log('1. Rebuilding extension JavaScript bundles...');
  await execAsync('node scripts/build-bundle.mjs', { cwd: rootDir });
  console.log('✅ Bundled JS assets ready in dist/.\n');

  // 2. Clean and recreate Staging directory structure
  console.log('2. Preparing clean staging build directory...');
  if (fs.existsSync(stagingDir)) {
    fs.rmSync(stagingDir, { recursive: true, force: true });
  }

  fs.mkdirSync(macosDir, { recursive: true });
  fs.mkdirSync(resourcesDir, { recursive: true });
  fs.mkdirSync(appexMacOS, { recursive: true });
  fs.mkdirSync(appexResources, { recursive: true });

  // 3. Compile Host Application binary
  console.log('3. Compiling native macOS Host Application binary (ARM64)...');
  const hostMainPath = path.join(rootDir, 'macos', 'HostApp', 'main.m');
  const hostBinPath = path.join(macosDir, appName);
  await execAsync(
    `clang -framework Cocoa -framework SafariServices -fobjc-arc -arch arm64 -mmacosx-version-min=13.0 -o "${hostBinPath}" "${hostMainPath}"`,
    { cwd: rootDir }
  );
  console.log('✅ Host App binary compiled successfully.');

  // 4. Compile Extension XPC binary
  console.log('4. Compiling native Safari Web Extension binary (ARM64)...');
  const extMainPath = path.join(rootDir, 'macos', 'Extension', 'SafariWebExtensionHandler.m');
  const extBinPath = path.join(appexMacOS, `${appName} Extension`);
  await execAsync(
    `clang -framework Foundation -framework SafariServices -fobjc-arc -arch arm64 -mmacosx-version-min=13.0 -o "${extBinPath}" "${extMainPath}"`,
    { cwd: rootDir }
  );
  console.log('✅ Extension binary compiled successfully.');

  // 5. Copy Plist & PkgInfo files
  console.log('5. Writing Info.plist & package metadata...');
  fs.copyFileSync(path.join(rootDir, 'macos', 'HostApp', 'Info.plist'), path.join(contentsDir, 'Info.plist'));
  fs.writeFileSync(path.join(contentsDir, 'PkgInfo'), 'APPL????');

  fs.copyFileSync(path.join(rootDir, 'macos', 'Extension', 'Info.plist'), path.join(appexContents, 'Info.plist'));
  fs.writeFileSync(path.join(appexContents, 'PkgInfo'), 'XPC!????');

  // 6. Copy bundled dist files into Extension Resources
  console.log('6. Embedding bundled extension assets into Extension Resources...');
  fs.cpSync(path.join(rootDir, 'dist'), appexResources, { recursive: true });

  // Copy app icons if available
  const distIcons = path.join(rootDir, 'dist', 'icons');
  if (fs.existsSync(distIcons)) {
    fs.cpSync(distIcons, path.join(resourcesDir, 'icons'), { recursive: true });
  }

  // 7. Ad-hoc Codesign the App and Extension with proper Sandboxing Entitlements
  console.log('7. Codesigning AppExtension and Host App with App-Sandbox entitlements...');
  const extEntitlements = path.join(rootDir, 'macos', 'Extension', 'Extension.entitlements');
  const hostEntitlements = path.join(rootDir, 'macos', 'HostApp', 'HostApp.entitlements');

  try {
    await execAsync(`codesign --force --sign - --entitlements "${extEntitlements}" "${appexDir}"`);
    await execAsync(`codesign --force --sign - --entitlements "${hostEntitlements}" "${stagingAppDir}"`);
    console.log('✅ Staged App and Extension codesigned successfully.');
  } catch (err) {
    console.warn('⚠️ Codesign error:', err.message);
  }

  // 8. Clean old duplicate locations to prevent multiple Safari entries
  console.log('8. Cleaning stale duplicate paths...');
  const duplicatePaths = [
    path.join(rootDir, `${appName}.app`),
    path.join(process.env.HOME || '', 'Applications', `${appName}.app`),
  ];
  const lsregisterPath = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';

  for (const dupPath of duplicatePaths) {
    if (fs.existsSync(dupPath)) {
      if (fs.existsSync(lsregisterPath)) {
        await execAsync(`"${lsregisterPath}" -u "${dupPath}"`).catch(() => {});
      }
      fs.rmSync(dupPath, { recursive: true, force: true });
      console.log(`🗑️ Removed duplicate: ${dupPath}`);
    }
  }

  // 9. Install into single canonical location: /Applications
  console.log(`9. Installing single canonical app into ${canonicalAppPath}...`);
  if (fs.existsSync(canonicalAppPath)) {
    if (fs.existsSync(lsregisterPath)) {
      await execAsync(`"${lsregisterPath}" -u "${canonicalAppPath}"`).catch(() => {});
    }
    fs.rmSync(canonicalAppPath, { recursive: true, force: true });
  }

  fs.cpSync(stagingAppDir, canonicalAppPath, { recursive: true });
  console.log(`✅ Installed to ${canonicalAppPath}`);

  // Re-sign in-place after copy
  try {
    const installedAppex = path.join(canonicalAppPath, 'Contents', 'PlugIns', appexName);
    await execAsync(`codesign --force --sign - --entitlements "${extEntitlements}" "${installedAppex}"`);
    await execAsync(`codesign --force --sign - --entitlements "${hostEntitlements}" "${canonicalAppPath}"`);
  } catch (err) {
    console.warn('⚠️ Codesign post-copy error:', err.message);
  }

  // 10. Register canonical app with LaunchServices and pluginkit
  console.log('10. Registering canonical app with LaunchServices and pluginkit...');
  if (fs.existsSync(lsregisterPath)) {
    await execAsync(`"${lsregisterPath}" -f -r "${canonicalAppPath}"`).catch(() => {});
    console.log('✅ Registered with LaunchServices.');
  }

  const installedAppexPath = path.join(canonicalAppPath, 'Contents', 'PlugIns', appexName);
  try {
    await execAsync(`pluginkit -a "${installedAppexPath}"`);
    console.log('✅ Registered extension with pluginkit.');
  } catch (err) {
    console.warn('⚠️ pluginkit note:', err.message);
  }

  // Remove staging dir
  fs.rmSync(stagingDir, { recursive: true, force: true });

  console.log('\n====================================================');
  console.log(`🎉 SINGLE CANONICAL SAFARI EXTENSION READY:`);
  console.log(`   ${canonicalAppPath}`);
  console.log('====================================================\n');
}

buildMacOSApp().catch((err) => {
  console.error('❌ Build failed:', err);
  process.exit(1);
});
