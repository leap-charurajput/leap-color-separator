#include "./constants.jsx"

/** Append one line to ~/Documents/LEAP Settings/Logs/leap_seps.log */
function appendLeapSepLog(message) {
 try {
  var logFolder = new Folder(Folder.myDocuments.fsName + "/LEAP Settings/Logs");
  if (!logFolder.exists) {
   logFolder.create();
  }
  var logFile = new File(logFolder.fsName + "/leap_seps.log");
  logFile.encoding = "UTF-8";
  if (logFile.open("a")) {
   logFile.writeln("[" + new Date().toISOString() + "] [JSX] " + message);
   logFile.close();
  }
 } catch (e) {}
}

function cmykToRgb(c, m, y, k) {
 c = c / 100;
 m = m / 100;
 y = y / 100;
 k = k / 100;

 var r = 255 * (1 - c) * (1 - k);
 var g = 255 * (1 - m) * (1 - k);
 var b = 255 * (1 - y) * (1 - k);

 return {
  r: Math.round(r),
  g: Math.round(g),
  b: Math.round(b)
 };
}

function rgbToHex(r, g, b) {
 var toHex = function (n) {
  var hex = Math.round(n).toString(16);
  return hex.length === 1 ? "0" + hex : hex;
 };
 return "#" + toHex(r) + toHex(g) + toHex(b);
}

function getColorHex(color) {
 if (color.typename === CONSTANTS.COLOR_TYPES.SPOT) {
  return getColorHex(color.spot.color);
 } else if (color.typename === CONSTANTS.COLOR_TYPES.CMYK) {
  var rgb = cmykToRgb(color.cyan, color.magenta, color.yellow, color.black);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
 } else if (color.typename === CONSTANTS.COLOR_TYPES.RGB) {
  return rgbToHex(color.red, color.green, color.blue);
 } else if (color.typename === CONSTANTS.COLOR_TYPES.GRAY) {
  var gray = Math.round((100 - color.gray) * 2.55);
  return rgbToHex(gray, gray, gray);
 }
 return "#808080";
}

function getColorName(color) {
 if (color.typename === CONSTANTS.COLOR_TYPES.SPOT) {
  return color.spot.name;
 } else if (color.typename === CONSTANTS.COLOR_TYPES.CMYK) {
  return CONSTANTS.COLOR_PREFIXES.CMYK +
   Math.round(color.cyan) + "_" +
   Math.round(color.magenta) + "_" +
   Math.round(color.yellow) + "_" +
   Math.round(color.black);
 } else if (color.typename === CONSTANTS.COLOR_TYPES.RGB) {
  return CONSTANTS.COLOR_PREFIXES.RGB +
   Math.round(color.red) + "_" +
   Math.round(color.green) + "_" +
   Math.round(color.blue);
 } else if (color.typename === CONSTANTS.COLOR_TYPES.GRAY) {
  return CONSTANTS.COLOR_PREFIXES.GRAY + Math.round(color.gray);
 }
 return CONSTANTS.COLOR_PREFIXES.UNKNOWN;
}

function collectItemsByColor(item, colorGroups) {
 if (item.typename === "CompoundPathItem") {
  if (item.pathItems && item.pathItems.length > 0 &&
   item.pathItems[0].filled && item.pathItems[0].fillColor) {
   var colorName = getColorName(item.pathItems[0].fillColor);

   if (!colorGroups[colorName]) {
    colorGroups[colorName] = [];
   }
   colorGroups[colorName].push(item);
  }
  return;
 }

 if (item.typename === "PathItem" && item.filled && item.fillColor) {
  var colorName = getColorName(item.fillColor);

  if (!colorGroups[colorName]) {
   colorGroups[colorName] = [];
  }
  colorGroups[colorName].push(item);
  return;
 }

 if (item.pageItems && item.pageItems.length > 0) {
  for (var j = 0; j < item.pageItems.length; j++) {
   collectItemsByColor(item.pageItems[j], colorGroups);
  }
 }
}

function isWhiteUbSeparationPlateName(name) {
 return /^white\s*ub(\s+\d+)?$/i.test(String(name || ""));
}

function isWhiteInkSwatchName(name) {
 var n = String(name || "").replace(/^\s+|\s+$/g, "");
 if (!n || n.toLowerCase().indexOf("white") === -1) {
  return false;
 }
 return !isWhiteUbSeparationPlateName(n);
}

function addSpotFillNameFromColor(color, nameLookup) {
 if (!color || !nameLookup) {
  return;
 }
 if (color.typename === CONSTANTS.COLOR_TYPES.SPOT && color.spot && color.spot.name) {
  var spotName = String(color.spot.name).replace(/^\s+|\s+$/g, "");
  if (spotName && isWhiteInkSwatchName(spotName)) {
   nameLookup[spotName.toUpperCase()] = spotName;
  }
 }
}

function collectWhiteSpotNamesFromContainer(container, nameLookup) {
 if (!container || !nameLookup) {
  return;
 }
 try {
  if (container.typename === "PathItem" && container.filled && container.fillColor) {
   addSpotFillNameFromColor(container.fillColor, nameLookup);
   return;
  }
  if (container.typename === "CompoundPathItem" && container.pathItems && container.pathItems.length > 0) {
   var firstPath = container.pathItems[0];
   if (firstPath && firstPath.filled && firstPath.fillColor) {
    addSpotFillNameFromColor(firstPath.fillColor, nameLookup);
   }
   return;
  }
  if (container.pageItems && container.pageItems.length > 0) {
   for (var i = 0; i < container.pageItems.length; i++) {
    collectWhiteSpotNamesFromContainer(container.pageItems[i], nameLookup);
   }
  }
  if (container.layers && container.layers.length > 0) {
   for (var l = 0; l < container.layers.length; l++) {
    collectWhiteSpotNamesFromLayer(container.layers[l], nameLookup);
   }
  }
 } catch (e) { }
}

function collectWhiteSpotNamesFromLayer(layer, nameLookup) {
 if (!layer || !nameLookup) {
  return;
 }
 try {
  if (layer.pageItems && layer.pageItems.length > 0) {
   for (var i = 0; i < layer.pageItems.length; i++) {
    collectWhiteSpotNamesFromContainer(layer.pageItems[i], nameLookup);
   }
  }
  if (layer.layers && layer.layers.length > 0) {
   for (var l = 0; l < layer.layers.length; l++) {
    collectWhiteSpotNamesFromLayer(layer.layers[l], nameLookup);
   }
  }
 } catch (e) { }
}

function scanLiveArtGraphicLayers(doc, nameLookup, graphicName) {
 try {
  var liveArt = doc.layers.getByName(CONSTANTS.LAYER_NAMES.LIVE_ART);
  if (!liveArt || !liveArt.layers) {
   return;
  }
  var targetLayerName = graphicName
   ? CONSTANTS.GRAPHIC.PREFIX + String(graphicName).replace(/^\s+|\s+$/g, "")
   : "";
  for (var i = 0; i < liveArt.layers.length; i++) {
   var layer = liveArt.layers[i];
   if (!layer || !layer.name) {
    continue;
   }
   if (String(layer.name).indexOf(CONSTANTS.GRAPHIC.PREFIX) !== 0) {
    continue;
   }
   if (targetLayerName && String(layer.name) !== targetLayerName) {
    continue;
   }
   collectWhiteSpotNamesFromLayer(layer, nameLookup);
  }
 } catch (e) { }
}

function scanSizedGraphicsLayer(doc, nameLookup, graphicName) {
 try {
  var sizedArt = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
  if (!sizedArt) {
   return;
  }
  var sizedGraphics = sizedArt.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
  if (!sizedGraphics) {
   return;
  }
  if (graphicName) {
   var trimmedName = String(graphicName).replace(/^\s+|\s+$/g, "");
   if (trimmedName) {
    try {
     var graphicItem = sizedGraphics.pageItems.getByName(trimmedName);
     if (graphicItem) {
      collectWhiteSpotNamesFromContainer(graphicItem, nameLookup);
     }
    } catch (itemErr) { }
   }
   return;
  }
  collectWhiteSpotNamesFromLayer(sizedGraphics, nameLookup);
 } catch (e) { }
}

