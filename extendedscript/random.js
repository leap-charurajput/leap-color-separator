function createCompoundPlate(parentLayerName, subLayerNames, newLayerName) {
 if (!app.documents.length) {
  throw new Error('No document open');
 }

 var doc = app.activeDocument;

 // ---------- helpers ----------

 function findLayerByName(layers, name) {
  for (var i = 0; i < layers.length; i++) {
   if (layers[i].name === name) {
    return layers[i];
   }
   var found = findLayerByName(layers[i].layers, name);
   if (found) return found;
  }
  return null;
 }

 function collectPageItems(layer, targetLayer) {
  // Copy items in this layer
  for (var i = layer.pageItems.length - 1; i >= 0; i--) {
   layer.pageItems[i].duplicate(targetLayer, ElementPlacement.PLACEATBEGINNING);
  }

  // Recurse into sublayers
  for (var j = 0; j < layer.layers.length; j++) {
   collectPageItems(layer.layers[j], targetLayer);
  }
 }

 // ---------- main ----------

 var parentLayer = findLayerByName(doc.layers, parentLayerName);
 if (!parentLayer) {
  throw new Error('Parent layer not found: ' + parentLayerName);
 }

 // Create compound layer at end of parent
 var compoundLayer = parentLayer.layers.add();
 compoundLayer.name = newLayerName;
 compoundLayer.zOrder(ZOrderMethod.SENDTOBACK);

 // Process sublayers
 for (var i = 0; i < subLayerNames.length; i++) {
  var sourceLayer = findLayerByName(doc.layers, subLayerNames[i]);
  if (!sourceLayer) continue;

  collectPageItems(sourceLayer, compoundLayer);
 }

 return compoundLayer.name;
}

createCompoundPlate('SEPARATED_ART', ['PANTONE 652 C'], 'PANTONE 652 C COMPOUND');
