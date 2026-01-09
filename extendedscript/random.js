/**
 * Find first .xlsx file inside BATCH folder
 * relative to the given document path
 */
function findExcelFileInBatchFolder(documentPath) {
 try {
  if (!documentPath) {
   return null;
  }

  var docFile = new File(documentPath);
  if (!docFile.exists) {
   return null;
  }

  var currentDir = docFile.parent;
  var teamoutsFolder = null;

  // Traverse upward to find TEAMOUTS or 01 folder
  while (currentDir) {
   var folderName = currentDir.name.toUpperCase();

   if (folderName.indexOf('TEAMOUTS') !== -1 || folderName.indexOf('01') !== -1) {
    teamoutsFolder = currentDir;
    break;
   }

   if (!currentDir.parent || currentDir.parent.fsName === currentDir.fsName) {
    break;
   }

   currentDir = currentDir.parent;
  }

  if (!teamoutsFolder) {
   return null;
  }

  // Go up two levels from TEAMOUTS
  var batchParentDir = teamoutsFolder.parent ? teamoutsFolder.parent.parent : null;
  if (!batchParentDir || !batchParentDir.exists) {
   return null;
  }

  // Find "BATCH" folder
  var folders = batchParentDir.getFiles(function (f) {
   return f instanceof Folder && f.name.toUpperCase() === 'BATCH';
  });

  if (!folders || folders.length === 0) {
   return null;
  }

  var batchFolder = folders[0];
  if (!batchFolder.exists) {
   return null;
  }

  // Find .xlsx files
  var excelFiles = batchFolder.getFiles(function (f) {
   return f instanceof File && f.name.toLowerCase().match(/\.xlsx$/);
  });

  if (!excelFiles || excelFiles.length === 0) {
   return null;
  }

  // Return first Excel file path
  return excelFiles[0].fsName;
 } catch (e) {
  return null;
 }
}

var result = findExcelFileInBatchFolder(
 '/Users/ashik/Documents/MDS/Resource/LEAP Assets/BackFront3/NFLT9386_ND9_0IAK ASSETS/01 TEAMOUTS/NBA/AI/NFLT9386NOP_1KND9_0IAK.ai'
);

$.writeln('Result: ' + result);
