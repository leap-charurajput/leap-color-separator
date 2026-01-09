function duplicateSeparatedArtLayer(sourceLayerName, newNameLayer) {
 var doc = app.activeDocument;

 var CONSTANTS = {
  LAYER_NAMES: {
   SEPARATED_ART: 'SEPARATED_ART'
  }
 };

 // Get SEPARATED_ART layer
 var separatedArtLayer;
 try {
  separatedArtLayer = doc.layers.getByName(CONSTANTS.LAYER_NAMES.SEPARATED_ART);
 } catch (e) {
  throw new Error('SEPARATED_ART layer not found');
 }

 // Get source layer
 var sourceLayer;
 try {
  sourceLayer = separatedArtLayer.layers.getByName(sourceLayerName);
 } catch (e) {
  throw new Error('Source layer "' + sourceLayerName + '" not found');
 }

 // Create new layer
 var newLayer = separatedArtLayer.layers.add();
 newLayer.name = newNameLayer;

 // Recursive copy (inline)
 (function copyLayer(src, dst) {
  // Copy pageItems
  for (var i = src.pageItems.length - 1; i >= 0; i--) {
   src.pageItems[i].duplicate(dst, ElementPlacement.PLACEATBEGINNING);
  }

  // Copy sublayers
  for (var j = 0; j < src.layers.length; j++) {
   var srcSub = src.layers[j];
   var dstSub = dst.layers.add();
   dstSub.name = srcSub.name;

   copyLayer(srcSub, dstSub);
  }
 })(sourceLayer, newLayer);

 return newLayer;
}

duplicateSeparatedArtLayer('White UB', 'White UB2');
