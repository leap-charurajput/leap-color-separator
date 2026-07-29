#include "./JSON.jsx";

if (!String.prototype.trim) {
 (function () {
  var rtrim = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
  String.prototype.trim = function () {
   return this.replace(rtrim, '');
  };
 })();
}

if (!Object.keys) {
 Object.keys = (function () {
  var hasOwnProperty = Object.prototype.hasOwnProperty,
   hasDontEnumBug = !({
    toString: null
   }).propertyIsEnumerable('toString'),
   dontEnums = [
    'toString',
    'toLocaleString',
    'valueOf',
    'hasOwnProperty',
    'isPrototypeOf',
    'propertyIsEnumerable',
    'constructor'
   ],
   dontEnumsLength = dontEnums.length;

  return function (obj) {
   if (typeof obj !== 'function' && (typeof obj !== 'object' || obj === null)) {
    throw new TypeError('Object.keys called on non-object');
   }

   var result = [],
    prop, i;

   for (prop in obj) {
    if (hasOwnProperty.call(obj, prop)) {
     result.push(prop);
    }
   }

   if (hasDontEnumBug) {
    for (i = 0; i < dontEnumsLength; i++) {
     if (hasOwnProperty.call(obj, dontEnums[i])) {
      result.push(dontEnums[i]);
     }
    }
   }
   return result;
  };
 }());
}

if (!Array.isArray) {
 Array.isArray = function (arg) {
  return Object.prototype.toString.call(arg) === '[object Array]';
 };
}

if (typeof xmpModifier !== 'object') {
 xmpModifier = {};
}

if (typeof xmpModifier._cache === 'undefined') {
 xmpModifier._cache = {};
 xmpModifier._cacheXMPString = {};
}

function GetXMP(nameSpace, nodeName, document) {
 var context = this;
 context.destNamespace = nameSpace;
 context.nodeName = nodeName;
 context.document = document || app.documents[0];

 context.init = function () {
  var xmp = null;
  if (ExternalObject.AdobeXMPScript == undefined) {
   ExternalObject.AdobeXMPScript = new ExternalObject("lib:AdobeXMPScript");
  }
  var registeredNameSpace = XMPMeta.registerNamespace(context.destNamespace, context.nodeName);
  var prefix = XMPMeta.getNamespacePrefix(context.destNamespace);
  var isValidXmp = false;
  if (prefix != '') {
   var docFullName = context.document.fullName ? context.document.fullName.fsName : '';
   var cacheKey = docFullName + '|' + context.destNamespace;
   var currentXMPString = context.document.XMPString;

   if (xmpModifier._cache[cacheKey] &&
    xmpModifier._cacheXMPString[cacheKey] === currentXMPString) {
    xmp = xmpModifier._cache[cacheKey];
   } else {
    xmp = new XMPMeta(currentXMPString);
    xmpModifier._cache[cacheKey] = xmp;
    xmpModifier._cacheXMPString[cacheKey] = currentXMPString;
   }
   isValidXmp = true;
  }
  context.xmp = xmp;
  context.isXmpCreated = isValidXmp;
  context.hasPendingChanges = false;
  context.cacheKey = context.document.fullName ? (context.document.fullName.fsName + '|' + context.destNamespace) : null;
 }

 context.doesStructFieldExist = function (structFieldName) {
  return context.xmp.doesStructFieldExist(context.destNamespace, context.nodeName, context.destNamespace, structFieldName)
 }

 context.deleteStructField = function (structFieldName, autoCommit) {
  if (context.doesStructFieldExist(structFieldName)) {
   context.xmp.deleteStructField(context.destNamespace, context.nodeName, context.destNamespace, structFieldName);
   context.hasPendingChanges = true;

   if (autoCommit !== false) {
    context.commit();
   }
  }
 }

 /*
  * Remove EVERY property under the ColorSeparator namespace — the whole "ColorSeparator" struct node
  * and all of its fields (colors, layer names, underbase swatches, profile metadata, body color,
  * document type, graphics-organization data, separation paths, and anything added in the future).
  * The struct-node delete removes all of our data in one call; the XMPUtils sweep is a
  * belt-and-suspenders pass for any stray top-level property left in the same namespace. Returns
  * true when something was removed.
  */
 context.deleteAllData = function (autoCommit) {
  var removedAny = false;
  try {
   if (context.xmp.doesPropertyExist(context.destNamespace, context.nodeName)) {
    context.xmp.deleteProperty(context.destNamespace, context.nodeName);
    removedAny = true;
   }
  } catch (delNodeErr) { }
  try {
   if (
    typeof XMPUtils !== 'undefined' &&
    XMPUtils.removeProperties &&
    typeof XMPConst !== 'undefined' &&
    XMPConst.REMOVE_ALL_PROPERTIES != null
   ) {
    XMPUtils.removeProperties(
     context.xmp,
     context.destNamespace,
     '',
     XMPConst.REMOVE_ALL_PROPERTIES
    );
    removedAny = true;
   }
  } catch (removeAllErr) { }
  if (removedAny) {
   context.hasPendingChanges = true;
   if (autoCommit !== false) {
    context.commit();
   }
  }
  return removedAny;
 }

 context.setStructField = function (structFieldName, structFieldValue, doesStringify, autoCommit) {
  structFieldValue = doesStringify ? JSON.stringify(structFieldValue) : structFieldValue;
  context.xmp.setStructField(context.destNamespace, context.nodeName, context.destNamespace, structFieldName, structFieldValue);
  context.hasPendingChanges = true;

  if (autoCommit !== false) {
   context.commit();
  }
 }

 context.getStructField = function (structFieldName, doesParse) {
  var structFieldValue = [];
  if (context.doesStructFieldExist(structFieldName)) {
   structFieldValue = context.xmp.getStructField(context.destNamespace, context.nodeName, context.destNamespace, structFieldName).value;
   structFieldValue = doesParse ? JSON.parse(structFieldValue) : structFieldValue;
  }
  return structFieldValue;
 }

 context.commit = function () {
  if (!context.isXmpCreated || !context.xmp) {
   return;
  }
  if (!context.hasPendingChanges) {
   return;
  }
  var packet = context.xmp.serialize(XMPConst.SERIALIZE_USE_COMPACT_FORMAT);
  context.document.XMPString = packet;
  context.document.saved = false;
  context.hasPendingChanges = false;

  if (context.cacheKey) {
   xmpModifier._cache[context.cacheKey] = context.xmp;
   xmpModifier._cacheXMPString[context.cacheKey] = packet;

   var docFullName = context.document.fullName ? context.document.fullName.fsName : '';
   for (var key in xmpModifier._cacheXMPString) {
    if (key.indexOf(docFullName + '|') === 0 && key !== context.cacheKey) {
     xmpModifier._cacheXMPString[key] = packet;
     delete xmpModifier._cache[key];
    }
   }
  }
 }

 context.init();
}

xmpModifier.GetXMP = GetXMP;

#include "./JSON.jsx"
#include "./constants.jsx"
#include "./utilities.jsx"
#include "./color_separation.jsx"

function getServerBasePath() {
 try {
  var documentsFolder = Folder.myDocuments || new Folder("~/Documents");
  var settingsPath = documentsFolder.fsName + "/LEAP Settings/logobaseDataPathSettings.json";
  var settingsFile = new File(settingsPath);
  if (!settingsFile.exists) {
   return null;
  }
  if (!settingsFile.open("r")) {
   return null;
  }
  var content = settingsFile.read();
  settingsFile.close();
  if (!content || !content.length) {
   return null;
  }
  var parsed;
  if (typeof JSON !== "undefined" && JSON.parse) {
   parsed = JSON.parse(content);
  } else {
   parsed = eval("(" + content + ")");
  }
  if (parsed && parsed.basePath) {
   return parsed.basePath;
  }
 } catch (error) {
 }
 return null;
}
function getTemplateFile(selectedTemplateFileName) {
 getTemplateFile.lastAttemptedPath = null;
 var serverBasePath = getServerBasePath();
 var preferredTemplateFileName = selectedTemplateFileName && selectedTemplateFileName.length
  ? selectedTemplateFileName
  : "SEP-GRID-TEMPLATE.ai";
 if (serverBasePath) {
  try {
   var normalizedBasePath = serverBasePath.replace(/\/$/, "");
   var templateFolderPath = normalizedBasePath + "/SETTINGS/LEAP_SEPS/Templates";
   var templateFilePath = templateFolderPath + "/" + preferredTemplateFileName;
   getTemplateFile.lastAttemptedPath = templateFilePath;
   var serverTemplatesFolder = new Folder(templateFolderPath);
   if (serverTemplatesFolder.exists) {
    var serverTemplateFile = new File(templateFilePath);
    if (serverTemplateFile.exists) {
     return serverTemplateFile;
    }
   }
  } catch (serverError) {
  }
 }
 return null;
}
getTemplateFile.lastAttemptedPath = null;
function createSeparationsFolders(rootFolder, league, teamCode, graphicName) {
 var separationsFolder = new Folder(rootFolder.fsName + "/09 SEPARATIONS");
 if (!separationsFolder.exists) {
  separationsFolder.create();
 }
 var leagueSepFolder = new Folder(separationsFolder.fsName + "/" + league);
 if (!leagueSepFolder.exists) {
  leagueSepFolder.create();
 }
 var teamCodeFolder = new Folder(leagueSepFolder.fsName + "/" + teamCode);
 if (!teamCodeFolder.exists) {
  teamCodeFolder.create();
 }
 var graphicNameFolder = new Folder(teamCodeFolder.fsName + "/" + graphicName.toUpperCase());
 if (!graphicNameFolder.exists) {
  graphicNameFolder.create();
 }
 return graphicNameFolder;
}

/** Keep SIZED_ART visible; hide only SIZED_GRAPHICS (guides/PNG stay on SIZED_ART). */
function hideSizedGraphicsSublayer(doc) {
 if (!doc) return;
 try {
  var sizedArt = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
  sizedArt.visible = true;
  try {
   var sizedGraphics = sizedArt.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
   sizedGraphics.visible = false;
  } catch (sgErr) { }
 } catch (e) { }
}

/**
 * Keep SIZED_ART visible but DELETE the SIZED_GRAPHICS sublayer entirely.
 * Used after a separation finishes: the embedded source graphic is no longer
 * needed on the SEP document. "Delete / Recreate All Plates" have been removed
 * from the UI (they were the only consumers that re-read SIZED_GRAPHICS on the
 * SEP doc), and underbase white-swatch detection reads LIVE_ART on the master
 * document, so removing this sublayer has no downstream impact. SIZED_ART itself
 * is preserved so its guides and placed PNG stay on the plate.
 */
function deleteSizedGraphicsSublayer(doc) {
 /* Guard against a missing document reference. */
 if (!doc) return;
 try {
  var sizedArt = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
  /* Keep SIZED_ART visible so guides / placed PNG remain intact. */
  sizedArt.visible = true;
  try {
   var sizedGraphics = sizedArt.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
   /* A locked layer cannot be removed, so unlock first. */
   sizedGraphics.locked = false;
   sizedGraphics.remove();
  } catch (sgErr) {
   /* SIZED_GRAPHICS already absent (e.g. removed on a prior run) - nothing to do. */
  }
 } catch (e) {
  /* SIZED_ART missing - leave the document untouched. */
 }
}

function findPageItemByName(container, itemName) {
 if (!container || !itemName) {
  return null;
 }

 try {
  if (container.pageItems) {
   var directMatch = container.pageItems.getByName(itemName);
   if (directMatch) {
    return directMatch;
   }
  }
 } catch (fastLookupError) {
 }

 try {
  if (container.pageItems) {
   for (var i = 0; i < container.pageItems.length; i++) {
    var pageItem = container.pageItems[i];
    if (pageItem.name === itemName) {
     return pageItem;
    }
    if (pageItem.typename === "GroupItem" || pageItem.typename === "CompoundPathItem") {
     var nestedMatch = findPageItemByName(pageItem, itemName);
     if (nestedMatch) {
      return nestedMatch;
     }
    }
   }
  }
 } catch (pageItemsError) {
 }

 if (container.layers && container.layers.length > 0) {
  for (var j = 0; j < container.layers.length; j++) {
   var layerMatch = findPageItemByName(container.layers[j], itemName);
   if (layerMatch) {
    return layerMatch;
   }
  }
 }

 if (container.pathItems && container.pathItems.length > 0) {
  for (var k = 0; k < container.pathItems.length; k++) {
   var pathItem = container.pathItems[k];
   if (pathItem.name === itemName) {
    return pathItem;
   }
  }
 }

 return null;
}

// Set fill overprint only (not stroke) on a single path item
function setOverprintOnPathItem(pathItem, overprintValue) {
 try {
  if (pathItem.filled) {
   pathItem.fillOverprint = overprintValue;
  }
 } catch (e) {
 }
}

// Recursively set fill overprint on all paths in a container (group, layer, etc.)
function setFillOverprintOnContainer(container, overprintValue) {
 if (!container) return;
 try {
  if (container.typename === "PathItem") {
   setOverprintOnPathItem(container, overprintValue);
   return;
  }
  if (container.typename === "CompoundPathItem") {
   if (container.pathItems && container.pathItems.length > 0) {
    for (var p = 0; p < container.pathItems.length; p++) {
     setOverprintOnPathItem(container.pathItems[p], overprintValue);
    }
   }
   return;
  }
  if (container.typename === "PlacedItem") {
   try {
    if (typeof container.overprint !== "undefined") {
     container.overprint = true;
    }
   } catch (opErr) {
   }
   return;
  }
  if (container.pageItems && container.pageItems.length > 0) {
   for (var i = 0; i < container.pageItems.length; i++) {
    setFillOverprintOnContainer(container.pageItems[i], overprintValue);
   }
  }
 } catch (e) {
  $.writeln("[SEPARATION] setFillOverprintOnContainer error: " + e.message);
 }
}

// Set fill overprint on all paths in SEPARATED_ART layer (including all sublayers)
function setOverprintOnSeparatedArt(doc, overprintValue) {
 try {
  var separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
  setFillOverprintOnContainer(separatedArtLayer, overprintValue);
  if (separatedArtLayer.layers && separatedArtLayer.layers.length > 0) {
   for (var s = 0; s < separatedArtLayer.layers.length; s++) {
    setFillOverprintOnContainer(separatedArtLayer.layers[s], overprintValue);
   }
  }
 } catch (e) {
  $.writeln("[SEPARATION] setOverprintOnSeparatedArt error: " + e.message);
 }
}