/** White spot swatch names used as fills inside LIVE_ART GRAPHIC:* layers and SIZED_GRAPHICS art. */
function getWhiteSpotNamesFromGraphicsArt(doc, graphicName) {
 var nameLookup = {};
 if (!doc) {
  return [];
 }
 var filterName = graphicName != null ? String(graphicName).replace(/^\s+|\s+$/g, "") : "";
 scanLiveArtGraphicLayers(doc, nameLookup, filterName || null);
 scanSizedGraphicsLayer(doc, nameLookup, filterName || null);
 var names = [];
 for (var key in nameLookup) {
  if (nameLookup.hasOwnProperty(key)) {
   names.push(nameLookup[key]);
  }
 }
 names.sort(function (a, b) {
  return String(a).replace(/^\s+|\s+$/g, "").toUpperCase().localeCompare(
   String(b).replace(/^\s+|\s+$/g, "").toUpperCase()
  );
 });
 return names;
}

function duplicateItemToLayer(item, targetLayer, copiedItems) {
 var newItem = item.duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
 if (copiedItems) {
  copiedItems.push(newItem);
 }
 return newItem;
}

/** Show SIZED_ART / SIZED_GRAPHICS and unlock so graphic art can be selected for splitColors / underbase. */
function showSizedLayersForProcessing(doc) {
 if (!doc) return;
 try {
  var sizedArt = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
  var layerStack = [sizedArt];
  var layerCount = 0;
  var maxLayers = 64;
  while (layerStack.length > 0 && layerCount < maxLayers) {
   var lyr = layerStack.pop();
   layerCount++;
   try {
    lyr.visible = true;
    lyr.locked = false;
   } catch (e0) { }
   try {
    if (lyr.layers && lyr.layers.length > 0) {
     for (var i = 0; i < lyr.layers.length; i++) {
      layerStack.push(lyr.layers[i]);
     }
    }
   } catch (e1) { }
  }
 } catch (e) { }
}

/** Unlock item + ancestor groups/layers only. */
function unlockPageItemForProcessing(item) {
 if (!item) return;
 var maxDepth = 64;
 var depth = 0;
 var current = item;
 while (current && depth < maxDepth) {
  try {
   if (current.locked) current.locked = false;
   if (current.hidden) current.hidden = false;
  } catch (e0) { }
  try {
   if (current.parent && current.parent.typename === "GroupItem") {
    current = current.parent;
    depth++;
   } else {
    break;
   }
  } catch (e1) {
   break;
  }
 }
 try {
  if (item.layer) {
   var layer = item.layer;
   depth = 0;
   while (layer && depth < maxDepth) {
    layer.locked = false;
    layer.visible = true;
    if (layer.parent && layer.parent.typename === "Layer") {
     layer = layer.parent;
     depth++;
    } else {
     break;
    }
   }
  }
 } catch (e2) { }
}

/** Iterative (stack) unlock of item + all descendants — required before group.selected = true. */
function unlockPageItemTreeForProcessing(rootItem) {
 if (!rootItem) return;
 var stack = [rootItem];
 var count = 0;
 var maxItems = 100000;
 while (stack.length > 0 && count < maxItems) {
  var node = stack.pop();
  count++;
  try {
   if (node.locked) node.locked = false;
   if (node.hidden) node.hidden = false;
  } catch (e0) { }
  try {
   if (node.typename === "GroupItem" && node.pageItems && node.pageItems.length > 0) {
    for (var i = node.pageItems.length - 1; i >= 0; i--) {
     stack.push(node.pageItems[i]);
    }
   }
  } catch (e1) { }
  try {
   if (node.typename === "CompoundPathItem" && node.pathItems && node.pathItems.length > 0) {
    for (var p = node.pathItems.length - 1; p >= 0; p--) {
     stack.push(node.pathItems[p]);
    }
   }
  } catch (e2) { }
 }
}

function unlockLayerContentsForSelection(layer) {
 if (!layer) return;
 var maxDepth = 64;
 var depth = 0;
 var current = layer;
 while (current && depth < maxDepth) {
  try {
   current.locked = false;
   current.visible = true;
  } catch (e0) { }
  try {
   if (current.parent && current.parent.typename === "Layer") {
    current = current.parent;
    depth++;
   } else {
    break;
   }
  } catch (e1) {
   break;
  }
 }
 try {
  if (layer.pageItems && layer.pageItems.length > 0) {
   for (var i = 0; i < layer.pageItems.length; i++) {
    unlockPageItemTreeForProcessing(layer.pageItems[i]);
   }
  }
 } catch (e2) { }
}

function unlockAllLayersInDocument(doc) {
 if (!doc || !doc.layers) return;
 var layerStack = [];
 try {
  for (var i = 0; i < doc.layers.length; i++) {
   layerStack.push(doc.layers[i]);
  }
 } catch (e0) { }
 var layerCount = 0;
 var maxLayers = 500;
 while (layerStack.length > 0 && layerCount < maxLayers) {
  var lyr = layerStack.pop();
  layerCount++;
  try {
   lyr.visible = true;
   lyr.locked = false;
  } catch (e1) { }
  try {
   if (lyr.layers && lyr.layers.length > 0) {
    for (var j = 0; j < lyr.layers.length; j++) {
     layerStack.push(lyr.layers[j]);
    }
   }
  } catch (e2) { }
 }
}

/** Show/unlock SIZED_ART subtree and every page item inside SIZED_GRAPHICS. */
function unlockSizedGraphicsContents(doc) {
 showSizedLayersForProcessing(doc);
 if (!doc) return;
 try {
  var sizedArt = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
  var sizedGraphics = sizedArt.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
  if (sizedGraphics.pageItems && sizedGraphics.pageItems.length > 0) {
   for (var i = 0; i < sizedGraphics.pageItems.length; i++) {
    unlockPageItemTreeForProcessing(sizedGraphics.pageItems[i]);
   }
  }
 } catch (e) { }
}

function prepareSizedArtGraphicForProcessing(doc, graphicItem) {
 unlockSizedGraphicsContents(doc);
 if (graphicItem) {
  unlockPageItemForProcessing(graphicItem);
  unlockPageItemTreeForProcessing(graphicItem);
 }
}

/** Choke / Blocker are not PG ink rows — exclude from [C#] ink count. */
function isNonInkSeparationLayerName(layerName) {
 if (!layerName) return true;
 var n = String(layerName).replace(/^\s+|\s+$/g, "");
 var up = n.toUpperCase();
 if (up === String(CONSTANTS.LAYER_NAMES.CHOKE).toUpperCase()) return true;
 if (up === String(CONSTANTS.LAYER_NAMES.BLOCKER).toUpperCase()) return true;
 if (/^BLOCKER(\s+\d+)?$/i.test(n)) return true;
 return false;
}

/** Count PG ink rows (matches SEP TABLE row count, not raw SEPARATED_ART sublayer count). */
function countPgInkColorsFromLayerNames(layerNames) {
 if (!layerNames || !layerNames.length) return 0;
 var count = 0;
 for (var i = 0; i < layerNames.length; i++) {
  if (!isNonInkSeparationLayerName(layerNames[i])) {
   count++;
  }
 }
 return count;
}

function expandObject() {
 try {
  app.executeMenuCommand('outline');
  app.executeMenuCommand('Live Outline Object');
  app.executeMenuCommand('Live Outline Stroke');
  app.executeMenuCommand('expandStyle');

  var actionFile = File(File($.fileName).parent + "/actions/" + CONSTANTS.ACTIONS.FILE_NAME);
  app.loadAction(actionFile);
  app.doScript(CONSTANTS.ACTIONS.EXPAND_NAME, CONSTANTS.ACTIONS.SET_NAME);
  app.unloadAction(CONSTANTS.ACTIONS.SET_NAME, '');
  pathFinderTrim();
 } catch (e) {
 }
}

function pathFinderTrim() {
 app.executeMenuCommand("group");
 app.executeMenuCommand("Live Pathfinder Trim");
 app.executeMenuCommand("expandStyle");
 app.executeMenuCommand("ungroup");
}

function loadLEAPColorSepsActions() {
 var _actionFile = File(File($.fileName).parent + "/actions/PathFinderAdd.aia");
 app.loadAction(_actionFile);
}

function unloadLEAPColorSepsActions() {
 try {
  app.unloadAction("LEAP Color Seps", "");
 } catch (e) { }
}

function pathFinderMerge() {
 app.doScript("Pathfinder_Merge", "LEAP Color Seps");
}

