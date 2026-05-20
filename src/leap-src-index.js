const XLSX = require('xlsx');
const fs = window.cep_node.require('fs');
const path = window.cep_node.require('path');

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
  var extensionBase = String(cs.getSystemPath(SystemPath.EXTENSION) || '').replace(/\/+$/, '');
  var extensionRoot = extensionBase + '/jsx/';
  cs.evalScript('$.evalFile("' + extensionRoot + fileName + '")');
 }

 evalScript(functionName, params) {
  var params_string = params ? JSON.stringify(params) : '';
  // Escape for embedding inside single-quoted ExtendScript string literal (apostrophes, backslashes).
  var escaped_params = params_string.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  var eval_string = `${functionName}('${escaped_params}')`;
  var that = this;

  return new Promise((resolve, reject) => {
   var callback = function (eval_res) {
    if (typeof eval_res === 'string') {
     var trimmed = eval_res.replace(/^\s+|\s+$/g, '');
     // Host handlers return JSON (often includes an "error" key on failure). Do not reject those.
     if (trimmed.charAt(0) === '{' || trimmed.charAt(0) === '[') {
      that.log('success eval');
      resolve(eval_res);
      return;
     }
     var low = eval_res.toLowerCase();
     if (low.indexOf('evalscript error') !== -1 || low.indexOf('error') !== -1) {
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
let cachedServerBasePath = null;

function sleep(ms) {
 return new Promise((resolve) => setTimeout(resolve, ms));
}

function getServerBasePath() {
 // commment this
 //  if (process.env.LEAP_SERVER_PATH) {
 //   return process.env.LEAP_SERVER_PATH;
 //  }

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
    const resolvedBasePath = String(parsed.basePath).trim();
    if (resolvedBasePath !== '' && fs.existsSync(resolvedBasePath)) {
     cachedServerBasePath = resolvedBasePath;
     return resolvedBasePath;
    }
   }
  }
 } catch (error) {}

 if (cachedServerBasePath && fs.existsSync(cachedServerBasePath)) {
  return cachedServerBasePath;
 }

 return null;
}

async function getServerBasePathWithRetry() {
 const retryDelaysMs = [0, 300, 1000, 2000];

 for (let i = 0; i < retryDelaysMs.length; i++) {
  const delayMs = retryDelaysMs[i];
  if (delayMs > 0) {
   await sleep(delayMs);
  }

  const basePath = getServerBasePath();
  if (basePath) {
   return basePath;
  }
 }

 return null;
}

function findExcelFileInBatchFolder(documentPath) {
 try {
  if (!documentPath || !fs.existsSync(documentPath)) {
   return null;
  }

  const resolveFirstExcelFromBatchFolder = (batchFolderPath) => {
   if (!batchFolderPath || !fs.existsSync(batchFolderPath)) {
    return null;
   }
   const files = fs
    .readdirSync(batchFolderPath)
    .filter((file) => {
     const filePath = path.join(batchFolderPath, file);
     return fs.statSync(filePath).isFile() && file.toLowerCase().endsWith('.xlsx');
    })
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
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
  };

  let walkDir = path.dirname(documentPath);
  while (walkDir) {
   const entries = fs.existsSync(walkDir) ? fs.readdirSync(walkDir) : [];
   const batchFolderName = entries.find((entry) => {
    const entryPath = path.join(walkDir, entry);
    return fs.statSync(entryPath).isDirectory() && entry.toUpperCase() === 'BATCH';
   });
   if (batchFolderName) {
    const excelFromAncestor = resolveFirstExcelFromBatchFolder(path.join(walkDir, batchFolderName));
    if (excelFromAncestor) {
     console.log(
      '[Separations] findExcelFileInBatchFolder – documentPath:',
      documentPath,
      '| excelFilePath:',
      excelFromAncestor
     );
     return excelFromAncestor;
    }
   }
   const parentWalkDir = path.dirname(walkDir);
   if (!parentWalkDir || parentWalkDir === walkDir) {
    break;
   }
   walkDir = parentWalkDir;
  }

  let currentDir = path.dirname(documentPath);
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

  console.log(
   '[Separations] findExcelFileInBatchFolder – documentPath:',
   documentPath,
   '| excelFilePath:',
   excelFilePath
  );
  return excelFilePath;
 } catch (error) {
  console.log(
   '[Separations] findExcelFileInBatchFolder – no Excel found for documentPath:',
   documentPath,
   '| error:',
   error?.message ?? error
  );
  return null;
 }
}

function findTeamJsonFileNearDocument(documentPath, teamCode) {
 try {
  if (!documentPath || !fs.existsSync(documentPath)) {
   return null;
  }

  const extractTeamCodeFromJson = (parsedJson) => {
   if (!parsedJson || typeof parsedJson !== 'object') return '';
   const direct = parsedJson.TeamCode;
   const fromTeamInfo = parsedJson.team_info && parsedJson.team_info.TeamCode;
   const value = direct || fromTeamInfo || '';
   return String(value || '').trim().toUpperCase();
  };

  const resolveJsonFromFolder = (jsonFolderPath, teamCode) => {
   if (!fs.existsSync(jsonFolderPath) || !fs.statSync(jsonFolderPath).isDirectory()) {
    return null;
   }
   const jsonFiles = fs
    .readdirSync(jsonFolderPath)
    .filter((entry) => entry.toLowerCase().endsWith('.json'))
    .sort();
   if (!jsonFiles.length) {
    return null;
   }
   if (teamCode) {
    const normalizedTeamCode = String(teamCode).trim().toUpperCase();
    const teamSpecific = jsonFiles.find(
     (file) => String(file).toUpperCase().startsWith(normalizedTeamCode + '_')
    );
    if (teamSpecific) {
     return path.join(jsonFolderPath, teamSpecific);
    }

    // Fallback: match by JSON content TeamCode when filename convention differs.
    for (let i = 0; i < jsonFiles.length; i++) {
     const jsonFile = jsonFiles[i];
     const jsonPath = path.join(jsonFolderPath, jsonFile);
     try {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      const parsed = JSON.parse(raw);
      const jsonTeamCode = extractTeamCodeFromJson(parsed);
      if (jsonTeamCode && jsonTeamCode === normalizedTeamCode) {
       return jsonPath;
      }
     } catch (jsonReadError) {}
    }

    // Do not silently pick another team's JSON when a team code was explicitly provided.
    return null;
   }
   return path.join(jsonFolderPath, jsonFiles[0]);
  };

  const normalizedTeamCode = String(teamCode || '').trim();
  const aiFolderPath = path.dirname(documentPath);
  const preferredJsonFolder = path.join(aiFolderPath, 'JSON');

  // Optimized path: JSON folder is usually at active document parent (AI folder) level.
  const preferredJsonFile = resolveJsonFromFolder(preferredJsonFolder, normalizedTeamCode);
  if (preferredJsonFile) {
   return preferredJsonFile;
  }

  // Fallback for older/variant structures: walk upward to locate JSON.
  let currentDir = path.dirname(aiFolderPath);
  while (currentDir) {
   const fallbackJsonFile = resolveJsonFromFolder(path.join(currentDir, 'JSON'), normalizedTeamCode);
   if (fallbackJsonFile) {
    return fallbackJsonFile;
   }
   const parentDir = path.dirname(currentDir);
   if (!parentDir || parentDir === currentDir) break;
   currentDir = parentDir;
  }

  return null;
 } catch (error) {
  return null;
 }
}

function getBatchExcelRecordsFromJson(documentPath, teamCode) {
 try {
  const jsonPath = findTeamJsonFileNearDocument(documentPath, teamCode);
  if (!jsonPath || !fs.existsSync(jsonPath)) {
   return null;
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const parsed = JSON.parse(raw);
  const records = parsed && parsed.batch_excel_records ? parsed.batch_excel_records : null;
  if (!records || typeof records !== 'object') {
   return null;
  }

  console.log(
   '[Separations] Using batch_excel_records JSON fallback from:',
   jsonPath,
   '| teamCode:',
   String(teamCode || '').trim() || '(missing)'
  );
  return records;
 } catch (error) {
  console.log('[Separations] Failed to parse batch_excel_records JSON fallback:', error?.message ?? error);
  return null;
 }
}

function getUniqueValuesFromBatchRecords(records, columnName) {
 const rawValue = records ? records[columnName] : null;
 if (rawValue == null) {
  return [];
 }

 const values = Array.isArray(rawValue) ? rawValue : [rawValue];
 const unique = new Set();

 values.forEach((entry) => {
  if (entry == null) return;
  const text = String(entry).trim();
  if (text !== '') {
   unique.add(text);
  }
 });

 return Array.from(unique).sort();
}

async function getColorCodesFromExcel(teamCode, documentPath) {
 try {
  if (!teamCode) {
   throw new Error('Team code is required');
  }

  let excelFilePath;
  let batchRecordsFromJson = null;
  if (documentPath) {
   excelFilePath = findExcelFileInBatchFolder(documentPath);
   if (!excelFilePath) {
    batchRecordsFromJson = getBatchExcelRecordsFromJson(documentPath, teamCode);
    if (!batchRecordsFromJson) {
     throw new Error('Excel file not found in BATCH folder');
    }
   }
   if (excelFilePath && !fs.existsSync(excelFilePath)) {
    throw new Error(`Excel file does not exist at: ${excelFilePath}`);
   }
   if (excelFilePath) {
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
   }
  } else {
   throw new Error('Document path not provided');
  }

  if (!excelFilePath && batchRecordsFromJson) {
   return getUniqueValuesFromBatchRecords(batchRecordsFromJson, 'Style Color Code');
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

  console.log('workbook', { workbook });

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
 try {
  if (!teamCode) {
   throw new Error('Team code is required');
  }

  let excelFilePath;
  let batchRecordsFromJson = null;
  if (documentPath) {
   excelFilePath = findExcelFileInBatchFolder(documentPath);
   if (!excelFilePath) {
    batchRecordsFromJson = getBatchExcelRecordsFromJson(documentPath, teamCode);
    if (!batchRecordsFromJson) {
     throw new Error('Excel file not found in BATCH folder');
    }
   }
  } else {
   console.log('[Separations] getStyleCodesFromExcel – document path not provided');
   throw new Error('Document path not provided');
  }

  if (!excelFilePath && batchRecordsFromJson) {
   return getUniqueValuesFromBatchRecords(batchRecordsFromJson, 'Lineup Style Code');
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
   console.log('[Separations] getStyleCodesFromExcel – Excel sheet empty, teamCode:', teamCode);
   return [];
  }

  const headerRow = data[0];
  const teamCodeColIndex = headerRow.findIndex((col) => col === 'Lineup Org Code');
  const styleCodeColIndex = headerRow.findIndex((col) => col === 'Lineup Style Code');

  if (teamCodeColIndex === -1 || styleCodeColIndex === -1) {
   console.log(
    '[Separations] getStyleCodesFromExcel – required columns missing. headerRow:',
    headerRow
   );
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

  const styleCodes = Array.from(styleSet).sort();
  console.log(
   '[Separations] getStyleCodesFromExcel – teamCode:',
   teamCode,
   '| styleCodes count:',
   styleCodes.length,
   '| styleCodes:',
   styleCodes
  );
  return styleCodes;
 } catch (error) {
  throw new Error(`Failed to read Excel file: ${error.message}`);
 }
}

function normalizeBatchLookupKey(str) {
 return String(str || '')
  .toLowerCase()
  .replace(/[\s_-]/g, '');
}

function findBatchTeamColumnIndex(headerRow) {
 if (!headerRow || !headerRow.length) {
  return -1;
 }
 const exactOrder = ['Lineup Org Code', 'Team Code', 'TeamCode'];
 for (let e = 0; e < exactOrder.length; e++) {
  const ex = exactOrder[e];
  const idx = headerRow.findIndex((col) => String(col || '').trim() === ex);
  if (idx !== -1) {
   return idx;
  }
 }
 for (let i = 0; i < headerRow.length; i++) {
  const nk = normalizeBatchLookupKey(String(headerRow[i] || ''));
  if (nk === 'lineuporgcode' || nk === 'teamcode') {
   return i;
  }
 }
 return -1;
}

async function getBatchRowVariableSource(teamCode, documentPath) {
 try {
  const normTeam = String(teamCode || '').trim();
  if (!normTeam || !documentPath) {
   return {};
  }
  const excelFilePath = findExcelFileInBatchFolder(documentPath);
  if (!excelFilePath) {
   return {};
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
   console.warn('[Leap] getBatchRowVariableSource read error:', readError.message);
   return {};
  }
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  if (!data.length) {
   return {};
  }
  const headerRow = data[0];
  const teamCol = findBatchTeamColumnIndex(headerRow);
  if (teamCol === -1) {
   return {};
  }
  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (!rowData || rowData[teamCol] == null || String(rowData[teamCol]).trim() === '') {
    continue;
   }
   if (String(rowData[teamCol]).trim() !== normTeam) {
    continue;
   }
   const fields = {};
   for (let c = 0; c < headerRow.length; c++) {
    const headerName = headerRow[c];
    if (headerName == null || String(headerName).trim() === '') {
     continue;
    }
    const key = String(headerName).trim();
    const cell = rowData[c];
    if (cell == null) {
     continue;
    }
    const txt = String(cell).trim();
    if (txt !== '') {
     fields[key] = txt;
    }
   }
   return fields;
  }
  return {};
 } catch (error) {
  console.warn('[Leap] getBatchRowVariableSource:', error.message);
  return {};
 }
}

async function getBatchExcelColumnNames(documentPath) {
 try {
  if (!documentPath) {
   return [];
  }

  const excelFilePath = findExcelFileInBatchFolder(documentPath);
  if (!excelFilePath) {
   const batchRecordsFromJson = getBatchExcelRecordsFromJson(documentPath);
   return batchRecordsFromJson ? Object.keys(batchRecordsFromJson).filter((key) => String(key || '').trim() !== '') : [];
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
   console.warn('[Leap] getBatchExcelColumnNames read error:', readError.message);
   return [];
  }

  const sheetName = workbook && workbook.SheetNames && workbook.SheetNames[0];
  const worksheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!worksheet) {
   return [];
  }

  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  const headerRow = Array.isArray(data) && Array.isArray(data[0]) ? data[0] : [];
  const seen = new Set();
  return headerRow
   .map((header) => String(header == null ? '' : header).trim())
   .filter((header) => {
    if (!header || seen.has(header)) return false;
    seen.add(header);
    return true;
   });
 } catch (error) {
  console.warn('[Leap] getBatchExcelColumnNames:', error.message);
  return [];
 }
}

async function getProfileNamesFromExcel(styleCodes) {
 try {
  if (!styleCodes || !Array.isArray(styleCodes) || styleCodes.length === 0) {
   throw new Error('Style codes array is required');
  }

  const serverBasePath = await getServerBasePathWithRetry();
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
  const normalizedHeaders = headerRow.map((col) => String(col || '').trim().toLowerCase());
  const findHeaderIndex = (candidates) =>
   normalizedHeaders.findIndex((header) => candidates.indexOf(header) >= 0);
  const styleCodeColIndex = findHeaderIndex(['style code', 'lineup style code']);
  const profileNameColIndex = findHeaderIndex(['profile name', 'profile', 'lineup profile name']);
  const styleDescColIndex = findHeaderIndex(['style desc', 'style description', 'description', 'style name']);

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

  const withProfile = Object.keys(profileMap);
  const missing = styleCodes.filter((sc) => !profileMap[sc]);
  console.log(
   '[Separations] getProfileNamesFromExcel – styleCodes requested:',
   styleCodes.length,
   '| found in Styles.xlsx:',
   withProfile.length,
   '| profileMap:',
   profileMap
  );
  if (missing.length) {
   console.log(
    '[Separations] getProfileNamesFromExcel – style codes NOT in Styles.xlsx (will show as Unknown Profile):',
    missing
   );
  }
  return profileMap;
 } catch (error) {
  throw new Error(`Failed to read Excel file: ${error.message}`);
 }
}

/**
 * Get full style information from Styles.xlsx (Icon, Style Desc, and all columns)
 * Returns styleInfoMap: { [styleCode]: { Icon, Style Desc, ... } }
 */
async function getStyleInformation(styleCodes) {
 try {
  console.log('[getStyleInformation] Called with styleCodes:', styleCodes);
  if (!styleCodes || !Array.isArray(styleCodes) || styleCodes.length === 0) {
   throw new Error('Style codes array is required');
  }

  const serverBasePath = await getServerBasePathWithRetry();
  console.log('[getStyleInformation] serverBasePath:', serverBasePath || '(null)');
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
   console.error('[getStyleInformation] File not found at:', excelFilePath);
   throw new Error(`Excel file not found at: ${excelFilePath}`);
  }
  console.log('[getStyleInformation] Reading Excel from:', excelFilePath);

  let workbook;
  try {
   const fileBuffer = fs.readFileSync(excelFilePath);
   workbook = XLSX.read(fileBuffer, { type: 'buffer' });
   console.log('[getStyleInformation] Read Excel via buffer, size:', fileBuffer.length);
  } catch (bufferError) {
   console.log('[getStyleInformation] Buffer read failed, trying readFile:', bufferError.message);
   workbook = XLSX.readFile(excelFilePath);
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (data.length === 0) {
   console.log('[getStyleInformation] Sheet is empty');
   return { success: true, styleInfoMap: {} };
  }

  const headerRow = data[0];
  const styleCodeColIndex = headerRow.findIndex((col) => col === 'Style Code');
  if (styleCodeColIndex === -1) {
   console.error('[getStyleInformation] No Style Code column. Headers:', headerRow);
   throw new Error('Required columns not found in Excel file');
  }

  const styleCodesSet = new Set(styleCodes.map((sc) => String(sc).trim()));
  const styleInfoMap = {};
  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (rowData && rowData[styleCodeColIndex]) {
    const styleCode = String(rowData[styleCodeColIndex]).trim();
    if (styleCodesSet.has(styleCode)) {
     const styleInfo = {};
     headerRow.forEach((columnName, colIndex) => {
      if (columnName && rowData[colIndex] !== undefined && rowData[colIndex] !== null) {
       styleInfo[columnName] = String(rowData[colIndex]).trim();
      }
     });
     styleInfoMap[styleCode] = styleInfo;
    }
   }
  }

  console.log(
   '[getStyleInformation] Found styleInfoMap for:',
   Object.keys(styleInfoMap),
   styleInfoMap
  );
  return { success: true, styleInfoMap };
 } catch (error) {
  console.error('[getStyleInformation] Error:', error.message, error);
  return { success: false, error: error.message || 'Failed to read Excel file' };
 }
}

async function getStylesCatalogFromExcel(explicitBasePath) {
 try {
  const resolvedBasePath =
   explicitBasePath && String(explicitBasePath).trim() !== ''
    ? String(explicitBasePath).trim()
    : await getServerBasePathWithRetry();
  if (!resolvedBasePath) {
   throw new Error('Server base path not found');
  }
  const normalizedBasePath = resolvedBasePath.replace(/\/$/, '');
  const excelFilePath = path.join(normalizedBasePath, 'SETTINGS', 'LEAP_SEPS', 'Data', 'Styles.xlsx');
  console.log('[StylesCatalog] Reading Styles.xlsx from:', excelFilePath);

  if (!fs.existsSync(excelFilePath)) {
   throw new Error(`Excel file not found at: ${excelFilePath}`);
  }

  let workbook;
  try {
   const fileBuffer = fs.readFileSync(excelFilePath);
   workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch (bufferError) {
   workbook = XLSX.readFile(excelFilePath);
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
  console.log('[StylesCatalog] Sheet name:', sheetName, '| total rows:', data.length);

  if (data.length === 0) {
   return { success: true, styles: [] };
  }

  const headerRow = data[0];
  const normalizedHeaders = headerRow.map((col) => String(col || '').trim().toLowerCase());
  const findHeaderIndex = (candidates) =>
   normalizedHeaders.findIndex((header) => candidates.indexOf(header) >= 0);
  const styleCodeColIndex = findHeaderIndex(['style code']);
  const profileNameColIndex = findHeaderIndex(['profile name']);
  const styleDescColIndex = findHeaderIndex(['style desc', 'style description', 'description']);

  if (styleCodeColIndex === -1) {
   throw new Error('Style Code column not found in Styles.xlsx');
  }
  console.log('[StylesCatalog] Header mapping', {
   styleCodeColIndex,
   profileNameColIndex,
   styleDescColIndex,
   headers: headerRow
  });

  const styleMap = new Map();
  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (!rowData || rowData[styleCodeColIndex] == null) continue;

   const styleCode = String(rowData[styleCodeColIndex]).trim();
   if (!styleCode) continue;

   const profileName =
    profileNameColIndex >= 0 && rowData[profileNameColIndex] != null
     ? String(rowData[profileNameColIndex]).trim()
     : '';
   const styleDesc =
    styleDescColIndex >= 0 && rowData[styleDescColIndex] != null
     ? String(rowData[styleDescColIndex]).trim()
     : '';

   styleMap.set(styleCode, {
    styleCode,
    profileName: profileName || 'Unknown Profile',
    styleDesc
   });
  }

  const styles = Array.from(styleMap.values()).sort((a, b) => a.styleCode.localeCompare(b.styleCode));
  console.log('[StylesCatalog] Loaded style codes count:', styles.length);
  console.log(
   '[StylesCatalog] Loaded style codes list:',
   styles.map((item) => item.styleCode)
  );
  return { success: true, styles };
 } catch (error) {
  console.error('[StylesCatalog] Failed to load Styles.xlsx:', error?.message || error);
  return { success: false, error: error.message || 'Failed to read Styles.xlsx', styles: [] };
 }
}

/**
 * Look up color by Code from COLOR_CODE_LOOKUP.xlsx (same folder as Styles.xlsx).
 * Columns: Color Name, Code, Hex, R, G, B, C, M, Y, K
 * @param {string} colorCode - Code to look up (e.g. "0042", "006R")
 * @returns {Promise<{ success: boolean, color?: { hex, colorName, cmyk, rgb }, error?: string }>}
 */
async function getColorByCodeFromLookup(colorCode) {
 try {
  if (!colorCode || String(colorCode).trim() === '') {
   return { success: false, error: 'Color code is required' };
  }

  const code = String(colorCode).trim();
  const serverBasePath = await getServerBasePathWithRetry();
  if (!serverBasePath) {
   return { success: false, error: 'Server base path not found' };
  }

  const normalizedBasePath = serverBasePath.replace(/\/$/, '');
  const excelFilePath = path.join(
   normalizedBasePath,
   'SETTINGS',
   'LEAP_SEPS',
   'Data',
   'COLOR_CODE_LOOKUP.xlsx'
  );

  if (!fs.existsSync(excelFilePath)) {
   return { success: false, error: `COLOR_CODE_LOOKUP.xlsx not found at: ${excelFilePath}` };
  }

  let workbook;
  try {
   const fileBuffer = fs.readFileSync(excelFilePath);
   workbook = XLSX.read(fileBuffer, { type: 'buffer' });
  } catch (bufferError) {
   workbook = XLSX.readFile(excelFilePath);
  }

  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

  if (!data || data.length < 2) {
   return { success: false, error: 'COLOR_CODE_LOOKUP.xlsx has no data rows' };
  }

  const headerRow = data[0];
  const codeColIndex = headerRow.findIndex((col) => String(col || '').trim() === 'Code');
  const hexColIndex = headerRow.findIndex((col) => String(col || '').trim() === 'Hex');
  const colorNameColIndex = headerRow.findIndex((col) => String(col || '').trim() === 'Color Name');
  const rCol = headerRow.findIndex((col) => String(col || '').trim() === 'R');
  const gCol = headerRow.findIndex((col) => String(col || '').trim() === 'G');
  const bCol = headerRow.findIndex((col) => String(col || '').trim() === 'B');
  const cCol = headerRow.findIndex((col) => String(col || '').trim() === 'C');
  const mCol = headerRow.findIndex((col) => String(col || '').trim() === 'M');
  const yCol = headerRow.findIndex((col) => String(col || '').trim() === 'Y');
  const kCol = headerRow.findIndex((col) => String(col || '').trim() === 'K');

  if (codeColIndex === -1) {
   return { success: false, error: 'Code column not found in COLOR_CODE_LOOKUP.xlsx' };
  }

  const toNum = (v) => {
   if (v == null || v === '') return 0;
   const n = Number(v);
   return isNaN(n) ? 0 : Math.max(0, Math.min(100, n));
  };
  const toNum255 = (v) => {
   if (v == null || v === '') return 0;
   const n = Number(v);
   return isNaN(n) ? 0 : Math.max(0, Math.min(255, Math.round(n)));
  };

  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (!rowData || rowData[codeColIndex] == null) continue;
   const rowCode = String(rowData[codeColIndex]).trim();
   if (rowCode !== code) continue;

   let hex = hexColIndex >= 0 && rowData[hexColIndex] != null ? String(rowData[hexColIndex]).trim() : '';
   if (hex && !hex.startsWith('#')) hex = '#' + hex;

   const colorName =
    colorNameColIndex >= 0 && rowData[colorNameColIndex] != null
     ? String(rowData[colorNameColIndex]).trim()
     : rowCode;

   const c = cCol >= 0 ? toNum(rowData[cCol]) : 0;
   const m = mCol >= 0 ? toNum(rowData[mCol]) : 0;
   const y = yCol >= 0 ? toNum(rowData[yCol]) : 0;
   const k = kCol >= 0 ? toNum(rowData[kCol]) : 0;

   const r = rCol >= 0 ? toNum255(rowData[rCol]) : 0;
   const g = gCol >= 0 ? toNum255(rowData[gCol]) : 0;
   const b = bCol >= 0 ? toNum255(rowData[bCol]) : 0;

   const color = {
    hex: hex || '#000000',
    colorName,
    cmyk: { c, m, y, k },
    rgb: { r, g, b }
   };
   return { success: true, color };
  }

  return { success: false, error: `No row with Code "${code}" in COLOR_CODE_LOOKUP.xlsx` };
 } catch (error) {
  console.error('[getColorByCodeFromLookup] Error:', error);
  return { success: false, error: error.message || 'Failed to read COLOR_CODE_LOOKUP.xlsx' };
 }
}

async function getGraphicPlacementOptions(documentPath, teamCode) {
 try {
  let excelFilePath;
  let batchRecordsFromJson = null;
  if (documentPath) {
   excelFilePath = findExcelFileInBatchFolder(documentPath);
   if (!excelFilePath) {
    batchRecordsFromJson = getBatchExcelRecordsFromJson(documentPath, teamCode);
    if (!batchRecordsFromJson) {
     throw new Error('Excel file not found in BATCH folder');
    }
   }
   if (excelFilePath && !fs.existsSync(excelFilePath)) {
    throw new Error(`Excel file does not exist at: ${excelFilePath}`);
   }
   if (excelFilePath) {
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
   }
  } else {
   throw new Error('Document path not provided');
  }

  if (!excelFilePath && batchRecordsFromJson) {
   const placementsRaw = [
    ...getUniqueValuesFromBatchRecords(batchRecordsFromJson, 'Graphic Placement'),
    ...getUniqueValuesFromBatchRecords(batchRecordsFromJson, 'Graphic Position')
   ];
   const placementSet = new Set();
   placementsRaw.forEach((value) => {
    value.split(',').forEach((item) => {
     const trimmed = String(item || '').trim();
     if (trimmed) {
      placementSet.add(trimmed);
     }
    });
   });
   return Array.from(placementSet).sort();
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
  const normalizedHeaders = headerRow.map((col) => String(col || '').trim().toLowerCase());
  const graphicPlacementColIndices = normalizedHeaders
   .map((header, index) => (header === 'graphic placement' || header === 'graphic position' ? index : -1))
   .filter((index) => index >= 0);

  if (graphicPlacementColIndices.length === 0) {
   return [];
  }

  const placementSet = new Set();
  for (let row = 1; row < data.length; row++) {
   const rowData = data[row];
   if (!rowData) continue;
   graphicPlacementColIndices.forEach((graphicPlacementColIndex) => {
    if (rowData[graphicPlacementColIndex]) {
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
   });
  }

  const placements = Array.from(placementSet).sort();
  return [...placements];
 } catch (error) {
  return [];
 }
}

async function getProfileInformation(profileCode) {
 try {
  if (!profileCode) {
   throw new Error('Profile code is required');
  }

  const serverBasePath = await getServerBasePathWithRetry();
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

  const normalizedLookup = String(profileCode).trim().toUpperCase();
  const matchedProfile = profilesData.find((profile) => {
   const codeValue =
    profile && profile['Profile Code'] != null ? String(profile['Profile Code']).trim().toUpperCase() : '';
   const nameValue =
    profile && profile['Profile Name'] != null ? String(profile['Profile Name']).trim().toUpperCase() : '';
   return codeValue === normalizedLookup || nameValue === normalizedLookup;
  });

  if (!matchedProfile) {
   console.warn('[LEAP][UB_DEBUG] Profile not found in Profiles.json for code:', profileCode);
   return {
    found: false,
    profileCode: profileCode,
    flash: false,
    cool: false,
    micron: 'NA',
    wb: false
   };
  }

  const toEnabled = (value) => {
   if (value === true || value === 1) return true;
   if (typeof value === 'string') {
    const normalized = value.trim().toUpperCase();
    return normalized === 'Y' || normalized === 'YES' || normalized === 'TRUE' || normalized === '1';
   }
   return false;
  };

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

  const ubEnabledArray = Array.isArray(matchedProfile.underbaseEnabled)
   ? matchedProfile.underbaseEnabled
   : null;
  const ubKnockoutArray = Array.isArray(matchedProfile.underbaseKnockoutBlack)
   ? matchedProfile.underbaseKnockoutBlack
   : null;
  const defaultUbSwatches = ['White UB', 'White UB', 'White UB', 'White UB'];
  const savedUbSwatches = Array.isArray(matchedProfile.underbaseKnockoutSwatches)
   ? matchedProfile.underbaseKnockoutSwatches
   : null;
  const underbaseKnockoutSwatches = [0, 1, 2, 3].map((j) => {
   if (savedUbSwatches && savedUbSwatches[j] != null && String(savedUbSwatches[j]).trim() !== '') {
    return String(savedUbSwatches[j]).trim();
   }
   return defaultUbSwatches[j];
  });
  const ub2Enabled = toEnabled(
   matchedProfile['Underbase 2'] != null ? matchedProfile['Underbase 2'] : matchedProfile['UB 2']
  ) || (ubEnabledArray ? !!ubEnabledArray[1] : false);
  const ub3Enabled = toEnabled(
   matchedProfile['Underbase 3'] != null ? matchedProfile['Underbase 3'] : matchedProfile['UB 3']
  ) || (ubEnabledArray ? !!ubEnabledArray[2] : false);
  const ub4Enabled = toEnabled(
   matchedProfile['Underbase 4'] != null ? matchedProfile['Underbase 4'] : matchedProfile['UB 4']
  ) || (ubEnabledArray ? !!ubEnabledArray[3] : false);

  console.log('[LEAP][UB_DEBUG] Matched profile row:', {
   profileCode,
   profileName: matchedProfile['Profile Name'] || '',
   underbase2Raw: matchedProfile['Underbase 2'] != null ? matchedProfile['Underbase 2'] : matchedProfile['UB 2'],
   underbase3Raw: matchedProfile['Underbase 3'] != null ? matchedProfile['Underbase 3'] : matchedProfile['UB 3'],
   underbase4Raw: matchedProfile['Underbase 4'] != null ? matchedProfile['Underbase 4'] : matchedProfile['UB 4'],
   underbaseEnabledArray: ubEnabledArray,
   underbaseKnockoutArray: ubKnockoutArray,
   underbase2Enabled: ub2Enabled,
   underbase3Enabled: ub3Enabled,
   underbase4Enabled: ub4Enabled,
   ub1Mesh: matchedProfile['UB 1 Mesh'] || '',
   ub2Mesh: matchedProfile['UB 2 Mesh'] || '',
   ub3Mesh: matchedProfile['UB 3 Mesh'] || '',
   ub4Mesh: matchedProfile['UB 4 Mesh'] || ''
  });

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
   blackInksKnockoutDisplay:
    matchedProfile.blackInksKnockoutDisplay != null
     ? String(matchedProfile.blackInksKnockoutDisplay)
     : '',
   underbaseSwatch:
    matchedProfile.underbaseSwatch != null && String(matchedProfile.underbaseSwatch).trim() !== ''
     ? String(matchedProfile.underbaseSwatch).trim()
     : (
      matchedProfile['Underbase Swatch'] != null && String(matchedProfile['Underbase Swatch']).trim() !== ''
       ? String(matchedProfile['Underbase Swatch']).trim()
       : 'White UB'
      ),
   underbaseKnockoutBlack: [
    ubKnockoutArray ? !!ubKnockoutArray[0] : false,
    ubKnockoutArray ? !!ubKnockoutArray[1] : false,
    ubKnockoutArray ? !!ubKnockoutArray[2] : false,
    ubKnockoutArray ? !!ubKnockoutArray[3] : false
   ],
   underbaseKnockoutSwatches,
   underbase2Enabled: ub2Enabled,
   underbase3Enabled: ub3Enabled,
   underbase4Enabled: ub4Enabled,
   distress: matchedProfile['Distress'] || '',
   twoHits: matchedProfile['2 Hits'] || '',
   blocker: matchedProfile['Blocker'] || '',
   blockerMesh:
    matchedProfile.blockerMesh != null
     ? String(matchedProfile.blockerMesh)
     : (
      matchedProfile['Blocker Mesh'] != null
       ? String(matchedProfile['Blocker Mesh'])
       : ''
      ),
   formatInkNameLabel: toEnabled(matchedProfile.formatInkNameLabel || false),
   colorNameLabelFormat:
    matchedProfile.colorNameLabelFormat != null && String(matchedProfile.colorNameLabelFormat).trim() !== ''
     ? String(matchedProfile.colorNameLabelFormat)
     : 'PANTONE XXX C'
  };
 } catch (error) {
  console.error('[LEAP][UB_DEBUG] getProfileInformation failed:', profileCode, error.message);
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

  const serverBasePath = await getServerBasePathWithRetry();
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

 async getBatchRowVariableSource(teamCode, documentPath) {
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
   const fields = await getBatchRowVariableSource(teamCode, documentPath);
   return {
    success: true,
    fields: fields || {}
   };
  } catch (error) {
   this.log(`Error getBatchRowVariableSource: ${error.message}`);
   return {
    success: false,
    error: error.message,
    fields: {}
   };
  }
 }

 async getBatchExcelColumnNames(documentPath) {
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
   const columns = await getBatchExcelColumnNames(documentPath);
   return {
    success: true,
    columns: columns || []
   };
  } catch (error) {
   this.log(`Error getBatchExcelColumnNames: ${error.message}`);
   return {
    success: false,
    error: error.message,
    columns: []
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

 async getStyleInformation(styleCodes) {
  try {
   console.log('[Leap.getStyleInformation] Called with:', styleCodes);
   const result = await getStyleInformation(styleCodes);
   console.log('[Leap.getStyleInformation] Returning:', result);
   return result;
  } catch (error) {
   console.error('[Leap.getStyleInformation] Error:', error);
   return {
    success: false,
    error: error.message
   };
  }
 }

 async getStylesCatalogFromExcel(basePath) {
  try {
   return await getStylesCatalogFromExcel(basePath);
  } catch (error) {
   return {
    success: false,
    error: error.message
   };
  }
 }

 async getColorByCodeFromLookup(colorCode) {
  try {
   const result = await getColorByCodeFromLookup(colorCode);
   return result;
  } catch (error) {
   console.error('[Leap.getColorByCodeFromLookup] Error:', error);
   return { success: false, error: error.message };
  }
 }

 async getGraphicPlacementOptions(documentPath, teamCode) {
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

   if (!teamCode) {
    try {
     const templateInfoResult = await scriptLoader.evalScript('handleGetTemplateInfo', {});
     const templateInfoData = JSON.parse(templateInfoResult);
     if (templateInfoData?.success && templateInfoData?.data?.teamCode) {
      teamCode = String(templateInfoData.data.teamCode).trim();
     }
    } catch (templateError) {
     this.log(`Could not get team code from template info: ${templateError.message}`);
    }
   }

   const placements = await getGraphicPlacementOptions(documentPath, teamCode);
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