function placeAndEmbedGraphicAI(sepDoc, graphicAIPath, graphicName) {
 try {
  var aiFile = new File(graphicAIPath);
  if (!aiFile.exists) {
   $.writeln("AI file not found: " + graphicAIPath);
   return false;
  }

  var sizedArtLayer;
  try {
   sizedArtLayer = sepDoc.layers.getByName("SIZED_ART");
  } catch (e) {
   $.writeln("SIZED_ART layer not found");
   return false;
  }

  var sizedGraphicsLayer;
  try {
   sizedGraphicsLayer = sizedArtLayer.layers.getByName("SIZED_GRAPHICS");
  } catch (e) {
   sizedGraphicsLayer = sizedArtLayer.layers.add();
   sizedGraphicsLayer.name = "SIZED_GRAPHICS";
  }

  var sepArtGuide = findPageItemByName(sizedArtLayer, "SEP_ART");
  if (!sepArtGuide) {
   sepArtGuide = findPageItemByName(sepDoc, "SEP_ART");
  }
  if (!sepArtGuide) {
   $.writeln("SEP_ART guide not found in SEP document");
   return false;
  }
  var sepArtBounds = sepArtGuide.geometricBounds;

  var graphicDoc = app.open(aiFile);
  unlockAllLayersInDocument(graphicDoc);
  try {
   graphicDoc.selectObjectsOnActiveArtboard();
  } catch (selectErr) {
   appendLeapSepLog(
    "selectObjectsOnActiveArtboard failed, retrying after unlock: " +
    (selectErr.message || selectErr)
   );
   unlockAllLayersInDocument(graphicDoc);
   try {
    graphicDoc.selectObjectsOnActiveArtboard();
   } catch (selectErr2) { }
  }

  if (graphicDoc.selection.length === 0) {
   $.writeln("No artwork found in graphics file");
   graphicDoc.close(SaveOptions.DONOTSAVECHANGES);
   return false;
  }

  app.copy();
  graphicDoc.close(SaveOptions.DONOTSAVECHANGES);
  app.activeDocument = sepDoc;
  app.preferences.setBooleanPreference('layers/pastePreserve', false);
  app.activeDocument.activeLayer = sizedGraphicsLayer;
  app.paste();

  if (app.activeDocument.selection.length > 0) {
   app.executeMenuCommand("group");
   var pastedGroup = app.activeDocument.selection[0];
   pastedGroup.name = graphicName;
   var currentBounds = pastedGroup.geometricBounds;
   // Center in SEP_ART horizontally, align top to SEP_ART (match React)
   var currentCenterX = currentBounds[0] + ((currentBounds[2] - currentBounds[0]) / 2);
   var sepArtWidth = sepArtBounds[2] - sepArtBounds[0];
   var targetCenterX = sepArtBounds[0] + (sepArtWidth / 2);
   var targetTop = sepArtBounds[1];
   var moveX = targetCenterX - currentCenterX;
   var moveY = targetTop - currentBounds[1];
   pastedGroup.translate(moveX, moveY);
   prepareSizedArtGraphicForProcessing(sepDoc, pastedGroup);
   // Graphic placed per SEP_ART bounds: set overprint on all paths
   setFillOverprintOnContainer(pastedGroup, false);
  }

  app.activeDocument.selection = null;
  return true;
 } catch (e) {
  $.writeln("Error copying AI graphic: " + e.message);
  return false;
 }
}
function deriveGraphicAiPathFromPngPath(pngPath) {
 if (!pngPath) return "";
 return String(pngPath).replace(/\/PNG\//i, "/AI/").replace(/\.png$/i, ".ai");
}

/** PNG/fileName first; if missing, use AI/fileName (same base name). */
function resolveGraphicPlaceholderFile(pngPath, aiPath) {
 var candidates = [];
 var seen = {};
 function addCandidate(pathValue) {
  if (!pathValue) return;
  var key = String(pathValue).toUpperCase();
  if (seen[key]) return;
  seen[key] = true;
  candidates.push(pathValue);
 }
 addCandidate(pngPath);
 addCandidate(deriveGraphicAiPathFromPngPath(pngPath));
 addCandidate(aiPath);
 for (var i = 0; i < candidates.length; i++) {
  var candidateFile = new File(candidates[i]);
  if (candidateFile.exists) return candidateFile;
 }
 return null;
}

function placeGraphicInDocument(doc, graphicPngPath, graphicAiPath) {
 try {
  var placeFile = resolveGraphicPlaceholderFile(graphicPngPath, graphicAiPath);
  if (!placeFile) {
   $.writeln(
    "Graphic file not found for [GRAPHIC] placement. PNG: " +
    graphicPngPath +
    " AI: " +
    graphicAiPath
   );
   return false;
  }

  var sizedArtLayer = null;
  for (var i = 0; i < doc.layers.length; i++) {
   if (doc.layers[i].name === "SIZED_ART") {
    sizedArtLayer = doc.layers[i];
    break;
   }
  }
  if (!sizedArtLayer) {
   $.writeln("SIZED_ART layer not found");
   return false;
  }

  // Match performSeparation.script: place PNG in each [GRAPHIC] path on SIZED_ART
  var graphicItems = [];
  if (sizedArtLayer.pathItems && sizedArtLayer.pathItems.length > 0) {
   for (var i = 0; i < sizedArtLayer.pathItems.length; i++) {
    var item = sizedArtLayer.pathItems[i];
    if (item.name === "[GRAPHIC]") {
     graphicItems.push(item);
    }
   }
  }
  if (graphicItems.length === 0) {
   return false;
  }

  for (var i = 0; i < graphicItems.length; i++) {
   var pathItem = graphicItems[i];
   var bounds = pathItem.geometricBounds;
   var placedItem = sizedArtLayer.placedItems.add();
   placedItem.file = placeFile;
   var boundsWidth = bounds[2] - bounds[0];
   var boundsHeight = bounds[1] - bounds[3];
   var originalWidth = placedItem.width;
   var originalHeight = placedItem.height;
   var imageAspectRatio = originalWidth / originalHeight;
   var boundsAspectRatio = boundsWidth / boundsHeight;
   var newWidth, newHeight;
   if (imageAspectRatio > boundsAspectRatio) {
    newWidth = boundsWidth;
    newHeight = boundsWidth / imageAspectRatio;
   } else {
    newHeight = boundsHeight;
    newWidth = boundsHeight * imageAspectRatio;
   }
   placedItem.width = newWidth;
   placedItem.height = newHeight;
   var centerX = bounds[0] + (boundsWidth / 2);
   var centerY = bounds[3] + (boundsHeight / 2);
   placedItem.left = centerX - (newWidth / 2);
   placedItem.top = centerY + (newHeight / 2);
   try {
    if (typeof placedItem.overprint !== "undefined") {
     placedItem.overprint = true;
    }
   } catch (opErr) { }

   // Embed the placed graphic so its spot colors become native document art. Left as a link
   // it keeps its own "PANTONE X C" spots inside the placed data, which resurface as
   // duplicate swatches after the formatted-ink merge (the merge cannot reach colors inside
   // a placed/linked item).
   try {
    placedItem.embed();
   } catch (embedErr) { }
  }

  return true;
 } catch (e) {
  $.writeln("Error placing graphic: " + e.message);
  return false;
 }
}

function cadPngFileExists(filePath) {
 try {
  return new File(filePath).exists;
 } catch (e) {
  return false;
 }
}

/** Find a PNG in folder (and one level of subfolders) whose name includes teamCode. */
function findTeamCadPngInFolder(folder, teamCode) {
 if (!folder || !folder.exists || !teamCode) return null;
 var teamLower = String(teamCode).trim().toLowerCase();
 if (!teamLower) return null;

 function scan(dir) {
  var entries = dir.getFiles();
  if (!entries || !entries.length) return null;
  for (var i = 0; i < entries.length; i++) {
   var entry = entries[i];
   if (entry instanceof Folder) continue;
   var name = String(entry.name || "").replace(/\.png$/i, "").toLowerCase();
   if (!/\.png$/i.test(String(entry.name || ""))) continue;
   if (name.indexOf(teamLower) !== -1) {
    return entry.fsName;
   }
  }
  for (var j = 0; j < entries.length; j++) {
   if (entries[j] instanceof Folder) {
    var nested = scan(entries[j]);
    if (nested) return nested;
   }
  }
  return null;
 }

 return scan(folder);
}

/**
 * Resolve CAD guide PNG: 03 CADS/SEPS/PNG first, then other 03 CADS paths, then 04 ASSETS PNG for team.
 */
function resolveCadPngPath(rootFolder, aiFolder, docName, league, teamCode, graphicName) {
 var cadPngFileName = docName + "_SEPS.png";
 var triedPaths = [];
 var pushTried = function (p) {
  if (p) triedPaths.push(p);
 };

 var cadsFolder = new Folder(rootFolder.fsName + "/03 CADS");
 var leagueCadsFolder = new Folder(cadsFolder.fsName + "/" + league);
 var cadsSepsPngPath = leagueCadsFolder.fsName + "/SEPS/PNG/" + cadPngFileName;
 pushTried(cadsSepsPngPath);
 if (cadPngFileExists(cadsSepsPngPath)) {
  return { path: cadsSepsPngPath, source: "03 CADS/SEPS/PNG", triedPaths: triedPaths };
 }

 var cadsArtPngFolder = new Folder(leagueCadsFolder.fsName + "/ART/PNG");
 if (cadsArtPngFolder.exists) {
  pushTried(cadsArtPngFolder.fsName);
  var artExact = cadsArtPngFolder.fsName + "/" + cadPngFileName;
  pushTried(artExact);
  if (cadPngFileExists(artExact)) {
   return { path: artExact, source: "03 CADS/ART/PNG", triedPaths: triedPaths };
  }
  var artTeamMatch = findTeamCadPngInFolder(cadsArtPngFolder, teamCode);
  if (artTeamMatch) {
   return { path: artTeamMatch, source: "03 CADS/ART/PNG (team)", triedPaths: triedPaths };
  }
 }

 var assetsFolderNames = ["04 ASSETS", "04 Assets"];
 var pngSearchFolders = [];

 for (var a = 0; a < assetsFolderNames.length; a++) {
  var assetsName = assetsFolderNames[a];
  var roots = [
   rootFolder.fsName + "/" + assetsName,
   aiFolder.fsName + "/" + docName + " ASSETS/" + assetsName
  ];
  for (var r = 0; r < roots.length; r++) {
   var pngFolder = new Folder(roots[r] + "/PNG");
   if (pngFolder.exists) {
    pngSearchFolders.push(pngFolder);
   }
  }
 }

 for (var f = 0; f < pngSearchFolders.length; f++) {
  var folder = pngSearchFolders[f];
  if (!folder || !folder.exists) continue;
  pushTried(folder.fsName);
  var exactInAssets = folder.fsName + "/" + cadPngFileName;
  pushTried(exactInAssets);
  if (cadPngFileExists(exactInAssets)) {
   return { path: exactInAssets, source: "04 ASSETS/PNG", triedPaths: triedPaths };
  }
  var teamMatch = findTeamCadPngInFolder(folder, teamCode);
  if (teamMatch) {
   pushTried(teamMatch);
   return { path: teamMatch, source: "04 ASSETS/PNG (team)", triedPaths: triedPaths };
  }
 }

 return { path: cadsSepsPngPath, source: "not_found", triedPaths: triedPaths };
}

function getGraphicFolderNamesToTry(graphicName, profileMetadata, jsonData) {
 var names = [];
 var pushUnique = function (n) {
  n = n != null ? String(n).trim() : "";
  if (!n) return;
  for (var i = 0; i < names.length; i++) {
   if (names[i] === n) return;
  }
  names.push(n);
 };
 pushUnique(graphicName);
 var graphicCode = "";
 if (profileMetadata && profileMetadata.batchVariableSource) {
  graphicCode =
   profileMetadata.batchVariableSource["Graphic_code"] ||
   profileMetadata.batchVariableSource["Graphic Code"] ||
   "";
 }
 if (!graphicCode && jsonData) {
  graphicCode =
   findValueInJSON(jsonData, "Graphic_code") ||
   findValueInJSON(jsonData, "Graphic Code") ||
   "";
 }
 pushUnique(graphicCode);
 return names;
}

function resolveGraphicAssetPaths(rootFolder, league, graphicName, docName, profileMetadata, jsonData) {
 var result = {
  aiFilePath: "",
  pngFilePath: "",
  graphicFolderUsed: "",
  tried: []
 };
 var graphicsFolder = new Folder(rootFolder.fsName + "/02 GRAPHICS");
 var leagueGraphicsFolder = new Folder(graphicsFolder.fsName + "/" + league);
 var folderNames = getGraphicFolderNamesToTry(graphicName, profileMetadata, jsonData);

 for (var fi = 0; fi < folderNames.length; fi++) {
  var folderName = folderNames[fi];
  var graphicTypeFolder = new Folder(leagueGraphicsFolder.fsName + "/" + folderName);
  if (!graphicTypeFolder.exists) continue;
  result.graphicFolderUsed = graphicTypeFolder.fsName;

  var aiFolder = new Folder(graphicTypeFolder.fsName + "/AI");
  if (aiFolder.exists) {
   var aiCandidates = [];
   aiCandidates.push(docName + "_GRAPHICS_" + folderName + ".ai");
   if (graphicName && graphicName !== folderName) {
    aiCandidates.push(docName + "_GRAPHICS_" + graphicName + ".ai");
   }
   aiCandidates.push(docName + ".ai");
   for (var ai = 0; ai < aiCandidates.length; ai++) {
    var aiPath = aiFolder.fsName + "/" + aiCandidates[ai];
    result.tried.push(aiPath);
    if (cadPngFileExists(aiPath)) {
     result.aiFilePath = aiPath;
     break;
    }
   }
   if (!result.aiFilePath) {
    var aiFiles = aiFolder.getFiles("*.ai");
    for (var af = 0; af < aiFiles.length; af++) {
     if (aiFiles[af].name.indexOf(docName) === 0) {
      result.aiFilePath = aiFiles[af].fsName;
      result.tried.push(result.aiFilePath);
      break;
     }
    }
   }
  }

  var pngFolder = new Folder(graphicTypeFolder.fsName + "/PNG");
  if (pngFolder.exists) {
   var pngCandidates = [];
   pngCandidates.push(docName + "_GRAPHICS_" + folderName + ".png");
   if (graphicName && graphicName !== folderName) {
    pngCandidates.push(docName + "_GRAPHICS_" + graphicName + ".png");
   }
   for (var pi = 0; pi < pngCandidates.length; pi++) {
    var pngPath = pngFolder.fsName + "/" + pngCandidates[pi];
    result.tried.push(pngPath);
    if (cadPngFileExists(pngPath)) {
     result.pngFilePath = pngPath;
     break;
    }
   }
  }

  if (result.aiFilePath) {
   break;
  }
 }

 return result;
}

function parseSplitColorsResult(splitResultRaw) {
 if (!splitResultRaw) return null;
 try {
  if (typeof splitResultRaw === "string") {
   var parsed = JSON.parse(splitResultRaw);
   if (parsed && parsed.success === false) {
    return parsed.error || "splitColors failed";
   }
  }
 } catch (e) { }
 return null;
}

function placeCadPngInDocument(doc, cadPngPath) {
 var dbg = {
  cadPngPath: cadPngPath || "",
  fileExists: false,
  cadsLayerFound: false,
  cadBoundCount: 0,
  placed: false,
  message: "",
  steps: []
 };
 try {
  var pngFile = new File(cadPngPath);
  dbg.fileExists = pngFile.exists;
  dbg.steps.push("Resolved CAD PNG path (see cadPngPath)");
  if (!pngFile.exists) {
   dbg.message = "CAD PNG file not found at cadPngPath";
   return dbg;
  }
  dbg.steps.push("File exists on disk");

  var cadsLayer = findLayerByName(doc.layers, "CADS");
  dbg.cadsLayerFound = cadsLayer !== null;
  if (!cadsLayer) {
   dbg.message = "CADS layer not found (searched whole document layer tree)";
   return dbg;
  }
  dbg.steps.push("Found CADS layer");

  var cadPathItems = [];
  function collectCadBounds(container, output) {
   if (!container || !output) return;
   try {
    if (container.pageItems && container.pageItems.length > 0) {
     for (var i = 0; i < container.pageItems.length; i++) {
      var pi = container.pageItems[i];
      var tn = pi.typename;
      if ((tn === "PathItem" || tn === "CompoundPathItem") && pi.name === "CAD") {
       output.push(pi);
      } else if (tn === "GroupItem") {
       collectCadBounds(pi, output);
      }
     }
    }
   } catch (e1) { }
   try {
    if (container.layers && container.layers.length > 0) {
     for (var l = 0; l < container.layers.length; l++) {
      collectCadBounds(container.layers[l], output);
     }
    }
   } catch (e2) { }
  }
  collectCadBounds(cadsLayer, cadPathItems);
  dbg.cadBoundCount = cadPathItems.length;
  if (cadPathItems.length === 0) {
   dbg.message = "No path/compound named CAD under CADS (check sublayers/groups)";
   return dbg;
  }
  dbg.steps.push("Found " + cadPathItems.length + " CAD bound(s)");

  for (var j = 0; j < cadPathItems.length; j++) {
   var pathItem = cadPathItems[j];
   var bounds = pathItem.geometricBounds;
   var placedItem = cadsLayer.placedItems.add();
   placedItem.file = pngFile;
   var boundsWidth = bounds[2] - bounds[0];
   var boundsHeight = bounds[1] - bounds[3];
   var originalWidth = placedItem.width;
   var originalHeight = placedItem.height;
   var imageAspectRatio = originalWidth / originalHeight;
   var boundsAspectRatio = boundsWidth / boundsHeight;
   var newWidth, newHeight;
   if (imageAspectRatio > boundsAspectRatio) {
    newWidth = boundsWidth;
    newHeight = boundsWidth / imageAspectRatio;
   } else {
    newHeight = boundsHeight;
    newWidth = boundsHeight * imageAspectRatio;
   }
   placedItem.width = newWidth;
   placedItem.height = newHeight;
   var centerX = bounds[0] + (boundsWidth / 2);
   var centerY = bounds[3] + (boundsHeight / 2);
   placedItem.left = centerX - (newWidth / 2);
   placedItem.top = centerY + (newHeight / 2);
   try {
    if (typeof placedItem.overprint !== "undefined") {
     placedItem.overprint = true;
    }
   } catch (opErr) { }
   try {
    placedItem.embed();
   } catch (embedErr) {
    dbg.steps.push("Embed warning: " + (embedErr.message || embedErr.toString()));
   }
  }

  dbg.placed = true;
  dbg.message = "CAD PNG placed and embedded";
  dbg.steps.push("Done");
  return dbg;
 } catch (e) {
  dbg.message = e.message || e.toString();
  dbg.steps.push("Error: " + dbg.message);
  return dbg;
 }
}

function getSeparatedArtLayerNames(doc) {
 var layerNames = [];
 try {
  var separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
  for (var i = 0; i < separatedArtLayer.layers.length; i++) {
   var subLayer = separatedArtLayer.layers[i];
   layerNames.push(subLayer.name);
  }
 } catch (e) { }
 return layerNames;
}

/** True when doc is a LEAP separation file (XMP DocumentType, or legacy path under 09 SEPARATIONS). */
function isActiveSeparationDocument(doc) {
 if (!doc) return false;
 try {
  var docPath = "";
  if (doc.fullName && doc.fullName.fsName) {
   docPath = doc.fullName.fsName;
  }
  if (docPath.indexOf("09 SEPARATIONS") !== -1) {
   return true;
  }
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
  if (xmp.isXmpCreated && xmp.doesStructFieldExist("DocumentType")) {
   var documentType = xmp.getStructField("DocumentType");
   if (documentType && documentType.toString().trim() === "Separation Document") {
    return true;
   }
  }
 } catch (e) { }
 return false;
}

/** Match ink exception Ink_Color (e.g. "123") to a SEPARATED_ART plate name (e.g. "PANTONE 123 C"). */
function inkExceptionNameMatchesLayerName(exceptionInk, layerName) {
 return inkExceptionNameMatchesName(exceptionInk, layerName);
}

/** True for ink plate second-hit layers like "PANTONE 123 C 2" (not White UB 2). */
function isInkSecondHitPlateLayerName(name) {
 var n = String(name || "");
 if (!/\s2$/i.test(n)) return false;
 if (isWhiteUbLayerName(n)) return false;
 if (n === CONSTANTS.LAYER_NAMES.CHOKE) return false;
 if (n === CONSTANTS.LAYER_NAMES.BLOCKER) return false;
 return true;
}

/** Resolve the document swatch name used by a plate layer's artwork. */
function resolveSourceSwatchNameForPlateLayer(sourceLayer) {
 if (!sourceLayer) return "";
 var fillColor = getFirstFillColorFromContainer(sourceLayer);
 if (fillColor) {
  var nameFromFill = getColorName(fillColor);
  if (nameFromFill && nameFromFill.indexOf(CONSTANTS.COLOR_PREFIXES.UNKNOWN) !== 0) {
   return nameFromFill;
  }
 }
 return String(sourceLayer.name);
}

/** Select all art on a layer and apply a swatch as fill (same pattern as finalizeUnderbaseLayer). */
function applySwatchToLayerSelection(doc, layer, swatchName) {
 if (!doc || !layer || !swatchName) return false;
 app.selection = null;
 unlockLayerContentsForSelection(layer);
 doc.activeLayer = layer;
 doc.activeLayer.hasSelectedArtwork = true;
 app.redraw();
 var applied = applySwatchToFill(doc, swatchName);
 app.selection = null;
 return applied;
}

/** Log the current pageItems count and swatch presence for each second-hit layer (debug). */
function auditSecondHitLayers(doc, appliedLayerNames, stageLabel) {
 try {
  if (!appliedLayerNames || !appliedLayerNames.length) return;
  var separatedArtLayer = null;
  try { separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART); } catch (e0) { return; }
  for (var i = 0; i < appliedLayerNames.length; i++) {
   var name = appliedLayerNames[i];
   var layer = getSeparatedArtSubLayerByNameCaseInsensitive(separatedArtLayer, name);
   var itemCount = -1;
   if (layer) {
    try { itemCount = layer.pageItems ? layer.pageItems.length : 0; } catch (e1) { itemCount = -1; }
   }
   var swatchExists = false;
   try { swatchExists = !!doc.swatches.getByName(name); } catch (e2) { swatchExists = false; }
   appendLeapSepLog(
    "2nd hit audit [" + stageLabel + "]: '" + name + "' layerExists=" + (!!layer) +
    ", pageItems=" + itemCount + ", swatchExists=" + swatchExists
   );
  }
 } catch (e) {
  appendLeapSepLog("2nd hit audit error [" + stageLabel + "]: " + (e.message || e));
 }
}

/** Recursively recolor the fill of all path items in a container to the given color. Returns count recolored. */
function setFillColorOnContainer(container, color) {
 if (!container || !color) return 0;
 var count = 0;
 try {
  if (container.typename === "PathItem") {
   if (container.filled) {
    container.fillColor = color;
    count++;
   }
   return count;
  }
  if (container.typename === "CompoundPathItem") {
   if (container.pathItems && container.pathItems.length > 0) {
    for (var p = 0; p < container.pathItems.length; p++) {
     if (container.pathItems[p].filled) {
      container.pathItems[p].fillColor = color;
      count++;
     }
    }
   }
   return count;
  }
  if (container.pageItems && container.pageItems.length > 0) {
   for (var i = 0; i < container.pageItems.length; i++) {
    count += setFillColorOnContainer(container.pageItems[i], color);
   }
  }
 } catch (e) {
  $.writeln("[SEPARATION] setFillColorOnContainer error: " + e.message);
  appendLeapSepLog("2nd hit recolor error: " + (e.message || e));
 }
 return count;
}

/** Duplicate a color plate layer for second hit (not UB stack placement). */
function duplicatePlateLayerForSecondHit(sourceLayerName) {
 try {
  if (!app.documents.length) return false;
  var doc = app.activeDocument;
  var separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
  var sourceLayer = getSeparatedArtSubLayerByNameCaseInsensitive(separatedArtLayer, sourceLayerName);
  if (!sourceLayer) {
   appendLeapSepLog("2nd hit: source layer not found for '" + sourceLayerName + "'");
   return false;
  }
  if (isInkSecondHitPlateLayerName(sourceLayer.name)) {
   appendLeapSepLog("2nd hit: refusing to duplicate from second-hit layer '" + sourceLayer.name + "'");
   return false;
  }
  var newLayerName = String(sourceLayer.name) + " 2";
  var newLayer = getSeparatedArtSubLayerByNameCaseInsensitive(separatedArtLayer, newLayerName);
  if (newLayer) {
   var existingCount = 0;
   try { existingCount = newLayer.pageItems ? newLayer.pageItems.length : 0; } catch (ecErr) { }
   if (existingCount > 0) {
    appendLeapSepLog("2nd hit: layer '" + newLayerName + "' already has " + existingCount + " item(s), skipping");
    return true;
   }
   appendLeapSepLog("2nd hit: repopulating empty existing layer '" + newLayerName + "'");
  } else {
   newLayer = separatedArtLayer.layers.add();
   newLayer.name = newLayerName;
   try {
    newLayer.move(sourceLayer, ElementPlacement.PLACEAFTER);
   } catch (moveErr) { }
  }
  sourceLayer.visible = true;
  sourceLayer.locked = false;
  newLayer.visible = true;
  newLayer.locked = false;
  var srcCount = 0;
  try { srcCount = sourceLayer.pageItems ? sourceLayer.pageItems.length : 0; } catch (scErr) { }
  appendLeapSepLog("2nd hit: '" + String(sourceLayer.name) + "' -> '" + newLayerName + "', source pageItems=" + srcCount);
  var dupCount = duplicateLayerItems(sourceLayer, newLayer);
  var newCount = 0;
  try { newCount = newLayer.pageItems ? newLayer.pageItems.length : 0; } catch (ncErr) { }
  appendLeapSepLog("2nd hit: duplicateLayerItems=" + dupCount + ", new layer pageItems=" + newCount);
  if (newCount < 1) {
   appendLeapSepLog("2nd hit: no art duplicated into '" + newLayerName + "'");
   return false;
  }
  // Create a dedicated spot swatch named like the new layer (e.g. "PANTONE 123 C 2"),
  // cloned from the source ink's swatch, and assign it to the duplicated geometry.
  try {
   var sourceSwatchName = resolveSourceSwatchNameForPlateLayer(sourceLayer);
   var srcSwatchExists = false;
   try { srcSwatchExists = !!getSwatchByName(doc, sourceSwatchName); } catch (srcSwErr) { srcSwatchExists = false; }
   var created = ensureSwatchExistsFromSource(sourceSwatchName, newLayerName);
   var newSwatch = getSwatchByName(doc, newLayerName);
   appendLeapSepLog(
    "2nd hit swatch: source '" + sourceSwatchName + "' exists=" + srcSwatchExists +
    ", ensureResult=" + created + ", newSwatchFound=" + (!!(newSwatch && newSwatch.color))
   );
   if (newSwatch && newSwatch.color) {
    var appliedFill = applySwatchToLayerSelection(doc, newLayer, newLayerName);
    var recolored = setFillColorOnContainer(newLayer, newSwatch.color);
    appendLeapSepLog(
     "2nd hit swatch: applySwatchToLayerSelection=" + appliedFill +
     ", setFillColorOnContainer=" + recolored + " for '" + newLayerName + "'"
    );
   } else {
    appendLeapSepLog("2nd hit swatch: could not resolve swatch '" + newLayerName + "' after create");
   }
  } catch (recolorErr) {
   $.writeln("[SEPARATION] second-hit swatch assign error: " + recolorErr.message);
   appendLeapSepLog("2nd hit swatch assign error: " + (recolorErr.message || recolorErr));
  }
  return true;
 } catch (e) {
  appendLeapSepLog("2nd hit: duplicatePlateLayerForSecondHit error: " + (e.message || e));
  return false;
 }
}

/** Max underbase passes required by ink exceptions for inks present on the separation doc. */
function getMaxInkExceptionUnderbaseCount(doc, profileCode) {
 var codeKey = profileCode ? String(profileCode).replace(/^\s+|\s+$/g, "").toUpperCase() : "";
 if (!codeKey) return 0;
 var allEntries = loadProfileInkExceptionsJson();
 if (!allEntries || !allEntries.length) return 0;
 var layerNames = doc ? getSeparatedArtLayerNames(doc) : [];
 var maxCount = 0;
 for (var i = 0; i < allEntries.length; i++) {
  var entry = allEntries[i];
  if (!entry || !inkProfileMatchesEntry(entry, codeKey)) continue;
  var row = inkJsonEntryToRow(entry, i);
  if (!row || !row.inkName) continue;
  if (doc && layerNames.length > 0) {
   var inkPresent = false;
   for (var L = 0; L < layerNames.length; L++) {
    if (inkExceptionNameMatchesLayerName(row.inkName, layerNames[L])) {
     inkPresent = true;
     break;
    }
   }
   if (!inkPresent) continue;
  }
  var count = row.underbaseCount != null ? parseInt(row.underbaseCount, 10) : 1;
  if (isNaN(count) || count < 1) count = 1;
  if (count > 4) count = 4;
  if (count > maxCount) maxCount = count;
 }
 return maxCount;
}

/** Number of UB passes enabled by the profile itself (its own underbaseEnabled flags). */
function getProfileGlobalUnderbaseCount(profileMetadata) {
 var enabled = profileMetadata && profileMetadata.underbaseEnabled instanceof Array
  ? profileMetadata.underbaseEnabled
  : null;
 if (!enabled) return 1;
 var count = 0;
 for (var i = 0; i < enabled.length && i < 4; i++) {
  if (enabled[i] === true) count = i + 1;
 }
 return count < 1 ? 1 : count;
}

/**
 * For inks present on the sep doc, return [{ layerName, count }] using each ink's
 * ink-exception underbase_count. Only inks needing more than one pass (count >= 2) are returned,
 * since the base pass (UB 1) is the global white underbase handled by generateUnderbase.
 */
function getInkExceptionUnderbaseLayerCounts(doc, profileCode) {
 var result = [];
 var codeKey = profileCode ? String(profileCode).replace(/^\s+|\s+$/g, "").toUpperCase() : "";
 if (!codeKey) return result;
 var allEntries = loadProfileInkExceptionsJson();
 if (!allEntries || !allEntries.length) return result;
 var layerNames = doc ? getSeparatedArtLayerNames(doc) : [];
 for (var i = 0; i < allEntries.length; i++) {
  var entry = allEntries[i];
  if (!entry || !inkProfileMatchesEntry(entry, codeKey)) continue;
  var row = inkJsonEntryToRow(entry, i);
  if (!row || !row.inkName) continue;
  var count = row.underbaseCount != null ? parseInt(row.underbaseCount, 10) : 1;
  if (isNaN(count) || count < 1) count = 1;
  if (count > 4) count = 4;
  if (count < 2) continue; // only inks needing extra passes contribute localized underbase
  for (var L = 0; L < layerNames.length; L++) {
   if (inkExceptionNameMatchesLayerName(row.inkName, layerNames[L])) {
    result.push({ layerName: layerNames[L], count: count });
   }
  }
 }
 return result;
}

/**
 * Per-ink localized underbase.
 *
 * UB 1 and any pass the PROFILE itself enables stay full whole-graphic white passes
 * (handled by generateUnderbase exactly as before — this function does NOT touch
 * underbaseEnabled). For passes BEYOND the profile's own UB count, we instead build
 * localized underbase layers from only the geometry of the inks whose ink-exception
 * underbase_count requires that pass. Example: profile = 1 pass, PANTONE 123 C has
 * underbase_count = 2 -> "White UB 2" is built from PANTONE 123 C's shapes only.
 * Every ink that needs pass N is merged into the same "White UB N" layer.
 *
 * Result is attached as profileMetadata.inkLocalizedUnderbase = [{ level, layers:[plateNames] }],
 * consumed by applyLocalizedInkUnderbaseLayers() during generateUnderbase.
 */
function mergeInkExceptionUnderbaseIntoProfileMetadata(profileMetadata, doc) {
 if (!profileMetadata) return profileMetadata;
 profileMetadata.inkLocalizedUnderbase = [];
 var profileCode = profileMetadata.profileCode;
 if (!profileCode) return profileMetadata;

 var inkCounts = getInkExceptionUnderbaseLayerCounts(doc, profileCode);
 if (!inkCounts.length) return profileMetadata;

 var globalCount = getProfileGlobalUnderbaseCount(profileMetadata);
 var localized = [];
 for (var level = globalCount + 1; level <= 4; level++) {
  var layersForLevel = [];
  var seen = {};
  for (var c = 0; c < inkCounts.length; c++) {
   if (inkCounts[c].count >= level) {
    var nm = inkCounts[c].layerName;
    var key = String(nm).toUpperCase();
    if (!seen[key]) {
     seen[key] = true;
     layersForLevel.push(nm);
    }
   }
  }
  if (layersForLevel.length) {
   localized.push({ level: level, layers: layersForLevel });
  }
 }
 profileMetadata.inkLocalizedUnderbase = localized;

 if (localized.length) {
  var summary = [];
  for (var s = 0; s < localized.length; s++) {
   summary.push("UB " + localized[s].level + " <- " + localized[s].layers.join(" + "));
  }
  appendLeapSepLog(
   "ink exception localized underbase (profile global = " + globalCount + "): " + summary.join("; ")
  );
 }
 return profileMetadata;
}

/** Create "… 2" plate layers for profile ink exceptions with hitsCount >= 2. */
function applyInkExceptionSecondHitLayers(doc, profileCode) {
 var applied = [];
 if (!doc || !profileCode) return { success: true, applied: applied };
 var codeKey = String(profileCode).replace(/^\s+|\s+$/g, "").toUpperCase();
 if (!codeKey) return { success: true, applied: applied };
 var allEntries = loadProfileInkExceptionsJson();
 if (!allEntries || !allEntries.length) return { success: true, applied: applied };
 var layerNames = getSeparatedArtLayerNames(doc);
 var prevDoc = null;
 try {
  prevDoc = app.activeDocument;
  app.activeDocument = doc;
 } catch (activateErr) { }
 for (var i = 0; i < allEntries.length; i++) {
  var entry = allEntries[i];
  if (!entry || !inkProfileMatchesEntry(entry, codeKey)) continue;
  var row = inkJsonEntryToRow(entry, i);
  if (!row || !row.inkName) continue;
  var hits = row.hitsCount != null ? parseInt(row.hitsCount, 10) : 1;
  if (isNaN(hits) || hits < 2) continue;
  var sourceLayer = null;
  for (var L = 0; L < layerNames.length; L++) {
   var candidateLayerName = layerNames[L];
   if (isInkSecondHitPlateLayerName(candidateLayerName)) continue;
   if (inkExceptionNameMatchesLayerName(row.inkName, candidateLayerName)) {
    sourceLayer = candidateLayerName;
    break;
   }
  }
  if (!sourceLayer) continue;
  if (duplicatePlateLayerForSecondHit(sourceLayer)) {
   applied.push(String(sourceLayer) + " 2");
  }
 }
 if (prevDoc) {
  try {
   app.activeDocument = prevDoc;
  } catch (restoreErr) { }
 }
 return { success: true, applied: applied };
}

