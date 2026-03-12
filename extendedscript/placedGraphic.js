//todo: NEW FUNCTION: placeAndEmbedGraphicAI

function placeAndEmbedGraphicAI(sepDoc, graphicAIPath, graphicName) {
 try {
  var aiFile = new File(graphicAIPath);
  if (!aiFile.exists) return false;

  // ---- find garment bounds ----
  var gridLayer = findLayerByName(sepDoc.layers, 'GRID');
  if (!gridLayer) return false;

  var garmentLayer = findLayerByName(gridLayer.layers, 'GARMENT');
  if (!garmentLayer) return false;

  if (garmentLayer.pathItems.length === 0) return false;

  var garmentRect = garmentLayer.pathItems[0];
  var targetBounds = garmentRect.geometricBounds; // [L, T, R, B]

  // ---- find / create target layer ----
  var sizedArtLayer;
  try {
   sizedArtLayer = sepDoc.layers.getByName('SIZED_ART');
  } catch (e) {
   return false;
  }

  var sizedGraphicsLayer;
  try {
   sizedGraphicsLayer = sizedArtLayer.layers.getByName('SIZED_GRAPHICS');
  } catch (e) {
   sizedGraphicsLayer = sizedArtLayer.layers.add();
   sizedGraphicsLayer.name = 'SIZED_GRAPHICS';
  }

  // ---- open graphic file ----
  var graphicDoc = app.open(aiFile);
  graphicDoc.selectObjectsOnActiveArtboard();

  if (graphicDoc.selection.length === 0) {
   graphicDoc.close(SaveOptions.DONOTSAVECHANGES);
   return false;
  }

  // ---- copy artwork ----
  app.copy();
  graphicDoc.close(SaveOptions.DONOTSAVECHANGES);

  // ---- paste into separation doc ----
  app.activeDocument = sepDoc;
  app.preferences.setBooleanPreference('layers/pastePreserve', false);
  sepDoc.activeLayer = sizedGraphicsLayer;
  app.paste();

  if (sepDoc.selection.length === 0) return false;

  // ---- group pasted items ----
  app.executeMenuCommand('group');
  var pastedGroup = sepDoc.selection[0];
  pastedGroup.name = graphicName.toUpperCase();

  // ---- KEEP ORIGINAL SIZE, ONLY CENTER ----
  var currentBounds = pastedGroup.geometricBounds;

  var targetWidth = targetBounds[2] - targetBounds[0];
  var targetHeight = targetBounds[1] - targetBounds[3];
  var targetCenterX = targetBounds[0] + targetWidth / 2;
  var targetCenterY = targetBounds[3] + targetHeight / 2;

  var currentCenterX = currentBounds[0] + (currentBounds[2] - currentBounds[0]) / 2;
  var currentCenterY = currentBounds[3] + (currentBounds[1] - currentBounds[3]) / 2;

  var moveX = targetCenterX - currentCenterX;
  var moveY = targetCenterY - currentCenterY;

  pastedGroup.translate(moveX, moveY);

  // ---- cleanup ----
  sepDoc.selection = null;
  return true;
 } catch (e) {
  return false;
 }
}

//todo: OLD FUNCTION: placeAndEmbedGraphicAI

function placeAndEmbedGraphicAI(sepDoc, graphicAIPath, graphicName) {
 try {
  var aiFile = new File(graphicAIPath);
  if (!aiFile.exists) {
   return false;
  }
  var gridLayer = findLayerByName(sepDoc.layers, 'GRID');
  if (!gridLayer) {
   return false;
  }
  var garmentLayer = findLayerByName(gridLayer.layers, 'GARMENT');
  if (!garmentLayer) {
   return false;
  }
  if (garmentLayer.pathItems.length === 0) {
   return false;
  }
  var garmentRect = garmentLayer.pathItems[0];
  var targetBounds = garmentRect.geometricBounds;
  var sizedArtLayer = null;
  try {
   sizedArtLayer = sepDoc.layers.getByName('SIZED_ART');
  } catch (e) {
   return false;
  }
  var sizedGraphicsLayer = null;
  try {
   sizedGraphicsLayer = sizedArtLayer.layers.getByName('SIZED_GRAPHICS');
  } catch (e) {
   sizedGraphicsLayer = sizedArtLayer.layers.add();
   sizedGraphicsLayer.name = 'SIZED_GRAPHICS';
  }
  var graphicDoc = app.open(aiFile);
  graphicDoc.selectObjectsOnActiveArtboard();
  if (graphicDoc.selection.length === 0) {
   graphicDoc.close(SaveOptions.DONOTSAVECHANGES);
   return false;
  }
  var originalBounds = graphicDoc.selection[0].geometricBounds;
  for (var i = 1; i < graphicDoc.selection.length; i++) {
   var itemBounds = graphicDoc.selection[i].geometricBounds;
   originalBounds[0] = Math.min(originalBounds[0], itemBounds[0]);
   originalBounds[1] = Math.max(originalBounds[1], itemBounds[1]);
   originalBounds[2] = Math.max(originalBounds[2], itemBounds[2]);
   originalBounds[3] = Math.min(originalBounds[3], itemBounds[3]);
  }
  app.copy();
  graphicDoc.close(SaveOptions.DONOTSAVECHANGES);
  app.activeDocument = sepDoc;
  app.preferences.setBooleanPreference('layers/pastePreserve', false);
  app.activeDocument.activeLayer = sizedGraphicsLayer;
  app.paste();
  if (app.activeDocument.selection.length > 0) {
   app.executeMenuCommand('group');
   var pastedGroup = app.activeDocument.selection[0];
   pastedGroup.name = graphicName.toUpperCase();
   var currentBounds = pastedGroup.geometricBounds;
   var originalWidth = originalBounds[2] - originalBounds[0];
   var originalHeight = originalBounds[1] - originalBounds[3];
   var targetWidth = targetBounds[2] - targetBounds[0];
   var targetHeight = targetBounds[1] - targetBounds[3];
   var graphicAspectRatio = originalWidth / originalHeight;
   var boundsAspectRatio = targetWidth / targetHeight;
   var newWidth, newHeight;
   if (graphicAspectRatio > boundsAspectRatio) {
    newWidth = targetWidth;
    newHeight = targetWidth / graphicAspectRatio;
   } else {
    newHeight = targetHeight;
    newWidth = targetHeight * graphicAspectRatio;
   }
   var scaleX = (newWidth / originalWidth) * 100;
   var scaleY = (newHeight / originalHeight) * 100;
   pastedGroup.resize(scaleX, scaleY);
   var resizedBounds = pastedGroup.geometricBounds;
   var targetCenterX = targetBounds[0] + targetWidth / 2;
   var targetCenterY = targetBounds[3] + targetHeight / 2;
   var currentCenterX = resizedBounds[0] + (resizedBounds[2] - resizedBounds[0]) / 2;
   var currentCenterY = resizedBounds[3] + (resizedBounds[1] - resizedBounds[3]) / 2;
   var moveX = targetCenterX - currentCenterX;
   var moveY = targetCenterY - currentCenterY;
   pastedGroup.translate(moveX, moveY);
  }
  app.activeDocument.selection = null;
  return true;
 } catch (e) {
  return false;
 }
}
