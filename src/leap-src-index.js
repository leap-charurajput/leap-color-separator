import * as XLSX from 'xlsx';
const fs = window.cep_node.require('fs');
const path = window.cep_node.require('path');

console.log('LEAPColorSeparator: leap-src-index.js');

class ScriptLoader {
 EvalScript_ErrMessage = 'EvalScript error.';

 constructor() {
  this._cs = new CSInterface();
 }

 get cs() {
  return this._cs;
 }

 set cs(val) {
  this._cs = val;
 }

 loadJSX(fileName) {
  var cs = this.cs;
  var extensionRoot = cs.getSystemPath(SystemPath.EXTENSION) + '/jsx/';
  cs.evalScript('$.evalFile("' + extensionRoot + fileName + '")');
 }

 evalScript(functionName, params) {
  var params_string = params ? JSON.stringify(params) : '';
  var eval_string = `${functionName}('${params_string}')`;
  var that = this;

  return new Promise((resolve, reject) => {
   var callback = function (eval_res) {
    if (typeof eval_res === 'string') {
     if (eval_res.toLowerCase().indexOf('error') != -1) {
      that.log('err eval');
      reject(that.createScriptError(eval_res));
      return;
     }
    }
    that.log('success eval');
    resolve(eval_res);
    return;
   };
   that.cs.evalScript(eval_string, callback);
  });
 }

 createScriptError(reason, data) {
  return { reason, data };
 }

 log(val) {}

 get name() {
  return 'ScriptLoader:: ';
 }
}

var scriptLoader = new ScriptLoader();

function getServerBasePath() {
 if (process.env.LEAP_SERVER_PATH) {
  return process.env.LEAP_SERVER_PATH;
 }

 try {
  const os = require('os');
  const homeDir = os.homedir();
  const settingsPath = path.join(
   homeDir,
   'Documents',
   'LEAP Settings',
   'logobaseDataPathSettings.json'
  );

  if (fs.existsSync(settingsPath)) {
   const content = fs.readFileSync(settingsPath, 'utf8');
   const parsed = JSON.parse(content);
   if (parsed && parsed.basePath) {
    return parsed.basePath;
   }
  }
 } catch (error) {}

 return null;
}

function findExcelFileInBatchFolder(documentPath) {
 try {
  if (!documentPath || !fs.existsSync(documentPath)) {
   return null;
  }

  let currentDir = path.dirname(documentPath);
  console.log('PATH', path, 'currentDIR', currentDir);
  let teamoutsFolder = null;
  while (currentDir) {
   const folderName = path.basename(currentDir);
   if (folderName.toUpperCase().includes('TEAMOUTS') || folderName.toUpperCase().includes('01')) {
    teamoutsFolder = currentDir;
    break;
   }
   const parentDir = path.dirname(currentDir);
   if (!parentDir || parentDir === currentDir) {
    break;
   }
   currentDir = parentDir;
  }

  if (!teamoutsFolder) {
   return null;
  }

  const batchParentDir = path.dirname(path.dirname(teamoutsFolder));
  if (!fs.existsSync(batchParentDir)) {
   return null;
  }

  const entries = fs.readdirSync(batchParentDir);
  const batchFolderName = entries.find((entry) => {
   const entryPath = path.join(batchParentDir, entry);
   return fs.statSync(entryPath).isDirectory() && entry.toUpperCase() === 'BATCH';
  });

  if (!batchFolderName) {
   return null;
  }

  const batchFolderPath = path.join(batchParentDir, batchFolderName);
  if (!fs.existsSync(batchFolderPath)) {
   return null;
  }

  const files = fs.readdirSync(batchFolderPath).filter((file) => {
   const filePath = path.join(batchFolderPath, file);
   return fs.statSync(filePath).isFile() && file.toLowerCase().endsWith('.xlsx');
  });

  if (!files || files.length === 0) {
   return null;
  }

  const excelFilePath = path.resolve(path.join(batchFolderPath, files[0]));
  if (!fs.existsSync(excelFilePath)) {
   return null;
  }

  try {
   fs.accessSync(excelFilePath, fs.constants.R_OK);
  } catch (accessError) {
   return null;
  }

  return excelFilePath;
 } catch (error) {
  return null;
 }
}