function duplicateLayerContentsToNewLayer(sourceLayerName, newLayerName, shouldClearTarget) {
 try {
  if (!app.documents.length) {
   return false;
  }
  var doc = app.activeDocument;
  var separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
  var sourceLayer = null;
  for (var i = 0; i < separatedArtLayer.layers.length; i++) {
   if (separatedArtLayer.layers[i].name === sourceLayerName) {
    sourceLayer = separatedArtLayer.layers[i];
    break;
   }
  }
  if (!sourceLayer) {
   return false;
  }
  var newLayer = null;
  for (var j = 0; j < separatedArtLayer.layers.length; j++) {
   if (separatedArtLayer.layers[j].name === newLayerName) {
    newLayer = separatedArtLayer.layers[j];
    break;
   }
  }
  if (!newLayer) {
   newLayer = separatedArtLayer.layers.add();
   newLayer.name = newLayerName;
  }

  // Place generated UB layers between CHOKE and WHITE UB when possible.
  // Desired stack: CHOKE (above) -> WHITE UB 2/3/... -> WHITE UB.
  try {
   var chokeLayer = null;
   for (var m = 0; m < separatedArtLayer.layers.length; m++) {
    if (separatedArtLayer.layers[m].name === CONSTANTS.LAYER_NAMES.CHOKE) {
     chokeLayer = separatedArtLayer.layers[m];
     break;
    }
   }

   if (chokeLayer) {
    // Put new UB directly below CHOKE.
    newLayer.move(chokeLayer, ElementPlacement.PLACEAFTER);
   } else {
    // If CHOKE does not exist yet, keep UB variants above WHITE UB.
    newLayer.move(sourceLayer, ElementPlacement.PLACEBEFORE);
   }
  } catch (moveErr) { }
  if (shouldClearTarget !== false) {
   for (var k = newLayer.pageItems.length - 1; k >= 0; k--) {
    try {
     newLayer.pageItems[k].remove();
    } catch (clearErr) { }
   }
  }
  sourceLayer.visible = true;
  sourceLayer.locked = false;
  newLayer.visible = true;
  newLayer.locked = false;
  for (var p = sourceLayer.pageItems.length - 1; p >= 0; p--) {
   try {
    sourceLayer.pageItems[p].duplicate(newLayer, ElementPlacement.PLACEATBEGINNING);
   } catch (dupErr) { }
  }
  return true;
 } catch (e) {
  return false;
 }
}

function getSeparatedArtSubLayerByNameCaseInsensitive(separatedArtLayer, layerName) {
 if (!separatedArtLayer || !layerName) return null;
 var search = String(layerName).toUpperCase();
 for (var i = 0; i < separatedArtLayer.layers.length; i++) {
  var candidate = separatedArtLayer.layers[i];
  if (candidate && candidate.name && String(candidate.name).toUpperCase() === search) {
   return candidate;
  }
 }
 return null;
}

function parseBlackLayerNamesFromProfile(profileMetadata) {
 try {
  var raw = profileMetadata && profileMetadata.blackInksKnockoutDisplay != null
   ? String(profileMetadata.blackInksKnockoutDisplay)
   : "";
  if (!raw) return [];

  var tokens = raw.split(/[\r\n,;|]+/);
  var names = [];
  var seen = {};
  for (var i = 0; i < tokens.length; i++) {
   var name = tokens[i] ? String(tokens[i]).replace(/^\s+|\s+$/g, "") : "";
   if (!name) continue;
   var key = name.toUpperCase();
   if (seen[key]) continue;
   seen[key] = true;
   names.push(name);
  }
  return names;
 } catch (e) {
  return [];
 }
}

function duplicateLayerPageItemsToTarget(sourceLayer, targetLayer) {
 if (!sourceLayer || !targetLayer) return 0;
 var duplicatedCount = 0;
 sourceLayer.visible = true;
 sourceLayer.locked = false;
 targetLayer.visible = true;
 targetLayer.locked = false;

 for (var i = sourceLayer.pageItems.length - 1; i >= 0; i--) {
  try {
   sourceLayer.pageItems[i].duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
   duplicatedCount++;
  } catch (dupErr) { }
 }

 for (var j = 0; j < sourceLayer.layers.length; j++) {
  duplicatedCount += duplicateLayerPageItemsToTarget(sourceLayer.layers[j], targetLayer);
 }

 return duplicatedCount;
}

function copyBlackLayersToUnderbaseTargets(profileMetadata) {
 try {
  if (!app.documents.length) return;
  var doc = app.activeDocument;
  var separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
  var enabledFlags = profileMetadata && profileMetadata.underbaseEnabled instanceof Array
   ? profileMetadata.underbaseEnabled
   : null;
  var koFlags = profileMetadata && profileMetadata.underbaseKnockoutBlack instanceof Array
   ? profileMetadata.underbaseKnockoutBlack
   : null;
  if (!enabledFlags || !koFlags) {
   return;
  }

  var blackLayerNames = parseBlackLayerNamesFromProfile(profileMetadata);
  if (blackLayerNames.length === 0) {
   return;
  }

  var blackSourceLayers = [];
  for (var i = 0; i < blackLayerNames.length; i++) {
   var blackLayer = getSeparatedArtSubLayerByNameCaseInsensitive(separatedArtLayer, blackLayerNames[i]);
   if (blackLayer) {
    blackSourceLayers.push(blackLayer);
   }
  }
  if (blackSourceLayers.length === 0) {
   return;
  }

  var ubTargets = [
   CONSTANTS.LAYER_NAMES.WHITE_UB,
   CONSTANTS.LAYER_NAMES.WHITE_UB + " 2",
   CONSTANTS.LAYER_NAMES.WHITE_UB + " 3",
   CONSTANTS.LAYER_NAMES.WHITE_UB + " 4"
  ];

  for (var ubIndex = 0; ubIndex < ubTargets.length; ubIndex++) {
   if (enabledFlags[ubIndex] !== true || koFlags[ubIndex] !== true) {
    continue;
   }
   var targetLayer = getSeparatedArtSubLayerByNameCaseInsensitive(separatedArtLayer, ubTargets[ubIndex]);
   if (!targetLayer) {
    continue;
   }
   var copiedItems = 0;
   for (var srcIdx = 0; srcIdx < blackSourceLayers.length; srcIdx++) {
    copiedItems += duplicateLayerPageItemsToTarget(blackSourceLayers[srcIdx], targetLayer);
   }
  }
 } catch (e) {
 }
}

function ensureSwatchExistsFromSource(sourceSwatchName, newSwatchName, fallbackCmyk) {
 try {
  var doc = app.activeDocument;
  try {
   var existing = doc.swatches.getByName(newSwatchName);
   if (existing) {
    return true;
   }
  } catch (existingErr) { }

  var sourceSwatch = null;
  try {
   sourceSwatch = doc.swatches.getByName(sourceSwatchName);
  } catch (sourceErr) { }
  if (!sourceSwatch || !sourceSwatch.color) {
   if (fallbackCmyk) {
    var fallbackSpot = doc.spots.add();
    fallbackSpot.colorType = ColorModel.SPOT;
    fallbackSpot.name = newSwatchName;
    var fallbackColor = new CMYKColor();
    fallbackColor.cyan = Math.max(0, Math.min(100, Number(fallbackCmyk.c) || 0));
    fallbackColor.magenta = Math.max(0, Math.min(100, Number(fallbackCmyk.m) || 0));
    fallbackColor.yellow = Math.max(0, Math.min(100, Number(fallbackCmyk.y) || 0));
    fallbackColor.black = Math.max(0, Math.min(100, Number(fallbackCmyk.k) || 0));
    fallbackSpot.color = fallbackColor;
    return true;
   }
   return false;
  }

  var sourceColor = sourceSwatch.color;
  if (sourceColor.typename === "SpotColor" && sourceColor.spot) {
   var newSpot = doc.spots.add();
   newSpot.name = newSwatchName;
   try {
    newSpot.colorType = sourceColor.spot.colorType;
   } catch (ctErr) { }
   newSpot.color = sourceColor.spot.color;
   return true;
  }

  // Non-spot fallback.
  var newSwatch = doc.swatches.add();
  newSwatch.name = newSwatchName;
  newSwatch.color = sourceColor;
  return true;
 } catch (e) {
  return false;
 }
}

function isBlockerEnabled(profileMetadata) {
 try {
  var raw = profileMetadata ? profileMetadata.blocker : null;
  if (raw === true || raw === 1) return true;
  if (typeof raw === "string") {
   var normalized = raw.replace(/^\s+|\s+$/g, "").toUpperCase();
   return normalized === "Y" || normalized === "YES" || normalized === "TRUE" || normalized === "1";
  }
  return false;
 } catch (e) {
  return false;
 }
}

function enrichProfileMetadataWithUnderbase2(profileMetadata, doc) {
 return enrichProfileMetadataWithGraphicsUnderbaseSwatches(profileMetadata, doc);
}

function applyProfileUnderbaseLayers(profileMetadata) {
 try {
  var enabled = profileMetadata && profileMetadata.underbaseEnabled instanceof Array
   ? profileMetadata.underbaseEnabled
   : null;
  if (!enabled || enabled.length < 2) {
   return;
  }
  // Underbase 2+ is built by generateUnderbase as "White UB N" layers filled with the Graphics swatch.
  if (enabled[2] === true) {
   ensureSwatchExistsFromSource(CONSTANTS.LAYER_NAMES.WHITE_UB, CONSTANTS.LAYER_NAMES.WHITE_UB + " 3");
   duplicateLayerContentsToNewLayer(CONSTANTS.LAYER_NAMES.WHITE_UB, CONSTANTS.LAYER_NAMES.WHITE_UB + " 3");
  }
  if (enabled[3] === true) {
   ensureSwatchExistsFromSource(CONSTANTS.LAYER_NAMES.WHITE_UB, CONSTANTS.LAYER_NAMES.WHITE_UB + " 3");
   ensureSwatchExistsFromSource(CONSTANTS.LAYER_NAMES.WHITE_UB, CONSTANTS.LAYER_NAMES.WHITE_UB + " 4");
   duplicateLayerContentsToNewLayer(CONSTANTS.LAYER_NAMES.WHITE_UB, CONSTANTS.LAYER_NAMES.WHITE_UB + " 3");
   duplicateLayerContentsToNewLayer(CONSTANTS.LAYER_NAMES.WHITE_UB, CONSTANTS.LAYER_NAMES.WHITE_UB + " 4");
  }
  if (isBlockerEnabled(profileMetadata)) {
   ensureSwatchExistsFromSource(
    CONSTANTS.SWATCH_NAMES.WHITE_UB,
    CONSTANTS.SWATCH_NAMES.BLOCKER,
    { c: 0, m: 0, y: 0, k: 0 }
   );
   duplicateLayerContentsToNewLayer(CONSTANTS.LAYER_NAMES.WHITE_UB, CONSTANTS.LAYER_NAMES.BLOCKER);
  }
  // Temporarily disabled per request: do not copy Black layer items into White UB layers.
  // copyBlackLayersToUnderbaseTargets(profileMetadata);
 } catch (e) { }
}
/*
 * Resolve the separation file NAME from the Export Settings "Separation file path" pattern
 * (separationPreviewFilePath). Only the basename is used — the folder stays the standard
 * 09 SEPARATIONS/[League]/[Team]/[Graphic]/ structure. Tokens [Name] are filled from the team JSON
 * batch row (batch_excel_information / batch_excel_records) plus a few known fields (position,
 * profile). Returns "" if nothing usable resolves (caller then keeps the default name).
 */
function resolveSeparationFileNameFromPattern(pattern, jsonData, profileMetadata) {
 if (!pattern) return "";
 var meta = profileMetadata || {};

 var batch = {};
 try {
  if (jsonData && jsonData.batch_excel_information) {
   for (var k in jsonData.batch_excel_information) {
    if (jsonData.batch_excel_information.hasOwnProperty(k)) batch[k] = jsonData.batch_excel_information[k];
   }
  }
  if (jsonData && jsonData.batch_excel_records) {
   for (var k2 in jsonData.batch_excel_records) {
    if (jsonData.batch_excel_records.hasOwnProperty(k2) && batch[k2] == null) {
     var arr = jsonData.batch_excel_records[k2];
     if (arr && arr.length) batch[k2] = arr[0];
    }
   }
  }
 } catch (eBatch) { }

 var posAbbv = "";
 try {
  if (meta.position) posAbbv = getGraphicPositionAbbreviation(String(meta.position));
 } catch (ePos) { posAbbv = meta.position ? String(meta.position) : ""; }

 var extra = {
  "position": posAbbv,
  "pos": posAbbv,
  "profile code": meta.profileCode != null ? String(meta.profileCode) : "",
  "profile name": meta.profileName != null ? String(meta.profileName) : "",
  "graphic name": meta.graphicName != null ? String(meta.graphicName) : "",
  "art code": meta.graphicName != null ? String(meta.graphicName) : ""
 };

 function lookupSepToken(name) {
  var key = String(name).replace(/^\s+|\s+$/g, "");
  var lk = key.toLowerCase();
  if (extra.hasOwnProperty(lk)) return extra[lk];
  if (batch.hasOwnProperty(key)) return String(batch[key]);
  for (var bk in batch) {
   if (batch.hasOwnProperty(bk) && String(bk).toLowerCase() === lk) return String(batch[bk]);
  }
  return "";
 }

 var resolved = String(pattern).replace(/\[([^\]]+)\]/g, function (m, name) {
  return lookupSepToken(name);
 });

 /* Basename only. Avoid a forward slash inside a regex char class (ExtendScript parser bug):
    replace backslashes with "/" via string ops, then split on "/". */
 var normalized = resolved.split("\\").join("/");
 var segs = normalized.split("/");
 var base = segs[segs.length - 1];
 base = base.replace(/^\s+|\s+$/g, "");
 if (!base) return "";
 base = base.replace(/\.[^.]+$/, "");
 if (!base) return "";
 return base + ".ai";
}

function copyAndPrepareSEPDocument(templateFile, destinationFolder, docName, jsonData, styleCodes, profileMetadata, bodyColorFromXMP, separationFileName) {
 var profileCode = null;
 if (profileMetadata && profileMetadata.profileCode) {
  profileCode = profileMetadata.profileCode;
 }
 var filename;
 if (separationFileName && String(separationFileName).replace(/^\s+|\s+$/g, "") !== "") {
  /* Name from the Export Settings "Separation file path" pattern (basename). */
  filename = String(separationFileName).replace(/^\s+|\s+$/g, "");
 } else {
  filename = docName + "-SEP";
  if (profileCode) {
   filename += "-" + profileCode;
  }
  filename += ".ai";
 }
 var destinationFile = new File(destinationFolder.fsName + "/" + filename);
 templateFile.copy(destinationFile);
 if (!destinationFile.exists) {
  return null;
 }
 var sepDoc = app.open(destinationFile);
 updateVariablesInDocument(sepDoc, jsonData, styleCodes, profileMetadata);
 try {
  var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", sepDoc);
  if (sepXmp.isXmpCreated) {
   sepXmp.setStructField("DocumentType", "Separation Document", false, false);
   if (profileMetadata) {
    sepXmp.setStructField("SeparationProfileMetadata", profileMetadata, true, false);
   }
   try {
    var bodyNameForSwatch = "Body (Default)";
    var bodyC = 0, bodyM = 0, bodyY = 0, bodyK = 0;
    var bodyColorData = null;

    // Prefer body color from COLOR_CODE_LOOKUP.xlsx (first color code) passed in profileMetadata
    if (profileMetadata && profileMetadata.bodyColorData) {
     var fromLookup = profileMetadata.bodyColorData;
     bodyNameForSwatch = fromLookup.colorName || bodyNameForSwatch;
     if (fromLookup.cmyk) {
      bodyC = Number(fromLookup.cmyk.c) || 0;
      bodyM = Number(fromLookup.cmyk.m) || 0;
      bodyY = Number(fromLookup.cmyk.y) || 0;
      bodyK = Number(fromLookup.cmyk.k) || 0;
     }
     bodyColorData = {
      bodyColor: fromLookup.bodyColor || "#808080",
      colorName: bodyNameForSwatch,
      cmyk: fromLookup.cmyk ? { c: bodyC, m: bodyM, y: bodyY, k: bodyK } : null,
      rgb: fromLookup.rgb || null
     };
     sepXmp.setStructField("BodyColor", bodyColorData, true, false);
    } else if (bodyColorFromXMP && (bodyColorFromXMP.cmyk || bodyColorFromXMP.bodyColor)) {
     // Fallback: BodyColor from active document XMP
     bodyNameForSwatch = bodyColorFromXMP.colorName || "Body";
     if (bodyColorFromXMP.cmyk) {
      bodyC = Number(bodyColorFromXMP.cmyk.c) || 0;
      bodyM = Number(bodyColorFromXMP.cmyk.m) || 0;
      bodyY = Number(bodyColorFromXMP.cmyk.y) || 0;
      bodyK = Number(bodyColorFromXMP.cmyk.k) || 0;
     } else {
      bodyC = 0;
      bodyM = 0;
      bodyY = 0;
      bodyK = 50;
     }
     bodyColorData = {
      bodyColor: bodyColorFromXMP.bodyColor || "#808080",
      colorName: bodyNameForSwatch,
      cmyk: { c: bodyC, m: bodyM, y: bodyY, k: bodyK },
      rgb: bodyColorFromXMP.rgb || { r: 128, g: 128, b: 128 }
     };
     sepXmp.setStructField("BodyColor", bodyColorData, true, false);
    } else {
     // Default when no bodyColorData (lookup) and no BodyColor in XMP
     bodyC = 0;
     bodyM = 0;
     bodyY = 0;
     bodyK = 50;
     var defaultBodyColorData = {
      bodyColor: "#808080",
      colorName: bodyNameForSwatch,
      cmyk: null,
      rgb: { r: 128, g: 128, b: 128 }
     };
     sepXmp.setStructField("BodyColor", defaultBodyColorData, true, false);
    }
    // Update GARMENT swatch CMYK only (swatch name unchanged; $BODY no longer in template)
    try {
     var garmentSwatchName = getChokeStrokeSwatchNameForDocument(sepDoc);
     var garmentSwatch = sepDoc.swatches.getByName(garmentSwatchName);
     if (garmentSwatch && garmentSwatch.color && garmentSwatch.color.typename === "SpotColor" && garmentSwatch.color.spot) {
      var garmentSpot = garmentSwatch.color.spot;
      if (garmentSpot.color && garmentSpot.color.typename === "CMYKColor") {
       garmentSpot.color.cyan = Math.max(0, Math.min(100, bodyC));
       garmentSpot.color.magenta = Math.max(0, Math.min(100, bodyM));
       garmentSpot.color.yellow = Math.max(0, Math.min(100, bodyY));
       garmentSpot.color.black = Math.max(0, Math.min(100, bodyK));
      }
     }
    } catch (swatchErr) {
     $.writeln("[SEPARATION] Error updating GARMENT swatch CMYK: " + swatchErr.message);
    }
   } catch (bodyColorError) {
    $.writeln("[SEPARATION] Error extracting/storing body color: " + bodyColorError.message);
   }
   sepXmp.commit();
  }
 } catch (e) {
 }
 sepDoc.save();
 return sepDoc;
}
/** True when the profile asks for formatted ink-name labels. */
function isFormatInkNameLabelEnabled(profileMetadata) {
 return !!(profileMetadata && profileMetadata.formatInkNameLabel);
}

/**
 * Formatted display name for a Pantone ink using the profile format string, e.g.
 * resolveFormattedInkName("PANTONE 1235 C", "PANTONE ###") -> "PANTONE 1235".
 * Non-Pantone names pass through unchanged; a trailing hit number ("… 2") is kept.
 * Mirrors the panel's resolveColorDisplayName so both sides produce the same name.
 */