function pathFinderAdd() {
 app.doScript("Pathfinder_Add", "LEAP Color Seps");
}

function pathFinderDivide() {
 app.doScript("Pathfinder_Divide", "LEAP Color Seps");
}

function findLayerByName(layers, layerName) {
 for (var i = 0; i < layers.length; i++) {
  var layer = layers[i];

  if (layer.name === layerName) {
   return layer;
  }

  if (layer.layers && layer.layers.length > 0) {
   var found = findLayerByName(layer.layers, layerName);
   if (found) {
    return found;
   }
  }
 }

 return null;
}

function getOrCreateLayer(doc, layerName, parentLayer) {
 var layer;
 var layerCollection = parentLayer ? parentLayer.layers : doc.layers;

 try {
  layer = layerCollection.getByName(layerName);
 } catch (e) {
  layer = layerCollection.add();
  layer.name = layerName;
 }
 app.redraw();
 return layer;
}

function getSwatchByName(doc, swatchName) {
 try {
  return doc.swatches.getByName(swatchName);
 } catch (e) {
  return null;
 }
}

function swatchNameHasTrailingNumber(name) {
 return /\s+\d+$/.test(String(name || ""));
}

function getSwatchCmykComponentsFromColor(color) {
 if (!color) {
  return null;
 }
 var base = color;
 if (color.typename === CONSTANTS.COLOR_TYPES.SPOT && color.spot && color.spot.color) {
  base = color.spot.color;
 }
 if (base.typename === CONSTANTS.COLOR_TYPES.CMYK) {
  return {
   c: Number(base.cyan) || 0,
   m: Number(base.magenta) || 0,
   y: Number(base.yellow) || 0,
   k: Number(base.black) || 0
  };
 }
 if (base.typename === CONSTANTS.COLOR_TYPES.GRAY) {
  return { c: 0, m: 0, y: 0, k: Number(base.gray) || 0 };
 }
 return null;
}

function getSwatchCmykSum(doc, swatch) {
 if (!doc || !swatch || !swatch.color) {
  return null;
 }
 var cmyk = getSwatchCmykComponentsFromColor(swatch.color);
 if (!cmyk) {
  return null;
 }
 return cmyk.c + cmyk.m + cmyk.y + cmyk.k;
}

/**
 * Default white swatch for UB2+ layers during separation generation.
 * 1) Prefer a document swatch whose name contains "White", excluding White UB variants.
 * 2) If several match, use the sole swatch without a trailing number; otherwise the first match.
 * 3) If none match, use the swatch with the lowest C+M+Y+K total.
 */
function isWhiteUbLayerName(name) {
 return /^white\s*ub(\s+\d+)?$/i.test(String(name || ""));
}

function getWhiteUbLayerNumber(name) {
 var match = String(name || "").match(/^white\s*ub(?:\s+(\d+))?$/i);
 if (!match) {
  return -1;
 }
 return match[1] ? parseInt(match[1], 10) : 1;
}

function getUnderbaseSwatchFieldFromXmp(doc, fieldName) {
 try {
  if (!doc) return "";
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
  if (xmp.isXmpCreated && xmp.doesStructFieldExist(fieldName)) {
   var val = xmp.getStructField(fieldName, false);
   if (val != null) return String(val).replace(/^\s+|\s+$/g, "");
  }
 } catch (e) { }
 return "";
}

function getGraphicsOrganizationDataFromDoc(doc) {
 try {
  if (!doc) return [];
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
  if (xmp.isXmpCreated && xmp.doesStructFieldExist("GraphicsOrganizationData")) {
   var data = xmp.getStructField("GraphicsOrganizationData", true);
   if (data && data instanceof Array) {
    return data;
   }
  }
 } catch (e) { }
 return [];
}

function getGraphicOrganizationEntry(doc, graphicName) {
 if (!graphicName) return null;
 var name = String(graphicName).replace(/^\s+|\s+$/g, "");
 if (!name) return null;
 var data = getGraphicsOrganizationDataFromDoc(doc);
 for (var i = 0; i < data.length; i++) {
  if (data[i] && String(data[i].name || "").replace(/^\s+|\s+$/g, "") === name) {
   return data[i];
  }
 }
 return null;
}

function getGraphicUnderbase234SwatchFromOrgData(doc, graphicName) {
 var entry = getGraphicOrganizationEntry(doc, graphicName);
 if (!entry) return "";
 var raw = entry.underbase234Swatch != null
  ? String(entry.underbase234Swatch).replace(/^\s+|\s+$/g, "")
  : "";
 if (raw) return raw;
 var metaFields = ["underbase2Swatch", "underbase3Swatch", "underbase4Swatch"];
 for (var f = 0; f < metaFields.length; f++) {
  if (entry[metaFields[f]] != null) {
   raw = String(entry[metaFields[f]]).replace(/^\s+|\s+$/g, "");
   if (raw) return raw;
  }
 }
 return "";
}

function getGraphicsUnderbaseSwatchNameForIndex(profileMetadata, doc, ubIndex) {
 if (ubIndex <= 0) {
  return getProfileUnderbaseSwatchName(profileMetadata);
 }
 var metaFields = ["underbase2Swatch", "underbase3Swatch", "underbase4Swatch"];
 var xmpFields = ["Underbase2Swatch", "Underbase3Swatch", "Underbase4Swatch"];
 var idx = ubIndex > 3 ? 3 : ubIndex;
 var fieldIdx = idx - 1;
 var raw = "";
 if (profileMetadata && profileMetadata[metaFields[fieldIdx]] != null) {
  raw = String(profileMetadata[metaFields[fieldIdx]]).replace(/^\s+|\s+$/g, "");
 }
 if (!raw && profileMetadata && profileMetadata.graphicName) {
  raw = getGraphicUnderbase234SwatchFromOrgData(doc, profileMetadata.graphicName);
 }
 if (!raw) raw = getUnderbaseSwatchFieldFromXmp(doc, xmpFields[fieldIdx]);
 if (!raw && fieldIdx > 0) return getGraphicsUnderbaseSwatchNameForIndex(profileMetadata, doc, idx - 1);
 if (!raw) raw = getUnderbaseSwatchFieldFromXmp(doc, "Underbase2Swatch");
 if (!raw) return getUnderbase2SwatchName(profileMetadata, doc);
 return raw;
}

function enrichProfileMetadataWithGraphicsUnderbaseSwatches(profileMetadata, doc) {
 if (!profileMetadata) profileMetadata = {};
 var graphicName = profileMetadata.graphicName != null
  ? String(profileMetadata.graphicName).replace(/^\s+|\s+$/g, "")
  : "";
 var orgSwatch = graphicName ? getGraphicUnderbase234SwatchFromOrgData(doc, graphicName) : "";
 var pairs = [
  { meta: "underbase2Swatch", xmp: "Underbase2Swatch" },
  { meta: "underbase3Swatch", xmp: "Underbase3Swatch" },
  { meta: "underbase4Swatch", xmp: "Underbase4Swatch" }
 ];
 for (var f = 0; f < pairs.length; f++) {
  var cur = profileMetadata[pairs[f].meta];
  if (cur != null && String(cur).replace(/^\s+|\s+$/g, "") !== "") continue;
  if (orgSwatch) {
   profileMetadata[pairs[f].meta] = orgSwatch;
   continue;
  }
  var fromXmp = getUnderbaseSwatchFieldFromXmp(doc, pairs[f].xmp);
  if (fromXmp) profileMetadata[pairs[f].meta] = fromXmp;
 }
 return profileMetadata;
}

function getWhiteUbPassIndexFromLayerName(layerName) {
 var n = String(layerName || "").replace(/^\s+|\s+$/g, "");
 if (/^white\s*ub$/i.test(n)) return 0;
 var m = n.match(/^white\s*ub\s+(\d+)$/i);
 if (!m || !m[1]) return -1;
 var num = parseInt(m[1], 10);
 return isNaN(num) ? -1 : num - 1;
}

