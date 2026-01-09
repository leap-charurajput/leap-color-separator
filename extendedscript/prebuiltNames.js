function prebuiltNames(nameList, nameField, atbNumber) {
  if (app.documents.length < 1) {
    alert("Please open the 'Name Prototype' document first.");
    return;
  }

  var sourceDoc = app.activeDocument;

  // Get prototype artboard size
  var protoAB = sourceDoc.artboards[0].artboardRect;
  var abWidth = protoAB[2] - protoAB[0];
  var abHeight = protoAB[1] - protoAB[3];
  var spacing = 72; // 0.5 inch spacing

  // Copy all artwork from prototype
  sourceDoc.activate();
  app.executeMenuCommand("selectall");
  app.copy();

  var namesPerFile = atbNumber;
  if (namesPerFile > 1000) namesPerFile = 1000; // Illustrator hard limit
  var totalFiles = Math.ceil(nameList.length / namesPerFile);

  var createdFiles = [];

  // ✅ function from your other script
  function getLargestBounds() {
    var tempLayer,
      tempText,
      left,
      top,
      LARGEST_SIZE = 16383;
    if (!app.documents.length) return;
    tempLayer = app.activeDocument.layers.add();
    tempText = tempLayer.textFrames.add();
    left = tempText.matrix.mValueTX;
    top = tempText.matrix.mValueTY;
    tempLayer.remove();
    return [left, top, left + LARGEST_SIZE, top + LARGEST_SIZE];
  }

  for (var f = 0; f < totalFiles; f++) {
    var newDoc = app.documents.add(DocumentColorSpace.RGB, abWidth, abHeight);
    newDoc.activate();

    var start = f * namesPerFile;
    var end = Math.min(start + namesPerFile, nameList.length);
    var batch = nameList.slice(start, end);

    // ✅ anchor all artboards from the start of document
    var rect = getLargestBounds();
    var originX = rect[0];
    var originY = rect[1];

    // --- Fixed 5 rows per column layout ---
    var rowsPerCol = 5;

    for (var i = 0; i < batch.length && i < namesPerFile; i++) {
      var col = Math.floor(i / rowsPerCol); // column index
      var row = i % rowsPerCol; // row index

      var left = originX + col * (abWidth + spacing);
      var top = originY - row * (abHeight + spacing);
      var rectAB = [left, top, left + abWidth, top - abHeight];

      if (i === 0) {
        newDoc.artboards[0].artboardRect = rectAB;
      } else {
        newDoc.artboards.add(rectAB);
      }

      var playerName = batch[i][nameField];
      if (playerName) {
        newDoc.artboards[i].name = playerName;
      }
    }

    //! Paste prototype and add name
    buildNameArtboards(sourceDoc, newDoc, batch, nameField);

    var baseName = sourceDoc.name.replace(/\.ai$/i, "");
    var outputFolder = new Folder(sourceDoc.path + "/Prebuilt Names Boards");
    if (!outputFolder.exists) {
      outputFolder.create();
    }

    var saveFile = new File(
      outputFolder.fsName + "/" + baseName + "-" + (f + 1) + ".ai"
    );

    var saveOptions = new IllustratorSaveOptions();
    // saveOptions.compatibility = Compatibility.ILLUSTRATOR2020; // CS6+
    saveOptions.embedICCProfile = true;
    saveOptions.pdfCompatible = true;

    var metadataPayload =
      '{"Document_Type":"Prebuilt Name Plates","Source_Document":"' +
      sourceDoc.name +
      '"}';

    setXMPMetadata("LEAP_XMP_META", metadataPayload);
    newDoc.saveAs(saveFile, saveOptions);

    createdFiles.push(saveFile);
    newDoc.close(SaveOptions.DONOTSAVECHANGES);
  }

  for (var i = 0; i < createdFiles.length; i++) {
    try {
      app.open(createdFiles[i]);
    } catch (e) {
      $.writeln("Could not open: " + createdFiles[i].fsName);
    }
  }

  alert(
    totalFiles +
      " documents created, each with up to " +
      namesPerFile +
      " artboards."
  );
}