function resolveFormattedInkName(name, format) {
 var trimmed = String(name || "").replace(/^\s+|\s+$/g, "");
 if (!/^PANTONE\s/i.test(trimmed)) {
  return trimmed;
 }
 var pantoneBase = trimmed;
 var hitSuffix = "";
 var hitMatch = trimmed.match(/^(.+?)\s+(\d+)$/);
 if (hitMatch && String(hitMatch[2]).length === 1) {
  pantoneBase = String(hitMatch[1]).replace(/^\s+|\s+$/g, "");
  hitSuffix = " " + hitMatch[2];
 }
 var withoutPrefix = pantoneBase.replace(/^PANTONE\s+/i, "");
 var tokenMatch = withoutPrefix.match(/^(.*?)\s+[A-Z]{1,3}P?$/);
 var token = tokenMatch ? String(tokenMatch[1]).replace(/^\s+|\s+$/g, "") : withoutPrefix.replace(/^\s+|\s+$/g, "");
 var fmt = String(format || "").replace(/^\s+|\s+$/g, "");
 if (!fmt) {
  fmt = "PANTONE ### C";
 }
 return fmt.replace(/###/g, token) + hitSuffix;
}

/**
 * Rename every Pantone ink to its formatted name from the profile format string.
 * For each SEPARATED_ART sublayer it renames the matching swatch (which also renames the
 * linked spot, so the name persists on save) and the sublayer itself. Needs no Excel
 * data. No-op unless the profile enables formatInkNameLabel. Returns the count changed.
 */
function renameFormattedInks(doc, profileMetadata) {
 if (!doc || !isFormatInkNameLabelEnabled(profileMetadata)) {
  return 0;
 }
 var format = String(profileMetadata.colorNameLabelFormat || "").replace(/^\s+|\s+$/g, "");
 if (!format) {
  format = "PANTONE ### C";
 }

 var sep = null;
 try {
  sep = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
 } catch (eSep) { }
 if (!sep) {
  return 0;
 }

 var applied = 0;
 for (var i = 0; i < sep.layers.length; i++) {
  var layer = sep.layers[i];
  var from = String(layer.name || "").replace(/^\s+|\s+$/g, "");
  if (!/^PANTONE\s/i.test(from)) {
   continue;
  }
  var to = resolveFormattedInkName(from, format);
  if (to === from) {
   continue;
  }

  // Rename the swatch and its underlying spot (swatch.color.spot) to the formatted name.
  // Now that the placed graphic is embedded as native document art, renaming the one
  // document spot reassigns every use (plates + graphic), so no duplicate should remain.
  var swatch = getSwatchByName(doc, from);
  if (swatch && !getSwatchByName(doc, to)) {
   if (swatch.color && swatch.color.typename === "SpotColor" && swatch.color.spot) {
    try {
     swatch.color.spot.name = to;
    } catch (eSpotName) { }
   }
   swatch.name = to;
  }

  // Rename the SEPARATED_ART sublayer to match.
  layer.name = to;
  applied++;
 }
 return applied;
}

function handlePerformSeparation(params_string) {
 try {
  var params = JSON.parse(params_string);
  var graphicName = params.graphicName;
  var styleCodes = params.styleCodes || [];
  var profileMetadata = params.profileMetadata || null;
  var sepsTemplateFileName = params.sepsTemplateFileName || "SEP-GRID-TEMPLATE.ai";

  if (!graphicName) {
   return JSON.stringify({
    success: false,
    error: "Graphic name is required"
   });
  }
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }
  var activeDoc = app.activeDocument;

  // Pull the Graphics-page "Underbase 2 Swatch" choice from this (version) document's XMP into
  // profileMetadata so it carries into the separated document and drives the UB2+ plate color.
  try {
   if (profileMetadata) {
    profileMetadata = enrichProfileMetadataWithUnderbase2(profileMetadata, activeDoc);
   }
  } catch (ub2ReadErr) { }

  var docFile = new File(activeDoc.fullName);
  var docName = docFile.name.replace(/\.[^\.]+$/, '');
  var aiFolder = docFile.parent;
  var leagueFolder = aiFolder.parent;
  var teamOutsFolder = leagueFolder.parent;
  var rootFolder = teamOutsFolder.parent;
  var templateFile = getTemplateFile(sepsTemplateFileName);
  if (!templateFile) {
   var attemptedPath = getTemplateFile.lastAttemptedPath;
   if (attemptedPath) {
    return JSON.stringify({
     success: false,
     error: "Template file not found at: " + attemptedPath
    });
   }
   return JSON.stringify({
    success: false,
    error: "Template file not found. Please verify basePath in logobaseDataPathSettings.json."
   });
  }
  var jsonData = findAndReadJSONFile(docName, leagueFolder);
  if (!jsonData) {
   return JSON.stringify({
    success: false,
    error: "JSON file not found or invalid for document: " + docName
   });
  }
  var league = findValueInJSON(jsonData, "League");
  var teamCode = findValueInJSON(jsonData, "TeamCode");
  if (!league || !teamCode) {
   return JSON.stringify({
    success: false,
    error: "League or TeamCode not found in JSON file"
   });
  }
  var originalDoc = activeDoc;
  var originalDocFile = docFile;
  if (!profileMetadata) {
   profileMetadata = {};
  }
  var profileNameForVersion = profileMetadata.profileName != null
   ? String(profileMetadata.profileName)
   : "";
  var nextSeparationVersion = getNextSeparationVersion(activeDoc, graphicName, profileNameForVersion);
  profileMetadata.separationVersion = nextSeparationVersion;
  appendLeapSepLog(
   "Separation version for this run: " + formatSeparationVersionLabel(nextSeparationVersion)
  );
  // Try BodyColor from active document XMP first (match React getBodyColor)
  var bodyColorFromXMP = null;
  try {
   var origXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", originalDoc);
   if (origXmp.isXmpCreated && origXmp.doesStructFieldExist("BodyColor")) {
    bodyColorFromXMP = origXmp.getStructField("BodyColor", true);
   }
  } catch (e) { }
  var graphicNameFolder = createSeparationsFolders(rootFolder, league, teamCode, graphicName);
  /* Separation file NAME from the Export Settings "Separation file path" pattern (basename only);
     folder stays the 09 SEPARATIONS structure above. Falls back to the default name if unresolved. */
  var separationFileName = "";
  try {
   if (profileMetadata && profileMetadata.separationFileNamePattern) {
    separationFileName = resolveSeparationFileNameFromPattern(profileMetadata.separationFileNamePattern, jsonData, profileMetadata);
   }
  } catch (eSepName) { separationFileName = ""; }
  var sepDoc = copyAndPrepareSEPDocument(templateFile, graphicNameFolder, docName, jsonData, styleCodes, profileMetadata, bodyColorFromXMP, separationFileName);
  if (!sepDoc) {
   return JSON.stringify({
    success: false,
    error: "Failed to create SEP document"
   });
  }
  var sepDocFile = new File(sepDoc.fullName);
  var sepDocPath = sepDocFile.fsName;
  appendLeapSepLog(
   "handlePerformSeparation: graphic=" +
   graphicName +
   " league=" +
   league +
   " team=" +
   teamCode +
   " doc=" +
   docName
  );

  var graphicAssets = resolveGraphicAssetPaths(
   rootFolder,
   league,
   graphicName,
   docName,
   profileMetadata,
   jsonData
  );
  var aiFilePath = graphicAssets.aiFilePath;
  var pngFilePath = graphicAssets.pngFilePath;
  appendLeapSepLog(
   "graphicAssets: ai=" +
   (graphicAssets.aiFilePath ? "yes" : "no") +
   " png=" +
   (graphicAssets.pngFilePath ? "yes" : "no")
  );

  var cadPngResolved = resolveCadPngPath(
   rootFolder,
   docFile.parent,
   docName,
   league,
   teamCode,
   graphicName
  );
  var cadPngPath = cadPngResolved.path;
  var cadPlacementDebug = placeCadPngInDocument(sepDoc, cadPngPath);
  cadPlacementDebug.cadPngSource = cadPngResolved.source;
  cadPlacementDebug.cadPngTriedPaths = cadPngResolved.triedPaths;

  if (!aiFilePath) {
   try {
    unloadLEAPColorSepsActions();
   } catch (unloadErr0) { }
   var missingAiMsg =
    "Graphic AI not found for \"" +
    graphicName +
    "\". Checked 02 GRAPHICS/" +
    league +
    "/ (folders: " +
    getGraphicFolderNamesToTry(graphicName, profileMetadata, jsonData).join(", ") +
    ").";
   appendLeapSepLog(missingAiMsg + " tried=" + graphicAssets.tried.join(" | "));
   return JSON.stringify({
    success: false,
    error: missingAiMsg,
    graphicAssets: graphicAssets,
    cadPlacementDebug: cadPlacementDebug
   });
  }

  unlockSizedGraphicsContents(sepDoc);
  var pngPlaced = placeGraphicInDocument(sepDoc, pngFilePath, aiFilePath);
  var aiPlaced = placeAndEmbedGraphicAI(sepDoc, aiFilePath, graphicName);
  if (!aiPlaced) {
   try {
    unloadLEAPColorSepsActions();
   } catch (unloadErr1) { }
   appendLeapSepLog("placeAndEmbedGraphicAI failed: " + aiFilePath);
   return JSON.stringify({
    success: false,
    error: "Graphic AI could not be placed: " + aiFilePath,
    aiFilePath: aiFilePath,
    pngFilePath: pngFilePath,
    pngPlaced: pngPlaced,
    graphicAssets: graphicAssets,
    cadPlacementDebug: cadPlacementDebug
   });
  }

  sepDoc.save();
  loadLEAPColorSepsActions();
  var splitColorsError = parseSplitColorsResult(splitColors(graphicName));
  if (splitColorsError) {
   try {
    unloadLEAPColorSepsActions();
   } catch (unloadErr2) { }
   appendLeapSepLog("splitColors failed: " + splitColorsError);
   return JSON.stringify({
    success: false,
    error: splitColorsError,
    aiFilePath: aiFilePath,
    graphicName: graphicName,
    graphicAssets: graphicAssets,
    cadPlacementDebug: cadPlacementDebug
   });
  }
  var profileCodeForHits =
   profileMetadata && profileMetadata.profileCode
    ? String(profileMetadata.profileCode).replace(/^\s+|\s+$/g, "").toUpperCase()
    : "";
  var secondHitApplied = [];
  deleteNonFillStrokeItems();
  mergeInkExceptionUnderbaseIntoProfileMetadata(profileMetadata, sepDoc);
  generateUnderbase(graphicName, null, profileMetadata);
  if (profileCodeForHits) {
   try {
    app.activeDocument = sepDoc;
   } catch (activeSepErr) { }
   var secondHitResult = applyInkExceptionSecondHitLayers(sepDoc, profileCodeForHits);
   secondHitApplied = secondHitResult.applied || [];
   appendLeapSepLog(
    "ink exception 2nd hits: " +
    (secondHitApplied.length ? secondHitApplied.join(", ") : "none")
   );
  }
  auditSecondHitLayers(sepDoc, secondHitApplied, "after applyInkExceptionSecondHitLayers");
  setOverprintOnSeparatedArt(sepDoc, true);
  deleteSizedGraphicsSublayer(sepDoc);
  unloadLEAPColorSepsActions();

  // Apply formatted ink names (layer + swatch + spot) before collecting layer names,
  // so the saved SEP doc and the SeparatedLayerNames XMP already carry the final names.
  var formattedInkCount = renameFormattedInks(sepDoc, profileMetadata);
  if (formattedInkCount > 0) {
   appendLeapSepLog("formatted ink names applied: " + formattedInkCount);
  }

  // Re-record the underbase layer/swatch XMP AFTER the formatted-ink rename so recorded underbase
  // swatch names match the final plate names (e.g. "PANTONE White C" -> "PANTONE White").
  try { recordUnderbaseLayersToXmp(sepDoc, profileMetadata); } catch (ubRecErr) { }

  var layerNames = [];
  try {
   layerNames = getSeparatedArtLayerNames(sepDoc);
   layerNames = filterPlateLayerNamesForUi(layerNames, profileMetadata);
   if (layerNames.length > 0) {
    var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", sepDoc);
    if (sepXmp.isXmpCreated) {
     sepXmp.setStructField("SeparatedLayerNames", layerNames, true, false);
     // Force UI to rebuild rows from live layer list (includes ink "… 2" second hits).
     sepXmp.setStructField("LEAPSeparationColorsData", [], true, false);
     sepXmp.commit();
     sepDoc.save();
    }
   }
  } catch (e) {
   appendLeapSepLog("SeparatedLayerNames XMP error: " + (e.message || e));
  }

  if (!layerNames || layerNames.length === 0) {
   appendLeapSepLog("No plates under SEPARATED_ART after splitColors");
   return JSON.stringify({
    success: false,
    error:
     "Separation plates were not created. Verify graphic colors and SEP_ART placement.",
    aiFilePath: aiFilePath,
    graphicName: graphicName,
    layerNames: layerNames,
    graphicAssets: graphicAssets,
    cadPlacementDebug: cadPlacementDebug
   });
  }

  appendLeapSepLog("Separation OK, plates: " + layerNames.join(", "));

  var inkColorCount = countPgInkColorsFromLayerNames(layerNames);
  if (profileMetadata) {
   profileMetadata.separationColorCount = inkColorCount;
  }
  try {
   var sepXmpMeta = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", sepDoc);
   if (sepXmpMeta.isXmpCreated && profileMetadata) {
    sepXmpMeta.setStructField("SeparationProfileMetadata", profileMetadata, true, false);
    sepXmpMeta.commit();
   }
  } catch (metaErr) {
   appendLeapSepLog("SeparationProfileMetadata C# update error: " + (metaErr.message || metaErr));
  }

  try {
   /* [V#] is written only at export (alongside the control number), not auto-filled at separation. */
   updateSeparationPageVariables(sepDoc, inkColorCount, null);
   sepDoc.save();
  } catch (cvErr) {
   appendLeapSepLog("C#/V# page variable update error: " + (cvErr.message || cvErr));
  }

  var savePathsDebug = [];
  try {
   $.sleep(100);
   var foundOriginalDoc = null;
   if (app.documents.length > 0) {
    for (var d = 0; d < app.documents.length; d++) {
     var doc = app.documents[d];
     if (doc.fullName && doc.fullName.fsName === originalDocFile.fsName) {
      foundOriginalDoc = doc;
      break;
     }
    }
    if (foundOriginalDoc) {
     savePathsDebug.push("Found original document: " + foundOriginalDoc.fullName.fsName);
     app.activeDocument = foundOriginalDoc;
     var origXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", foundOriginalDoc);
     if (origXmp.isXmpCreated) {
      savePathsDebug.push("XMP created successfully");
      var separations = [];
      if (origXmp.doesStructFieldExist("LEAPSeparationProfileData")) {
       try {
        var existingSeparations = origXmp.getStructField("LEAPSeparationProfileData", true);
        if (Array.isArray(existingSeparations)) {
         separations = existingSeparations;
         savePathsDebug.push("Found existing separations: " + separations.length);
        }
       } catch (e) {
        savePathsDebug.push("Error loading existing separations: " + e.message);
        separations = [];
       }
      } else {
       savePathsDebug.push("No existing LEAPSeparationProfileData field");
      }
      var existingIndex = -1;
      var currentProfileName = profileMetadata && profileMetadata.profileName ? profileMetadata.profileName : null;
      savePathsDebug.push("Current graphic: " + graphicName + ", profile: " + (currentProfileName || "none"));
      for (var i = 0; i < separations.length; i++) {
       var existingSeparation = separations[i];
       var existingGraphicName = existingSeparation.graphicName;
       var existingProfileName = existingSeparation.profileMetadata && existingSeparation.profileMetadata.profileName ? existingSeparation.profileMetadata.profileName : null;
       if (existingGraphicName === graphicName) {
        if (currentProfileName && existingProfileName) {
         if (existingProfileName === currentProfileName) {
          existingIndex = i;
          savePathsDebug.push("Found existing entry at index: " + i);
          break;
         }
        } else if (!currentProfileName && !existingProfileName) {
         existingIndex = i;
         savePathsDebug.push("Found existing entry at index: " + i);
         break;
        }
       }
      }
      var separationEntry = {
       graphicName: graphicName,
       profileMetadata: profileMetadata || null,
       separatedDocumentPath: sepDocPath,
       separationVersion: profileMetadata && profileMetadata.separationVersion != null
        ? profileMetadata.separationVersion
        : nextSeparationVersion
      };
      savePathsDebug.push("Saving separation entry - graphic: " + graphicName + ", path: " + sepDocPath);
      if (existingIndex >= 0) {
       separations[existingIndex] = separationEntry;
       savePathsDebug.push("Updated existing entry at index: " + existingIndex);
      } else {
       separations.push(separationEntry);
       savePathsDebug.push("Added new entry. Total separations: " + separations.length);
      }
      try {
       origXmp.setStructField("LEAPSeparationProfileData", separations, true, false);
       savePathsDebug.push("Set struct field successful");
       origXmp.commit();
       savePathsDebug.push("XMP commit successful");
       if (foundOriginalDoc.fullName && foundOriginalDoc.fullName.fsName) {
        try {
         foundOriginalDoc.save();
         savePathsDebug.push("Document save successful");
        } catch (saveError) {
         savePathsDebug.push("Document save error: " + saveError.message);
        }
       }
      } catch (xmpError) {
       savePathsDebug.push("XMP save error: " + xmpError.message);
      }
     } else {
      savePathsDebug.push("XMP not created for original document");
     }
    } else {
     savePathsDebug.push("Original document not found in open documents");
    }
   }
  } catch (e) {
   savePathsDebug.push("Error saving separation path: " + e.message);
  }

  try {
   app.activeDocument = sepDoc;
  } catch (e) {
  }

  var response = {
   success: true,
   message: "Separation performed successfully for graphic: " + graphicName,
   layerNames: layerNames,
   aiFilePath: aiFilePath,
   separatedDocumentPath: sepDocPath
  };
  if (savePathsDebug && savePathsDebug.length > 0) {
   response.savePathsDebug = savePathsDebug;
  }
  return JSON.stringify(response);
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

function handleRecreatePlatesInActiveDocument(params_string) {
 try {
  var params = JSON.parse(params_string);

  var graphicName = params.graphicName;
  if (!graphicName) {
   return JSON.stringify({
    success: false,
    error: "Graphic name is required"
   });
  }
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }
  var doc = app.activeDocument;
  unlockSizedGraphicsContents(doc);
  loadLEAPColorSepsActions();
  var profileMetadata = params.profileMetadata || null;
  if (!profileMetadata) {
   try {
    var xmpRec = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
    if (xmpRec.isXmpCreated && xmpRec.doesStructFieldExist("SeparationProfileMetadata")) {
     profileMetadata = xmpRec.getStructField("SeparationProfileMetadata", true);
    }
   } catch (eMeta) { }
  }
  profileMetadata = enrichProfileMetadataWithUnderbase2(profileMetadata, doc);
  var hasCleanupParams = params.hasOwnProperty("deleteUnpaintedPaths") || params.hasOwnProperty("deleteLeftoverPaths");
  var cleanupOpts = null;
  if (hasCleanupParams) {
   cleanupOpts = {
    deleteUnpaintedPaths: params.deleteUnpaintedPaths === true,
    deleteLeftoverPaths: params.deleteLeftoverPaths === true
   };
  }
  splitColors(graphicName, cleanupOpts);
  var profileCodeRecreate = "";
  if (profileMetadata && profileMetadata.profileCode) {
   profileCodeRecreate = String(profileMetadata.profileCode).replace(/^\s+|\s+$/g, "").toUpperCase();
  }
  var secondHitRecreateApplied = [];
  if (cleanupOpts == null || cleanupOpts.deleteUnpaintedPaths) {
   deleteNonFillStrokeItems();
  }
  mergeInkExceptionUnderbaseIntoProfileMetadata(profileMetadata, doc);
  generateUnderbase(graphicName, cleanupOpts, profileMetadata);
  if (profileCodeRecreate) {
   var secondHitRecreate = applyInkExceptionSecondHitLayers(doc, profileCodeRecreate);
   secondHitRecreateApplied = secondHitRecreate.applied || [];
   appendLeapSepLog(
    "recreate ink exception 2nd hits: " +
    (secondHitRecreateApplied.length ? secondHitRecreateApplied.join(", ") : "none")
   );
  }
  auditSecondHitLayers(doc, secondHitRecreateApplied, "recreate: after applyInkExceptionSecondHitLayers");
  setOverprintOnSeparatedArt(doc, true);
  hideSizedGraphicsSublayer(doc);
  unloadLEAPColorSepsActions();

  // Apply formatted ink names (layer + swatch + spot) before collecting layer names.
  var formattedInkCountRecreate = renameFormattedInks(doc, profileMetadata);
  if (formattedInkCountRecreate > 0) {
   appendLeapSepLog("recreate formatted ink names applied: " + formattedInkCountRecreate);
  }

  var layerNames = [];
  try {
   layerNames = getSeparatedArtLayerNames(doc);
   layerNames = filterPlateLayerNamesForUi(layerNames, profileMetadata);
   if (layerNames.length > 0) {
    var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
    if (sepXmp.isXmpCreated) {
     sepXmp.setStructField("SeparatedLayerNames", layerNames, true, false);
     sepXmp.setStructField("LEAPSeparationColorsData", [], true, false);
     sepXmp.commit();
    }
   }
  } catch (e) {
  }

  try {
   if (!profileMetadata) {
    profileMetadata = {};
   }
   var inkColorCountRecreate = countPgInkColorsFromLayerNames(layerNames);
   profileMetadata.separationColorCount = inkColorCountRecreate;
   var profileNameRecreate = profileMetadata.profileName != null
    ? String(profileMetadata.profileName)
    : "";
   var versionDocRecreate = findOpenVersionDocument();
   if (versionDocRecreate) {
    var bumpedVersion = bumpSeparationVersionOnVersionDoc(
     versionDocRecreate,
     graphicName,
     profileNameRecreate
    );
    profileMetadata.separationVersion = bumpedVersion;
    appendLeapSepLog(
     "Recreate bumped separation version: " + formatSeparationVersionLabel(bumpedVersion)
    );
   }
   try {
    var xmpRecreate = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
    if (xmpRecreate.isXmpCreated) {
     xmpRecreate.setStructField("SeparationProfileMetadata", profileMetadata, true, false);
     xmpRecreate.commit();
    }
   } catch (xmpRecErr) { }
   /* [V#] is written only at export (alongside the control number), not auto-filled on recreate. */
   updateSeparationPageVariables(
    doc,
    inkColorCountRecreate,
    null
   );
   try {
    doc.save();
   } catch (saveRecErr) { }
  } catch (versionBumpErr) {
   appendLeapSepLog("Recreate version bump error: " + (versionBumpErr.message || versionBumpErr));
  }

  return JSON.stringify({
   success: true,
   message: "Plates recreated successfully for graphic: " + graphicName
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

/**
 * Regenerate choke and underbase layers from existing SEPARATED_ART ink plates.
 * Ink color plates are kept; only choke / White UB stack layers are removed and rebuilt.
 */
function handleRegenerateUnderbaseFromExistingInks(params_string) {
 try {
  var params = params_string ? JSON.parse(params_string) : {};
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }
  var doc = app.activeDocument;
  if (!isActiveSeparationDocument(doc)) {
   return JSON.stringify({
    success: false,
    error: "Active document is not a separation document."
   });
  }
  try {
   doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
  } catch (sepErr) {
   return JSON.stringify({
    success: false,
    error: "SEPARATED_ART layer not found"
   });
  }

  loadLEAPColorSepsActions();
  var profileMetadata = params.profileMetadata || null;
  if (!profileMetadata) {
   try {
    var xmpUb = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
    if (xmpUb.isXmpCreated && xmpUb.doesStructFieldExist("SeparationProfileMetadata")) {
     profileMetadata = xmpUb.getStructField("SeparationProfileMetadata", true);
    }
   } catch (eMeta) { }
  }
  profileMetadata = enrichProfileMetadataWithUnderbase2(profileMetadata, doc);

  var hasCleanupParams = params.hasOwnProperty("deleteUnpaintedPaths") || params.hasOwnProperty("deleteLeftoverPaths");
  var cleanupOpts = null;
  if (hasCleanupParams) {
   cleanupOpts = {
    deleteUnpaintedPaths: params.deleteUnpaintedPaths === true,
    deleteLeftoverPaths: params.deleteLeftoverPaths === true
   };
  }

  mergeInkExceptionUnderbaseIntoProfileMetadata(profileMetadata, doc);
  appendLeapSepLog("regenerate underbase from existing inks: start");
  var ubResult = generateUnderbase(null, cleanupOpts, profileMetadata, { fromExistingInks: true });
  if (ubResult) {
   try { unloadLEAPColorSepsActions(); } catch (unloadUbErr) { }
   var parsedUbErr = null;
   try { parsedUbErr = JSON.parse(ubResult); } catch (parseUbErr) { }
   return JSON.stringify({
    success: false,
    error: (parsedUbErr && parsedUbErr.error) ? parsedUbErr.error : ubResult
   });
  }

  setOverprintOnSeparatedArt(doc, true);
  unloadLEAPColorSepsActions();

  try {
   var layerNames = getSeparatedArtLayerNames(doc);
   layerNames = filterPlateLayerNamesForUi(layerNames, profileMetadata);
   if (layerNames.length > 0) {
    var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
    if (sepXmp.isXmpCreated) {
     sepXmp.setStructField("SeparatedLayerNames", layerNames, true, false);
     sepXmp.commit();
    }
   }
  } catch (xmpSynErr) {
   appendLeapSepLog("regenerate underbase SeparatedLayerNames sync error: " + (xmpSynErr.message || xmpSynErr));
  }

  try {
   doc.save();
  } catch (saveUbErr) { }

  appendLeapSepLog("regenerate underbase from existing inks: complete");
  return JSON.stringify({
   success: true,
   message: "Underbase and choke regenerated from existing ink plates"
  });
 } catch (e) {
  try { unloadLEAPColorSepsActions(); } catch (unloadErr) { }
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleGetGraphicsList(params_string) {
 try {
  var graphicsList = getGraphicList();
  return JSON.stringify({
   success: true,
   graphics: graphicsList
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

function handleGetGraphicsArtWhiteSwatches(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found",
    swatches: []
   });
  }
  var params = {};
  try {
   params = params_string ? JSON.parse(params_string) : {};
  } catch (parseErr) {
   params = {};
  }
  var graphicName = params && params.graphicName != null
   ? String(params.graphicName).replace(/^\s+|\s+$/g, "")
   : "";
  var swatches = getWhiteSpotNamesFromGraphicsArt(
   app.activeDocument,
   graphicName || undefined
  );
  return JSON.stringify({
   success: true,
   swatches: swatches
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString(),
   swatches: []
  });
 }
}

function handleToggleLayerVisibility(params_string) {
 try {
  var params = JSON.parse(params_string);
  var layerName = params.layerName;

  if (!layerName) {
   return JSON.stringify({
    success: false,
    error: "Layer name is required"
   });
  }

  // Check if there's an active document
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }

  var doc = app.activeDocument;

  // Search for layer recursively (including sublayers)
  var layer = findLayerByName(doc.layers, layerName);

  if (!layer) {
   // Layer doesn't exist - this is not an error, just return success with no action
   return JSON.stringify({
    success: true,
    layerFound: false,
    message: "Layer not found: " + layerName
   });
  }

  // Toggle visibility
  layer.visible = !layer.visible;
  var newVisibility = layer.visible;

  return JSON.stringify({
   success: true,
   layerFound: true,
   visible: newVisibility,
   message: "Layer visibility toggled: " + layerName
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

/*********************************************************
 * Ink visibility helpers for SEPARATED_ART layer
 *********************************************************/
function getSeparatedArtLayer(doc) {
 try {
  return doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
 } catch (e) {
  return null;
 }
}

function getSeparatedArtVisibilityState(separatedArtLayer) {
 var total = separatedArtLayer.layers.length;
 var visibleCount = 0;

 for (var i = 0; i < separatedArtLayer.layers.length; i++) {
  if (separatedArtLayer.layers[i].visible) {
   visibleCount++;
  }
 }

 var mode = "other";
 if (total === 0) {
  mode = "empty";
 } else if (visibleCount === 0) {
  mode = "noneVisible";
 } else if (visibleCount === total) {
  mode = "allVisible";
 } else if (visibleCount === 1) {
  mode = "singleVisible";
 }

 return {
  total: total,
  visibleCount: visibleCount,
  mode: mode
 };
}

/** Normalized (trim + upper) name for case-insensitive comparison. */
function normVisibilityName(n) {
 return String(n == null ? "" : n).replace(/^\s+|\s+$/g, "").toUpperCase();
}

/**
 * Group key for a SEPARATED_ART sublayer = the SPOT swatch its art is actually filled with, so
 * layers that share a swatch resolve to the same key (e.g. the "PANTONE White" plate layer and
 * the "White UB 2" underbase layer, both filled with the PANTONE White spot). Falls back to the
 * layer's own name when no spot fill can be read (e.g. an empty layer), so name matches still work.
 * This is Option A: visibility is grouped by what the art is actually painted with — no tracking,
 * no XMP, no hardcoding, so it stays correct after merges/renames.
 */
function getSublayerFillSwatchKey(doc, subLayer) {
 try {
  var color = getFirstFillColorFromSeparatedArtSublayer(doc, subLayer.name);
  if (color && color.typename === "SpotColor" && color.spot && color.spot.name) {
   return normVisibilityName(color.spot.name);
  }
 } catch (e) {}
 return normVisibilityName(subLayer.name);
}

/*********************************************************
 * Toggle ink visibility according to SEPARATED_ART rules
 *
 * Expected params: { inkName: "PANTONE 123 C" }
 * States:
 *  - If all sublayers visible  -> hide all, show only clicked ink
 *  - If only one visible       -> show all
 * Returns: { success: true, mode: "allVisible" | "singleVisible" | "other" }
 *********************************************************/
function handleToggleInkVisibility(params_string) {
 try {
  var params = JSON.parse(params_string);
  var inkName = params.inkName;

  if (!inkName) {
   return JSON.stringify({
    success: false,
    error: "Ink name is required"
   });
  }

  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }

  var doc = app.activeDocument;

  hideSizedGraphicsSublayer(doc);

  var separatedArtLayer = getSeparatedArtLayer(doc);

  // Fallback to generic toggle if SEPARATED_ART layer is missing
  if (!separatedArtLayer) {
   var genericLayer = findLayerByName(doc.layers, inkName);
   if (!genericLayer) {
    return JSON.stringify({
     success: true,
     layerFound: false,
     mode: "other",
     message: "Layer not found: " + inkName
    });
   }

   genericLayer.visible = !genericLayer.visible;
   return JSON.stringify({
    success: true,
    layerFound: true,
    mode: "other",
    visible: genericLayer.visible
   });
  }

  var subs = separatedArtLayer.layers;
  var total = subs.length;
  var targetKey = normVisibilityName(inkName);

  // Build the target GROUP: every sublayer whose fill swatch (or name) matches the clicked
  // swatch. A swatch can back multiple layers (e.g. "PANTONE White" fills both the
  // "PANTONE White" plate and the "White UB 2" underbase), and the eye must act on all of them.
  var targetLayers = [];
  var visibleCount = 0;
  var visibleGroupKeys = {};
  for (var i = 0; i < total; i++) {
   var sl = subs[i];
   var key = getSublayerFillSwatchKey(doc, sl);
   if (key === targetKey) { targetLayers.push(sl); }
   if (sl.visible) {
    visibleCount++;
    visibleGroupKeys[key] = true;
   }
  }

  if (!targetLayers.length) {
   return JSON.stringify({
    success: true,
    layerFound: false,
    mode: "other",
    message: "No SEPARATED_ART layer uses swatch: " + inkName
   });
  }

  function setAllVisibility(vis) {
   for (var a = 0; a < total; a++) { subs[a].visible = vis; }
  }
  function soloTargetGroup() {
   setAllVisibility(false);
   for (var t = 0; t < targetLayers.length; t++) { targetLayers[t].visible = true; }
  }

  var allVisible = (total > 0 && visibleCount === total);

  // Distinct group keys among currently-visible layers: tells "one plate soloed" from "mixed".
  var distinctVisible = 0, singleVisibleKey = "";
  for (var vk in visibleGroupKeys) {
   if (visibleGroupKeys.hasOwnProperty(vk)) { distinctVisible++; singleVisibleKey = vk; }
  }
  var oneGroupVisible = (distinctVisible === 1);

  if (allVisible) {
   // All visible -> solo the clicked group.
   soloTargetGroup();
   app.redraw();
   return JSON.stringify({ success: true, layerFound: true, mode: "singleVisible", activeInk: inkName });
  } else if (oneGroupVisible && singleVisibleKey === targetKey) {
   // The clicked group is the one currently soloed -> show all (toggle off).
   setAllVisibility(true);
   app.redraw();
   return JSON.stringify({ success: true, layerFound: true, mode: "allVisible" });
  } else if (oneGroupVisible && singleVisibleKey !== targetKey) {
   // A different single group is soloed -> switch solo to the clicked group.
   soloTargetGroup();
   app.redraw();
   return JSON.stringify({ success: true, layerFound: true, mode: "singleVisible", activeInk: inkName });
  } else {
   // Genuinely mixed state -> default to Show All (matches previous behavior).
   setAllVisibility(true);
   app.redraw();
   return JSON.stringify({ success: true, layerFound: true, mode: "allVisible" });
  }
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

/*********************************************************
 * Reset ink visibility from header eye icon
 *
 * - If all sublayers are already visible -> do nothing
 * - If only one (or some) visible       -> show all sublayers
 * Returns: { success: true, mode: "allVisible" | "allVisibleNoOp" | "other" }
 *********************************************************/
function handleResetInkVisibility(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }

  var doc = app.activeDocument;
  var separatedArtLayer = getSeparatedArtLayer(doc);

  if (!separatedArtLayer) {
   return JSON.stringify({
    success: true,
    mode: "other",
    message: "SEPARATED_ART layer not found - no changes made"
   });
  }

  var state = getSeparatedArtVisibilityState(separatedArtLayer);

  if (state.mode === "allVisible") {
   // Toggle to Hide All

   hideSizedGraphicsSublayer(doc);

   for (var i = 0; i < separatedArtLayer.layers.length; i++) {
    separatedArtLayer.layers[i].visible = false;
   }

   app.redraw();
   return JSON.stringify({
    success: true,
    mode: "noneVisible"
   });
  } else {
   // Toggle to Show All
   for (var i = 0; i < separatedArtLayer.layers.length; i++) {
    separatedArtLayer.layers[i].visible = true;
   }

   app.redraw();
   return JSON.stringify({
    success: true,
    mode: "allVisible"
   });
  }
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

/*********************************************************
 * Reorder SEPARATED_ART sublayers to match panel ink order
 *
 * Params: { orderedNames: [...] } — table top first (Illustrator sublayer index 0 = top of Layers panel).
 * - Choke, Blocker, and White UB / UB variants stay at the bottom of SEPARATED_ART (not driven by table order).
 * - Table labels may differ from sublayer names (e.g. formal "LS 186 C" vs layer "PANTONE 186 C"); we resolve by
 *   case-insensitive match, stripping trailing "(...)", substring, then shared digit codes among non-tail layers.
 *********************************************************/
function handleReorderSeparatedArtLayers(params_string) {
 try {
  var params = JSON.parse(params_string);
  var orderedNames = params.orderedNames;

  if (!orderedNames || !Array.isArray(orderedNames) || orderedNames.length === 0) {
   return JSON.stringify({
    success: false,
    error: "orderedNames (non-empty array) is required"
   });
  }

  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }

  var doc = app.activeDocument;
  var separatedArtLayer = getSeparatedArtLayer(doc);
  if (!separatedArtLayer) {
   return JSON.stringify({
    success: false,
    error: "SEPARATED_ART layer not found"
   });
  }

  function isStructuredTailSublayerName(layerName) {
   if (!layerName) return false;
   var n = String(layerName).replace(/^\s+|\s+$/g, "");
   var up = n.toUpperCase();
   if (up === String(CONSTANTS.LAYER_NAMES.CHOKE).toUpperCase()) return true;
   if (up === String(CONSTANTS.LAYER_NAMES.BLOCKER).toUpperCase()) return true;
   if (/^BLOCKER(\s+\d+)?$/i.test(n)) return true;
   if (up === String(CONSTANTS.LAYER_NAMES.WHITE_UB).toUpperCase()) return true;
   if (up.indexOf(String(CONSTANTS.LAYER_NAMES.WHITE_UB).toUpperCase() + " ") === 0) return true;
   if (/WHITE\s*UB|WHITEUB/i.test(n)) return true;
   return false;
  }

  function normalizeInkLabel(s) {
   return String(s || "")
    .replace(/^\s+|\s+$/g, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
  }

  function stripTrailingParenthetical(s) {
   return String(s || "").replace(/\s*\([^)]*\)\s*$/g, "").replace(/^\s+|\s+$/g, "");
  }

  function extractDigitTokens(s) {
   try {
    var m = String(s).match(/\d{2,4}/g);
    return m || [];
   } catch (eDig) {
    return [];
   }
  }

  function resolveUiLabelToSublayer(parent, uiName, nonTailCandidates) {
   if (!uiName || !parent) return null;
   var lyr = getSeparatedArtSubLayerByNameCaseInsensitive(parent, uiName);
   if (lyr && !isStructuredTailSublayerName(lyr.name)) return lyr;

   var nu = normalizeInkLabel(uiName);
   var nuStrip = normalizeInkLabel(stripTrailingParenthetical(uiName));
   var d;
   var ch;
   var ln;
   var lnStrip;

   for (d = 0; d < nonTailCandidates.length; d++) {
    ch = nonTailCandidates[d];
    if (!ch || !ch.name) continue;
    ln = normalizeInkLabel(ch.name);
    lnStrip = normalizeInkLabel(stripTrailingParenthetical(ch.name));
    if (ln === nu || lnStrip === nu || ln === nuStrip || lnStrip === nuStrip) return ch;
   }

   var subs = [];
   for (d = 0; d < nonTailCandidates.length; d++) {
    ch = nonTailCandidates[d];
    if (!ch || !ch.name) continue;
    ln = normalizeInkLabel(ch.name);
    lnStrip = normalizeInkLabel(stripTrailingParenthetical(ch.name));
    if (nu.length >= 4 && (ln.indexOf(nu) >= 0 || lnStrip.indexOf(nu) >= 0)) subs.push(ch);
    else if (ln.length >= 4 && (nu.indexOf(ln) >= 0 || nu.indexOf(lnStrip) >= 0)) subs.push(ch);
   }
   if (subs.length === 1) return subs[0];
   if (subs.length > 1) {
    var best = subs[0];
    for (var c = 1; c < subs.length; c++) {
     if (String(subs[c].name).length < String(best.name).length) best = subs[c];
    }
    return best;
   }

   var uiDigits = extractDigitTokens(uiName);
   if (uiDigits.length === 0) return null;
   var digitMatches = [];
   for (d = 0; d < nonTailCandidates.length; d++) {
    ch = nonTailCandidates[d];
    if (!ch || !ch.name) continue;
    var ld = extractDigitTokens(ch.name);
    var hit = false;
    var ui;
    var lj;
    for (ui = 0; ui < uiDigits.length; ui++) {
     for (lj = 0; lj < ld.length; lj++) {
      if (uiDigits[ui] === ld[lj]) {
       hit = true;
       break;
      }
     }
     if (hit) break;
    }
    if (hit) digitMatches.push(ch);
   }
   if (digitMatches.length === 1) return digitMatches[0];
   return null;
  }

  var all = [];
  var i;
  for (i = 0; i < separatedArtLayer.layers.length; i++) {
   all.push(separatedArtLayer.layers[i]);
  }

  function sortStructuredTailLayersForPanel(tailLayers) {
   function tailRank(layer) {
    if (!layer || !layer.name) return 50;
    var n = String(layer.name);
    if (n === String(CONSTANTS.LAYER_NAMES.CHOKE)) return 0;
    if (isWhiteUbLayerName(n)) return getWhiteUbLayerNumber(n);
    if (n === String(CONSTANTS.LAYER_NAMES.BLOCKER) || /^blocker(\s+\d+)?$/i.test(n)) return 100;
    return 50;
   }
   tailLayers.sort(function (a, b) {
    return tailRank(a) - tailRank(b);
   });
   return tailLayers;
  }

  var tails = [];
  var nonTail = [];
  for (i = 0; i < all.length; i++) {
   if (isStructuredTailSublayerName(all[i].name)) tails.push(all[i]);
   else nonTail.push(all[i]);
  }

  tails = sortStructuredTailLayersForPanel(tails);

  var matchedOrdered = [];
  var usedLayer = {};
  var u;
  for (u = 0; u < orderedNames.length; u++) {
   var rawName = orderedNames[u];
   if (!rawName) continue;
   if (isStructuredTailSublayerName(rawName)) continue;
   var resolved = resolveUiLabelToSublayer(separatedArtLayer, rawName, nonTail);
   if (!resolved) continue;
   if (isStructuredTailSublayerName(resolved.name)) continue;
   if (usedLayer[resolved.name]) continue;
   usedLayer[resolved.name] = true;
   matchedOrdered.push(resolved);
  }

  if (matchedOrdered.length === 0) {
   return JSON.stringify({
    success: false,
    error: "Could not match any table rows to plate sublayers (check formal names vs layer names)"
   });
  }

  var others = [];
  for (i = 0; i < nonTail.length; i++) {
   var nt = nonTail[i];
   if (!usedLayer[nt.name]) others.push(nt);
  }

  var newFull = others.concat(matchedOrdered).concat(tails);

  if (newFull.length !== all.length) {
   return JSON.stringify({
    success: false,
    error: "Internal reorder mismatch (layer count)"
   });
  }

  for (var t = 0; t < newFull.length; t++) {
   if (t === 0) {
    newFull[t].move(separatedArtLayer, ElementPlacement.PLACEATBEGINNING);
   } else {
    newFull[t].move(newFull[t - 1], ElementPlacement.PLACEAFTER);
   }
  }

  try {
   var layerNames = getSeparatedArtLayerNames(doc);
   if (layerNames.length > 0) {
    var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
    if (sepXmp.isXmpCreated) {
     sepXmp.setStructField("SeparatedLayerNames", layerNames, true, false);
     sepXmp.commit();
    }
   }
  } catch (eXmp) { }

  app.redraw();
  return JSON.stringify({
   success: true,
   movedCount: matchedOrdered.length
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

/**
 * Optional cleanup when removing an ink from the separation panel: delete SEPARATED_ART sublayer
 * and/or document swatch. Params: { tryNames: string[], inkSublayerName?, removeSublayer, removeSwatch }.
 * tryNames: ordered labels to try (UI colorName first, then host name if different) — exact case-insensitive
 * match only; no fuzzy remap to a different ink (so "LS 186 2" removes that plate, not "PANTONE 186 C").
 */
function handleRemoveSeparationInkArtifacts(params_string) {
 try {
  var params = JSON.parse(params_string);
  var removeSublayer = !!params.removeSublayer;
  var removeSwatch = !!params.removeSwatch;
  var out = {
   success: true,
   removedLayer: false,
   removedSwatch: false,
   layerMessage: null,
   swatchMessage: null
  };

  if (!removeSublayer && !removeSwatch) {
   return JSON.stringify(out);
  }

  var tryNames = [];
  if (params.tryNames && params.tryNames.length) {
   var tn;
   for (tn = 0; tn < params.tryNames.length; tn++) {
    var one = String(params.tryNames[tn] || "").replace(/^\s+|\s+$/g, "");
    if (one) tryNames.push(one);
   }
  }
  if (tryNames.length === 0) {
   var legacy = String(params.inkSublayerName || params.inkName || "").replace(/^\s+|\s+$/g, "");
   if (legacy) tryNames.push(legacy);
  }

  if (tryNames.length === 0) {
   return JSON.stringify({
    success: false,
    error: "tryNames or inkSublayerName is required when removing layer or swatch"
   });
  }

  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }

  var doc = app.activeDocument;
  var mutated = false;
  var ti;

  function findSwatchByNameInsensitive(docRef, name) {
   var n = String(name || "").toLowerCase();
   var i;
   var sw;
   for (i = 0; i < docRef.swatches.length; i++) {
    sw = docRef.swatches[i];
    if (sw && sw.name && String(sw.name).toLowerCase() === n) {
     return sw;
    }
   }
   return null;
  }

  function tryRemoveSwatchByName(name) {
   if (!name) return false;
   var swatchRef = null;
   try {
    swatchRef = doc.swatches.getByName(name);
   } catch (eSw0) {
    swatchRef = findSwatchByNameInsensitive(doc, name);
   }
   if (!swatchRef) return false;
   try {
    swatchRef.remove();
    return true;
   } catch (eSw1) {
    out.swatchMessage = eSw1 && eSw1.message ? eSw1.message : String(eSw1);
    return false;
   }
  }

  var resolvedDocLayerName = null;

  if (removeSublayer) {
   var separatedArtLayer = getSeparatedArtLayer(doc);
   if (!separatedArtLayer) {
    out.layerMessage = "SEPARATED_ART layer not found";
   } else {
    var sub = null;
    for (ti = 0; ti < tryNames.length; ti++) {
     sub = getSeparatedArtSubLayerByNameCaseInsensitive(separatedArtLayer, tryNames[ti]);
     if (sub) break;
    }
    if (!sub) {
     out.layerMessage = "Sublayer not found (tried: " + tryNames.join(", ") + ")";
    } else {
     try {
      resolvedDocLayerName = sub.name;
      sub.locked = false;
      sub.visible = true;
      sub.remove();
      out.removedLayer = true;
      mutated = true;
      try {
       var layerNames = getSeparatedArtLayerNames(doc);
       var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
       if (sepXmp.isXmpCreated) {
        sepXmp.setStructField("SeparatedLayerNames", layerNames, true, false);
        sepXmp.commit();
       }
      } catch (eXmp) { }
     } catch (eRem) {
      out.layerMessage = eRem && eRem.message ? eRem.message : String(eRem);
      out.success = false;
     }
    }
   }
  }

  if (removeSwatch) {
   var swatchOrder = [];
   if (resolvedDocLayerName) swatchOrder.push(resolvedDocLayerName);
   for (ti = 0; ti < tryNames.length; ti++) {
    if (
     resolvedDocLayerName &&
     String(tryNames[ti]).toUpperCase() === String(resolvedDocLayerName).toUpperCase()
    ) {
     continue;
    }
    swatchOrder.push(tryNames[ti]);
   }
   var removedSw = false;
   for (ti = 0; ti < swatchOrder.length; ti++) {
    if (tryRemoveSwatchByName(swatchOrder[ti])) {
     removedSw = true;
     break;
    }
   }
   if (removedSw) {
    out.removedSwatch = true;
    mutated = true;
   } else if (!out.swatchMessage) {
    out.swatchMessage = "Swatch not found (tried: " + swatchOrder.join(", ") + ")";
   }
  }

  if (mutated) {
   try {
    doc.save();
   } catch (eSave) { }
  }

  return JSON.stringify(out);
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

function handleGetTemplateInfo(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: true,
    hasDocument: false,
    message: "No active document"
   });
  }
  var activeDoc = app.activeDocument;
  var docFile = new File(activeDoc.fullName);
  var docName = docFile.name.replace(/\.[^\.]+$/, '');
  var docPath = docFile.fsName;
  var leagueFolder;
  if (docPath.indexOf("09 SEPARATIONS") !== -1) {
   var graphicFolder = docFile.parent;
   var teamCodeFolder = graphicFolder.parent;
   var leagueSepFolder = teamCodeFolder.parent;
   var separationsFolder = leagueSepFolder.parent;
   var rootFolder = separationsFolder.parent;
   var league = leagueSepFolder.name;
   var teamOutsFolder = new Folder(rootFolder.fsName + "/01 TEAMOUTS");
   leagueFolder = new Folder(teamOutsFolder.fsName + "/" + league);
  } else {
   var aiFolder = docFile.parent;
   leagueFolder = aiFolder.parent;
  }
  var jsonData = findAndReadJSONFile(docName, leagueFolder);
  if (!jsonData) {
   return JSON.stringify({
    success: false,
    error: "JSON file not found or invalid for document: " + docName
   });
  }
  var templateInfo = {
   template: decodeURIString(findValueInJSON(jsonData, "Template") || docName),
   brand: decodeURIString(findValueInJSON(jsonData, "Brand") || ""),
   orgGrp: decodeURIString(findValueInJSON(jsonData, "ORG-GRP") || findValueInJSON(jsonData, "ORGGRP") || ""),
   conceptNumber: decodeURIString(findValueInJSON(jsonData, "Concept") || findValueInJSON(jsonData, "ConceptNumber") || ""),
   graphicName: decodeURIString(findValueInJSON(jsonData, "GraphicName") || findValueInJSON(jsonData, "Graphic Name") || ""),
   teamName: decodeURIString(findValueInJSON(jsonData, "TeamName") || findValueInJSON(jsonData, "Team Name") || ""),
   teamCode: findValueInJSON(jsonData, "TeamCode") || "",
   garmColors: decodeURIString(findValueInJSON(jsonData, "GarmColors") || findValueInJSON(jsonData, "Garm Colors") || ""),
   styles: decodeURIString(findValueInJSON(jsonData, "Styles") || "")
  };
  return JSON.stringify({
   success: true,
   hasDocument: true,
   documentPath: docPath,
   data: templateInfo
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleGetActiveDocumentPath(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document"
   });
  }
  var activeDoc = app.activeDocument;
  var docFile = new File(activeDoc.fullName);
  var docPath = docFile.fsName;
  return JSON.stringify({
   success: true,
   documentPath: docPath
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleUpdateSepTable(params_string) {
 try {
  var params = JSON.parse(params_string);
  var separationData = params.separationData;
  if (!separationData || !separationData.length) {
   return JSON.stringify({
    success: false,
    error: "No separation data provided"
   });
  }
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }
  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  var doc = app.activeDocument;
  var errors = [];
  var updatedRows = 0;
  var clearedRows = 0;
  var inkRenamesApplied = 0;
  var ri;
  for (ri = 0; ri < separationData.length; ri++) {
   var sdRename = separationData[ri];
   if (!sdRename || !sdRename.renameInkFrom) {
    continue;
   }
   var fromInk = String(sdRename.renameInkFrom).replace(/^\s+|\s+$/g, "");
   var toInk = String(sdRename.swatchName || sdRename.colorName || "").replace(/^\s+|\s+$/g, "");
   if (!fromInk || !toInk || fromInk.toLowerCase() === toInk.toLowerCase()) {
    continue;
   }
   var rr = renameSeparationInkInDocument(doc, fromInk, toInk);
   if (rr.success && (rr.renamedLayer || rr.renamedSwatch)) {
    inkRenamesApplied++;
   } else if (rr.error) {
    errors.push("Ink rename " + fromInk + " → " + toInk + ": " + rr.error);
   }
  }

  var pgInkDataLayer = findLayerByName(doc.layers, "PG Ink Data");
  if (pgInkDataLayer) {
   // Track which groups have data (by seq number)
   var groupsWithData = {};

   // Process each separation data item and update corresponding numbered group
   for (var i = 0; i < separationData.length; i++) {
    var sepData = separationData[i];
    var groupName = String(sepData.seq);
    var rowGroup = null;
    for (var j = 0; j < pgInkDataLayer.groupItems.length; j++) {
     if (pgInkDataLayer.groupItems[j].name === groupName) {
      rowGroup = pgInkDataLayer.groupItems[j];
      break;
     }
    }
    if (!rowGroup) {
     errors.push("Group '" + groupName + "' not found in PG Ink Data layer");
     continue;
    }
    try {
     updateTextFrameInGroup(rowGroup, "SEQ", String(sepData.seq));
     updateTextFrameInGroup(rowGroup, "COLOR NAME", sepData.colorName);
     updateTextFrameInGroup(rowGroup, "MESH", sepData.mesh);
     updateTextFrameInGroup(rowGroup, "MICRON", sepData.micron);
     updateTextFrameInGroup(rowGroup, "FLASH", sepData.flash ? "YES" : "NO");
     updateTextFrameInGroup(rowGroup, "COOL", sepData.cool ? "YES" : "NO");
     updateTextFrameInGroup(rowGroup, "WB", sepData.wb ? "YES" : "NO");

     // Make the group visible since it has data
     rowGroup.hidden = false;
     groupsWithData[groupName] = true;

     updatedRows++;
    } catch (e) {
     errors.push("Error updating group '" + groupName + "': " + e.message);
    }
   }

   // Reset and hide remaining groups (groups that don't have data)
   // Check all groups from 1 to 14 and hide those that weren't updated
   var maxGroupsToCheck = 14;
   for (var i = 1; i <= maxGroupsToCheck; i++) {
    var groupName = String(i);

    // Skip groups that have data
    if (groupsWithData[groupName]) {
     continue;
    }

    var rowGroup = null;
    for (var j = 0; j < pgInkDataLayer.groupItems.length; j++) {
     if (pgInkDataLayer.groupItems[j].name === groupName) {
      rowGroup = pgInkDataLayer.groupItems[j];
      break;
     }
    }
    if (!rowGroup) {
     // Group doesn't exist, continue to next
     continue;
    }
    try {
     updateTextFrameInGroup(rowGroup, "SEQ", String(i));
     updateTextFrameInGroup(rowGroup, "COLOR NAME", "COLOR");
     updateTextFrameInGroup(rowGroup, "MESH", "157");
     updateTextFrameInGroup(rowGroup, "MICRON", "XXX");
     updateTextFrameInGroup(rowGroup, "FLASH", "YES");
     updateTextFrameInGroup(rowGroup, "COOL", "YES");
     updateTextFrameInGroup(rowGroup, "WB", "NO");

     // Hide the group since it has no data
     rowGroup.hidden = true;

     clearedRows++;
    } catch (e) {
     errors.push("Error resetting group '" + groupName + "': " + e.message);
    }
   }
  } else {
   errors.push("PG Ink Data layer not found in document");
  }
  var gridLabelResult = updateGridColorLabels(doc, separationData);
  if (gridLabelResult.errors.length > 0) {
   errors = errors.concat(gridLabelResult.errors);
  }

  try {
   updateSeparationPageVariables(doc, separationData.length, null);
  } catch (cvPageErr) {
   errors.push("C# page variable update error: " + cvPageErr.message);
  }

  // ===== SAVE SEPARATION COLORS DATA TO XMP =====
  try {
   var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
   if (xmp.isXmpCreated) {
    xmp.setStructField("LEAPSeparationColorsData", separationData, true, false);
    if (inkRenamesApplied > 0) {
     try {
      var syncedLayerNames = getSeparatedArtLayerNames(doc);
      xmp.setStructField("SeparatedLayerNames", syncedLayerNames, true, false);
     } catch (eSyn) { }
    }
    xmp.commit();
    // Save document to persist XMP data
    try {
     doc.save();
    } catch (saveError) {
     // Could not auto-save document - XMP data committed and will be saved when document is manually saved
    }
   }
  } catch (xmpError) {
   // Continue anyway - XMP storage is not critical
  }

  return JSON.stringify({
   success: true,
   updatedRows: updatedRows,
   clearedRows: clearedRows,
   updatedLabels: gridLabelResult.updatedLabels,
   deletedLabels: gridLabelResult.deletedLabels,
   totalRows: separationData.length,
   inkRenamesApplied: inkRenamesApplied,
   errors: errors.length > 0 ? errors : undefined
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleGetGraphicSwatches(params_string) {
 try {
  var params = JSON.parse(params_string);
  var graphicName = params.graphicName;

  if (!graphicName) {
   return JSON.stringify({
    success: false,
    error: "Graphic name is required"
   });
  }

  // Check if there's an active document
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document found"
   });
  }

  var activeDoc = app.activeDocument;
  var docFile = new File(activeDoc.fullName);
  var docName = docFile.name.replace(/\.[^\.]+$/, ''); // Remove extension
  var docPath = docFile.fsName;

  var rootFolder, league, teamCode, leagueFolder;
  var isSeparatedDocument = isActiveSeparationDocument(activeDoc);
  var layerNames = null;

  // For separated documents, get layer names from XMP (works even when file is moved outside 09 SEPARATIONS)
  var profileMetaForPlates = null;
  /*
   * Map of lowercased underbase layer name -> 1-based pass index, from the XMP "UnderbaseLayerNames"
   * written during underbase generation. Lets the panel recognize custom-named underbase plates
   * (whose names no longer start with "White UB") as underbase.
   */
  var underbaseLayerNameMap = {};
  /* Map of lowercased underbase SWATCH name -> 1-based pass (from XMP "UnderbaseSwatchNames"). Lets a
     plate that merely shares an underbase swatch (e.g. "PANTONE White" doubling as UB2) group as underbase. */
  var underbaseSwatchNameMap = {};
  if (isSeparatedDocument) {
   try {
    var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);
    if (sepXmp.isXmpCreated && sepXmp.doesStructFieldExist("SeparatedLayerNames")) {
     layerNames = sepXmp.getStructField("SeparatedLayerNames", true);
    }
    if (sepXmp.isXmpCreated && sepXmp.doesStructFieldExist("SeparationProfileMetadata")) {
     profileMetaForPlates = enrichProfileMetadataWithUnderbase2(
      sepXmp.getStructField("SeparationProfileMetadata", true),
      activeDoc
     );
    }
    if (sepXmp.isXmpCreated && sepXmp.doesStructFieldExist("UnderbaseLayerNames")) {
     var ubLayerNamesXmp = sepXmp.getStructField("UnderbaseLayerNames", true);
     if (ubLayerNamesXmp && ubLayerNamesXmp.length) {
      for (var ubn = 0; ubn < ubLayerNamesXmp.length; ubn++) {
       var ubnName = ubLayerNamesXmp[ubn] != null ? String(ubLayerNamesXmp[ubn]).replace(/^\s+|\s+$/g, "") : "";
       if (ubnName) underbaseLayerNameMap[ubnName.toLowerCase()] = ubn + 1;
      }
     }
    }
    if (sepXmp.isXmpCreated && sepXmp.doesStructFieldExist("UnderbaseSwatchNames")) {
     var ubSwatchNamesXmp = sepXmp.getStructField("UnderbaseSwatchNames", true);
     if (ubSwatchNamesXmp && ubSwatchNamesXmp.length) {
      for (var ubs = 0; ubs < ubSwatchNamesXmp.length; ubs++) {
       var ubsName = ubSwatchNamesXmp[ubs] != null ? String(ubSwatchNamesXmp[ubs]).replace(/^\s+|\s+$/g, "") : "";
       if (ubsName) underbaseSwatchNameMap[ubsName.toLowerCase()] = ubs + 1;
      }
     }
    }
    if (!layerNames || !layerNames.length) {
     layerNames = getSeparatedArtLayerNames(activeDoc);
    }
   } catch (e) {
    layerNames = null;
   }
  }

  // If SeparatedLayerNames found, use it (for separated documents)
  if (layerNames && layerNames.length > 0) {
   // Path structure for separated documents: .../09 SEPARATIONS/[LEAGUE]/[TEAM_CODE]/[GRAPHIC_NAME]/file.ai
   var graphicFolder = docFile.parent; // GRAPHIC_NAME folder (e.g., CF)
   var teamCodeFolder = graphicFolder.parent; // TEAM_CODE folder
   var leagueSepFolder = teamCodeFolder.parent; // LEAGUE folder
   var separationsFolder = leagueSepFolder.parent; // 09 SEPARATIONS folder
   rootFolder = separationsFolder.parent; // Root folder

   league = leagueSepFolder.name;
   teamCode = teamCodeFolder.name;

   // Plate source = SPOT SWATCHES that also exist as a SEPARATED_ART layer.
   //
   // We iterate the LIVE SEPARATED_ART sublayers (ground truth for what plates exist in
   // the document right now) in their stacking order, and keep a plate ONLY when a spot
   // swatch with the same name still exists. This means:
   //   - "Choke" has a layer but no swatch  -> dropped (as desired; no Choke swatch).
   //   - A swatch merged/removed in the Swatches panel (e.g. "White UB 2" merged into
   //     "PANTONE White C") drops its plate on the next fetch, because the layer remains
   //     but the swatch is gone. The surviving swatch ("PANTONE White C") still shows.
   //   - Blocker / White UB / White UB 2-4 / "… 2" second hits all keep real spot
   //     swatches, so they remain.
   // Reserved bracketed swatches like "[Registration]" / "[None]" are skipped (and have
   // no layer anyway). Colors are read from the spot swatch via resolveLayerSwatchData.
   var liveLayerNames = getSeparatedArtLayerNames(activeDoc);
   if (!liveLayerNames || !liveLayerNames.length) {
    // Fallback to the XMP-derived list only if the live layer read failed.
    liveLayerNames = filterPlateLayerNamesForUi(layerNames, profileMetaForPlates);
   }

   // Build a case-insensitive lookup of existing SPOT swatches from the SWATCHES PANEL
   // (activeDoc.swatches), NOT activeDoc.spots. When a swatch is merged in the Swatches panel,
   // the panel entry (swatches) is removed immediately, but the underlying spot object can
   // linger in activeDoc.spots until the document is saved/reopened. Keying off activeDoc.spots
   // therefore kept a merged-away plate (e.g. "White UB 2") visible until reopen. The Swatches
   // panel reflects the merge right away, so we intersect against it and require SpotColor type.
   function normalizePlateName(n) {
    return String(n == null ? "" : n).replace(/^\s+|\s+$/g, "").toUpperCase();
   }
   /*
    * Structural SEPARATED_ART layers (Choke, Blocker/Blocker N, White UB / White UB N) are the
    * underbase + trap stack, not user inks. They are EXCLUDED from rename-recovery below so the
    * documented behavior is preserved: e.g. a "White UB 2" layer that shares the white plate's
    * swatch must NOT surface as its own plate. Renamed user inks never carry these names, so this
    * guard only blocks the structural layers, never a genuinely renamed ink plate.
    */
   function isStructuralPlateLayerName(n) {
    var up = normalizePlateName(n);
    if (up === normalizePlateName(CONSTANTS.LAYER_NAMES.CHOKE)) { return true; }
    if (up.indexOf(normalizePlateName(CONSTANTS.LAYER_NAMES.BLOCKER)) === 0) { return true; }
    if (up.indexOf(normalizePlateName(CONSTANTS.LAYER_NAMES.WHITE_UB)) === 0) { return true; }
    return false;
   }
   var spotSwatchLookup = {};
   try {
    for (var si = 0; si < activeDoc.swatches.length; si++) {
     var sw = activeDoc.swatches[si];
     var swName = sw ? sw.name : null;
     if (!swName) { continue; }
     if (String(swName).charAt(0) === "[") { continue; } // skip [Registration], [None], etc.
     var swColor = null;
     try { swColor = sw.color; } catch (colErr) { swColor = null; }
     if (!swColor || swColor.typename !== "SpotColor") { continue; } // spot swatches only
     spotSwatchLookup[normalizePlateName(swName)] = true;
    }
   } catch (spotErr) {}

   var swatches = [];
   /*
    * De-dupe by the FINAL (resolved) plate name so a swatch merge, or a rename onto an already
    * existing plate name, can never list the same plate twice. First match in stacking order wins.
    */
   var seenPlateKeys = {};
   for (var i = 0; i < liveLayerNames.length; i++) {
    var layerNm = liveLayerNames[i];
    var plateName = null;

    if (spotSwatchLookup[normalizePlateName(layerNm)]) {
     /*
      * Primary path (unchanged): the layer name still matches a live spot swatch in the panel.
      * This keeps delete / Choke / Blocker / White UB / second-hit ("... 2") behavior identical.
      */
     plateName = layerNm;
    } else if (!isStructuralPlateLayerName(layerNm)) {
     /*
      * Rename recovery (identity match). An ink-plate layer whose name no longer matches any
      * swatch may simply have had its swatch RENAMED in the Swatches panel (e.g. XYZ -> TEST):
      * renaming a swatch does NOT rename the layer, so the name-only intersection above wrongly
      * dropped it. Match by IDENTITY instead - read the spot the layer's art is actually filled
      * with and, if that spot is still a live panel swatch, keep the plate under its CURRENT
      * (renamed) name.
      *
      * This does NOT resurrect deleted swatches: deleting a swatch leaves the art with a non-spot
      * (process) fill, and Choke's fill is [None]; both fail the SpotColor test and still drop.
      * Bracketed reserved swatches ([Registration]/[None]) are skipped as everywhere else.
      */
     var fillColor = getFirstFillColorFromSeparatedArtSublayer(activeDoc, layerNm);
     if (
      fillColor &&
      fillColor.typename === "SpotColor" &&
      fillColor.spot &&
      fillColor.spot.name &&
      String(fillColor.spot.name).charAt(0) !== "[" &&
      spotSwatchLookup[normalizePlateName(fillColor.spot.name)]
     ) {
      plateName = String(fillColor.spot.name);
     }
    }

    if (!plateName) {
     continue; // no live swatch backs this layer (deleted / Choke / empty) -> not a plate
    }

    var plateKey = normalizePlateName(plateName);
    if (seenPlateKeys[plateKey]) {
     continue; // already represented (e.g. two layers now share one merged/renamed swatch)
    }
    seenPlateKeys[plateKey] = true;

    /*
     * Attach the SEPARATED_ART sublayer name (layerNm) alongside the resolved swatch
     * data. The panel uses this stable layer identity to classify underbase / blocker
     * plates for grouping, so a "White UB N" plate backed by a shared or renamed white
     * spot swatch (e.g. "PANTONE White C") is still grouped with the underbase instead
     * of being ranked as an ordinary ink. Additive; never changes which plates surface.
     */
    var plateSwatchData = resolveLayerSwatchData(activeDoc, plateName);
    if (plateSwatchData && typeof plateSwatchData === "object") {
     plateSwatchData.layerName = layerNm;
     /*
      * Flag underbase plates by layer identity: either the standard "White UB" prefix or a
      * custom underbase layer recorded in XMP UnderbaseLayerNames. underbasePass (1-based) lets
      * the panel order underbase passes even when they carry custom names.
      */
     var ubKey = String(layerNm || "").replace(/^\s+|\s+$/g, "").toLowerCase();
     var ubPassFromXmp = underbaseLayerNameMap[ubKey];
     var isWhiteUbPrefix = String(layerNm || "").indexOf(CONSTANTS.LAYER_NAMES.WHITE_UB) === 0;
     /* Swatch-based match: a plate that shares an underbase swatch (e.g. "PANTONE White" doubling as
        UB2) is grouped as underbase. Check the plate name and its actual fill swatch. */
     var plateNameKey = String(plateSwatchData.name || plateName || "").replace(/^\s+|\s+$/g, "").toLowerCase();
     var fillSwatchKey = String(plateSwatchData.fillSwatchName || "").replace(/^\s+|\s+$/g, "").toLowerCase();
     var ubPassFromSwatch = underbaseSwatchNameMap[plateNameKey] || underbaseSwatchNameMap[fillSwatchKey];
     if (ubPassFromXmp || isWhiteUbPrefix || ubPassFromSwatch) {
      plateSwatchData.isUnderbase = true;
      plateSwatchData.underbasePass = ubPassFromXmp
       ? ubPassFromXmp
       : (isWhiteUbPrefix ? getWhiteUbLayerNumber(layerNm) : ubPassFromSwatch);
      /* Swatch-only match = a real ink plate that ALSO serves as underbase. Group it with the
         underbase, but keep its ink mesh (do not force the underbase mesh). */
      if (!ubPassFromXmp && !isWhiteUbPrefix && ubPassFromSwatch) {
       plateSwatchData.underbaseSharedInk = true;
      }
     }
    }
    swatches.push(plateSwatchData);
   }

   try {
    var _dbgMapS = [];
    for (var _mk in underbaseSwatchNameMap) { if (underbaseSwatchNameMap.hasOwnProperty(_mk)) _dbgMapS.push(_mk + "=" + underbaseSwatchNameMap[_mk]); }
    var _dbgMapL = [];
    for (var _lk in underbaseLayerNameMap) { if (underbaseLayerNameMap.hasOwnProperty(_lk)) _dbgMapL.push(_lk + "=" + underbaseLayerNameMap[_lk]); }
    var _dbgPlates = [];
    for (var _pi = 0; _pi < swatches.length; _pi++) {
     var _sw = swatches[_pi];
     _dbgPlates.push(
      (_sw.name || "?") +
      "(layer=" + (_sw.layerName || "?") + ",fill=" + (_sw.fillSwatchName || "?") + ")" +
      (_sw.isUnderbase ? "[UB pass " + _sw.underbasePass + (_sw.underbaseSharedInk ? " sharedInk" : "") + "]" : "")
     );
    }
    appendLeapSepLog("[UB_ORDER] getGraphicSwatches swatchMap={" + _dbgMapS.join(", ") + "} layerMap={" + _dbgMapL.join(", ") + "}");
    appendLeapSepLog("[UB_ORDER] getGraphicSwatches plates: " + _dbgPlates.join(" | "));
   } catch (_dbgErr) { }

   return JSON.stringify({
    success: true,
    swatches: swatches
   });
  }

  // Fallback to Graphics JSON file approach for non-separated documents or if SeparatedLayerNames not found
  if (docPath.indexOf("09 SEPARATIONS") !== -1) {
   var graphicFolder = docFile.parent;
   var teamCodeFolder = graphicFolder.parent;
   var leagueSepFolder = teamCodeFolder.parent;
   var separationsFolder = leagueSepFolder.parent;
   rootFolder = separationsFolder.parent;
   league = leagueSepFolder.name;
   teamCode = teamCodeFolder.name;
  } else {
   var aiFolder = docFile.parent;
   leagueFolder = aiFolder.parent;
   var teamOutsFolder = leagueFolder.parent;
   rootFolder = teamOutsFolder.parent;
   var jsonData = findAndReadJSONFile(docName, leagueFolder);
   if (!jsonData) {
    return JSON.stringify({
     success: false,
     error: "JSON file not found or invalid for document: " + docName
    });
   }
   league = findValueInJSON(jsonData, "League");
   teamCode = findValueInJSON(jsonData, "TeamCode");
   if (!league || !teamCode) {
    return JSON.stringify({
     success: false,
     error: "League or TeamCode not found in JSON file"
    });
   }
  }
  var graphicsFolder = new Folder(rootFolder.fsName + "/02 GRAPHICS");
  var leagueGraphicsFolder = new Folder(graphicsFolder.fsName + "/" + league);
  var graphicTypeFolder = new Folder(leagueGraphicsFolder.fsName + "/" + graphicName.toUpperCase());
  var jsonFolder = new Folder(graphicTypeFolder.fsName + "/JSON");
  if (!jsonFolder.exists) {
   return JSON.stringify({
    success: false,
    error: "JSON folder not found: " + jsonFolder.fsName
   });
  }
  var jsonFiles = jsonFolder.getFiles("*.json");
  var graphicJsonFile = null;
  for (var i = 0; i < jsonFiles.length; i++) {
   var fileName = jsonFiles[i].name;
   if (fileName.indexOf("GRAPHICS") !== -1 && fileName.indexOf(graphicName.toUpperCase()) !== -1) {
    graphicJsonFile = jsonFiles[i];
    break;
   }
  }
  if (!graphicJsonFile) {
   return JSON.stringify({
    success: false,
    error: "Graphics JSON file not found for: " + graphicName
   });
  }
  graphicJsonFile.open('r');
  var jsonContent = graphicJsonFile.read();
  graphicJsonFile.close();
  var graphicJsonData = JSON.parse(jsonContent);
  var decorationColors = graphicJsonData.Decoration_colors || [];
  var swatches = [];
  for (var i = 0; i < decorationColors.length; i++) {
   var swatchName = decorationColors[i].colorName;
   var swatchData = {
    name: swatchName,
    hex: "#808080",
    cmyk: null,
    rgb: null
   };
   var docSwatch = null;
   try {
    docSwatch = activeDoc.swatches.getByName(swatchName);
   } catch (e) {
   }
   if (docSwatch && docSwatch.color) {
    var color = docSwatch.color;
    swatchData.hex = getColorHex(color);
    if (color.typename === "SpotColor") {
     var spotColor = color.spot.color;
     if (spotColor.typename === "CMYKColor") {
      swatchData.cmyk = {
       c: Math.round(spotColor.cyan),
       m: Math.round(spotColor.magenta),
       y: Math.round(spotColor.yellow),
       k: Math.round(spotColor.black)
      };
     }
    } else if (color.typename === "CMYKColor") {
     swatchData.cmyk = {
      c: Math.round(color.cyan),
      m: Math.round(color.magenta),
      y: Math.round(color.yellow),
      k: Math.round(color.black)
     };
    }
    if (color.typename === "RGBColor") {
     swatchData.rgb = {
      r: Math.round(color.red),
      g: Math.round(color.green),
      b: Math.round(color.blue)
     };
    } else if (swatchData.cmyk) {
     var rgb = cmykToRgb(swatchData.cmyk.c, swatchData.cmyk.m, swatchData.cmyk.y, swatchData.cmyk.k);
     swatchData.rgb = rgb;
    }
   }
   swatches.push(swatchData);
  }
  return JSON.stringify({
   success: true,
   swatches: swatches
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleCheckSeparatedDocument(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: true,
    data: {
     hasDocument: false,
     isSeparatedDoc: false
    }
   });
  }

  var activeDoc = app.activeDocument;
  var docFile = new File(activeDoc.fullName);
  var docPath = docFile.fsName;

  var _dataFromXMP = {
   hasDocument: true,
   isSeparatedDoc: false,
   profileMetaData: null,
   separatedLayerNames: [],
   docName: docFile.name,
   docPath: docPath
  };

  try {
   var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);
   if (xmp.isXmpCreated && xmp.doesStructFieldExist("DocumentType")) {
    var documentType = xmp.getStructField("DocumentType");
    if (documentType && documentType.toString().trim() === "Separation Document") {
     _dataFromXMP.isSeparatedDoc = true;

     // Get profile metadata from XMP
     var _profileMetaData = xmp.getStructField("SeparationProfileMetadata", true);
     if (_profileMetaData) {
      _dataFromXMP.profileMetaData = enrichProfileMetadataWithUnderbase2(_profileMetaData, activeDoc);
     }

     // Get SeparatedLayerNames from XMP; fall back to live SEPARATED_ART sublayers
     var _separatedLayerNames = xmp.getStructField("SeparatedLayerNames", true);
     if (_separatedLayerNames && _separatedLayerNames.length) {
      _dataFromXMP.separatedLayerNames = _separatedLayerNames;
     } else {
      var liveLayerNames = getSeparatedArtLayerNames(activeDoc);
      if (liveLayerNames && liveLayerNames.length) {
       _dataFromXMP.separatedLayerNames = liveLayerNames;
      }
     }

     // Get LEAPSeparationColorsData from XMP
     var _leapSeparationColorsData = xmp.getStructField("LEAPSeparationColorsData", true);
     if (_leapSeparationColorsData) {
      _dataFromXMP.leapSeparationColorsData = _leapSeparationColorsData;
     }

     // get BodyColor from XMP
     var _bodyColor = xmp.getStructField("BodyColor", true);
     if (_bodyColor) {
      _dataFromXMP.bodyColor = _bodyColor;
     }
    }
   }
  } catch (xmpError) {
   // Error reading DocumentType from XMP - fall back to path check
   if (docPath.indexOf("09 SEPARATIONS") !== -1) {
    _dataFromXMP.isSeparatedDoc = true;
    var graphicFolder = docFile.parent;
    _dataFromXMP.graphicName = graphicFolder.name;
   }
  }

  // Sync GARMENT swatch CMYK from BodyColor XMP (name unchanged; match React getDocumentInfo)
  if (_dataFromXMP.isSeparatedDoc && _dataFromXMP.bodyColor && _dataFromXMP.bodyColor.cmyk) {
   try {
    var garmentCmyk = _dataFromXMP.bodyColor.cmyk;
    var gc = Math.max(0, Math.min(100, Number(garmentCmyk.c) || 0));
    var gm = Math.max(0, Math.min(100, Number(garmentCmyk.m) || 0));
    var gy = Math.max(0, Math.min(100, Number(garmentCmyk.y) || 0));
    var gk = Math.max(0, Math.min(100, Number(garmentCmyk.k) || 0));
    var garmentSwatchNameOnOpen = getChokeStrokeSwatchNameForDocument(activeDoc);
    var garmentSwatchOnOpen = activeDoc.swatches.getByName(garmentSwatchNameOnOpen);
    if (garmentSwatchOnOpen && garmentSwatchOnOpen.color && garmentSwatchOnOpen.color.typename === "SpotColor" && garmentSwatchOnOpen.color.spot) {
     var garmentSpotOnOpen = garmentSwatchOnOpen.color.spot;
     if (garmentSpotOnOpen.color && garmentSpotOnOpen.color.typename === "CMYKColor") {
      garmentSpotOnOpen.color.cyan = gc;
      garmentSpotOnOpen.color.magenta = gm;
      garmentSpotOnOpen.color.yellow = gy;
      garmentSpotOnOpen.color.black = gk;
     }
    }
   } catch (garmentSwatchErr) {
    // GARMENT swatch may not exist or may not be spot color - ignore
   }
  }

  return JSON.stringify({
   success: true,
   data: _dataFromXMP
  });

 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function getProfilesJsonPath() {
 try {
  var serverBasePath = getServerBasePath();
  if (!serverBasePath) {
   return null;
  }
  var normalizedBasePath = serverBasePath.replace(/\/$/, "");
  var profilesPath = normalizedBasePath + "/SETTINGS/LEAP_SEPS/Data/Profiles.json";
  return profilesPath;
 } catch (error) {
  return null;
 }
}
function handleGetSeparationProfiles() {
 try {
  var profilesPath = getProfilesJsonPath();
  if (!profilesPath) {
   return JSON.stringify({
    success: false,
    error: "Could not determine profiles file path"
   });
  }
  var profilesFile = new File(profilesPath);
  if (!profilesFile.exists) {
   return JSON.stringify({
    success: true,
    profiles: []
   });
  }
  if (!profilesFile.open("r")) {
   return JSON.stringify({
    success: false,
    error: "Failed to open profiles file"
   });
  }
  var content = profilesFile.read();
  profilesFile.close();
  if (!content || !content.length) {
   return JSON.stringify({
    success: true,
    profiles: []
   });
  }
  var parsed;
  if (typeof JSON !== "undefined" && JSON.parse) {
   parsed = JSON.parse(content);
  } else {
   parsed = eval("(" + content + ")");
  }
  if (!parsed || !(parsed instanceof Array)) {
   return JSON.stringify({
    success: false,
    error: "Profiles file does not contain an array"
   });
  }
  return JSON.stringify({
   success: true,
   profiles: parsed
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
/**
 * Collapse arrays that contain only primitives (no nested objects/arrays) onto a single line, so the
 * saved Profiles.json keeps arrays like underbaseEnabled compact while objects stay multi-line. Newlines
 * inside a flat array become single spaces; values are NOT split on commas, so quoted strings that
 * contain commas are preserved as-is.
 */
function collapseFlatArraysInJson(jsonString) {
 if (jsonString == null) return jsonString;
 return String(jsonString).replace(/\[\s*([^\[\]{}]*?)\s*\]/g, function (match, inner) {
  var collapsed = inner.replace(/\s*\r?\n\s*/g, " ").replace(/^\s+|\s+$/g, "");
  return "[" + collapsed + "]";
 });
}

function handleSaveSeparationProfiles(params_string) {
 try {
  var params = JSON.parse(params_string);
  var profiles = params && params.profiles ? params.profiles : null;
  if (!profiles || !(profiles instanceof Array)) {
   return JSON.stringify({
    success: false,
    error: "No profiles data provided or invalid format"
   });
  }
  var profilesPath = getProfilesJsonPath();
  if (!profilesPath) {
   return JSON.stringify({
    success: false,
    error: "Could not determine profiles file path"
   });
  }
  var profilesFile = new File(profilesPath);
  var profilesFolder = profilesFile.parent;
  if (!profilesFolder.exists) {
   profilesFolder.create();
  }
  if (!profilesFile.open("w")) {
   return JSON.stringify({
    success: false,
    error: "Failed to open profiles file for writing"
   });
  }
  var jsonString = JSON.stringify(profiles, null, 2);
  /* Keep flat arrays (e.g. underbaseEnabled) on one line for a compact, readable file. */
  jsonString = collapseFlatArraysInJson(jsonString);
  profilesFile.write(jsonString);
  profilesFile.close();
  return JSON.stringify({
   success: true,
   message: "Profiles saved successfully"
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

function normalizeInkProfileName(value) {
 if (value == null) return "";
 return String(value).trim();
}

function meshValueFromJsonEntry(value) {
 if (value == null || value === "") return "";
 return String(value).trim();
}

function meshValueToJsonEntry(mesh, enabled) {
 if (!enabled) return null;
 var trimmed = mesh != null ? String(mesh).trim() : "";
 if (trimmed === "") return null;
 var numeric = parseFloat(trimmed);
 return isNaN(numeric) ? trimmed : numeric;
}

function inkJsonEntryToRow(entry, index) {
 if (!entry || typeof entry !== "object") return null;
 var inkColor = entry.Ink_Color != null ? String(entry.Ink_Color).trim() : "";
 var profile = entry.Profile != null ? String(entry.Profile).trim() : "";
 var mesh = meshValueFromJsonEntry(entry.Color_Mesh);
 /*
  * "Two Hits" is value-driven (no longer Y/N): any non-empty value (except N/No/False/0) means a
  * second hit is required. A numeric value is the second-hit mesh; a legacy Y/Yes carries no mesh.
  */
 var twoHitsRaw = entry.Two_Hits != null ? String(entry.Two_Hits).trim() : "";
 var twoHitsIsNegative = /^(n|no|false|0)$/i.test(twoHitsRaw);
 var hitsCount = (twoHitsRaw !== "" && !twoHitsIsNegative) ? 2 : 1;
 if (entry.hitsCount != null) {
  var parsedHits = parseInt(entry.hitsCount, 10);
  if (!isNaN(parsedHits) && parsedHits >= 1) hitsCount = parsedHits;
 }
 var secondHitMesh = (/^(y|yes|true)$/i.test(twoHitsRaw) || twoHitsIsNegative) ? "" : twoHitsRaw;
 var underbaseCount = entry.underbase_count != null ? parseInt(entry.underbase_count, 10) : 1;
 if (isNaN(underbaseCount) || underbaseCount < 1) underbaseCount = 1;
 if (underbaseCount > 4) underbaseCount = 4;
 var id = "ink-" + profile + "-" + inkColor + "-" + index;
 return {
  id: id,
  enabled: true,
  inkName: inkColor,
  mesh: mesh,
  underbaseCount: underbaseCount,
  hitsCount: hitsCount,
  secondHitMesh: secondHitMesh,
  printMethod: entry.Print_Method != null ? String(entry.Print_Method).trim() : "",
  profile: profile
 };
}

function inkRowToJsonEntry(row, profileName, profileCode) {
 var inkColor = row && row.inkName != null ? String(row.inkName).trim() : "";
 var enabled = row && row.enabled !== false;
 var hitsCount = enabled && row.hitsCount != null ? parseInt(row.hitsCount, 10) : 1;
 if (isNaN(hitsCount) || hitsCount < 1) hitsCount = 1;
 /*
  * "Two Hits" stores the raw second-hit value: a numeric mesh means a second hit is required (and is
  * the second-hit mesh); "" means single hit. A legacy row with only hitsCount writes "Y".
  */
 var secondHitMeshOut = enabled && row && row.secondHitMesh != null ? String(row.secondHitMesh).trim() : "";
 var twoHitsValue = hitsCount >= 2 ? (secondHitMeshOut !== "" ? secondHitMeshOut : "Y") : "";
 var underbaseCount = enabled && row.underbaseCount != null ? parseInt(row.underbaseCount, 10) : 1;
 if (isNaN(underbaseCount) || underbaseCount < 1) underbaseCount = 1;
 if (underbaseCount > 4) underbaseCount = 4;
 return {
  Color_Mesh: meshValueToJsonEntry(row && row.mesh != null ? row.mesh : "", enabled),
  Ink_Color: inkColor,
  Print_Method: row && row.printMethod != null ? String(row.printMethod).trim() : "",
  Profile: profileName,
  profileCode: profileCode != null ? String(profileCode).trim() : "",
  Two_Hits: twoHitsValue,
  underbase_count: underbaseCount
 };
}

function inkProfileMatchesEntry(entry, profileCodeKey) {
 if (!entry || !profileCodeKey) return false;
 var entryCode = entry.profileCode != null ? String(entry.profileCode).trim().toUpperCase() : "";
 return entryCode !== "" && entryCode === profileCodeKey;
}

function handleGetInkExceptions(params_string) {
 try {
  var params = params_string ? JSON.parse(params_string) : {};
  var profileCode = params.profileCode != null ? String(params.profileCode).trim().toUpperCase() : "";
  if (!profileCode) {
   return JSON.stringify({
    success: false,
    error: "Profile code is required"
   });
  }
  var allEntries = loadProfileInkExceptionsJson();
  var rows = [];
  for (var i = 0; i < allEntries.length; i++) {
   var entry = allEntries[i];
   if (!entry) continue;
   if (inkProfileMatchesEntry(entry, profileCode)) {
    var row = inkJsonEntryToRow(entry, i);
    if (row) rows.push(row);
   }
  }
  return JSON.stringify({
   success: true,
   inkExceptions: rows
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

function handleSaveInkExceptions(params_string) {
 try {
  var params = JSON.parse(params_string);
  var profileName = normalizeInkProfileName(params.profileName);
  var profileCode = params.profileCode != null ? String(params.profileCode).trim().toUpperCase() : "";
  var inkRows = params && params.inkRows ? params.inkRows : null;
  if (!profileCode) {
   return JSON.stringify({
    success: false,
    error: "Profile code is required"
   });
  }
  if (!inkRows || !(inkRows instanceof Array)) {
   return JSON.stringify({
    success: false,
    error: "No ink exception data provided or invalid format"
   });
  }
  var allEntries = loadProfileInkExceptionsJson();
  var remaining = [];
  for (var i = 0; i < allEntries.length; i++) {
   var entry = allEntries[i];
   if (!entry) continue;
   if (!inkProfileMatchesEntry(entry, profileCode)) {
    remaining.push(entry);
   }
  }
  var updatedProfileEntries = [];
  for (var j = 0; j < inkRows.length; j++) {
   var row = inkRows[j];
   if (!row) continue;
   var inkName = row.inkName != null ? String(row.inkName).trim() : "";
   if (!inkName) continue;
   var printMethod = row.printMethod != null ? String(row.printMethod).trim() : "";
   if (!printMethod && remaining.length > 0) {
    for (var k = 0; k < allEntries.length; k++) {
     var sample = allEntries[k];
     if (!sample) continue;
     if (inkProfileMatchesEntry(sample, profileCode) && sample.Print_Method) {
      printMethod = String(sample.Print_Method).trim();
      break;
     }
    }
   }
   row.printMethod = printMethod;
   updatedProfileEntries.push(inkRowToJsonEntry(row, profileName, profileCode));
  }
  var merged = remaining.concat(updatedProfileEntries);
  var saveResult = saveProfileInkExceptionsJson(merged);
  if (!saveResult || !saveResult.success) {
   return JSON.stringify({
    success: false,
    error: saveResult && saveResult.error ? saveResult.error : "Failed to save profile_ink_exceptions.json"
   });
  }
  return JSON.stringify({
   success: true,
   message: "Ink exceptions saved successfully"
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

function handleSaveGraphicsData(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document"
   });
  }

  var params = JSON.parse(params_string);
  var graphicsData = params && params.graphicsData ? params.graphicsData : null;

  if (!graphicsData || !(graphicsData instanceof Array)) {
   return JSON.stringify({
    success: false,
    error: "No graphics data provided or invalid format"
   });
  }

  var activeDoc = app.activeDocument;
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);

  if (!xmp.isXmpCreated) {
   return JSON.stringify({
    success: false,
    error: "Failed to initialize XMP"
   });
  }

  // Save graphics data to XMP with batch commit (autoCommit = false)
  // This avoids expensive serialization on every write
  xmp.setStructField("GraphicsOrganizationData", graphicsData, true, false);

  // The Graphics-page underbase swatch choices (optional), stored as separate XMP fields.
  var underbase2Swatch = params && params.underbase2Swatch != null ? String(params.underbase2Swatch) : "";
  var underbase3Swatch = params && params.underbase3Swatch != null ? String(params.underbase3Swatch) : "";
  var underbase4Swatch = params && params.underbase4Swatch != null ? String(params.underbase4Swatch) : "";
  if (underbase2Swatch !== "") {
   xmp.setStructField("Underbase2Swatch", underbase2Swatch, false, false);
  }
  if (underbase3Swatch !== "") {
   xmp.setStructField("Underbase3Swatch", underbase3Swatch, false, false);
  }
  if (underbase4Swatch !== "") {
   xmp.setStructField("Underbase4Swatch", underbase4Swatch, false, false);
  }

  // Commit all changes at once (much faster than committing on every setStructField)
  xmp.commit();

  // Save the document to persist XMP data to disk
  // This ensures the data is saved when the document is reopened
  // Only save if document has been saved before (has a file path)
  if (activeDoc.fullName && activeDoc.fullName.fsName) {
   try {
    activeDoc.save();
   } catch (saveError) {
    // If save fails, XMP data is still committed and will be saved when user manually saves
   }
  }

  return JSON.stringify({
   success: true,
   message: "Graphics data saved successfully",
   saved: graphicsData.length
  });

 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleLoadGraphicsData(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: true,
    graphicsData: []
   });
  }

  var activeDoc = app.activeDocument;
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);

  if (!xmp.isXmpCreated) {
   return JSON.stringify({
    success: true,
    graphicsData: []
   });
  }

  var graphicsData = [];
  if (xmp.doesStructFieldExist("GraphicsOrganizationData")) {
   graphicsData = xmp.getStructField("GraphicsOrganizationData", true);
   if (!graphicsData || !(graphicsData instanceof Array)) {
    graphicsData = [];
   }
  }

  var underbase2Swatch = "";
  var underbase3Swatch = "";
  var underbase4Swatch = "";
  if (xmp.doesStructFieldExist("Underbase2Swatch")) {
   var ub2 = xmp.getStructField("Underbase2Swatch", false);
   if (ub2 != null && typeof ub2 === "string") {
    underbase2Swatch = ub2;
   }
  }
  if (xmp.doesStructFieldExist("Underbase3Swatch")) {
   var ub3 = xmp.getStructField("Underbase3Swatch", false);
   if (ub3 != null && typeof ub3 === "string") {
    underbase3Swatch = ub3;
   }
  }
  if (xmp.doesStructFieldExist("Underbase4Swatch")) {
   var ub4 = xmp.getStructField("Underbase4Swatch", false);
   if (ub4 != null && typeof ub4 === "string") {
    underbase4Swatch = ub4;
   }
  }

  return JSON.stringify({
   success: true,
   graphicsData: graphicsData,
   underbase2Swatch: underbase2Swatch,
   underbase3Swatch: underbase3Swatch,
   underbase4Swatch: underbase4Swatch
  });

 } catch (e) {
  return JSON.stringify({
   success: true,
   graphicsData: []
  });
 }
}
function getProfilesJsonPath() {
 try {
  var serverBasePath = getServerBasePath();
  if (!serverBasePath) {
   return null;
  }
  var normalizedBasePath = serverBasePath.replace(/\/$/, "");
  var profilesPath = normalizedBasePath + "/SETTINGS/LEAP_SEPS/Data/Profiles.json";
  return profilesPath;
 } catch (error) {
  return null;
 }
}
function normalizeDistressFlagForProfile(value) {
 if (value === true || value === 1) {
  return "Y";
 }
 if (typeof value === "string") {
  var normalized = value.replace(/^\s+|\s+$/g, "").toUpperCase();
  if (normalized === "Y" || normalized === "YES" || normalized === "TRUE" || normalized === "1") {
   return "Y";
  }
 }
 return "N";
}

function profileDistressMatchesForLookup(profile, distressFlag) {
 return normalizeDistressFlagForProfile(profile && profile["Distress"]) === normalizeDistressFlagForProfile(distressFlag);
}

function getProfileCodeFromName(profileName, distressOption) {
 try {
  if (!profileName) {
   return null;
  }
  var profilesPath = getProfilesJsonPath();
  if (!profilesPath) {
   return null;
  }
  var profilesFile = new File(profilesPath);
  if (!profilesFile.exists) {
   return null;
  }
  if (!profilesFile.open("r")) {
   return null;
  }
  var content = profilesFile.read();
  profilesFile.close();
  if (!content || !content.length) {
   return null;
  }
  var parsed;
  if (typeof JSON !== "undefined" && JSON.parse) {
   parsed = JSON.parse(content);
  } else {
   parsed = eval("(" + content + ")");
  }
  if (!parsed || !(parsed instanceof Array)) {
   return null;
  }
  function normalizeProfileName(value) {
   // Normalize whitespace/dash variants so names from Excel/JSON compare consistently.
   var text = value == null ? "" : String(value);
   return text
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\s+|\s+$/g, "")
    .toLowerCase();
  }

  function compactProfileName(value) {
   return normalizeProfileName(value).replace(/[^a-z0-9]/g, "");
  }

  function extractProfileCode(profile) {
   var profileCode = profile["Profile Code"] || profile.code || "";
   return profileCode ? profileCode.toString().replace(/^\s+|\s+$/g, "") : "";
  }

  var hasDistressFilter = distressOption !== undefined && distressOption !== null;
  var requestedDistress = hasDistressFilter ? normalizeDistressFlagForProfile(distressOption) : null;

  var searchName = normalizeProfileName(profileName);
  var searchNameCompact = compactProfileName(profileName);
  for (var i = 0; i < parsed.length; i++) {
   var profile = parsed[i];
   var profileNameInFile = profile["Profile Name"] || profile.profileName || "";
   var normalizedNameInFile = normalizeProfileName(profileNameInFile);
   if (normalizedNameInFile === searchName) {
    if (hasDistressFilter && !profileDistressMatchesForLookup(profile, requestedDistress)) {
     continue;
    }
    var codeFromName = extractProfileCode(profile);
    if (codeFromName) {
     return codeFromName;
    }
   }
  }

  // Secondary safe match only for punctuation/spacing differences.
  for (var j = 0; j < parsed.length; j++) {
   var profile2 = parsed[j];
   var profileNameInFile2 = profile2["Profile Name"] || profile2.profileName || "";
   var compactNameInFile = compactProfileName(profileNameInFile2);
   if (compactNameInFile && searchNameCompact && compactNameInFile === searchNameCompact) {
    if (hasDistressFilter && !profileDistressMatchesForLookup(profile2, requestedDistress)) {
     continue;
    }
    var codeFromCompact = extractProfileCode(profile2);
    if (codeFromCompact) {
     return codeFromCompact;
    }
   }
  }

  // Distressed variant missing — fall back to non-distressed (Distress N).
  if (hasDistressFilter && requestedDistress === "Y") {
   for (var k = 0; k < parsed.length; k++) {
    var profile3 = parsed[k];
    var profileNameInFile3 = profile3["Profile Name"] || profile3.profileName || "";
    if (normalizeProfileName(profileNameInFile3) !== searchName) {
     continue;
    }
    if (!profileDistressMatchesForLookup(profile3, "N")) {
     continue;
    }
    var codeFromFallback = extractProfileCode(profile3);
    if (codeFromFallback) {
     return codeFromFallback;
    }
   }
  }

  // Avoid broad substring matching because names like
  // "Fanatics-Plastisol" and "Fanatics-Plastisol-Blocker" can conflict.
  return null;
 } catch (e) {
  return null;
 }
}
function handleCheckGraphicFolderExists(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document"
   });
  }
  var params = JSON.parse(params_string);
  var graphicName = params.graphicName;
  if (graphicName !== null && graphicName !== undefined) {
   graphicName = String(graphicName);
  }
  if (!graphicName || graphicName.trim() === "") {
   return JSON.stringify({
    success: false,
    error: "Graphic name is required"
   });
  }
  graphicName = graphicName.trim();
  var activeDoc = app.activeDocument;
  var docFile = new File(activeDoc.fullName);
  var docPath = docFile.fsName;
  var rootFolder;
  var league;
  var docName = null; // Version document name (no extension); used to check for THIS team's graphics file
  if (docPath.indexOf("09 SEPARATIONS") !== -1) {
   var graphicFolder = docFile.parent;
   var teamCodeFolder = graphicFolder.parent;
   var leagueSepFolder = teamCodeFolder.parent;
   var separationsFolder = leagueSepFolder.parent;
   rootFolder = separationsFolder.parent;
   league = leagueSepFolder.name;
  } else {
   var aiFolder = docFile.parent;
   var leagueFolder = aiFolder.parent;
   league = leagueFolder.name;
   var teamOutsFolder = leagueFolder.parent;
   rootFolder = teamOutsFolder.parent;
   docName = docFile.name.replace(/\.[^\.]+$/, "");
  }
  if (!rootFolder || !league) {
   return JSON.stringify({
    success: false,
    error: "Could not determine root folder or league"
   });
  }
  var graphicsFolder = new Folder(rootFolder.fsName + "/02 GRAPHICS");
  if (!graphicsFolder.exists) {
   return JSON.stringify({
    success: true,
    folderExists: false,
    graphicsFileExists: false
   });
  }
  var leagueGraphicsFolder = new Folder(graphicsFolder.fsName + "/" + league);
  if (!leagueGraphicsFolder.exists) {
   return JSON.stringify({
    success: true,
    folderExists: false,
    graphicsFileExists: false
   });
  }
  var graphicTypeFolder = new Folder(leagueGraphicsFolder.fsName + "/" + graphicName);
  var folderExists = graphicTypeFolder.exists;
  if (!folderExists) {
   var allFolders = leagueGraphicsFolder.getFiles();
   for (var i = 0; i < allFolders.length; i++) {
    if (allFolders[i] instanceof Folder) {
     if (allFolders[i].name.toLowerCase() === graphicName.toLowerCase()) {
      folderExists = true;
      graphicTypeFolder = allFolders[i];
      break;
     }
    }
   }
  }
  // Only consider graphics file existing if THIS version doc's export exists: 02 GRAPHICS/LEAGUE/[GRAPHIC_NAME]/AI/[docName]_GRAPHICS_[graphicName].ai
  var graphicsFileExists = false;
  if (folderExists && docName) {
   var aiSubfolder = new Folder(graphicTypeFolder.fsName + "/AI");
   if (aiSubfolder.exists) {
    var expectedFileName = docName + "_GRAPHICS_" + graphicName + ".ai";
    var expectedFile = new File(aiSubfolder.fsName + "/" + expectedFileName);
    graphicsFileExists = expectedFile.exists;
   }
  }
  return JSON.stringify({
   success: true,
   folderExists: folderExists,
   graphicsFileExists: graphicsFileExists
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleGetProfileCodeFromName(params_string) {
 try {
  var params = JSON.parse(params_string);
  var profileName = params.profileName;
  var distress = params.distress;
  if (!profileName) {
   return JSON.stringify({
    success: false,
    error: "Profile name is required"
   });
  }
  var profileCode = getProfileCodeFromName(profileName, distress);
  return JSON.stringify({
   success: true,
   profileCode: profileCode
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleRemoveSeparationData(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document"
   });
  }

  var activeDoc = app.activeDocument;
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);

  if (!xmp.isXmpCreated) {
   return JSON.stringify({
    success: false,
    error: "Failed to initialize XMP"
   });
  }

  /*
   * Report which known ColorSeparator fields were present before the wipe. The removal itself deletes
   * the ENTIRE ColorSeparator namespace node (xmp.deleteAllData), so any field not in this list is
   * still removed — this array only drives the informational "removedFields" response.
   */
  var knownFields = [
   "DocumentType",
   "SeparationProfileMetadata",
   "BodyColor",
   "SeparatedLayerNames",
   "LEAPSeparationColorsData",
   "LEAPSeparationProfileData",
   "GraphicsOrganizationData",
   "Underbase2Swatch",
   "Underbase3Swatch",
   "Underbase4Swatch",
   "UnderbaseLayerNames",
   "UnderbaseSwatchNames"
  ];
  var removedFields = [];
  for (var kf = 0; kf < knownFields.length; kf++) {
   if (xmp.doesStructFieldExist(knownFields[kf])) {
    removedFields.push(knownFields[kf]);
   }
  }

  /* Delete every property under the ColorSeparator namespace in one shot. */
  var removedAny = xmp.deleteAllData(false);

  if (removedAny) {
   xmp.commit();

   if (activeDoc.fullName && activeDoc.fullName.fsName) {
    try {
     activeDoc.save();
    } catch (saveError) {
    }
   }

   return JSON.stringify({
    success: true,
    message: "Separation data removed successfully",
    removedFields: removedFields
   });
  } else {
   return JSON.stringify({
    success: true,
    message: "No separation data found to remove",
    removedFields: []
   });
  }

 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleLoadSeparationPaths(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: true,
    separationPaths: {},
    separationEntries: []
   });
  }
  var versionDoc = null;
  var activeDoc = app.activeDocument;
  if (activeDoc && activeDoc.fullName && activeDoc.fullName.fsName) {
   var activeDocPath = activeDoc.fullName.fsName;
   var isSeparatedDoc = activeDocPath.indexOf("09 SEPARATIONS") !== -1;
   var isVersionDoc = activeDocPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
   if (isVersionDoc) {
    versionDoc = activeDoc;
   }
  }
  if (!versionDoc) {
   for (var d = 0; d < app.documents.length; d++) {
    var doc = app.documents[d];
    if (doc && doc.fullName && doc.fullName.fsName) {
     var docPath = doc.fullName.fsName;
     var isSeparatedDoc = docPath.indexOf("09 SEPARATIONS") !== -1;
     var isVersionDoc = docPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
     if (isVersionDoc) {
      versionDoc = doc;
      break;
     }
    }
   }
  }
  if (!versionDoc) {
   return JSON.stringify({
    success: false,
    separationPaths: {},
    separationEntries: [],
    error: "No version document found"
   });
  }
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", versionDoc);
  if (!xmp.isXmpCreated) {
   return JSON.stringify({
    success: false,
    separationPaths: {},
    separationEntries: [],
    error: "XMP not created"
   });
  }
  var loadPathsDebug = [];
  loadPathsDebug.push("Version doc path: " + (versionDoc && versionDoc.fullName ? versionDoc.fullName.fsName : "null"));
  loadPathsDebug.push("XMP created: " + xmp.isXmpCreated);
  var separationPaths = {};
  var separationEntries = [];
  var fieldExists = xmp.doesStructFieldExist("LEAPSeparationProfileData");
  loadPathsDebug.push("LEAPSeparationProfileData field exists: " + fieldExists);
  if (fieldExists) {
   try {
    var separations = xmp.getStructField("LEAPSeparationProfileData", true);
    loadPathsDebug.push("Separations data type: " + typeof separations);
    loadPathsDebug.push("Is array: " + Array.isArray(separations));
    if (separations) {
     loadPathsDebug.push("Separations length: " + (Array.isArray(separations) ? separations.length : "not array"));
    }
    if (Array.isArray(separations)) {
     for (var i = 0; i < separations.length; i++) {
      var separation = separations[i];
      loadPathsDebug.push("Separation " + i + ": " + JSON.stringify(separation));
      var profileName = null;
      if (separation && separation.profileMetadata && separation.profileMetadata.profileName) {
       profileName = separation.profileMetadata.profileName;
      }
      loadPathsDebug.push("Profile name: " + profileName);
      if (separation && separation.graphicName && separation.separatedDocumentPath) {
       var key = separation.graphicName;
       if (profileName) {
        key = separation.graphicName + "_" + profileName;
       }
       loadPathsDebug.push("Adding path with key: " + key + ", path: " + separation.separatedDocumentPath);
       separationPaths[key] = separation.separatedDocumentPath;
      } else {
       loadPathsDebug.push("Separation missing required fields - graphicName: " + (separation ? separation.graphicName : "null") + ", separatedDocumentPath: " + (separation ? separation.separatedDocumentPath : "null"));
      }

      var styleCodes = [];
      if (
       separation &&
       separation.profileMetadata &&
       separation.profileMetadata.styleCodes &&
       separation.profileMetadata.styleCodes instanceof Array
      ) {
       styleCodes = separation.profileMetadata.styleCodes;
      }
      if (separation && separation.graphicName && profileName) {
       separationEntries.push({
        graphicName: separation.graphicName,
        profileName: profileName,
        styleCodes: styleCodes,
        separatedDocumentPath: separation.separatedDocumentPath || ""
       });
      }
     }
     loadPathsDebug.push("Total paths loaded: " + Object.keys(separationPaths).length);
    } else {
     loadPathsDebug.push("Separations is not an array or is null/undefined");
    }
   } catch (e) {
    loadPathsDebug.push("Error processing separations: " + e.message);
    separationPaths = {};
   }
  } else {
   loadPathsDebug.push("LEAPSeparationProfileData field does not exist in XMP");
  }
  var debugInfo = {
   versionDocFound: versionDoc ? true : false,
   versionDocPath: versionDoc && versionDoc.fullName ? versionDoc.fullName.fsName : null,
   xmpCreated: xmp.isXmpCreated,
   fieldExists: xmp.doesStructFieldExist("LEAPSeparationProfileData"),
   pathsCount: Object.keys(separationPaths).length,
   pathsKeys: Object.keys(separationPaths),
   loadPathsDebug: loadPathsDebug
  };
  try {
   return JSON.stringify({
    success: true,
    separationPaths: separationPaths,
    separationEntries: separationEntries,
    debug: debugInfo
   });
  } catch (jsonError) {
   return JSON.stringify({
    success: false,
    separationPaths: {},
    separationEntries: [],
    error: "Failed to serialize response: " + jsonError.message
   });
  }
 } catch (e) {
  return JSON.stringify({
   success: false,
   separationPaths: {},
   separationEntries: [],
   error: e.message || e.toString()
  });
 }
}
function handleOpenSeparationDocument(params_string) {
 try {
  var params = JSON.parse(params_string);
  var filePath = params.filePath;
  if (!filePath) {
   return JSON.stringify({
    success: false,
    error: "File path is required"
   });
  }
  var sepFile = new File(filePath);
  if (!sepFile.exists) {
   return JSON.stringify({
    success: false,
    error: "Separation document not found: " + filePath
   });
  }
  app.open(sepFile);
  return JSON.stringify({
   success: true,
   message: "Separation document opened successfully"
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}


function leapProfileNameFromSeparationEntry(separation) {
 if (separation && separation.profileMetadata && separation.profileMetadata.profileName) {
  return String(separation.profileMetadata.profileName);
 }
 return "";
}

function handleDeleteSeparationFile(params_string) {
 try {
  var params = JSON.parse(params_string);
  var graphicName = params.graphicName;
  var profileName = params.profileName ? String(params.profileName) : "";
  var filePath = params.filePath ? String(params.filePath) : "";

  var versionDoc = app.activeDocument;
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", versionDoc);
  if (!xmp.isXmpCreated) {
   return JSON.stringify({
    success: false,
    error: "Failed to initialize XMP on version document"
   });
  }

  if (!xmp.doesStructFieldExist("LEAPSeparationProfileData")) {
   return JSON.stringify({
    success: false,
    error: "LEAPSeparationProfileData not found in XMP"
   });
  }

  var separations = xmp.getStructField("LEAPSeparationProfileData", true);
  if (!Array.isArray(separations)) {
   return JSON.stringify({
    success: false,
    error: "LEAPSeparationProfileData is not an array"
   });
  }

  var idx = -1;
  for (var i = 0; i < separations.length; i++) {
   var sep = separations[i];
   var g = sep && sep.graphicName ? String(sep.graphicName) : "";
   var pn = leapProfileNameFromSeparationEntry(sep);
   if (g === String(graphicName) && pn === profileName) {
    idx = i;
    break;
   }
  }

  if (idx < 0) {
   return JSON.stringify({
    success: false,
    error: "No matching separation entry for graphic and profile"
   });
  }

  var entry = separations[idx];
  var pathToRemove = filePath;
  var _separtionFile = File(entry.separatedDocumentPath);
  if (_separtionFile.exists) {
   try {
    _separtionFile.remove();
   } catch (removeErr) {
    return JSON.stringify({
     success: false,
     error: "Could not delete file: " + (removeErr.message || removeErr.toString())
    });
   }
  }

  var newEntry = {
   graphicName: entry.graphicName,
   profileMetadata: entry.profileMetadata ? entry.profileMetadata : null
  };

  separations[idx] = newEntry;
  xmp.setStructField("LEAPSeparationProfileData", separations, true, false);
  xmp.commit();
  if (versionDoc.fullName && versionDoc.fullName.fsName) {
   try {
    versionDoc.save();
   } catch (saveError) {
   }
  }

  return JSON.stringify({
   success: true,
   message: "Separation file removed and XMP path cleared"
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

function handleUpdateSeparationProfileDataEntry(params_string) {
 try {
  var params = JSON.parse(params_string);
  var graphicName = params.graphicName ? String(params.graphicName) : "";
  var matchProfileName = params.matchProfileName != null ? String(params.matchProfileName) : "";
  var newProfileName = params.profileName != null ? String(params.profileName) : "";
  var styleCodes = params.styleCodes && params.styleCodes instanceof Array ? params.styleCodes : [];
  var profileCode = params.profileCode != null ? params.profileCode : null;
  var duplicateAiFile = params.duplicateAiFile === true;
  var scaleEnabled = params.scaleEnabled === true;
  var scalePercent = params.scalePercent != null ? Number(params.scalePercent) : null;

  if (!graphicName) {
   return JSON.stringify({
    success: false,
    error: "graphicName is required"
   });
  }

  var versionDoc = app.activeDocument;
  if (!versionDoc) {
   return JSON.stringify({
    success: false,
    error: "No version document found"
   });
  }

  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", versionDoc);
  if (!xmp.isXmpCreated || !xmp.doesStructFieldExist("LEAPSeparationProfileData")) {
   return JSON.stringify({
    success: false,
    error: "LEAPSeparationProfileData not found"
   });
  }

  var separations = xmp.getStructField("LEAPSeparationProfileData", true);
  if (!Array.isArray(separations)) {
   return JSON.stringify({
    success: false,
    error: "LEAPSeparationProfileData is not an array"
   });
  }

  var idx = -1;
  for (var j = 0; j < separations.length; j++) {
   var sep2 = separations[j];
   var g2 = sep2 && sep2.graphicName ? String(sep2.graphicName) : "";
   var pn2 = leapProfileNameFromSeparationEntry(sep2);
   if (g2 === graphicName && pn2 === matchProfileName) {
    idx = j;
    break;
   }
  }

  if (idx < 0) {
   return JSON.stringify({
    success: false,
    error: "No matching separation entry for graphic and profile"
   });
  }

  var entry2 = separations[idx];
  var meta = entry2.profileMetadata ? entry2.profileMetadata : {};
  if (newProfileName) {
   meta.profileName = newProfileName;
  }
  if (profileCode != null && profileCode !== "") {
   meta.profileCode = profileCode;
  }
  meta.styleCodes = styleCodes;

  if (scaleEnabled && scalePercent != null && !isNaN(scalePercent)) {
   meta.graphicScalePercent = scalePercent;
  } else {
   try {
    delete meta.graphicScalePercent;
   } catch (delScale) {
    meta.graphicScalePercent = null;
   }
  }

  var pathOut = entry2.separatedDocumentPath ? String(entry2.separatedDocumentPath) : "";

  if (duplicateAiFile && pathOut) {
   var srcFile = new File(pathOut);
   if (!srcFile.exists) {
    return JSON.stringify({
     success: false,
     error: "Separation file not found for duplicate: " + pathOut
    });
   }
   var parentFolder = srcFile.parent;
   var base = srcFile.name.replace(/\.ai$/i, "");
   var stamp = String((new Date()).getTime());
   var destFile = new File(parentFolder.fsName + "/" + base + "_COPY_" + stamp + ".ai");
   try {
    srcFile.copy(destFile);
    if (!destFile.exists) {
     return JSON.stringify({
      success: false,
      error: "Copy failed (destination missing)"
     });
    }
    pathOut = destFile.fsName;
   } catch (copyErr) {
    return JSON.stringify({
     success: false,
     error: "Copy failed: " + (copyErr.message || copyErr.toString())
    });
   }
  }

  var updatedEntry = {
   graphicName: entry2.graphicName,
   profileMetadata: meta,
   separatedDocumentPath: pathOut
  };

  separations[idx] = updatedEntry;
  xmp.setStructField("LEAPSeparationProfileData", separations, true, false);
  xmp.commit();
  if (versionDoc.fullName && versionDoc.fullName.fsName) {
   try {
    versionDoc.save();
   } catch (saveErr2) {
   }
  }

  return JSON.stringify({
   success: true,
   separatedDocumentPath: updatedEntry.separatedDocumentPath || "",
   message: "Separation profile data updated"
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

function handleAddSeparationProfileDataEntry(params_string) {
 try {
  var params = JSON.parse(params_string);
  var graphicName = params.graphicName ? String(params.graphicName) : "";
  var profileName = params.profileName ? String(params.profileName) : "";
  var profileCode = params.profileCode != null ? String(params.profileCode) : "";
  var styleCodes = params.styleCodes && params.styleCodes instanceof Array ? params.styleCodes : [];

  if (!graphicName || !profileName || !styleCodes.length) {
   return JSON.stringify({ success: false, error: "graphicName, profileName and styleCodes are required" });
  }

  function normalizeCodes(list) {
   var out = [];
   var seen = {};
   for (var i = 0; i < list.length; i++) {
    var code = list[i] != null ? String(list[i]).replace(/^\s+|\s+$/g, "") : "";
    if (!code) continue;
    if (!seen[code]) {
     seen[code] = true;
     out.push(code);
    }
   }
   out.sort();
   return out;
  }

  function findVersionDocument() {
   var versionDoc = null;
   if (app.documents.length > 0) {
    var activeDoc = app.activeDocument;
    if (activeDoc && activeDoc.fullName && activeDoc.fullName.fsName) {
     var activeDocPath = activeDoc.fullName.fsName;
     var isSeparatedDoc = activeDocPath.indexOf("09 SEPARATIONS") !== -1;
     var isVersionDoc = activeDocPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
     if (isVersionDoc) versionDoc = activeDoc;
    }
   }
   if (!versionDoc) {
    for (var d = 0; d < app.documents.length; d++) {
     var doc = app.documents[d];
     if (doc && doc.fullName && doc.fullName.fsName) {
      var docPath = doc.fullName.fsName;
      var isSeparatedDoc2 = docPath.indexOf("09 SEPARATIONS") !== -1;
      var isVersionDoc2 = docPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc2;
      if (isVersionDoc2) { versionDoc = doc; break; }
     }
    }
   }
   return versionDoc;
  }

  var versionDoc = findVersionDocument();
  if (!versionDoc) {
   return JSON.stringify({ success: false, error: "No version document found" });
  }

  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", versionDoc);
  if (!xmp.isXmpCreated) {
   return JSON.stringify({ success: false, error: "XMP not created on version document" });
  }

  var separations = [];
  if (xmp.doesStructFieldExist("LEAPSeparationProfileData")) {
   try {
    var existing = xmp.getStructField("LEAPSeparationProfileData", true);
    if (Array.isArray(existing)) separations = existing;
   } catch (e) {
    separations = [];
   }
  }

  var idx = -1;
  for (var j = 0; j < separations.length; j++) {
   var s = separations[j];
   var g = s && s.graphicName ? String(s.graphicName) : "";
   var p = leapProfileNameFromSeparationEntry(s);
   if (g === graphicName && p === profileName) { idx = j; break; }
  }

  var normalizedIncoming = normalizeCodes(styleCodes);
  var created = false;
  if (idx >= 0) {
   var entry = separations[idx];
   var meta = entry && entry.profileMetadata ? entry.profileMetadata : {};
   var existingCodes = meta.styleCodes && meta.styleCodes instanceof Array ? meta.styleCodes : [];
   meta.profileName = profileName;
   if (profileCode) meta.profileCode = profileCode;
   meta.styleCodes = normalizeCodes(existingCodes.concat(normalizedIncoming));
   entry.profileMetadata = meta;
   if (!entry.separatedDocumentPath) entry.separatedDocumentPath = "";
   separations[idx] = entry;
  } else {
   created = true;
   separations.push({
    graphicName: graphicName,
    profileMetadata: {
     profileName: profileName,
     profileCode: profileCode || null,
     styleCodes: normalizedIncoming
    },
    separatedDocumentPath: ""
   });
  }

  xmp.setStructField("LEAPSeparationProfileData", separations, true, false);
  xmp.commit();
  if (versionDoc.fullName && versionDoc.fullName.fsName) {
   try { versionDoc.save(); } catch (saveErr) { }
  }

  return JSON.stringify({ success: true, created: created });
 } catch (e) {
  return JSON.stringify({ success: false, error: e.message || e.toString() });
 }
}

function handleGetBodyColor(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No active document"
   });
  }
  var activeDoc = app.activeDocument;
  var docFile = new File(activeDoc.fullName);
  var docName = docFile.name.replace(/\.[^\.]+$/, '');
  var docPath = docFile.fsName;
  try {
   var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", activeDoc);
   if (xmp.isXmpCreated && xmp.doesStructFieldExist("BodyColor")) {
    try {
     var bodyColorData = xmp.getStructField("BodyColor", true);
     if (bodyColorData && bodyColorData.bodyColor) {
      return JSON.stringify({
       success: true,
       bodyColor: bodyColorData.bodyColor,
       colorName: bodyColorData.colorName || "Body",
       cmyk: bodyColorData.cmyk || null,
       rgb: bodyColorData.rgb || null,
       source: "XMP"
      });
     }
    } catch (xmpError) {
    }
   }
  } catch (xmpCheckError) {
  }
  var leagueFolder;
  if (docPath.indexOf("09 SEPARATIONS") !== -1) {
   var graphicFolder = docFile.parent;
   var teamCodeFolder = graphicFolder.parent;
   var leagueSepFolder = teamCodeFolder.parent;
   var separationsFolder = leagueSepFolder.parent;
   var rootFolder = separationsFolder.parent;
   var league = leagueSepFolder.name;
   var teamOutsFolder = new Folder(rootFolder.fsName + "/01 TEAMOUTS");
   leagueFolder = new Folder(teamOutsFolder.fsName + "/" + league);
  } else {
   var aiFolder = docFile.parent;
   leagueFolder = aiFolder.parent;
  }
  var jsonData = findAndReadJSONFile(docName, leagueFolder);
  if (!jsonData) {
   return JSON.stringify({
    success: false,
    error: "JSON file not found or invalid for document: " + docName
   });
  }
  var colorsInfo = jsonData.colors_info || [];
  var bodyColorInfo = null;
  for (var i = 0; i < colorsInfo.length; i++) {
   if (colorsInfo[i].name && colorsInfo[i].name.toLowerCase() === "body") {
    bodyColorInfo = colorsInfo[i];
    break;
   }
  }
  if (!bodyColorInfo || !bodyColorInfo.colorInfo) {
   return JSON.stringify({
    success: true,
    bodyColor: "#808080",
    colorName: "Body (Default)",
    cmyk: null,
    rgb: { r: 128, g: 128, b: 128 },
    source: "DEFAULT"
   });
  }
  var cmyk = bodyColorInfo.colorInfo;
  var c = cmyk.C || 0;
  var m = cmyk.M || 0;
  var y = cmyk.Y || 0;
  var k = cmyk.K || 0;
  var rgb = cmykToRgb(c, m, y, k);
  var hexColor = rgbToHex(rgb.r, rgb.g, rgb.b);
  var result = {
   success: true,
   bodyColor: hexColor,
   colorName: bodyColorInfo.ColorName || bodyColorInfo.name || "Body",
   cmyk: {
    c: c,
    m: m,
    y: y,
    k: k
   },
   rgb: rgb,
   source: "JSON"
  };
  return JSON.stringify(result);
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
function handleSwitchToVersionDocument(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({
    success: false,
    error: "No documents open"
   });
  }
  var versionDoc = null;
  var activeDoc = app.activeDocument;
  if (activeDoc && activeDoc.fullName && activeDoc.fullName.fsName) {
   var activeDocPath = activeDoc.fullName.fsName;
   var isSeparatedDoc = activeDocPath.indexOf("09 SEPARATIONS") !== -1;
   var isVersionDoc = activeDocPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
   if (isVersionDoc) {
    return JSON.stringify({
     success: true,
     message: "Already on version document",
     switched: false
    });
   }
  }
  for (var d = 0; d < app.documents.length; d++) {
   var doc = app.documents[d];
   if (doc && doc.fullName && doc.fullName.fsName) {
    var docPath = doc.fullName.fsName;
    var isSeparatedDoc = docPath.indexOf("09 SEPARATIONS") !== -1;
    var isVersionDoc = docPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
    if (isVersionDoc) {
     versionDoc = doc;
     break;
    }
   }
  }
  if (versionDoc) {
   try {
    app.activeDocument = versionDoc;
    return JSON.stringify({
     success: true,
     message: "Switched to version document",
     switched: true
    });
   } catch (e) {
    return JSON.stringify({
     success: false,
     error: "Error switching to version document: " + e.message
    });
   }
  } else {
   return JSON.stringify({
    success: false,
    error: "No version document found in open documents"
   });
  }
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: "Error switching to version document: " + e.message
  });
 }
}

function handleDeleteAllPlatesInSeparationDocument(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({ success: false, error: "No documents open" });
  }
  var doc = app.activeDocument;
  if (!isActiveSeparationDocument(doc)) {
   return JSON.stringify({
    success: false,
    error: "Active document is not a separation document."
   });
  }
  var sepLayer;
  try {
   sepLayer = doc.layers.getByName("SEPARATED_ART");
   sepLayer.visible = true;
   sepLayer.locked = false;
  } catch (e) {
   return JSON.stringify({
    success: false,
    error: "SEPARATED_ART layer not found"
   });
  }
  var count = 0;
  var n = sepLayer.layers.length;
  for (var i = n - 1; i >= 0; i--) {
   sepLayer.layers[i].visible = true;
   sepLayer.layers[i].locked = false;
   sepLayer.layers[i].remove();
   count++;
  }

  // Clear XMP plate/color data so the UI refreshes to show no plates
  try {
   var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
   if (sepXmp.isXmpCreated) {
    sepXmp.setStructField("SeparatedLayerNames", [], true, false);
    sepXmp.setStructField("LEAPSeparationColorsData", [], true, false);
    sepXmp.commit();
   }
  } catch (xmpErr) { }

  try { doc.save(); } catch (e) { }
  return JSON.stringify({
   success: true,
   message: "Deleted " + count + " plate(s)",
   deletedCount: count
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}

function handleDeleteUbChokeBlockerArtInSeparationDocument(params_string) {
 try {
  if (!app.documents.length) {
   return JSON.stringify({ success: false, error: "No documents open" });
  }
  var doc = app.activeDocument;
  if (!isActiveSeparationDocument(doc)) {
   return JSON.stringify({
    success: false,
    error: "Active document is not a separation document."
   });
  }
  var sepLayer;
  try {
   sepLayer = doc.layers.getByName("SEPARATED_ART");
   sepLayer.visible = true;
   sepLayer.locked = false;
  } catch (e) {
   return JSON.stringify({ success: false, error: "SEPARATED_ART layer not found" });
  }

  function trimStr(s) {
   return String(s || "").replace(/^\s+|\s+$/g, "");
  }
  function normalizeLayerNameLocal(name) {
   return String(name || "").replace(/\s+/g, " ").replace(/^\s+|\s+$/g, "").toLowerCase();
  }
  function isUbChokeBlockerLayerName(layerName) {
   if (!layerName) return false;
   var n = trimStr(layerName);
   if (n === "__TEMP_WHITE_UB") return true;
   var norm = normalizeLayerNameLocal(layerName);
   if (norm === "choke") return true;
   if (norm === "blocker" || /^blocker \d+$/.test(norm)) return true;
   return isWhiteUbLayerName(layerName);
  }
  function isUbChokeBlockerColorName(name, profileMetadata, doc) {
   if (!name) return false;
   if (isUbChokeBlockerLayerName(name)) return true;
   var lower = trimStr(name).toLowerCase();
   if (lower.indexOf("white ub") !== -1 || lower.indexOf("whiteub") !== -1) return true;
   if (lower === "sl white ub") return true;
   if (lower === "choke") return true;
   try {
    if (profileMetadata && doc) {
     profileMetadata = enrichProfileMetadataWithGraphicsUnderbaseSwatches(profileMetadata, doc);
     var indices = getEnabledUnderbaseIndices(profileMetadata);
     for (var pi = 0; pi < indices.length; pi++) {
      var sw = getGraphicsUnderbaseSwatchNameForIndex(profileMetadata, doc, indices[pi]);
      if (sw && normalizeLayerNameLocal(sw) === normalizeLayerNameLocal(name)) return true;
     }
     if (profileMetadata.underbaseSwatch &&
      normalizeLayerNameLocal(profileMetadata.underbaseSwatch) === normalizeLayerNameLocal(name)) {
      return true;
     }
    }
   } catch (profErr) { }
   return false;
  }
  function isUbChokeBlockerXmpEntry(entry, profileMetadata, doc) {
   if (!entry) return false;
   if (isUbChokeBlockerColorName(entry.colorName, profileMetadata, doc)) return true;
   if (isUbChokeBlockerColorName(entry.swatchName, profileMetadata, doc)) return true;
   return false;
  }
  function layerNameMatchesCustomUnderbase(layerName, profileMetadata) {
   try {
    var names = profileMetadata && profileMetadata.underbaseNames instanceof Array ? profileMetadata.underbaseNames : [];
    var target = normalizeLayerNameLocal(layerName);
    for (var i = 0; i < names.length; i++) {
     var nm = names[i] != null ? normalizeLayerNameLocal(names[i]) : "";
     if (nm && nm === target) return true;
    }
   } catch (e) { }
   return false;
  }
  function collectUbChokeBlockerLayerNames(separatedArtLayer, profileMetadata) {
   var names = [];
   var seen = {};
   if (!separatedArtLayer || !separatedArtLayer.layers) return names;
   var count = separatedArtLayer.layers.length;
   for (var i = 0; i < count; i++) {
    try {
     var layer = separatedArtLayer.layers[i];
     if (!layer) continue;
     var layerName = trimStr(layer.name);
     if (!layerName) continue;
     /* Standard White UB N / Choke / Blocker OR a custom-named underbase pass (profile underbaseNames). */
     if (!isUbChokeBlockerLayerName(layerName) && !layerNameMatchesCustomUnderbase(layerName, profileMetadata)) continue;
     var key = normalizeLayerNameLocal(layerName);
     if (seen[key]) continue;
     seen[key] = true;
     names.push(layerName);
    } catch (collectErr) { }
   }
   return names;
  }
  function removeSubLayerByName(parentLayer, layerName) {
   var layer = parentLayer.layers.getByName(layerName);
   layer.visible = true;
   layer.locked = false;
   unlockLayerContentsForSelection(layer);
   try { app.selection = null; } catch (selErr) { }
   layer.remove();
  }

  try { app.selection = null; } catch (selClearErr) { }

  var profileMetadata = null;
  try {
   var metaXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
   if (metaXmp.isXmpCreated && metaXmp.doesStructFieldExist("SeparationProfileMetadata")) {
    profileMetadata = metaXmp.getStructField("SeparationProfileMetadata", true);
   }
  } catch (metaLoadErr) { }

  var namesToRemove = collectUbChokeBlockerLayerNames(sepLayer, profileMetadata);
  var deletedLayers = [];
  var failedLayers = [];
  for (var ri = 0; ri < namesToRemove.length; ri++) {
   var targetName = namesToRemove[ri];
   try {
    removeSubLayerByName(sepLayer, targetName);
    deletedLayers.push(targetName);
   } catch (rmErr) {
    failedLayers.push(targetName + ": " + (rmErr.message || rmErr.toString()));
   }
  }

  var xmpUpdated = [];
  var removedFromLayerNames = 0;
  var removedFromColorsData = 0;
  try {
   var sepXmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
   if (sepXmp.isXmpCreated) {
    var liveLayerNames = getSeparatedArtLayerNames(doc);
    sepXmp.setStructField("SeparatedLayerNames", liveLayerNames, true, false);
    xmpUpdated.push("SeparatedLayerNames");
    removedFromLayerNames = namesToRemove.length;

    if (sepXmp.doesStructFieldExist("LEAPSeparationColorsData")) {
     var colorsData = sepXmp.getStructField("LEAPSeparationColorsData", true);
     if (Array.isArray(colorsData)) {
      var filteredColors = [];
      for (var ci = 0; ci < colorsData.length; ci++) {
       var entry = colorsData[ci];
       if (isUbChokeBlockerXmpEntry(entry, profileMetadata, doc)) {
        removedFromColorsData++;
       } else {
        filteredColors.push(entry);
       }
      }
      sepXmp.setStructField("LEAPSeparationColorsData", filteredColors, true, false);
      xmpUpdated.push("LEAPSeparationColorsData");
     }
    }
    if (sepXmp.hasPendingChanges) {
     sepXmp.commit();
    }
   }
  } catch (xmpErr) { }

  try { doc.save(); } catch (saveErr) { }

  if (deletedLayers.length === 0 && namesToRemove.length > 0 && failedLayers.length > 0) {
   return JSON.stringify({
    success: false,
    error: "Could not remove UB/Choke/Blocker layer(s): " + failedLayers.join("; "),
    failedLayers: failedLayers,
    namesToRemove: namesToRemove
   });
  }

  return JSON.stringify({
   success: true,
   message: "Deleted " + deletedLayers.length + " UB/Choke/Blocker plate layer(s). Swatches were not deleted; XMP updated.",
   deletedLayers: deletedLayers,
   deletedLayerCount: deletedLayers.length,
   failedLayers: failedLayers,
   xmpUpdated: xmpUpdated,
   removedFromLayerNames: removedFromLayerNames,
   removedFromColorsData: removedFromColorsData
  });
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}
