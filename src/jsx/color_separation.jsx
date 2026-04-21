

#include "./utilities.jsx"

function splitColors(_graphicName, cleanupOpts) {
 try {
  var runLeftover = cleanupOpts == null || cleanupOpts.deleteLeftoverPaths === true;
  var _sizedArtLayer = app.activeDocument.layers.getByName("SIZED_ART");
  var _sizedGraphicLayer = _sizedArtLayer.layers.getByName("SIZED_GRAPHICS");
  var _graphicItem = _sizedGraphicLayer.pageItems.getByName(_graphicName);
  _graphicItem.selected = true;
  app.redraw();
  app.executeMenuCommand('copy');
  app.executeMenuCommand('pasteInPlace');
  app.redraw();
  expandObject();
  app.executeMenuCommand('group');
  pathFinderDivide();
  var _processItem = app.selection[0];
  app.selection = null;


  var _separatedArtLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.SEPARATED_ART);


  var colorGroups = {};
  collectItemsByColor(_processItem, colorGroups);


  for (var colorName in colorGroups) {
   if (colorGroups.hasOwnProperty(colorName)) {

    var colorSubLayer = getOrCreateLayer(app.activeDocument, colorName, _separatedArtLayer);


    var items = colorGroups[colorName];
    for (var j = 0; j < items.length; j++) {
     items[j].move(colorSubLayer, ElementPlacement.PLACEATBEGINNING);
    }


    app.selection = null;
    app.activeDocument.activeLayer = colorSubLayer;
    app.activeDocument.activeLayer.hasSelectedArtwork = true;
    app.redraw();
    pathFinderAdd();
    if (runLeftover) {
     deleteLeftoverPathsInLayer(colorSubLayer);
    }
   }
  }
  app.redraw();

 } catch (e) {
  return JSON.stringify({
   success: false,
   error: e.message || e.toString()
  });
 }
}