async function getColorCodesFromExcel(teamCode, documentPath) {
 try {
  if (!teamCode) {
   throw new Error('Team code is required');
  }

  let excelFilePath;
  if (documentPath) {
   excelFilePath = findExcelFileInBatchFolder(documentPath);
   if (!excelFilePath) {
    throw new Error('Excel file not found in BATCH folder');
   }
   if (!fs.existsSync(excelFilePath)) {
    throw new Error(`Excel file does not exist at: ${excelFilePath}`);
   }
   try {
    fs.accessSync(excelFilePath, fs.constants.R_OK);
   } catch (accessError) {
    throw new Error(`Cannot access Excel file: ${excelFilePath}`);
   }
   try {
    const stats = fs.statSync(excelFilePath);
    if (stats.size === 0) {
     throw new Error(`Excel file is empty: ${excelFilePath}`);
    }
   } catch (statsError) {
    throw new Error(`Cannot get file stats for Excel file: ${excelFilePath}`);
   }
  } else {
   throw new Error('Document path not provided');
  }

  let workbook;
  try {
   try {
    const fileBuffer = fs.readFileSync(excelFilePath);
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
   } catch (bufferError) {
    workbook = XLSX.readFile(excelFilePath);
   }
  } catch (readError) {
   throw new Error(
    `Failed to read Excel file: Cannot access file ${excelFilePath}. The file may be open in another application, corrupted, or locked. ${readError.message}`
   );
  }

  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
   throw new Error(`Excel file appears to be empty or invalid: ${excelFilePath}`);
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
   throw new Error(`Excel file sheet "${sheetName}" is empty or invalid: ${excelFilePath}`);
  }

  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (data.length === 0) {
   return [];
  }

  const headerRow = data[0];
  const teamCodeColIndex = headerRow.findIndex((col) => col === 'Lineup Org Code');
  const colorCodeColIndex = headerRow.findIndex((col) => col === 'Style Color Code');

  if (teamCodeColIndex === -1 || colorCodeColIndex === -1) {
   throw new Error('Required columns not found in Excel file');
  }

  const colorSet = new Set();
  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (rowData && rowData[teamCodeColIndex]) {
    const rowTeamCode = String(rowData[teamCodeColIndex]).trim();
    if (rowTeamCode === String(teamCode).trim()) {
     const colorValue = rowData[colorCodeColIndex];
     if (colorValue) {
      const colorStr = String(colorValue).trim();
      if (colorStr !== '') {
       colorSet.add(colorStr);
      }
     }
    }
   }
  }

  return Array.from(colorSet).sort();
 } catch (error) {
  throw new Error(`Failed to read Excel file: ${error.message}`);
 }
}