/** Underbase 2 Swatch from document XMP (Graphics tab choice). */
function getUnderbase2SwatchNameFromDocument(doc) {
 var name = "";
 try {
  if (!doc) return "";
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", doc);
  if (xmp.isXmpCreated && xmp.doesStructFieldExist("SeparationProfileMetadata")) {
   var profileMeta = xmp.getStructField("SeparationProfileMetadata", true);
   if (profileMeta && profileMeta.underbase2Swatch != null) {
    name = String(profileMeta.underbase2Swatch).replace(/^\s+|\s+$/g, "");
   }
  }
  if (!name && xmp.isXmpCreated && xmp.doesStructFieldExist("Underbase2Swatch")) {
   var ub2Val = xmp.getStructField("Underbase2Swatch", false);
   if (ub2Val != null) {
    name = String(ub2Val).replace(/^\s+|\s+$/g, "");
   }
  }
 } catch (e) { }
 return name;
}

function getFirstFillColorFromContainer(container) {
 if (!container) {
  return null;
 }
 try {
  if (container.typename === "PathItem" && container.filled && container.fillColor) {
   return container.fillColor;
  }
  if (container.typename === "CompoundPathItem" && container.pathItems && container.pathItems.length > 0) {
   var firstPath = container.pathItems[0];
   if (firstPath && firstPath.filled && firstPath.fillColor) {
    return firstPath.fillColor;
   }
  }
  if (container.pageItems && container.pageItems.length > 0) {
   for (var i = 0; i < container.pageItems.length; i++) {
    var found = getFirstFillColorFromContainer(container.pageItems[i]);
    if (found) {
     return found;
    }
   }
  }
  if (container.layers && container.layers.length > 0) {
   for (var l = 0; l < container.layers.length; l++) {
    var layerFill = getFirstFillColorFromContainer(container.layers[l]);
    if (layerFill) {
     return layerFill;
    }
   }
  }
 } catch (e) { }
 return null;
}

function getFirstFillColorFromSeparatedArtSublayer(doc, layerName) {
 try {
  var separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
  if (!separatedArtLayer || !separatedArtLayer.layers) {
   return null;
  }
  var targetLayer = null;
  for (var i = 0; i < separatedArtLayer.layers.length; i++) {
   if (String(separatedArtLayer.layers[i].name) === String(layerName)) {
    targetLayer = separatedArtLayer.layers[i];
    break;
   }
  }
  if (!targetLayer) {
   return null;
  }
  return getFirstFillColorFromContainer(targetLayer);
 } catch (e) {
  return null;
 }
}

function buildSwatchDataFromColor(swatchName, color) {
 var swatchData = {
  name: swatchName,
  hex: "#808080",
  cmyk: null,
  rgb: null,
  fillSwatchName: null
 };
 if (!color) {
  return swatchData;
 }

 swatchData.hex = getColorHex(color);
 swatchData.fillSwatchName = getColorName(color);

 if (color.typename === CONSTANTS.COLOR_TYPES.SPOT) {
  var spotColor = color.spot.color;
  if (spotColor.typename === CONSTANTS.COLOR_TYPES.CMYK) {
   swatchData.cmyk = {
    c: Math.round(spotColor.cyan),
    m: Math.round(spotColor.magenta),
    y: Math.round(spotColor.yellow),
    k: Math.round(spotColor.black)
   };
  }
 } else if (color.typename === CONSTANTS.COLOR_TYPES.CMYK) {
  swatchData.cmyk = {
   c: Math.round(color.cyan),
   m: Math.round(color.magenta),
   y: Math.round(color.yellow),
   k: Math.round(color.black)
  };
 }

 if (color.typename === CONSTANTS.COLOR_TYPES.RGB) {
  swatchData.rgb = {
   r: Math.round(color.red),
   g: Math.round(color.green),
   b: Math.round(color.blue)
  };
 } else if (swatchData.cmyk) {
  swatchData.rgb = cmykToRgb(
   swatchData.cmyk.c,
   swatchData.cmyk.m,
   swatchData.cmyk.y,
   swatchData.cmyk.k
  );
 }

 return swatchData;
}

function buildSwatchDataFromDocumentSwatch(doc, swatchName) {
 var swatch = getSwatchByName(doc, swatchName);
 if (swatch && swatch.color) {
  return buildSwatchDataFromColor(swatchName, swatch.color);
 }
 return null;
}

/**
 * Resolve swatch display data for a SEPARATED_ART layer name.
 * For White UB 2+, prefers the actual layer fill swatch (e.g. PANTONE White C).
 */
function resolveLayerSwatchData(doc, layerName) {
 var name = String(layerName || "");

 if (isWhiteUbLayerName(name) && getWhiteUbLayerNumber(name) >= 2) {
  var ubFillColor = getFirstFillColorFromSeparatedArtSublayer(doc, name);
  if (ubFillColor) {
   return buildSwatchDataFromColor(name, ubFillColor);
  }
  var ub2FromMeta = getUnderbase2SwatchNameFromDocument(doc);
  if (ub2FromMeta) {
   var ub2SwatchData = buildSwatchDataFromDocumentSwatch(doc, ub2FromMeta);
   if (ub2SwatchData && (ub2SwatchData.cmyk !== null || ub2SwatchData.rgb !== null)) {
    ub2SwatchData.name = name;
    return ub2SwatchData;
   }
  }
  var defaultWhiteName = getDefaultUnderbaseWhiteSwatchName(doc);
  var defaultSwatchData = buildSwatchDataFromDocumentSwatch(doc, defaultWhiteName);
  if (defaultSwatchData) {
   defaultSwatchData.name = name;
   return defaultSwatchData;
  }
 }

 var swatchData = buildSwatchDataFromDocumentSwatch(doc, name);
 if (swatchData && (swatchData.cmyk !== null || swatchData.rgb !== null)) {
  return swatchData;
 }

 var fillColor = getFirstFillColorFromSeparatedArtSublayer(doc, name);
 if (fillColor) {
  return buildSwatchDataFromColor(name, fillColor);
 }

 if (swatchData) {
  return swatchData;
 }

 return buildSwatchDataFromColor(name, null);
}

function getDefaultUnderbaseWhiteSwatchName(doc) {
 var fallback = CONSTANTS.SWATCH_NAMES.WHITE_UB;
 try {
  if (!doc || !doc.swatches || doc.swatches.length === 0) {
   return fallback;
  }

  var whiteSwatches = [];
  for (var i = 0; i < doc.swatches.length; i++) {
   var swatch = doc.swatches[i];
   if (!swatch || !swatch.name || !swatch.color) {
    continue;
   }
   var name = String(swatch.name);
   var isWhiteUbVariant = /^white\s*ub(\s*\d+)?$/i.test(name);
   if (name.charAt(0) === "[") {
    continue;
   }
   if (isWhiteUbVariant) {
    continue;
   }
   if (name.toLowerCase().indexOf("white") === -1) {
    continue;
   }
   whiteSwatches.push(swatch);
  }

  if (whiteSwatches.length === 1) {
   return whiteSwatches[0].name;
  }
  if (whiteSwatches.length > 1) {
   var withoutTrailingNumber = [];
   for (var w = 0; w < whiteSwatches.length; w++) {
    if (!swatchNameHasTrailingNumber(whiteSwatches[w].name)) {
     withoutTrailingNumber.push(whiteSwatches[w]);
    }
   }
   if (withoutTrailingNumber.length === 1) {
    return withoutTrailingNumber[0].name;
   }
   return whiteSwatches[0].name;
  }

  var lowestSum = null;
  var lowestName = null;
  for (var s = 0; s < doc.swatches.length; s++) {
   var candidate = doc.swatches[s];
   if (!candidate || !candidate.name || !candidate.color) {
    continue;
   }
   var candidateName = String(candidate.name);
   if (candidateName.charAt(0) === "[") {
    continue;
   }
   var sum = getSwatchCmykSum(doc, candidate);
   if (sum === null) {
    continue;
   }
   if (lowestSum === null || sum < lowestSum) {
    lowestSum = sum;
    lowestName = candidateName;
   }
  }

  if (lowestName && getSwatchByName(doc, lowestName)) {
   return lowestName;
  }
 } catch (e) { }
 return fallback;
}

function applySwatchToFill(doc, swatchName) {
 var swatch = getSwatchByName(doc, swatchName);
 if (swatch) {
  doc.defaultFilled = true;
  doc.defaultFillColor = swatch.color;
  return true;
 }
 return false;
}