function getKnockoutBlackNamesFromProfile(profileMetadata) {
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

function shouldApplyKnockoutForUnderbaseIndex(profileMetadata, ubIndex) {
 try {
  var enabled = profileMetadata && profileMetadata.underbaseEnabled instanceof Array
   ? profileMetadata.underbaseEnabled
   : null;
  var ko = profileMetadata && profileMetadata.underbaseKnockoutBlack instanceof Array
   ? profileMetadata.underbaseKnockoutBlack
   : null;
  if (!enabled || !ko) return false;
  if (ubIndex < 0 || ubIndex >= enabled.length || ubIndex >= ko.length) return false;
  return enabled[ubIndex] === true && ko[ubIndex] === true;
 } catch (e) {
  return false;
 }
}

function isItemFilledWithAnyName(item, nameLookup) {
 try {
  if (!item || !item.filled || !item.fillColor) return false;
  var fill = item.fillColor;
  var fillName = "";
  if (fill.typename === "SpotColor" && fill.spot && fill.spot.name) {
   fillName = String(fill.spot.name);
  }
  if (!fillName) return false;
  return !!nameLookup[fillName.toUpperCase()];
 } catch (e) {
  return false;
 }
}

function removeItemsByFillNamesFromContainer(container, nameLookup) {
 var removed = 0;
 try {
  if (!container || !nameLookup) return 0;
  var toRemove = [];

  function collectPathItems(node) {
   if (!node) return;

   try {
    if (node.typename === "PathItem") {
     if (isItemFilledWithAnyName(node, nameLookup)) {
      toRemove.push(node);
     }
     return;
    }
   } catch (e0) { }

   try {
    if (node.pathItems && node.pathItems.length > 0) {
     for (var p = 0; p < node.pathItems.length; p++) {
      collectPathItems(node.pathItems[p]);
     }
    }
   } catch (e1) { }

   try {
    if (node.pageItems && node.pageItems.length > 0) {
     for (var i = 0; i < node.pageItems.length; i++) {
      collectPathItems(node.pageItems[i]);
     }
    }
   } catch (e2) { }

   try {
    if (node.layers && node.layers.length > 0) {
     for (var l = 0; l < node.layers.length; l++) {
      collectPathItems(node.layers[l]);
     }
    }
   } catch (e3) { }
  }

  collectPathItems(container);

  for (var r = toRemove.length - 1; r >= 0; r--) {
   try {
    toRemove[r].remove();
    removed++;
   } catch (removeErr) { }
  }
 } catch (e) { }
 return removed;
}

function removeKnockoutFilledItemsFromUnderbaseLayer(whiteUBLayer, profileMetadata, ubIndex) {
 try {
  if (!whiteUBLayer) return 0;
  if (!shouldApplyKnockoutForUnderbaseIndex(profileMetadata, ubIndex)) return 0;
  var names = getKnockoutBlackNamesFromProfile(profileMetadata);
  if (!names || names.length === 0) return 0;
  var lookup = {};
  for (var i = 0; i < names.length; i++) {
   lookup[names[i].toUpperCase()] = true;
  }
  return removeItemsByFillNamesFromContainer(whiteUBLayer, lookup);
 } catch (e) {
  return 0;
 }
}

function getEnabledUnderbaseIndices(profileMetadata) {
 try {
  var enabled = profileMetadata && profileMetadata.underbaseEnabled instanceof Array
   ? profileMetadata.underbaseEnabled
   : null;
  if (!enabled || enabled.length === 0) return [0];
  var indices = [];
  for (var i = 0; i < enabled.length; i++) {
   if (enabled[i] === true) indices.push(i);
  }
  if (indices.length === 0) indices.push(0);
  return indices;
 } catch (e) {
  return [0];
 }
}

function clearLayerPageItems(layer) {
 try {
  if (!layer || !layer.pageItems) return;
  for (var i = layer.pageItems.length - 1; i >= 0; i--) {
   try { layer.pageItems[i].remove(); } catch (e) { }
  }
 } catch (e2) { }
}

function duplicateLayerItems(sourceLayer, targetLayer) {
 try {
  if (!sourceLayer || !targetLayer) return 0;
  var duplicated = 0;
  for (var i = sourceLayer.pageItems.length - 1; i >= 0; i--) {
   try {
    sourceLayer.pageItems[i].duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
    duplicated++;
   } catch (e) { }
  }
  return duplicated;
 } catch (e2) {
  return 0;
 }
}

function getUnderbaseLayerNameForIndex(index) {
 if (index <= 0) return CONSTANTS.LAYER_NAMES.WHITE_UB;
 return CONSTANTS.LAYER_NAMES.WHITE_UB + " " + (index + 1);
}

function finalizeUnderbaseLayer(underbaseLayer, runLeftoverUb) {
 try {
  app.selection = null;
  app.activeDocument.activeLayer = underbaseLayer;
  app.activeDocument.activeLayer.hasSelectedArtwork = true;
  app.redraw();
  applySwatchToFill(app.activeDocument, CONSTANTS.SWATCH_NAMES.WHITE_UB);
  app.executeMenuCommand('sendToBack');
  pathFinderAdd();
  if (runLeftoverUb) {
   deleteLeftoverPathsInLayer(underbaseLayer);
  }
  app.selection = null;
 } catch (e) { }
}

function generateUnderbase(_graphicName, cleanupOpts, profileMetadata) {
 try {
  var runUnpainted = cleanupOpts == null || cleanupOpts.deleteUnpaintedPaths === true;
  var runLeftoverUb = cleanupOpts == null || cleanupOpts.deleteLeftoverPaths === true;
  var _separatedArtLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.SEPARATED_ART);
  var _sizedArtLayer = app.activeDocument.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_ART);
  var _sizedGraphicLayer = _sizedArtLayer.layers.getByName(CONSTANTS.LAYER_NAMES.SIZED_GRAPHICS);
  var _graphicItem = _sizedGraphicLayer.pageItems.getByName(_graphicName);

  var tempWhiteUBLayer = getOrCreateLayer(app.activeDocument, "__TEMP_WHITE_UB", _separatedArtLayer);
  clearLayerPageItems(tempWhiteUBLayer);
  duplicateItemToLayer(_graphicItem, tempWhiteUBLayer);

  app.selection = null;
  app.activeDocument.activeLayer = tempWhiteUBLayer;
  app.activeDocument.activeLayer.hasSelectedArtwork = true;
  app.redraw();
  setFillOverprintOnContainer(tempWhiteUBLayer, false);
  app.redraw();

  pathFinderMerge();
  app.executeMenuCommand('ungroup');
  if (runUnpainted) {
   deleteNonFillStrokeItems();
  }

  var enabledUnderbaseIndices = getEnabledUnderbaseIndices(profileMetadata);
  for (var ub = 0; ub < enabledUnderbaseIndices.length; ub++) {
   var ubIndex = enabledUnderbaseIndices[ub];
   var ubLayerName = getUnderbaseLayerNameForIndex(ubIndex);
   var ubLayer = getOrCreateLayer(app.activeDocument, ubLayerName, _separatedArtLayer);
   clearLayerPageItems(ubLayer);
   duplicateLayerItems(tempWhiteUBLayer, ubLayer);
   removeKnockoutFilledItemsFromUnderbaseLayer(ubLayer, profileMetadata, ubIndex);
   finalizeUnderbaseLayer(ubLayer, runLeftoverUb);
  }

  // Generate Choke
  generateChoke(tempWhiteUBLayer, _separatedArtLayer);
  try { tempWhiteUBLayer.remove(); } catch (tempRemoveErr) { }
  app.activeDocument.selection = null;
 } catch (e) {
  return JSON.stringify({
   success: false,
   error: "Underbase generation failed: " + (e.message || e.toString())
  });
 }
}