async function getStyleCodesFromExcel(teamCode, documentPath) {
 console.log(
  'getStyleCodesFromExcel called with teamCode 100:',
  teamCode,
  'documentPath:',
  documentPath
 );
 try {
  if (!teamCode) {
   throw new Error('Team code is required');
  }

  let excelFilePath;
  if (documentPath) {
   excelFilePath = findExcelFileInBatchFolder(documentPath);
   console.log('Found excelFilePath:', excelFilePath, 'for documentPath:', documentPath);
   if (!excelFilePath) {
    throw new Error('Excel file not found in BATCH folder');
   }
  } else {
   const serverBasePath = getServerBasePath();
   if (!serverBasePath) {
    throw new Error('Server base path not found and document path not provided');
   }
   const normalizedBasePath = serverBasePath.replace(/\/$/, '');
   excelFilePath = path.join(normalizedBasePath, 'SETTINGS', 'LEAP_SEPS', 'Data', 'CL0.xlsx');
   if (!fs.existsSync(excelFilePath)) {
    throw new Error(`Excel file not found at: ${excelFilePath}`);
   }
  }

  let workbook;
  try {
   try {
    const fileBuffer = fs.readFileSync(excelFilePath);
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
   } catch (bufferError) {
    workbook = XLSX.readFile(excelFilePath);
   }
  } catch (readError) {
   throw new Error(`Failed to read Excel file: ${readError.message}`);
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (data.length === 0) {
   return [];
  }

  const headerRow = data[0];
  const teamCodeColIndex = headerRow.findIndex((col) => col === 'Lineup Org Code');
  const styleCodeColIndex = headerRow.findIndex((col) => col === 'Lineup Style Code');

  if (teamCodeColIndex === -1 || styleCodeColIndex === -1) {
   throw new Error('Required columns not found in Excel file');
  }

  const styleSet = new Set();
  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (rowData && rowData[teamCodeColIndex]) {
    const rowTeamCode = String(rowData[teamCodeColIndex]).trim();
    if (rowTeamCode === String(teamCode).trim()) {
     const styleValue = rowData[styleCodeColIndex];
     if (styleValue) {
      const styleStr = String(styleValue).trim();
      if (styleStr !== '') {
       styleSet.add(styleStr);
      }
     }
    }
   }
  }

  return Array.from(styleSet).sort();
 } catch (error) {
  throw new Error(`Failed to read Excel file: ${error.message}`);
 }
}

async function getProfileNamesFromExcel(styleCodes) {
 try {
  if (!styleCodes || !Array.isArray(styleCodes) || styleCodes.length === 0) {
   throw new Error('Style codes array is required');
  }

  const serverBasePath = getServerBasePath();
  if (!serverBasePath) {
   throw new Error('Server base path not found');
  }

  const normalizedBasePath = serverBasePath.replace(/\/$/, '');
  const excelFilePath = path.join(
   normalizedBasePath,
   'SETTINGS',
   'LEAP_SEPS',
   'Data',
   'Styles.xlsx'
  );

  if (!fs.existsSync(excelFilePath)) {
   throw new Error(`Excel file not found at: ${excelFilePath}`);
  }

  try {
   fs.accessSync(excelFilePath, fs.constants.R_OK);
  } catch (accessError) {
   throw new Error(`Cannot access Excel file: ${excelFilePath}`);
  }

  try {
   const stats = fs.statSync(excelFilePath);
   if (stats.size === 0) {
    throw new Error(`Excel file is empty: ${excelFilePath}`);
   }
  } catch (statsError) {
   throw new Error(`Cannot get file stats for Excel file: ${excelFilePath}`);
  }

  let workbook;
  try {
   try {
    const fileBuffer = fs.readFileSync(excelFilePath);
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
   } catch (bufferError) {
    workbook = XLSX.readFile(excelFilePath);
   }
  } catch (readError) {
   throw new Error(`Failed to read Excel file: ${readError.message}`);
  }
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (data.length === 0) {
   return {};
  }

  const headerRow = data[0];
  const styleCodeColIndex = headerRow.findIndex((col) => col === 'Style Code');
  const profileNameColIndex = headerRow.findIndex((col) => col === 'Profile Name');

  if (styleCodeColIndex === -1 || profileNameColIndex === -1) {
   throw new Error('Required columns not found in Excel file');
  }

  const styleCodesSet = new Set(styleCodes.map((sc) => String(sc).trim()));
  const profileMap = {};
  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (rowData && rowData[styleCodeColIndex]) {
    const styleCode = String(rowData[styleCodeColIndex]).trim();
    if (styleCodesSet.has(styleCode)) {
     const profileName = rowData[profileNameColIndex];
     if (profileName) {
      profileMap[styleCode] = String(profileName).trim();
     }
    }
   }
  }

  return profileMap;
 } catch (error) {
  throw new Error(`Failed to read Excel file: ${error.message}`);
 }
}