function applyStroke(doc, swatchName, strokeWidth) {
 var swatch = getSwatchByName(doc, swatchName);
 if (swatch) {
  doc.defaultStroked = true;
  doc.defaultStrokeColor = swatch.color;
  doc.defaultStrokeWidth = strokeWidth || CONSTANTS.STYLES.DEFAULT_STROKE_WIDTH;
  return true;
 }
 return false;
}

function getGeneralSettingsFromDisk() {
 try {
  var documentsFolder = Folder.myDocuments || new Folder("~/Documents");
  var settingsPath = documentsFolder.fsName + "/LEAP Settings/LEAP_Seps/general_settings.json";
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
  return parsed || null;
 } catch (e) {
  return null;
 }
}

/** Choke stroke swatch from general_settings.json, or GARMENT if unset, blank, or not in doc. */
function getChokeStrokeSwatchNameForDocument(doc) {
 var fallback = CONSTANTS.SWATCH_NAMES.GARMENT;
 var gen = getGeneralSettingsFromDisk();
 if (!gen) {
  return fallback;
 }
 var raw = gen.chokeStrokeColorSwatch;
 if (raw === undefined || raw === null) {
  return fallback;
 }
 var name = String(raw).replace(/^\s+|\s+$/g, "");
 if (!name.length) {
  return fallback;
 }
 if (getSwatchByName(doc, name)) {
  return name;
 }
 return fallback;
}

/** Apply choke stroke; if it fails, force default swatch (e.g. settings name invalid at apply time). */
function applyChokeStroke(doc, strokeWidth) {
 var defaultName = CONSTANTS.SWATCH_NAMES.GARMENT;
 var width = strokeWidth != null ? strokeWidth : CONSTANTS.STYLES.CHOKE_STROKE_WIDTH;
 var chosen = getChokeStrokeSwatchNameForDocument(doc);
 if (applyStroke(doc, chosen, width)) {
  return true;
 }
 if (chosen !== defaultName) {
  return applyStroke(doc, defaultName, width);
 }
 return false;
}

function findTextFrameInGroup(items, name) {
 for (var i = 0; i < items.length; i++) {
  var item = items[i];

  if (item.typename === "TextFrame" && item.name === name) {
   return item;
  }

  if (item.typename === "GroupItem" && item.pageItems && item.pageItems.length > 0) {
   var found = findTextFrameInGroup(item.pageItems, name);
   if (found) return found;
  }
 }
 return null;
}

function updateTextFrameInGroup(group, frameName, content) {
 var textFrame = findTextFrameInGroup(group.pageItems, frameName);
 if (textFrame) {
  textFrame.contents = content;
 } else {
  throw new Error("Text frame not found: " + frameName);
 }
}

function setTextFrameColor(textFrame, color) {
 try {
  if (textFrame && textFrame.textRange && color) {
   textFrame.textRange.fillColor = color;
  }
 } catch (e) {
 }
}

function applyColorToAllTextFramesInGroup(group, color) {
 if (!group || !color) return;

 function findAndColorTextFrames(items) {
  for (var i = 0; i < items.length; i++) {
   var item = items[i];

   if (item.typename === "TextFrame") {
    setTextFrameColor(item, color);
   } else if (item.typename === "GroupItem" && item.pageItems && item.pageItems.length > 0) {
    findAndColorTextFrames(item.pageItems);
   }
  }
 }

 findAndColorTextFrames(group.pageItems);
}

function findRectangleInGroup(items, name) {
 for (var i = 0; i < items.length; i++) {
  var item = items[i];

  if (item.typename === "PathItem" && item.name === name) {
   return item;
  }

  if (item.typename === "GroupItem" && item.pageItems && item.pageItems.length > 0) {
   var found = findRectangleInGroup(item.pageItems, name);
   if (found) return found;
  }
 }
 return null;
}

function applyColorToRectanglesInGroup(group, color) {
 if (!group || !color) return;

 var colRect = findRectangleInGroup(group.pageItems, "COLOR");
 if (colRect) {
  try {
   colRect.filled = true;
   colRect.fillColor = color;
  } catch (e) {
  }
 }
}

/**
 * Rename a separation ink in the document: SEPARATED_ART sublayer and spot swatch (by name).
 * Used when formatted labels (e.g. LS 186) replace formal names (PANTONE 186 C) in swatches and layers.
 * Returns { success, error?, renamedLayer, renamedSwatch }.
 */
function renameSeparationInkInDocument(doc, fromName, toName) {
 var result = { success: true, error: null, renamedLayer: false, renamedSwatch: false };
 var from = String(fromName || "").replace(/^\s+|\s+$/g, "");
 var to = String(toName || "").replace(/^\s+|\s+$/g, "");
 if (!from || !to) {
  result.success = false;
  result.error = "Missing from or to ink name.";
  return result;
 }
 if (from.toLowerCase() === to.toLowerCase()) {
  return result;
 }

 var existingTargetSwatch = getSwatchByName(doc, to);
 var sourceSwatchForConflict = getSwatchByName(doc, from);
 if (existingTargetSwatch) {
  if (
   !sourceSwatchForConflict ||
   String(existingTargetSwatch.name).toLowerCase() !== String(sourceSwatchForConflict.name).toLowerCase()
  ) {
   result.success = false;
   result.error = "A swatch named \"" + to + "\" already exists.";
   return result;
  }
 }else{
  sourceSwatchForConflict.name = to;
  result.renamedSwatch = true;
 }

 var sep = null;
 try {
  sep = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
 } catch (eSep) { }
 if (sep) {
  var i;
  var lyr = null;
  for (i = 0; i < sep.layers.length; i++) {
   if (String(sep.layers[i].name).toLowerCase() === from.toLowerCase()) {
    lyr = sep.layers[i];
    break;
   }
  }
  if (lyr) {
   try {
    lyr.name = to;
    result.renamedLayer = true;
   } catch (eLyr) {
    result.success = false;
    result.error = (result.error ? result.error + " " : "") + "Layer rename: " + (eLyr.message || eLyr);
   }
  }
 }

//  var sw = getSwatchByName(doc, from);
//  if (result.success && sw && sw.color) {
//   try {
//    if (sw.color.typename === "SpotColor" && sw.color.spot) {
//     sw.color.spot.name = to;
//     result.renamedSwatch = true;
//    } else {
//     try {
//      sw.name = to;
//      result.renamedSwatch = true;
//     } catch (eNm) { }
//    }
//   } catch (eSw) {
//    result.success = false;
//    result.error = (result.error ? result.error + " " : "") + "Swatch rename: " + (eSw.message || eSw);
//   }
//  }

 if (!result.success) {
  return result;
 }

 if (!result.renamedLayer && !result.renamedSwatch) {
  result.success = false;
  result.error =
   (result.error ? result.error + " " : "") +
   "No SEPARATED_ART sublayer or swatch found named \"" +
   from +
   "\".";
 }

 return result;
}