function generateChoke(sourceLayer, separatedArtLayer) {

 var chokeLayer = getOrCreateLayer(app.activeDocument, CONSTANTS.LAYER_NAMES.CHOKE, separatedArtLayer);
 clearLayerPageItems(chokeLayer);
 chokeLayer.move(separatedArtLayer, ElementPlacement.PLACEATBEGINNING);

 app.activeDocument.activeLayer = sourceLayer;
 app.activeDocument.activeLayer.hasSelectedArtwork = true;
 if (app.selection && app.selection.length > 0) {
  for (var i = app.selection.length - 1; i >= 0; i--) {
   try { app.selection[i].duplicate(chokeLayer, ElementPlacement.PLACEATBEGINNING); } catch (dupErr) { }
  }
 }

 app.selection = null;
 app.activeDocument.activeLayer = chokeLayer;
 app.activeDocument.activeLayer.hasSelectedArtwork = true;


 var noneSwatch = getSwatchByName(app.activeDocument, CONSTANTS.SWATCH_NAMES.NONE);
 if (noneSwatch) {
  app.activeDocument.defaultFilled = true;
  app.activeDocument.defaultFillColor = noneSwatch.color;
  app.redraw();
 }


 applyChokeStroke(app.activeDocument, CONSTANTS.STYLES.CHOKE_STROKE_WIDTH);
}


function getGraphicList() {
 var _graphicList = [];
 var _liveArtLayer = app.activeDocument.layers.getByName(CONSTANTS.LAYER_NAMES.LIVE_ART);
 var _pageItems = _liveArtLayer.layers;

 for (var i = 0; i < _pageItems.length; i++) {
  if (_pageItems[i].name.indexOf(CONSTANTS.GRAPHIC.PREFIX) != -1) {
   _graphicList.push(_pageItems[i].name.split(":")[1]);
  }
 }
 return _graphicList;
}