async function getGraphicPlacementOptions(documentPath) {
 try {
  let excelFilePath;
  if (documentPath) {
   excelFilePath = findExcelFileInBatchFolder(documentPath);
   if (!excelFilePath) {
    throw new Error('Excel file not found in BATCH folder');
   }
   if (!fs.existsSync(excelFilePath)) {
    throw new Error(`Excel file does not exist at: ${excelFilePath}`);
   }
   try {
    fs.accessSync(excelFilePath, fs.constants.R_OK);
   } catch (accessError) {
    throw new Error(`Cannot access Excel file: ${excelFilePath}`);
   }
   try {
    const stats = fs.statSync(excelFilePath);
    if (stats.size === 0) {
     throw new Error(`Excel file is empty: ${excelFilePath}`);
    }
   } catch (statsError) {
    throw new Error(`Cannot get file stats for Excel file: ${excelFilePath}`);
   }
  } else {
   const serverBasePath = getServerBasePath();
   if (!serverBasePath) {
    throw new Error('Server base path not found and document path not provided');
   }
   const normalizedBasePath = serverBasePath.replace(/\/$/, '');
   excelFilePath = path.join(normalizedBasePath, 'SETTINGS', 'LEAP_SEPS', 'Data', 'CL0.xlsx');
   if (!fs.existsSync(excelFilePath)) {
    throw new Error(`Excel file not found at: ${excelFilePath}`);
   }
  }

  let workbook;
  try {
   try {
    const fileBuffer = fs.readFileSync(excelFilePath);
    workbook = XLSX.read(fileBuffer, { type: 'buffer' });
   } catch (bufferError) {
    workbook = XLSX.readFile(excelFilePath);
   }
  } catch (readError) {
   throw new Error(
    `Failed to read Excel file: Cannot access file ${excelFilePath}. The file may be open in another application, corrupted, or locked. ${readError.message}`
   );
  }

  if (!workbook || !workbook.SheetNames || workbook.SheetNames.length === 0) {
   throw new Error(`Excel file appears to be empty or invalid: ${excelFilePath}`);
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  if (!worksheet) {
   throw new Error(`Excel file sheet "${sheetName}" is empty or invalid: ${excelFilePath}`);
  }

  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (data.length === 0) {
   return [];
  }

  const headerRow = data[0];
  const graphicPlacementColIndex = headerRow.findIndex((col) => col === 'Graphic Placement');

  if (graphicPlacementColIndex === -1) {
   return ['Choose'];
  }

  const placementSet = new Set();
  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (rowData && rowData[graphicPlacementColIndex]) {
    const placementValue = String(rowData[graphicPlacementColIndex]).trim();
    if (placementValue !== '') {
     const placements = placementValue.split(',');
     placements.forEach((placement) => {
      const trimmedPlacement = placement.trim();
      if (trimmedPlacement !== '') {
       placementSet.add(trimmedPlacement);
      }
     });
    }
   }
  }

  const placements = Array.from(placementSet).sort();
  return ['Choose', ...placements];
 } catch (error) {
  return ['Choose'];
 }
}