function updateGridColorLabels(doc, separationData) {
 var result = {
  updatedLabels: 0,
  deletedLabels: 0,
  errors: []
 };

 var infoBoxLayer = findLayerByName(doc.layers, "GRID INFO BOX");
 if (!infoBoxLayer) {
  result.errors.push("GRID INFO BOX layer not found in document");
  return result;
 }

 var groupsWithData = {};

 for (var i = 0; i < separationData.length; i++) {
  var sepData = separationData[i];
  var groupName = String(sepData.seq);
  var labelGroup = null;

  for (var j = 0; j < infoBoxLayer.groupItems.length; j++) {
   if (infoBoxLayer.groupItems[j].name === groupName) {
    labelGroup = infoBoxLayer.groupItems[j];
    break;
   }
  }

  if (!labelGroup) {
   result.errors.push("Group '" + groupName + "' not found in GRID INFO BOX layer");
   continue;
  }

  var swatchColor = null;
  var swatchLookupName = sepData.swatchName || sepData.colorName;
  if (swatchLookupName) {
   var swatch = getSwatchByName(doc, swatchLookupName);
   if (swatch && swatch.color) {
    swatchColor = swatch.color;
   } else {
    var isWhiteUbVariant = /^white\s*ub(\s+(\d+))?$/i.test(String(swatchLookupName));
    if (isWhiteUbVariant) {
     var ubNumMatch = String(swatchLookupName).match(/^white\s*ub(?:\s+(\d+))?$/i);
     var ubNum = ubNumMatch && ubNumMatch[1] ? parseInt(ubNumMatch[1], 10) : 1;
     if (ubNum >= 2) {
      var ub2Name = getUnderbase2SwatchNameFromDocument(doc);
      if (ub2Name) {
       var ub2Swatch = getSwatchByName(doc, ub2Name);
       if (ub2Swatch && ub2Swatch.color) {
        swatchColor = ub2Swatch.color;
       }
      }
     }
     if (!swatchColor) {
      var whiteUbSwatch = getSwatchByName(doc, "White UB");
      if (whiteUbSwatch && whiteUbSwatch.color) {
       swatchColor = whiteUbSwatch.color;
      } else {
       result.errors.push("Swatch '" + swatchLookupName + "' not found for group '" + groupName + "' and fallback 'White UB' swatch missing");
      }
     }
    } else {
     result.errors.push("Swatch '" + swatchLookupName + "' not found for group '" + groupName + "'");
    }
   }
  }

  try {
   updateTextFrameInGroup(labelGroup, "SEQ", String(sepData.seq));
   updateTextFrameInGroup(labelGroup, "COLOR NAME", sepData.colorName);
   updateTextFrameInGroup(labelGroup, "MESH", sepData.mesh);
   updateTextFrameInGroup(labelGroup, "MICRON", sepData.micron);
   updateTextFrameInGroup(labelGroup, "FLASH", sepData.flash ? "Y" : "N");
   updateTextFrameInGroup(labelGroup, "COOL", sepData.cool ? "Y" : "N");
   updateTextFrameInGroup(labelGroup, "WB", sepData.wb ? "Y" : "N");

   if (swatchColor) {
    applyColorToAllTextFramesInGroup(labelGroup, swatchColor);
    applyColorToRectanglesInGroup(labelGroup, swatchColor);
   }

   labelGroup.hidden = false;
   groupsWithData[groupName] = true;

   result.updatedLabels++;
  } catch (e) {
   result.errors.push("Error updating group '" + groupName + "': " + e.message);
  }
 }

 var maxGroupsToCheck = 14;
 for (var i = 1; i <= maxGroupsToCheck; i++) {
  var groupName = String(i);

  if (groupsWithData[groupName]) {
   continue;
  }

  var labelGroup = null;

  for (var j = 0; j < infoBoxLayer.groupItems.length; j++) {
   if (infoBoxLayer.groupItems[j].name === groupName) {
    labelGroup = infoBoxLayer.groupItems[j];
    break;
   }
  }

  if (!labelGroup) {
   continue;
  }

  try {
   labelGroup.hidden = true;
  } catch (e) {
   result.errors.push("Error hiding group '" + groupName + "': " + e.message);
  }
 }

 return result;
}

function normalizeKey(str) {
 return str.toLowerCase().replace(/[\s_-]/g, '');
}

function findValueInJSON(obj, key) {
 var normalizedSearchKey = normalizeKey(key);

 if (obj.hasOwnProperty(key)) {
  return obj[key];
 }

 for (var prop in obj) {
  if (obj.hasOwnProperty(prop)) {
   var normalizedProp = normalizeKey(prop);

   if (normalizedProp === normalizedSearchKey) {
    if (typeof obj[prop] !== 'object' || obj[prop] === null) {
     return obj[prop];
    }
   }
  }
 }

 for (var prop in obj) {
  if (obj.hasOwnProperty(prop) && typeof obj[prop] === 'object' && obj[prop] !== null) {
   var result = findValueInJSON(obj[prop], key);
   if (result !== null) {
    return result;
   }
  }
 }

 return null;
}

// Format ISO date for [DATE] (e.g. "11/02/2026"). Parse ISO string manually for ExtendScript.
function formatSeparationDate(isoStr) {
 if (!isoStr || typeof isoStr !== 'string') return '';
 try {
  var s = isoStr.trim();
  var datePart = s.indexOf('T') >= 0 ? s.substring(0, s.indexOf('T')) : s.substring(0, 10);
  if (datePart.length < 10) return '';
  var parts = datePart.split('-');
  if (parts.length !== 3) return '';
  var year = parts[0];
  var month = parts[1];
  var day = parts[2];
  if (!year || !month || !day) return '';
  return day + '/' + month + '/' + year;
 } catch (e) {
  return '';
 }
}

// Read the graphic position lookup JSON from the configured server base path.
// Expected location: <ServerBasePath>/SETTINGS/graphic_positions.json
// Expected shape: [{ "ABBV": "FT", "DESC": "FRONT" }, ...]
function loadGraphicPositionLookup() {
 try {
  if (typeof getServerBasePath !== 'function') return [];
  var serverBasePath = getServerBasePath();
  if (!serverBasePath) return [];
  var normalizedBasePath = String(serverBasePath).replace(/\/$/, "");
  var lookupPath = normalizedBasePath + "/SETTINGS/graphic_positions.json";
  var lookupFile = new File(lookupPath);
  if (!lookupFile.exists) return [];
  if (!lookupFile.open("r")) return [];
  var content = lookupFile.read();
  lookupFile.close();
  if (!content || !content.length) return [];
  var parsed;
  if (typeof JSON !== "undefined" && JSON.parse) {
   parsed = JSON.parse(content);
  } else {
   parsed = eval("(" + content + ")");
  }
  return (parsed && parsed instanceof Array) ? parsed : [];
 } catch (e) {
  return [];
 }
}

function normalizeInkMatchString(value) {
 if (value == null) return "";
 return String(value).replace(/^\s+|\s+$/g, "").toUpperCase();
}

