#!/usr/bin/env node

/**
 * Setup script to create CEP plugin structure for Angular app
 * This script copies built Angular files and creates the CEP plugin structure
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const PLUGIN_NAME = 'com.octane5.LEAPColorSeparator';
const BUILD_OUTPUT = path.join(__dirname, 'dist', 'leap-color-separator');
const CEP_PLUGIN_OUTPUT = path.join(__dirname, PLUGIN_NAME);
const JSX_FOLDER = path.join(__dirname, 'src', 'jsx');
const LIBS_FOLDER = path.join(__dirname, 'src', 'libs');
const LEAP_DIST_FILE = path.join(__dirname, 'src', 'leap-dist.js');
const LEAP_SRC_FILE = path.join(__dirname, 'src', 'leap-src-index.js');
const WEBPACK_LEAP_CONFIG = path.join(__dirname, 'webpack.leap.config.js');

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

console.log('🚀 Setting up CEP plugin for Angular app...\n');

// Check if build exists
if (!fs.existsSync(BUILD_OUTPUT)) {
    console.error('❌ Error: Build output not found!');
    console.error('   Please run: npm run build');
    process.exit(1);
}

// Check if required folders exist in Angular project
if (!fs.existsSync(JSX_FOLDER)) {
    console.error('❌ Error: JSX folder not found in src/');
    console.error(`   Expected at: ${JSX_FOLDER}`);
    console.error('   Please ensure src/jsx/ folder exists with JSX files');
    process.exit(1);
}

// Check for optional folders
if (!fs.existsSync(LIBS_FOLDER)) {
    console.warn('⚠️  Warning: libs folder not found in src/');
    console.warn(`   Expected at: ${LIBS_FOLDER}`);
    console.warn('   Plugin will work but CSInterface.js may not be available');
}

if (!fs.existsSync(LEAP_DIST_FILE)) {
    console.warn('⚠️  Warning: leap-dist.js not found');
    console.warn(`   Expected at: ${LEAP_DIST_FILE}`);
    if (fs.existsSync(LEAP_SRC_FILE)) {
        console.warn('   Will build from leap-src-index.js...');
    } else {
        console.error('❌ Error: leap-src-index.js not found!');
        console.error(`   Expected at: ${LEAP_SRC_FILE}`);
        console.error('');
        console.error('   The leap-src-index.js file should already exist in the Angular plugin.');
        console.error('   If missing, please check that all files were created correctly.');
        console.error('');
        console.warn('   For now, creating minimal placeholder leap-dist.js');
    }
}

// Create plugin directory structure
function createDirectories() {
    console.log('📁 Creating directory structure...');
    const dirs = [
        CEP_PLUGIN_OUTPUT,
        path.join(CEP_PLUGIN_OUTPUT, 'CSXS'),
        path.join(CEP_PLUGIN_OUTPUT, 'jsx'),
        path.join(CEP_PLUGIN_OUTPUT, 'libs'),
        path.join(CEP_PLUGIN_OUTPUT, 'icons'),
        path.join(CEP_PLUGIN_OUTPUT, 'assets')
    ];

    dirs.forEach(dir => {
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
        fs.readdirSync(src).forEach(file => {
            copyRecursive(path.join(src, file), path.join(dest, file));
        });
    } else {
        fs.copyFileSync(src, dest);
    }
}

// Get Angular build files with hashes
function getBuildFiles() {
    const files = fs.readdirSync(BUILD_OUTPUT);
    const result = {
        runtime: files.find(f => f.startsWith('runtime.') && f.endsWith('.js')),
        polyfills: files.find(f => f.startsWith('polyfills.') && f.endsWith('.js')),
        main: files.find(f => f.startsWith('main.') && f.endsWith('.js')),
        styles: files.find(f => f.startsWith('styles.') && f.endsWith('.css'))
    };
    return result;
}

function createManifest() {
    console.log('📝 Creating manifest.xml...');
    const manifest = `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionManifest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
                   ExtensionBundleId="com.octane5.LEAPColorSeparator"
                   ExtensionBundleVersion="1.0.1"
                   ExtensionBundleName="LEAP Color Separator Angular"
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
              <Icon Type="Normal">./icons/icon.png</Icon>
              <Icon Type="RollOver">./icons/icon.png</Icon>
              <Icon Type="DarkNormal">./icons/icon.png</Icon>
              <Icon Type="DarkRollOver">./icons/icon.png</Icon>
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
    const buildFiles = getBuildFiles();

    if (!buildFiles.runtime || !buildFiles.polyfills || !buildFiles.main || !buildFiles.styles) {
        console.error('❌ Error: Could not find all required build files!');
        console.error('   Found:', buildFiles);
        process.exit(1);
    }

    const indexHtml = `<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>LEAP Color Separator</title>
    <base href="./">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="icon" type="image/x-icon" href="favicon.ico">
    <link rel="stylesheet" href="${buildFiles.styles}">
</head>
<body>
    <app-root></app-root>

    <!-- CEP Interface -->
    <script type="text/javascript" src="libs/CSInterface.js"></script>
    <script type="text/javascript" src="leap-dist.js"></script>

    <!-- Angular Runtime -->
    <script type="text/javascript" src="${buildFiles.runtime}"></script>
    <script type="text/javascript" src="${buildFiles.polyfills}"></script>
    <script type="text/javascript" src="${buildFiles.main}"></script>
</body>
</html>`;

    fs.writeFileSync(path.join(CEP_PLUGIN_OUTPUT, 'index.html'), indexHtml);
}

// Fix font paths in CSS for CEP extension
function fixFontPathsInCSS() {
    console.log('🔧 Fixing font paths in CSS for CEP extension...');

    const buildFiles = getBuildFiles();
    if (!buildFiles.styles) {
        console.warn('⚠️  Could not find styles file to fix font paths');
        return;
    }

    const cssPath = path.join(CEP_PLUGIN_OUTPUT, buildFiles.styles);
    if (!fs.existsSync(cssPath)) {
        console.warn(`⚠️  CSS file not found: ${cssPath}`);
        return;
    }

    let cssContent = fs.readFileSync(cssPath, 'utf8');

    // Fix font paths - Angular outputs fonts with hashes in root, but we need them relative to extension root
    // Pattern: url(icomoon.hash.eot) -> url(./icomoon.hash.eot)
    // This ensures fonts load correctly in CEP extensions
    cssContent = cssContent.replace(/url\(([^)]+\.(eot|ttf|woff|woff2|svg)[^)]*)\)/g, (match, fontPath) => {
        // If path doesn't start with ./ or / or http, add ./
        if (!fontPath.match(/^(\.\/|\/|http|data:)/)) {
            return `url(./${fontPath})`;
        }
        return match;
    });

    fs.writeFileSync(cssPath, cssContent);
    console.log('✅ Font paths fixed in CSS');
}

// Build leap bundle from Angular plugin's own leap-src
function buildLeapBundle() {
    const { execSync } = require('child_process');

    try {
        if (!fs.existsSync(WEBPACK_LEAP_CONFIG)) {
            throw new Error('webpack.leap.config.js not found in Angular plugin');
        }

        if (!fs.existsSync(LEAP_SRC_FILE)) {
            throw new Error('leap-src-index.js not found. The leap-src-index.js file should already exist in the Angular plugin.');
        }

        console.log('   Running webpack to build leap bundle for Angular...');
        execSync(`webpack --config "${WEBPACK_LEAP_CONFIG}" --env mode=development`, {
            stdio: 'inherit',
            cwd: __dirname
        });

        // Check if bundle was created
        if (fs.existsSync(LEAP_DIST_FILE)) {
            console.log('   Copying built bundle to CEP plugin output...');
            fs.copyFileSync(LEAP_DIST_FILE, path.join(CEP_PLUGIN_OUTPUT, 'leap-dist.js'));
            console.log('✅ Leap bundle built successfully for Angular plugin');
        } else {
            throw new Error('Bundle not found after build');
        }
    } catch (err) {
        console.error('❌ Error building leap bundle:', err.message);
        console.warn('   Falling back to placeholder bundle');
        console.warn('   The leap-src-index.js file should already exist in the Angular plugin.');
        createPlaceholderBundle();
    }
}

// Create minimal placeholder leap-dist.js
function createPlaceholderBundle() {
    console.log('📝 Creating minimal placeholder leap-dist.js...');

    // Create a minimal leap-dist.js that at least won't break the page
    const placeholderBundle = `// Minimal placeholder leap-dist.js for CEP plugin
// This is a placeholder - functionality may be limited without the full leap bundle
// To get full functionality, build the leap bundle: npm run build:leap

console.warn('leap-dist.js is a placeholder - some features may not work');

// Create a minimal leap object to prevent errors
// This allows the app to load but methods will fail gracefully
if (typeof window !== 'undefined') {
    window.leap = {
        scriptLoader: function() {
            return {
                evalScript: function() {
                    return Promise.reject('Leap is a placeholder - please build the full leap bundle: npm run build:leap');
                },
                cs: {}
            };
        },
        invokePlugin: function() {
            return Promise.reject('Leap is a placeholder - please build the full leap bundle: npm run build:leap');
        },
        getColorCodesFromExcel: function() {
            return Promise.reject('Leap is a placeholder - please build the full leap bundle: npm run build:leap');
        },
        getStyleCodesFromExcel: function() {
            return Promise.reject('Leap is a placeholder - please build the full leap bundle: npm run build:leap');
        },
        getProfileNamesFromExcel: function() {
            return Promise.reject('Leap is a placeholder - please build the full leap bundle: npm run build:leap');
        },
        getGraphicPlacementOptions: function() {
            return Promise.reject('Leap is a placeholder - please build the full leap bundle: npm run build:leap');
        }
    };
}

// Minimal exports to prevent errors
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {};
}`;

    fs.writeFileSync(path.join(CEP_PLUGIN_OUTPUT, 'leap-dist.js'), placeholderBundle);
    console.log('✅ Placeholder leap-dist.js created');
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

// Create or update .debug file inside plugin folder (in extensions directory)
function createDebugFile() {
    const cepExtensionsDir = getCEPExtensionsDir();
    if (!cepExtensionsDir) {
        return false;
    }

    const pluginPathInExtensions = path.join(cepExtensionsDir, PLUGIN_NAME);
    const debugFilePath = path.join(pluginPathInExtensions, '.debug');
    const extensionId = 'com.octane5.LEAPColorSeparator';

    console.log('\n📝 Creating/updating .debug file in plugin folder...');

    // Ensure plugin folder exists in extensions directory
    if (!fs.existsSync(pluginPathInExtensions)) {
        console.warn('⚠️  Plugin folder not found in extensions directory, skipping .debug file creation');
        return false;
    }

    // Build .debug XML content
    const debugContent = `<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
    <Extension Id="${extensionId}">
        <HostList>
            <Host Name="ILST" Port="8088"/>
        </HostList>
    </Extension>
</ExtensionList>`;

    fs.writeFileSync(debugFilePath, debugContent);
    console.log(`✅ .debug file created at: ${debugFilePath}`);
    return true;
}

// Main execution
try {
    createDirectories();

    // Copy Angular build files
    console.log('📦 Copying Angular build files...');
    copyRecursive(BUILD_OUTPUT, CEP_PLUGIN_OUTPUT);

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

    if (fs.existsSync(LIBS_FOLDER)) {
        copyRecursive(LIBS_FOLDER, path.join(CEP_PLUGIN_OUTPUT, 'libs'));
    } else {
        console.warn('⚠️  libs folder not found in src/, skipping...');
        console.warn('   CSInterface.js may not be available');
    }

    // Try to get leap-dist.js - build if needed
    if (fs.existsSync(LEAP_DIST_FILE)) {
        console.log('✅ Found leap-dist.js in Angular src/, copying...');
        fs.copyFileSync(LEAP_DIST_FILE, path.join(CEP_PLUGIN_OUTPUT, 'leap-dist.js'));
    } else if (fs.existsSync(LEAP_SRC_FILE)) {
        console.log('📦 Building leap bundle from Angular plugin leap-src-index.js...');
        buildLeapBundle();
    } else {
        console.warn('⚠️  leap-dist.js not found and leap-src-index.js not available');
        console.warn('   Creating minimal placeholder bundle');
        console.warn('   The leap-src-index.js file should already exist in the Angular plugin.');
        createPlaceholderBundle();
    }

    // Copy icon
    const iconSourcePath = path.join(__dirname, 'src', 'icon.png');
    if (fs.existsSync(iconSourcePath)) {
        console.log('📦 Copying icon.png...');
        fs.copyFileSync(iconSourcePath, path.join(CEP_PLUGIN_OUTPUT, 'icons', 'icon.png'));
        console.log('✅ Icon copied successfully');
    } else {
        console.warn('⚠️  icon.png not found in src/, skipping...');
    }

    // Copy favicon
    if (fs.existsSync(path.join(BUILD_OUTPUT, 'favicon.ico'))) {
        copyRecursive(path.join(BUILD_OUTPUT, 'favicon.ico'), path.join(CEP_PLUGIN_OUTPUT, 'favicon.ico'));
    } else {
        console.warn('⚠️  favicon.ico not found, skipping...');
    }

    // Create manifest and index.html
    createManifest();
    createIndexHtml();

    // Fix font paths in CSS for CEP extension
    fixFontPathsInCSS();

    console.log('\n✅ CEP plugin setup complete!');
    console.log(`\n📂 Plugin created at: ${CEP_PLUGIN_OUTPUT}`);

    // Copy to CEP extensions directory
    const copied = copyToCEPExtensions();
    if (copied) {
        // Create .debug file
        createDebugFile();

        console.log('\n🎉 Setup complete!');
        console.log('\n📋 Next steps:');
        console.log('   1. Restart Adobe Illustrator (if it\'s running)');
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
