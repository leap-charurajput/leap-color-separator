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
// const REMOTE_APP_URL = 'http://localhost:6002'; // http://salesforce-connector.metadesign.org.in  | http://localhost:6002

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
          <Icons>
						<Icon Type="Normal">./icon_light.png</Icon>
						<Icon Type="RollOver">./icon_light.png</Icon>
						<Icon Type="DarkNormal">./icon_dark.png</Icon>
						<Icon Type="DarkRollOver">./icon_dark.png</Icon>
					</Icons>
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
    <meta charset="utf-8" />
    <title>LEAP Color Separator</title>
    <base href="./" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <script type="text/javascript">
      (function () {
        var fs = window.require('fs');
        var path = window.require('path');
        var os = window.require('os');
        var dns = window.require('dns');
        var DEFAULT_ORIGIN = 'http://salesforce-connector.metadesign.org.in';
        var OFFLINE_MESSAGE = 'LEAP Color Separator requires internet connection';

        function showOfflineMessage() {
          var render = function () {
            if (!document.body) {
              return;
            }
            document.body.style.margin = '0';
            document.body.style.background = '#2f2f2f';
            document.body.style.color = '#f0f0f0';
            document.body.style.fontFamily = 'Arial,sans-serif';
            document.body.innerHTML =
              '<div style="display:flex;align-items:center;justify-content:center;min-height:100vh;padding:16px;box-sizing:border-box;text-align:center;font-size:14px;">' +
              OFFLINE_MESSAGE +
              '</div>';
          };

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', render, { once: true });
            return;
          }
          render();
        }

        function isHostReachable(origin, callback) {
          try {
            var hostname = new URL(origin).hostname;
            dns.lookup(hostname, function (err) {
              callback(!err);
            });
          } catch (err) {
            callback(false);
          }
        }

        function redirectIfOnline(origin) {
          if (typeof navigator !== 'undefined' && navigator.onLine === false) {
            showOfflineMessage();
            return;
          }
          isHostReachable(origin, function (reachable) {
            if (reachable) {
              window.location.href = origin;
            } else {
              showOfflineMessage();
            }
          });
        }

        var documentsPath = path.join(os.homedir(), 'Documents');
        var leapSettingsDir = path.join(documentsPath, 'LEAP Settings');
        var leapSepsDir = path.join(documentsPath, 'LEAP Settings', 'LEAP_Seps');
        var oldJsonFilePath = path.join(leapSettingsDir, 'ColorSep_Folder_Paths.json');
        var newJsonFilePath = path.join(leapSepsDir, 'ColorSep_Folder_Paths.json');

        // Ensure folders exist
        if (!fs.existsSync(leapSettingsDir)) {
          fs.mkdirSync(leapSettingsDir, { recursive: true });
        }
        if (!fs.existsSync(leapSepsDir)) {
          fs.mkdirSync(leapSepsDir, { recursive: true });
        }

        // Migrate old file to new location if needed
        if (fs.existsSync(oldJsonFilePath) && !fs.existsSync(newJsonFilePath)) {
          fs.copyFileSync(oldJsonFilePath, newJsonFilePath);
          fs.unlinkSync(oldJsonFilePath);
        }

        try {
          var jsonData = fs.readFileSync(newJsonFilePath, 'utf8');
          var parsedData = JSON.parse(jsonData);
          var origin = parsedData?.origin || DEFAULT_ORIGIN;
          redirectIfOnline(origin);
        } catch (error) {
          console.error('Error reading JSON file:', error);
          redirectIfOnline(DEFAULT_ORIGIN);
        }
      })();
    </script>
  </head>
  <body>
    Redirecting to URL...
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

 // Copy icons
 console.log('🖼️  Copying icons...');
 ['icon_dark.png', 'icon_light.png'].forEach((icon) => {
  const src = path.join(__dirname, icon);
  const dest = path.join(CEP_PLUGIN_OUTPUT, icon);
  if (fs.existsSync(src)) {
   fs.copyFileSync(src, dest);
   console.log(`   ${icon} copied.`);
  } else {
   console.warn(`⚠️  Warning: Icon not found: ${icon}`);
  }
 });

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