function escapeRegExpForInkMatch(str) {
 return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Match ink exception Ink_Color (e.g. "123") to a plate/ink name (e.g. "PANTONE 123 C").
 * Numeric Pantone codes must match the full number token — "123" must not match "1235".
 */
function inkExceptionNameMatchesName(exceptionInk, targetName) {
 var needle = normalizeInkMatchString(exceptionInk);
 var target = normalizeInkMatchString(targetName);
 if (!needle || !target) return false;
 if (target === needle) return true;

 /*
  * The exception's Ink Color is a color code ("62Q", "24C", "4FA", "1235", or a full
  * "PANTONE 1235 C"). It must match a COMPLETE alphanumeric token in the target name, never a bare
  * digit fragment. Matching only the digit run ("24" out of "24C") wrongly collided with unrelated
  * tokens such as the season code in "SPORT RED 62Q S24" (the "24" inside "S24"), so the WRONG
  * exception row was picked. Alphanumeric token boundaries fix that and still (a) keep "123" from
  * matching "1235", and (b) resolve reformatted Pantone names, because the shared number token
  * ("1235") matches both "PANTONE 1235 C" and "LS 1235" / "LS 1235 2".
  */
 var codeToken = needle;
 var pantoneNumber = needle.match(/PANTONE\s+([0-9]+[A-Z]?)/);
 if (pantoneNumber) {
  codeToken = pantoneNumber[1];
 }
 if (/^[0-9A-Z]+$/.test(codeToken)) {
  var tokenRe = new RegExp("(?:^|[^A-Z0-9])" + escapeRegExpForInkMatch(codeToken) + "(?:[^A-Z0-9]|$)");
  return tokenRe.test(target);
 }

 if (target.indexOf(needle) !== -1) return true;
 if (needle.indexOf(target) !== -1) return true;
 return false;
}

// Read/write profile ink exceptions JSON from the configured server base path.
// Expected location: <ServerBasePath>/SETTINGS/LEAP_SEPS/Data/profile_ink_exceptions.json
function getProfileInkExceptionsJsonPath() {
 try {
  if (typeof getServerBasePath !== "function") return null;
  var serverBasePath = getServerBasePath();
  if (!serverBasePath) return null;
  var normalizedBasePath = String(serverBasePath).replace(/\/$/, "");
  return normalizedBasePath + "/SETTINGS/LEAP_SEPS/Data/profile_ink_exceptions.json";
 } catch (e) {
  return null;
 }
}

function loadProfileInkExceptionsJson() {
 try {
  var jsonPath = getProfileInkExceptionsJsonPath();
  if (!jsonPath) return [];
  var jsonFile = new File(jsonPath);
  if (!jsonFile.exists) return [];
  if (!jsonFile.open("r")) return [];
  var content = jsonFile.read();
  jsonFile.close();
  if (!content || !content.length) return [];
  var parsed;
  if (typeof JSON !== "undefined" && JSON.parse) {
   parsed = JSON.parse(content);
  } else {
   parsed = eval("(" + content + ")");
  }
  return (parsed && parsed instanceof Array) ? parsed : [];
 } catch (e) {
  return [];
 }
}

function saveProfileInkExceptionsJson(entries) {
 try {
  var jsonPath = getProfileInkExceptionsJsonPath();
  if (!jsonPath) {
   return { success: false, error: "Could not determine profile_ink_exceptions.json path" };
  }
  var jsonFile = new File(jsonPath);
  var jsonFolder = jsonFile.parent;
  if (!jsonFolder.exists) {
   jsonFolder.create();
  }
  if (!jsonFile.open("w")) {
   return { success: false, error: "Failed to open profile_ink_exceptions.json for writing" };
  }
  var jsonString = JSON.stringify(entries, null, 2);
  jsonFile.write(jsonString);
  jsonFile.close();
  return { success: true };
 } catch (e) {
  return { success: false, error: e.message || e.toString() };
 }
}

// Return the ABBV for a given position DESC using the graphic position lookup.
// Falls back to the original positionDesc when no match is found.
function getGraphicPositionAbbreviation(positionDesc) {
 if (positionDesc == null) return '';
 var original = String(positionDesc).trim();
 if (!original) return '';
 try {
  var target = original.toLowerCase();
  var lookup = loadGraphicPositionLookup();
  for (var i = 0; i < lookup.length; i++) {
   var entry = lookup[i];
   if (!entry) continue;
   var desc = entry.DESC != null ? entry.DESC : (entry.desc != null ? entry.desc : '');
   if (!desc) continue;
   if (String(desc).trim().toLowerCase() === target) {
    var abbv = entry.ABBV != null ? entry.ABBV : (entry.abbv != null ? entry.abbv : '');
    if (abbv != null && String(abbv).trim() !== '') {
     return String(abbv).trim();
    }
    break;
   }
  }
 } catch (e) { }
 return original;
}

function formatSeparationVersionLabel(versionNumber) {
 var n = parseInt(versionNumber, 10);
 if (isNaN(n) || n < 1) {
  n = 1;
 }
 return "V" + n;
}

function separationProfileNameFromEntry(entry) {
 if (entry && entry.profileMetadata && entry.profileMetadata.profileName) {
  return String(entry.profileMetadata.profileName);
 }
 return "";
}

function findSeparationEntryIndex(separations, graphicName, profileName) {
 if (!separations || !separations.length || !graphicName) {
  return -1;
 }
 var graphicKey = String(graphicName);
 var profileKey = profileName != null ? String(profileName) : "";
 for (var i = 0; i < separations.length; i++) {
  var entry = separations[i];
  if (!entry || String(entry.graphicName) !== graphicKey) {
   continue;
  }
  var entryProfile = separationProfileNameFromEntry(entry);
  if (profileKey && entryProfile) {
   if (entryProfile === profileKey) {
    return i;
   }
  } else if (!profileKey && !entryProfile) {
   return i;
  }
 }
 return -1;
}

function getStoredSeparationVersionFromEntry(entry) {
 if (!entry) {
  return 0;
 }
 var fromMeta = entry.profileMetadata && entry.profileMetadata.separationVersion != null
  ? parseInt(entry.profileMetadata.separationVersion, 10)
  : NaN;
 if (!isNaN(fromMeta) && fromMeta > 0) {
  return fromMeta;
 }
 var fromEntry = entry.separationVersion != null ? parseInt(entry.separationVersion, 10) : NaN;
 if (!isNaN(fromEntry) && fromEntry > 0) {
  return fromEntry;
 }
 return 0;
}

function loadSeparationsFromVersionDoc(versionDoc) {
 var separations = [];
 if (!versionDoc) {
  return separations;
 }
 try {
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", versionDoc);
  if (xmp.isXmpCreated && xmp.doesStructFieldExist("LEAPSeparationProfileData")) {
   var existing = xmp.getStructField("LEAPSeparationProfileData", true);
   if (existing instanceof Array) {
    separations = existing;
   }
  }
 } catch (e) { }
 return separations;
}

function persistSeparationVersionOnVersionDoc(versionDoc, graphicName, profileName, versionNumber) {
 if (!versionDoc || !graphicName || versionNumber == null) {
  return false;
 }
 var version = parseInt(versionNumber, 10);
 if (isNaN(version) || version < 1) {
  return false;
 }
 try {
  var xmp = new xmpModifier.GetXMP("http://my.LEAPColorSeparator", "ColorSeparator", versionDoc);
  if (!xmp.isXmpCreated) {
   return false;
  }
  var separations = loadSeparationsFromVersionDoc(versionDoc);
  var idx = findSeparationEntryIndex(separations, graphicName, profileName);
  if (idx < 0) {
   separations.push({
    graphicName: String(graphicName),
    profileMetadata: {
     profileName: profileName != null ? String(profileName) : "",
     separationVersion: version
    },
    separatedDocumentPath: "",
    separationVersion: version
   });
  } else {
   var entry = separations[idx];
   if (!entry.profileMetadata || typeof entry.profileMetadata !== "object") {
    entry.profileMetadata = {};
   }
   entry.profileMetadata.separationVersion = version;
   entry.separationVersion = version;
   separations[idx] = entry;
  }
  xmp.setStructField("LEAPSeparationProfileData", separations, true, false);
  xmp.commit();
  if (versionDoc.fullName && versionDoc.fullName.fsName) {
   try {
    versionDoc.save();
   } catch (saveErr) { }
  }
  return true;
 } catch (e) {
  return false;
 }
}

function getNextSeparationVersion(versionDoc, graphicName, profileName) {
 var separations = loadSeparationsFromVersionDoc(versionDoc);
 var idx = findSeparationEntryIndex(separations, graphicName, profileName);
 if (idx < 0) {
  return 1;
 }
 return getStoredSeparationVersionFromEntry(separations[idx]) + 1;
}

function bumpSeparationVersionOnVersionDoc(versionDoc, graphicName, profileName) {
 var nextVersion = getNextSeparationVersion(versionDoc, graphicName, profileName);
 persistSeparationVersionOnVersionDoc(versionDoc, graphicName, profileName, nextVersion);
 return nextVersion;
}

/** Find an open team version document (01 TEAMOUTS, not a separation file). */
function findOpenVersionDocument() {
 var versionDoc = null;
 try {
  if (app.documents.length > 0) {
   var activeDoc = app.activeDocument;
   if (activeDoc && activeDoc.fullName && activeDoc.fullName.fsName) {
    var activeDocPath = activeDoc.fullName.fsName;
    var isSeparatedDoc = activeDocPath.indexOf("09 SEPARATIONS") !== -1;
    var isVersionDoc = activeDocPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc;
    if (isVersionDoc) {
     versionDoc = activeDoc;
    }
   }
  }
  if (!versionDoc) {
   for (var d = 0; d < app.documents.length; d++) {
    var doc = app.documents[d];
    if (!doc || !doc.fullName || !doc.fullName.fsName) {
     continue;
    }
    var docPath = doc.fullName.fsName;
    var isSeparatedDoc2 = docPath.indexOf("09 SEPARATIONS") !== -1;
    var isVersionDoc2 = docPath.indexOf("01 TEAMOUTS") !== -1 && !isSeparatedDoc2;
    if (isVersionDoc2) {
     versionDoc = doc;
     break;
    }
   }
  }
 } catch (e) { }
 return versionDoc;
}

/** Update [C#] (ink count) and/or [V#] (separation version label) in all document text frames. */
function updateSeparationPageVariables(doc, colorCount, separationVersion) {
 if (!doc || !doc.textFrames) {
  return;
 }
 var hasColor = colorCount !== null && colorCount !== undefined && colorCount !== "";
 var hasVersion = separationVersion !== null && separationVersion !== undefined && separationVersion !== "";
 if (!hasColor && !hasVersion) {
  return;
 }
 try {
  for (var i = 0; i < doc.textFrames.length; i++) {
   var textFrame = doc.textFrames[i];
   var content = textFrame.contents;
   var updatedContent = content;
   var regex = /\[([^\]]+)\]/g;
   var match;
   while ((match = regex.exec(content)) !== null) {
    var variableName = String(match[1] || "");
    var fullMatch = match[0];
    var key = variableName.toLowerCase().replace(/\s/g, "_");
    var value = null;
    if (hasColor && (key === "c#" || variableName === "C#")) {
     value = String(colorCount);
    } else if (hasVersion && (key === "v#" || variableName === "V#")) {
     value = formatSeparationVersionLabel(separationVersion);
    }
    if (value !== null && value !== undefined) {
     updatedContent = updatedContent.split(fullMatch).join(value);
    }
   }
   if (updatedContent !== content) {
    textFrame.contents = updatedContent;
   }
  }
 } catch (e) {
  $.writeln("Error updating separation page variables: " + e.message);
 }
}