function buildNameArtboards(sourceDoc, newDoc, batch, nameField) {
  var tempFolder = Folder.temp;

  for (var j = 0; j < batch.length && j < newDoc.artboards.length; j++) {
    var playerName = batch[j][nameField];
    if (!playerName) continue;

    // --- 1. Make a temp copy of sourceDoc file ---
    var sourceFile = new File(sourceDoc.fullName);
    var tempFile = new File(tempFolder.fsName + "/temp_name_" + j + ".ai");

    if (!copyFile(sourceFile, tempFile)) {
      alert("Failed to copy " + sourceFile.fsName);
      continue;
    }

    // --- 2. Open temp copy and insert name ---
    var tempDoc = app.open(tempFile);
    placeTextAndHandleOverflow(tempDoc.layers, playerName, "Scale");

    var saveOptions = new IllustratorSaveOptions();
    saveOptions.compatibility = Compatibility.ILLUSTRATOR17;
    saveOptions.embedICCProfile = true;
    saveOptions.pdfCompatible = true;
    tempDoc.save();
    tempDoc.close(SaveOptions.SAVECHANGES);

    // --- 3. Paste contents into artboard of newDoc ---
    newDoc.artboards.setActiveArtboardIndex(j);
    newDoc.activate();

    var playerLayer = newDoc.layers.add();
    playerLayer.name = playerName;

    var tempDoc2 = app.open(tempFile);
    tempDoc2.activate();
    app.executeMenuCommand("selectall");
    app.copy();
    tempDoc2.close(SaveOptions.DONOTSAVECHANGES);

    newDoc.activate();
    app.paste(); // ✅ keeps area type
    var pastedItems = newDoc.selection;

    // --- Move pasted items into player layer (root) ---
    for (var p = pastedItems.length - 1; p >= 0; p--) {
      pastedItems[p].move(playerLayer, ElementPlacement.PLACEATBEGINNING);
    }

    // --- 4. Center pasted items in artboard ---
    var abBounds = newDoc.artboards[j].artboardRect;
    var abCenterX = (abBounds[0] + abBounds[2]) / 2;
    var abCenterY = (abBounds[1] + abBounds[3]) / 2;

    for (var p = 0; p < pastedItems.length; p++) {
      var gb = pastedItems[p].geometricBounds;
      var itemWidth = gb[2] - gb[0];
      var itemHeight = gb[1] - gb[3];

      pastedItems[p].position = [
        abCenterX - itemWidth / 2,
        abCenterY + itemHeight / 2,
      ];
    }

    newDoc.selection = null;

    // --- 5. Cleanup temp file ---
    try {
      tempFile.remove();
    } catch (e) {
      $.writeln("Warning: Could not delete " + tempFile.fsName);
    }
  }

  // --- 6. Remove empty default "Layer 1" if unused ---
  try {
    var defaultLayer = newDoc.layers.getByName("Layer 1");
    if (defaultLayer && defaultLayer.pageItems.length === 0) {
      defaultLayer.remove();
    }
  } catch (e) {}
}

// helper
function copyFile(sourceFile, destFile) {
  if (!sourceFile.exists) return false;
  try {
    return sourceFile.copy(destFile);
  } catch (e) {
    $.writeln("Error copying file: " + e);
    return false;
  }
}

