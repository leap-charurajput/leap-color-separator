#!/usr/bin/env node

/**
 * Setup script to create CEP plugin structure for Angular app
 * This script copies built Angular files and creates the CEP plugin structure
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGIN_NAME = 'com.octane5.LEAPColorSeparator';
const CEP_PLUGIN_OUTPUT = path.join(__dirname, PLUGIN_NAME);
const JSX_FOLDER = path.join(__dirname, 'src', 'jsx');
const REMOTE_APP_URL = 'http://salesforce-connector.metadesign.org.in'; // http://salesforce-connector.metadesign.org.in  | http://localhost:6002

// Get CEP extensions directory based on OS
function getCEPExtensionsDir() {
 const platform = os.platform();
 const homeDir = os.homedir();

 if (platform === 'darwin') {
  // macOS
  return path.join(homeDir, 'Library', 'Application Support', 'Adobe', 'CEP', 'extensions');
 } else if (platform === 'win32') {
  // Windows
  return path.join(homeDir, 'AppData', 'Roaming', 'Adobe', 'CEP', 'extensions');
 } else {
  // Linux or other
  console.warn('⚠️  Unsupported OS. Please copy manually.');
  return null;
 }
}

console.log('🚀 Setting up CEP plugin for remote Angular app...\n');

// Check if required folders exist in Angular project
if (!fs.existsSync(JSX_FOLDER)) {
 console.error('❌ Error: JSX folder not found in src/');
 console.error(`   Expected at: ${JSX_FOLDER}`);
 console.error('   Please ensure src/jsx/ folder exists with JSX files');
 process.exit(1);
}

// Create plugin directory structure
function createDirectories() {
 console.log('📁 Creating directory structure...');
 const dirs = [
  CEP_PLUGIN_OUTPUT,
  path.join(CEP_PLUGIN_OUTPUT, 'CSXS'),
  path.join(CEP_PLUGIN_OUTPUT, 'jsx')
 ];

 dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
   fs.mkdirSync(dir, { recursive: true });
  }
 });
}

// Copy files recursively
function copyRecursive(src, dest) {
 if (!fs.existsSync(src)) {
  console.warn(`⚠️  Warning: Source not found: ${src}`);
  return;
 }

 const stat = fs.statSync(src);
 if (stat.isDirectory()) {
  if (!fs.existsSync(dest)) {
   fs.mkdirSync(dest, { recursive: true });
  }
  fs.readdirSync(src).forEach((file) => {
   copyRecursive(path.join(src, file), path.join(dest, file));
  });
 } else {
  fs.copyFileSync(src, dest);
 }
}

function createManifest() {
 console.log('📝 Creating manifest.xml...');
 const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   ExtensionBundleId="com.octane5.LEAPColorSeparator"
                   ExtensionBundleVersion="1.0.1"
                   ExtensionBundleName="com.octane5.LEAPColorSeparator"
                   Version="7.0">
  <ExtensionList>
    <Extension Id="com.octane5.LEAPColorSeparator" Version="1.0.1">
    </Extension>
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
        <Host Name="ILST" Version="[0.0,99.9]" />
    </HostList>
    <LocaleList>
      <Locale Code="All" />
    </LocaleList>
    <RequiredRuntimeList>
      <RequiredRuntime Name="CSXS" Version="7.0" />
    </RequiredRuntimeList>
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.octane5.LEAPColorSeparator">
      <DispatchInfo>
        <Resources>
          <MainPath>./index.html</MainPath>
          <CEFCommandLine>
              <Parameter>--enable-nodejs</Parameter>
              <Parameter>--allow-file-access</Parameter>
              <Parameter>--allow-file-access-from-files</Parameter>
          </CEFCommandLine>
        </Resources>
        <Lifecycle>
          <AutoVisible>true</AutoVisible>
        </Lifecycle>
        <UI>
          <Type>Panel</Type>
          <Menu>LEAP Color Separator</Menu>
          <Geometry>
            <Size>
              <Width>500</Width>
              <Height>600</Height>
            </Size>
            <MinSize>
              <Width>500</Width>
              <Height>600</Height>
            </MinSize>
            <MaxSize>
              <Width>500</Width>
              <Height>600</Height>
            </MaxSize>
          </Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>`;

 fs.writeFileSync(path.join(CEP_PLUGIN_OUTPUT, 'CSXS', 'manifest.xml'), manifest);
}

function createIndexHtml() {
 console.log('📝 Creating index.html...');
 const indexHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>LEAP Color Separator</title>
    <base href="./">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <script>
        window.location.href = "${REMOTE_APP_URL}";
    </script>
</head>
<body>
    Redirecting to ${REMOTE_APP_URL}...
</body>
</html>`;

 fs.writeFileSync(path.join(CEP_PLUGIN_OUTPUT, 'index.html'), indexHtml);
}

// Copy plugin to CEP extensions directory
function copyToCEPExtensions() {
 const cepExtensionsDir = getCEPExtensionsDir();
 if (!cepExtensionsDir) {
  return false;
 }

 console.log('\n📋 Copying plugin to CEP extensions directory...');

 // Create CEP extensions directory if it doesn't exist
 if (!fs.existsSync(cepExtensionsDir)) {
  console.log(`📁 Creating CEP extensions directory: ${cepExtensionsDir}`);
  fs.mkdirSync(cepExtensionsDir, { recursive: true });
 }

 const targetPluginPath = path.join(cepExtensionsDir, PLUGIN_NAME);

 // Remove existing plugin if it exists
 if (fs.existsSync(targetPluginPath)) {
  console.log('🗑️  Removing existing plugin...');
  fs.rmSync(targetPluginPath, { recursive: true, force: true });
 }

 // Copy plugin to CEP extensions directory
 console.log(`📦 Copying plugin to: ${targetPluginPath}`);
 copyRecursive(CEP_PLUGIN_OUTPUT, targetPluginPath);

 console.log('✅ Plugin copied successfully!');
 return true;
}

function writeDebugFile(targetDir, label) {
 const debugFilePath = path.join(targetDir, '.debug');
 const extensionId = 'com.octane5.LEAPColorSeparator';

 const debugContent = `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
    <Extension Id="${extensionId}">
        <HostList>
            <Host Name="ILST" Port="8088"/>
        </HostList>
    </Extension>
</ExtensionList>`;

 fs.writeFileSync(debugFilePath, debugContent);
 console.log(`✅ .debug file created at: ${debugFilePath}${label ? ` (${label})` : ''}`);
 return true;
}

// Create or update .debug file inside plugin folder (in extensions directory)
function createDebugFile() {
 const cepExtensionsDir = getCEPExtensionsDir();
 if (!cepExtensionsDir) {
  return false;
 }

 const pluginPathInExtensions = path.join(cepExtensionsDir, PLUGIN_NAME);
 if (!fs.existsSync(pluginPathInExtensions)) {
  console.warn(
   '⚠️  Plugin folder not found in extensions directory, skipping .debug file creation'
  );
  return false;
 }

 console.log('\n📝 Creating/updating .debug file in plugin folder...');
 return writeDebugFile(pluginPathInExtensions, 'extensions');
}

// Main execution
try {
 createDirectories();

 // Copy required CEP files from Angular project
 console.log('📦 Copying CEP files from Angular project...');
 if (fs.existsSync(JSX_FOLDER)) {
  copyRecursive(JSX_FOLDER, path.join(CEP_PLUGIN_OUTPUT, 'jsx'));
 } else {
  console.error('❌ Error: JSX folder not found in src/');
  console.error(`   Expected at: ${JSX_FOLDER}`);
  console.error('   Please ensure src/jsx/ folder exists with JSX files');
  process.exit(1);
 }

 // Create manifest and index.html
 createManifest();
 createIndexHtml();
 writeDebugFile(CEP_PLUGIN_OUTPUT, 'local');

 console.log('\n✅ CEP plugin setup complete!');
 console.log(`\n📂 Plugin created at: ${CEP_PLUGIN_OUTPUT}`);

 // Copy to CEP extensions directory
 const copied = copyToCEPExtensions();
 if (copied) {
  // Create .debug file
  createDebugFile();

  console.log('\n🎉 Setup complete!');
  console.log('\n📋 Next steps:');
  console.log("   1. Restart Adobe Illustrator (if it's running)");
  console.log('   2. Go to Window > Extensions > LEAP Color Separator');
  console.log('   3. The plugin should now be available!\n');
 } else {
  console.log('\n⚠️  Could not automatically copy to CEP extensions directory.');
  console.log('\n📋 Manual steps:');
  console.log('   1. Copy the plugin folder to CEP extensions directory:');
  const cepDir = getCEPExtensionsDir();
  if (cepDir) {
   console.log(`      ${cepDir}`);
  } else {
   console.log('      macOS: ~/Library/Application Support/Adobe/CEP/extensions/');
   console.log('      Windows: C:\\Users\\[USERNAME]\\AppData\\Roaming\\Adobe\\CEP\\extensions\\');
  }
  console.log('   2. Create .debug file if needed (see RUN_IN_ILLUSTRATOR.md)');
  console.log('   3. Restart Adobe Illustrator');
  console.log('   4. Go to Window > Extensions > LEAP Color Separator\n');
 }
} catch (error) {
 console.error('❌ Error:', error.message);
 process.exit(1);
}