async function getProfileInformation(profileCode) {
 try {
  if (!profileCode) {
   throw new Error('Profile code is required');
  }

  const serverBasePath = getServerBasePath();
  if (!serverBasePath) {
   throw new Error('Server base path not found');
  }

  const normalizedBasePath = serverBasePath.replace(/\/$/, '');
  const profilesFilePath = path.join(normalizedBasePath, 'SETTINGS', 'LEAP_SEPS', 'Profiles.json');

  if (!fs.existsSync(profilesFilePath)) {
   throw new Error(`Profiles.json file not found at: ${profilesFilePath}`);
  }

  const profilesData = JSON.parse(fs.readFileSync(profilesFilePath, 'utf8'));
  if (!Array.isArray(profilesData)) {
   throw new Error('Profiles.json does not contain an array');
  }

  const matchedProfile = profilesData.find(
   (profile) =>
    profile['Profile Code'] &&
    String(profile['Profile Code']).trim().toUpperCase() === profileCode.trim().toUpperCase()
  );

  if (!matchedProfile) {
   return {
    found: false,
    profileCode: profileCode,
    flash: false,
    cool: false,
    micron: 'NA',
    wb: false
   };
  }

  const flashValue = matchedProfile['Flash']
   ? String(matchedProfile['Flash']).trim().toUpperCase()
   : '';
  const coolValue = matchedProfile['Cool']
   ? String(matchedProfile['Cool']).trim().toUpperCase()
   : '';
  const micronValue = matchedProfile['Micron'] ? String(matchedProfile['Micron']).trim() : 'NA';
  const wbValue = matchedProfile['WB'] ? String(matchedProfile['WB']).trim().toUpperCase() : 'N';

  const flash = flashValue === 'Y' || flashValue === 'YES';
  const cool = coolValue === 'Y' || coolValue === 'YES';
  const wb = wbValue === 'Y' || wbValue === 'YES';

  return {
   found: true,
   profileCode: profileCode,
   profileName: matchedProfile['Profile Name'] || '',
   flash: flash,
   cool: cool,
   micron: micronValue,
   wb: wb,
   colorMesh: matchedProfile['Color Mesh'] || '',
   ub1Mesh: matchedProfile['UB 1 Mesh'] || '',
   ub2Mesh: matchedProfile['UB 2 Mesh'] || '',
   ub3Mesh: matchedProfile['UB 3 Mesh'] || '',
   ub4Mesh: matchedProfile['UB 4 Mesh'] || '',
   distress: matchedProfile['Distress'] || '',
   twoHits: matchedProfile['2 Hits'] || '',
   blocker: matchedProfile['Blocker'] || ''
  };
 } catch (error) {
  return {
   found: false,
   profileCode: profileCode,
   flash: false,
   cool: false,
   micron: 'NA',
   wb: false,
   error: error.message
  };
 }
}

async function getInkInformation(inkName, profileName) {
 try {
  if (!inkName) {
   throw new Error('Ink name is required');
  }

  const serverBasePath = getServerBasePath();
  if (!serverBasePath) {
   throw new Error('Server base path not found');
  }

  const normalizedBasePath = serverBasePath.replace(/\/$/, '');
  const inksFilePath = path.join(normalizedBasePath, 'SETTINGS', 'LEAP_SEPS', 'Data', 'Inks.xlsx');

  if (!fs.existsSync(inksFilePath)) {
   throw new Error(`Inks.xlsx file not found at: ${inksFilePath}`);
  }

  const workbook = XLSX.readFile(inksFilePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (data.length === 0) {
   throw new Error('Inks.xlsx file is empty');
  }

  const headerRow = data[0];
  const inkColorColIndex = headerRow.findIndex((col) => col === 'Ink Color');
  const colorMeshColIndex = headerRow.findIndex((col) => col === 'Color Mesh');
  const twoHitsColIndex = headerRow.findIndex((col) => col === 'Two Hits');
  const profileColIndex = headerRow.findIndex((col) => col === 'Profile');

  if (inkColorColIndex === -1 || colorMeshColIndex === -1 || twoHitsColIndex === -1) {
   throw new Error('Required columns not found in Inks.xlsx');
  }

  const profileNameUpper = profileName ? String(profileName).trim().toUpperCase() : null;
  const inkNameUpper = inkName.toUpperCase().trim();
  let matchedRow = null;

  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (rowData && rowData[inkColorColIndex]) {
    const excelInkColor = String(rowData[inkColorColIndex]).trim().toUpperCase();
    let inkColorMatches = false;

    if (inkNameUpper.includes(excelInkColor) || excelInkColor.includes(inkNameUpper)) {
     inkColorMatches = true;
    } else {
     const inkNameParts = inkNameUpper.match(/\d+[A-Z]*/g);
     const excelParts = excelInkColor.match(/\d+[A-Z]*/g);
     if (inkNameParts && excelParts) {
      for (const inkPart of inkNameParts) {
       for (const excelPart of excelParts) {
        if (inkPart === excelPart) {
         inkColorMatches = true;
         break;
        }
       }
       if (inkColorMatches) break;
      }
     }
    }

    if (inkColorMatches) {
     if (profileNameUpper && profileColIndex !== -1) {
      const excelProfileName = rowData[profileColIndex]
       ? String(rowData[profileColIndex]).trim().toUpperCase()
       : '';
      if (excelProfileName === profileNameUpper) {
       matchedRow = rowData;
       break;
      }
     } else {
      matchedRow = rowData;
      break;
     }
    }
   }
  }

  if (!matchedRow) {
   return {
    found: false,
    mesh: '110',
    twoHits: false,
    inkName: inkName,
    profileCode: null
   };
  }

  const meshValue = matchedRow[colorMeshColIndex]
   ? String(matchedRow[colorMeshColIndex]).trim()
   : '110';
  const twoHitsValue = matchedRow[twoHitsColIndex]
   ? String(matchedRow[twoHitsColIndex]).trim().toUpperCase()
   : 'N';
  const twoHits = twoHitsValue === 'Y' || twoHitsValue === 'YES';
  const matchedProfileName =
   profileColIndex !== -1 && matchedRow[profileColIndex]
    ? String(matchedRow[profileColIndex]).trim()
    : null;

  let profileInfo = null;
  let profileCode = null;
  if (matchedProfileName) {
   profileCode = matchedProfileName;
   profileInfo = await getProfileInformation(profileCode);
  }

  return {
   found: true,
   mesh: meshValue,
   twoHits: twoHits,
   inkName: inkName,
   profileCode: profileCode,
   profileName: matchedProfileName,
   profileInfo: profileInfo
  };
 } catch (error) {
  return {
   found: false,
   mesh: '110',
   twoHits: false,
   inkName: inkName,
   profileCode: null,
   error: error.message
  };
 }
}