function placeTextAndHandleOverflow(layers, text, fittingType) {
  var layersArray = [];
  for (var i = 0; i < layers.length; i++) {
    layersArray.push(layers[i]);
  }

  layersArray.sort(function (a, b) {
    var nameA = parseInt(a.name, 10);
    var nameB = parseInt(b.name, 10);
    if (!isNaN(nameA) && !isNaN(nameB)) {
      return nameA - nameB;
    }
    return a.name.localeCompare(b.name);
  });

  var lastLayerIndex = layersArray.length - 1;
  var lastLayerFits = false;
  var anyLayerFits = false;

  for (var i = 0; i < layersArray.length; i++) {
    var layer = layersArray[i];
    var layerFits = true;

    for (var j = 0; j < layer.textFrames.length; j++) {
      var textFrame = layer.textFrames[j];
      var originalText = textFrame.contents;

      textFrame.contents = text;
      if (isTextOverflow(textFrame)) {
        layerFits = false;
        textFrame.contents = originalText;
        break;
      }
    }

    layer.visible = layerFits;

    if (layerFits) {
      anyLayerFits = true;
      lastLayerFits = i === lastLayerIndex;

      for (var k = i + 1; k < layersArray.length; k++) {
        layersArray[k].visible = false;
      }

      if (!lastLayerFits) return;
    }
  }

  if (!anyLayerFits && (fittingType === "Scale" || fittingType === "Size")) {
    var lastLayer = layersArray[lastLayerIndex];

    lastLayer.visible = true;

    for (var i = 0; i < lastLayerIndex; i++) {
      layersArray[i].visible = false;
    }

    for (var j = 0; j < lastLayer.textFrames.length; j++) {
      var textFrame = lastLayer.textFrames[j];
      textFrame.contents = text;

      var fontSize = textFrame.textRange.characterAttributes.size;
      var horizontalScale =
        textFrame.textRange.characterAttributes.horizontalScale;

      while (isTextOverflow(textFrame) && fontSize > 6) {
        if (fittingType === "Size") {
          fontSize -= 1;
          textFrame.textRange.characterAttributes.size = fontSize;
        } else if (fittingType === "Scale") {
          horizontalScale -= 1;
          textFrame.textRange.characterAttributes.horizontalScale =
            horizontalScale;
        }
      }
    }
  }
}

function isTextOverflow(textFrame) {
  return getCharacters(textFrame) !== getVisibleCharacters(textFrame);
}

function getVisibleCharacters(textObject) {
  var total = 0;
  for (var i = 0; i < textObject.lines.length; i++) {
    total += textObject.lines[i].characters.length;
  }
  return total;
}

function getCharacters(textObject) {
  var total = 0;
  for (var i = 0; i < textObject.paragraphs.length; i++) {
    total += textObject.paragraphs[i].characters.length;
  }
  return total;
}

function setXMPMetadata(key, payload) {
  var doc = app.activeDocument;
  if (!doc) return;

  var xmpString = doc.XMPString;
  if (!xmpString || xmpString.length === 0) {
    xmpString =
      '<?xpacket begin="﻿" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
      '<x:xmpmeta xmlns:x="adobe:ns:meta/">' +
      '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">' +
      "<rdf:Description>" +
      "</rdf:Description>" +
      "</rdf:RDF>" +
      "</x:xmpmeta>" +
      '<?xpacket end="w"?>';
  }

  var regex = new RegExp(
    "(<xmp:" + key + "[^>]*>)([\\s\\S]*?)(</xmp:" + key + ">)"
  );

  if (regex.test(xmpString)) {
    xmpString = xmpString.replace(regex, "$1" + payload + "$3");
  } else {
    var insertPos = xmpString.indexOf("</rdf:Description>");
    var newField = "<xmp:" + key + ">" + payload + "</xmp:" + key + ">";
    if (insertPos !== -1) {
      xmpString =
        xmpString.substring(0, insertPos) +
        newField +
        xmpString.substring(insertPos);
    }
  }

  doc.XMPString = xmpString;
}

// Example run
var nameList = [
  { "Player Last Name": "TERRAVAIN" },
  { "Player Last Name": "SMITH" },
  { "Player Last Name": "JOHNSON" },
  { "Player Last Name": "WILLIAMS" },
  { "Player Last Name": "BROWN" },
  { "Player Last Name": "JONES" },
  { "Player Last Name": "GARCIA" },
  { "Player Last Name": "MILLER" },
  { "Player Last Name": "DAVIS" },
  { "Player Last Name": "RODRIGUEZ" },
  { "Player Last Name": "MARTINEZ" },
  { "Player Last Name": "HERNANDEZ" },
  { "Player Last Name": "LOPEZ" },
  { "Player Last Name": "GONZALEZ" },
  { "Player Last Name": "WILSON" },
];

prebuiltNames(nameList, "Player Last Name", 10); // ✅ will create 50 artboards per file
