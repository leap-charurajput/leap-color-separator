function createCompoundPlate(subLayerNames, newLayerName, fillColorName) {
 if (!app.documents.length) {
  throw new Error('No document open');
 }

 var doc = app.activeDocument;
 var PARENT_LAYER_NAME = 'SEPARATED_ART';

 // ---------------- HELPERS ----------------

 function findLayerByName(layers, name) {
  for (var i = 0; i < layers.length; i++) {
   if (layers[i].name === name) return layers[i];
   var found = findLayerByName(layers[i].layers, name);
   if (found) return found;
  }
  return null;
 }

 function unlockItem(item) {
  try {
   item.locked = false;
   if (item.layer) item.layer.locked = false;
  } catch (e) {}
 }

 function applyFill(item, colorName) {
  try {
   var swatch = doc.swatches.getByName(colorName);
   var color = swatch.color;

   if (item.typename === 'PathItem') {
    item.filled = true;
    item.fillColor = color;
   } else if (item.typename === 'CompoundPathItem') {
    for (var i = 0; i < item.pathItems.length; i++) {
     item.pathItems[i].filled = true;
     item.pathItems[i].fillColor = color;
    }
   }
  } catch (e) {}
 }

 function duplicateCompoundPathSafe(compound, targetLayer) {
  unlockItem(compound);

  var newCompound = targetLayer.compoundPathItems.add();

  for (var i = 0; i < compound.pathItems.length; i++) {
   var p = compound.pathItems[i];
   unlockItem(p);
   p.duplicate(newCompound, ElementPlacement.PLACEATEND);
  }

  return newCompound;
 }

 function duplicateItemSafe(item, targetLayer) {
  unlockItem(item);
  try {
   return item.duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
  } catch (e) {
   return null;
  }
 }

 function collectPageItems(layer, targetLayer) {
  layer.locked = false;
  layer.visible = true;

  // Page items
  for (var i = layer.pageItems.length - 1; i >= 0; i--) {
   var srcItem = layer.pageItems[i];
   unlockItem(srcItem);

   var dup = null;

   if (srcItem.typename === 'CompoundPathItem') {
    dup = duplicateCompoundPathSafe(srcItem, targetLayer);
   } else {
    dup = duplicateItemSafe(srcItem, targetLayer);
   }

   if (dup) {
    applyFill(dup, fillColorName);
   }
  }

  // Recurse sublayers
  for (var j = 0; j < layer.layers.length; j++) {
   collectPageItems(layer.layers[j], targetLayer);
  }
 }

 // ---------------- MAIN ----------------

 var parentLayer = findLayerByName(doc.layers, PARENT_LAYER_NAME);
 if (!parentLayer) {
  throw new Error('Parent layer not found: ' + PARENT_LAYER_NAME);
 }

 parentLayer.locked = false;
 parentLayer.visible = true;

 // Create compound layer
 var compoundLayer = parentLayer.layers.add();
 compoundLayer.name = newLayerName;
 compoundLayer.locked = false;
 compoundLayer.visible = true;
 compoundLayer.zOrder(ZOrderMethod.SENDTOBACK);

 // Process source layers
 for (var i = 0; i < subLayerNames.length; i++) {
  var srcLayer = findLayerByName(doc.layers, subLayerNames[i]);
  if (!srcLayer) continue;

  collectPageItems(srcLayer, compoundLayer);
 }

 return compoundLayer.name;
}

// Example usage: motamuti workable
createCompoundPlate(['PANTONE 151 C'], 'DYC', 'INFO BOX INK');