// Update variables in document ([ARTIST], [Artist Initials], [POS], [DATE], [STYLE_CODE], jsonData keys; optional profileMetadata.batchVariableSource from BATCH .xlsx after JSON)
function updateVariablesInDocument(doc, jsonData, styleCodes, profileMetadata) {
 try {
  var meta = profileMetadata || {};
  var textFrames = doc.textFrames;

  for (var i = 0; i < textFrames.length; i++) {
   var textFrame = textFrames[i];
   var content = textFrame.contents;

   var regex = /\[([^\]]+)\]/g;
   var match;
   var updatedContent = content;

   while ((match = regex.exec(content)) !== null) {
    var variableName = match[1];
    var fullMatch = match[0];
    var key = variableName.toLowerCase().replace(/\s/g, '_');
    var value = null;

    if (key === 'style_code') {
     if (styleCodes && styleCodes.length > 0) {
      value = styleCodes.join(', ');
     } else {
      value = findValueInJSON(jsonData, variableName);
     }
    } else if (key === 'artist') {
     value = (meta.artistName != null && meta.artistName !== '') ? String(meta.artistName).trim() : '';
    } else if (key === 'artist_initials' || key === 'artistinitials') {
     value = (meta.artistInitials != null && meta.artistInitials !== '') ? String(meta.artistInitials).trim() : '';
    } else if (key === 'pos') {
     var rawPosition = (meta.position != null && meta.position !== '') ? String(meta.position).trim() : (findValueInJSON(jsonData, 'Position') || findValueInJSON(jsonData, 'position') || '');
     value = rawPosition ? getGraphicPositionAbbreviation(rawPosition) : '';
    } else if (key === 'date') {
     value = formatSeparationDate(meta.createdDate || '');
    } else if (key === 'c#') {
     if (meta.separationColorCount != null && meta.separationColorCount !== '') {
      value = String(meta.separationColorCount);
     }
    } else if (key === 'v#') {
     /* [V#] is written only at export (with the control number) — leave the placeholder untouched here. */
     value = null;
    } else {
     value = findValueInJSON(jsonData, variableName);
    }

    var batchSrc = meta.batchVariableSource;
    if (
     (value === null || value === undefined || value === '') &&
     batchSrc &&
     typeof batchSrc === 'object'
    ) {
     var fromBatch = findValueInJSON(batchSrc, variableName);
     if (fromBatch !== null && fromBatch !== undefined && fromBatch !== '') {
      value = fromBatch;
     }
    }

    if (value !== null && value !== undefined) {
     var strVal = value.toString();
     updatedContent = updatedContent.split(fullMatch).join(strVal);
    }
   }

   if (updatedContent !== content) {
    textFrame.contents = updatedContent;
   }
  }
 } catch (e) {
  $.writeln('Error updating variables: ' + e.message);
 }
}

function findAndReadJSONFile(docName, leagueFolder) {
 var jsonFolder = new Folder(leagueFolder.fsName + "/JSON");
 if (!jsonFolder.exists) {
  return null;
 }

 var jsonFiles = jsonFolder.getFiles("*.json");
 var jsonFile = null;

 for (var i = 0; i < jsonFiles.length; i++) {
  var fileName = jsonFiles[i].name;
  if (fileName.indexOf(docName) !== -1) {
   jsonFile = jsonFiles[i];
   break;
  }
 }

 if (!jsonFile) {
  return null;
 }

 jsonFile.open('r');
 var jsonContent = jsonFile.read();
 jsonFile.close();

 try {
  return JSON.parse(jsonContent);
 } catch (e) {
  return null;
 }
}

function decodeURIString(str) {
 if (!str) return str;

 try {
  return decodeURIComponent(str);
 } catch (e) {
  return str;
 }
}

function deleteNonFillStrokeItems() {
 try {
  app.selection = null;
  var _tempRectangle = app.activeDocument.pathItems.rectangle(700, 100, 200, 100);
  var _noneSwatch = app.activeDocument.swatches.getByName("[None]");
  _tempRectangle.filled = true;
  _tempRectangle.stroked = true;
  _tempRectangle.fillColor = _noneSwatch.color;
  _tempRectangle.strokeColor = _noneSwatch.color;
  app.executeMenuCommand('Find Fill & Stroke menu item');


  for (var i = app.selection.length - 1; i >= 0; i--) {
   var selectedItem = app.selection[i];
   if (!selectedItem) continue;
   // Top-level PathItem that is a clipping path
   if (selectedItem.typename === "PathItem" && selectedItem.clipping === true) {
    selectedItem.selected = false;
    // Top-level GroupItem that is a clipping group, or contains one deeper
   } else if (selectedItem.typename === "CompoundPathItem" && selectedItem.pathItems[0].clipping) {
    selectedItem.selected = false;
   } else if (selectedItem.typename === "GroupItem") {
    deselectedClippedItemsInGroup(selectedItem);
   }
  }

  app.doScript("Clear", "LEAP Color Seps");
 }
 catch (e) {
 }
}

function deselectedClippedItemsInGroup(item) {
 if (!item) return;
 // PathItem: .clipping === true means this path IS the clipping mask
 if (item.typename === "PathItem" && item.clipping === true) {
  item.selected = false;
  return;
 }
 if (item.typename === "CompoundPathItem" && item.pathItems[0].clipping) {
  item.selected = false;
  return;
 }
 // GroupItem: .clipped === true means the group contains a clipping mask
 if (item.typename === "GroupItem") {
  if (item.clipped === true) {
   item.selected = false;
   return;
  }
  if (item.pageItems) {
   for (var j = item.pageItems.length - 1; j >= 0; j--) {
    deselectedClippedItemsInGroup(item.pageItems[j]);
   }
  }
 }
}

var _LEAP_AREA_EPS = 1e-6;

function _gatherCompoundPathItems(items, out) {
 if (!items || !items.length) return;
 for (var i = 0; i < items.length; i++) {
  var item = items[i];
  if (!item) continue;
  if (item.typename === "CompoundPathItem") {
   out.push(item);
  } else if (item.typename === "GroupItem" && item.pageItems && item.pageItems.length) {
   _gatherCompoundPathItems(item.pageItems, out);
  }
 }
}

/**
 * Remove degenerate or hairline subpaths from compound paths on a layer (after Pathfinder Add).
 * Zero-area paths are removed; otherwise SizeAreaRatio = (width + height) / ABS(area), delete if > 100.
 */
function deleteLeftoverPathsInLayer(layer) {
 if (!layer || !layer.pageItems) return;
 var compounds = [];
 _gatherCompoundPathItems(layer.pageItems, compounds);
 for (var c = 0; c < compounds.length; c++) {
  deleteLeftoverPathsInCompound(compounds[c]);
 }
}

function deleteLeftoverPathsInCompound(compound) {
 if (!compound || compound.typename !== "CompoundPathItem" || !compound.pathItems) return;
 for (var i = compound.pathItems.length - 1; i >= 0; i--) {
  var pi = compound.pathItems[i];
  if (!pi) continue;
  var area;
  try {
   area = pi.area;
  } catch (ea) {
   continue;
  }
  if (Math.abs(area) < _LEAP_AREA_EPS) {
   try {
    pi.remove();
   } catch (e0) { }
   continue;
  }
  var absArea = Math.abs(area);
  var b;
  try {
   b = pi.geometricBounds;
  } catch (e1) {
   continue;
  }
  var width = Math.abs(b[2] - b[0]);
  var height = Math.abs(b[1] - b[3]);
  var sizeAreaRatio = (width + height) / absArea;
  if (sizeAreaRatio > 100) {
   try {
    pi.remove();
   } catch (e2) { }
  }
 }
 try {
  if (compound.pathItems.length === 0) {
   compound.remove();
  }
 } catch (e3) { }
}