async function getInkInformationBatch(inkNames, profileName) {
 try {
  if (!inkNames || !Array.isArray(inkNames) || inkNames.length === 0) {
   throw new Error('Ink names array is required');
  }

  let profileNames = null;
  if (profileName) {
   if (typeof profileName === 'string') {
    profileNames = new Array(inkNames.length).fill(profileName);
   } else if (Array.isArray(profileName)) {
    if (profileName.length !== inkNames.length) {
     throw new Error(
      `Profile names array length (${profileName.length}) must match ink names array length (${inkNames.length})`
     );
    }
    profileNames = profileName;
   } else {
    throw new Error('Profile name must be a string or array of strings');
   }
  }

  const results = [];
  for (let i = 0; i < inkNames.length; i++) {
   const inkName = inkNames[i];
   const profileNameForInk = profileNames ? profileNames[i] : null;
   const inkInfo = await getInkInformation(inkName, profileNameForInk);
   results.push(inkInfo);
  }

  return results;
 } catch (error) {
  throw new Error(`Failed to get ink information: ${error.message}`);
 }
}

class Leap {
 constructor() {
  this.init();
 }

 init() {
  this.log('leap is initing...');
  scriptLoader.loadJSX('cep_adapters.jsx');
  this.log('leap is inited');
 }

 scriptLoader() {
  return scriptLoader;
 }

 invokePlugin(options) {
  const {
   folderPath,
   isFlattenChecked,
   isInfoChecked,
   isInspectVisibleChecked,
   isMasksChecked,
   isTexturesChecked,
   isMeaningfulNamesChecked,
   isHierarchicalChecked
  } = options;

  const pluginData = {
   destinationFolder: folderPath,
   exportInfoJson: isInfoChecked,
   inspectOnlyVisibleLayers: isInspectVisibleChecked,
   exportMasks: isMasksChecked,
   exportTextures: isTexturesChecked,
   flatten: !isHierarchicalChecked,
   namePrefix: isMeaningfulNamesChecked ? 'layer' : undefined
  };

  var that = this;

  return new Promise((resolve, reject) => {
   scriptLoader
    .evalScript('invoke_document_worker', pluginData)
    .then((res) => {
     resolve(JSON.parse(res));
    })
    .catch((err) => {
     reject(err);
    });
  });
 }

 async getColorCodesFromExcel(teamCode, documentPath) {
  try {
   if (!documentPath) {
    try {
     const docPathResult = await scriptLoader.evalScript('handleGetActiveDocumentPath', {});
     const docPathData = JSON.parse(docPathResult);
     if (docPathData.success && docPathData.documentPath) {
      documentPath = docPathData.documentPath;
      this.log(`Retrieved document path from host: ${documentPath}`);
     }
    } catch (docPathError) {
     this.log(`Could not get document path from host: ${docPathError.message}`);
    }
   }

   const colors = await getColorCodesFromExcel(teamCode, documentPath);
   return {
    success: true,
    colors: colors
   };
  } catch (error) {
   this.log(`Error getting color codes: ${error.message}`);
   return {
    success: false,
    error: error.message
   };
  }
 }

 async getStyleCodesFromExcel(teamCode, documentPath) {
  console.log(
   'getStyleCodesFromExcel called with teamCode 200:',
   teamCode,
   'documentPath:',
   documentPath
  );
  try {
   if (!documentPath) {
    try {
     const docPathResult = await scriptLoader.evalScript('handleGetActiveDocumentPath', {});
     const docPathData = JSON.parse(docPathResult);
     if (docPathData.success && docPathData.documentPath) {
      documentPath = docPathData.documentPath;
      this.log(`Retrieved document path from host: ${documentPath}`);
     }
    } catch (docPathError) {
     this.log(`Could not get document path from host: ${docPathError.message}`);
    }
   }

   const styleCodes = await getStyleCodesFromExcel(teamCode, documentPath);
   return {
    success: true,
    styleCodes: styleCodes
   };
  } catch (error) {
   this.log(`Error getting style codes: ${error.message}`);
   return {
    success: false,
    error: error.message
   };
  }
 }

 async getProfileNamesFromExcel(styleCodes) {
  try {
   const profileMap = await getProfileNamesFromExcel(styleCodes);
   return {
    success: true,
    profileMap: profileMap
   };
  } catch (error) {
   this.log(`Error getting profile names: ${error.message}`);
   return {
    success: false,
    error: error.message
   };
  }
 }

 async getGraphicPlacementOptions(documentPath) {
  try {
   if (!documentPath) {
    try {
     const docPathResult = await scriptLoader.evalScript('handleGetActiveDocumentPath', {});
     const docPathData = JSON.parse(docPathResult);
     if (docPathData.success && docPathData.documentPath) {
      documentPath = docPathData.documentPath;
      this.log(`Retrieved document path from host: ${documentPath}`);
     }
    } catch (docPathError) {
     this.log(`Could not get document path from host: ${docPathError.message}`);
    }
   }

   const placements = await getGraphicPlacementOptions(documentPath);
   return {
    success: true,
    placements: placements
   };
  } catch (error) {
   this.log(`Error getting graphic placement options: ${error.message}`);
   return {
    success: false,
    error: error.message
   };
  }
 }

 async getInkInformation(inkName, profileName) {
  try {
   const inkInfo = await getInkInformation(inkName, profileName);
   return {
    success: true,
    inkInfo: inkInfo
   };
  } catch (error) {
   this.log(`Error getting ink information: ${error.message}`);
   return {
    success: false,
    error: error.message
   };
  }
 }

 async getInkInformationBatch(inkNames, profileName) {
  try {
   const inkInfoList = await getInkInformationBatch(inkNames, profileName);
   return {
    success: true,
    inkInfoList: inkInfoList
   };
  } catch (error) {
   this.log(`Error getting ink information batch: ${error.message}`);
   return {
    success: false,
    error: error.message
   };
  }
 }

 async getProfileInformation(profileCode) {
  try {
   const profileInfo = await getProfileInformation(profileCode);
   return {
    success: true,
    profileInfo: profileInfo
   };
  } catch (error) {
   this.log(`Error getting profile information: ${error.message}`);
   return {
    success: false,
    error: error.message
   };
  }
 }

 log(val) {}

 get name() {
  return 'LEAP:: ';
 }
}

var leap = new Leap();
window.leap = leap;
