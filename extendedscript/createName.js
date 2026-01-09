// Illustrator ExtendScript
function exportAllNameArtboards(overrideExisting) {
  if (app.documents.length === 0) {
    alert("No active document open!");
    return;
  }

  var doc = app.activeDocument;
  var docFolderPath = Folder(doc.path);
  var parentFolder = docFolderPath.parent;

  // ✅ Keep only "Names Live"
  var namesFolder = new Folder(parentFolder + "/Names");
  if (!namesFolder.exists) namesFolder.create();

  // Cleanup old TEMP files
  var leftovers = namesFolder.getFiles("TEMP*.ai");
  for (var lf = 0; lf < leftovers.length; lf++) {
    try {
      leftovers[lf].remove();
    } catch (e) {}
  }

  // Save all artboards as TEMP into Live folder
  var tempFile = new File(namesFolder.fsName + "/TEMP.ai");
  if (tempFile.exists) tempFile.remove();

  var saveOptions = new IllustratorSaveOptions();
  saveOptions.saveMultipleArtboards = true;
  saveOptions.artboardRange = "1-" + doc.artboards.length;
  doc.saveAs(tempFile, saveOptions);

  delay(2000);

  // Progress bar
  var win = new Window("palette", "Exporting Artboards", undefined);
  win.alignChildren = "fill";
  var bar = win.add("progressbar", undefined, 0, doc.artboards.length);
  bar.preferredSize = [300, 20];
  var statusText = win.add("statictext", undefined, "Starting...");
  win.show();

  var exportedCount = 0;

  for (var atbIndex = 0; atbIndex < doc.artboards.length; atbIndex++) {
    var ab = doc.artboards[atbIndex];
    var abName =
      ab.name && ab.name !== ""
        ? ab.name
        : "Artboard_" + ("0" + (atbIndex + 1)).slice(-2);
    abName = abName.replace(/[\\\/:*?"<>|]/g, "_").replace(/^\s+|\s+$/g, "");
    var finalName = abName + ".ai";

    var nameFile = new File(namesFolder.fsName + "/" + finalName);

    // ✅ Skip if exists and override not set
    if (!overrideExisting && nameFile.exists) {
      cleanupTempFile(namesFolder, abName); // remove leftover TEMP
      bar.value++;
      statusText.text = "Skipped (already exists): " + abName;
      win.update();
      continue;
    }

    try {
      var oldFile = findTempFile(namesFolder, abName);
      $.writeln(oldFile ? "Found TEMP for " + abName : "No TEMP for " + abName);
      if (!oldFile) continue;

      if (nameFile.exists && overrideExisting) nameFile.remove();
      oldFile.rename(finalName);
      var tempDoc = app.open(nameFile);

      var sourceLayer = tempDoc.layers[0];
      sourceLayer.locked = false;
      sourceLayer.visible = true;

      var liveLayer = tempDoc.layers.add();
      liveLayer.name = "LIVE TYPE";
      liveLayer.locked = false;

      for (var tI = 0; tI < tempDoc.layers.length; tI++) {
        tempDoc.layers[tI].locked = false;
        tempDoc.layers[tI].visible = true;
      }

      for (var j = sourceLayer.pageItems.length - 1; j >= 0; j--) {
        sourceLayer.pageItems[j].duplicate(
          liveLayer,
          ElementPlacement.PLACEATBEGINNING
        );
      }
      function outlineLayer(layer) {
        // Unlock + show the layer
        layer.locked = false;
        layer.visible = true;

        // Deselect everything first
        app.selection = null;

        // Select all page items in the layer
        for (var i = 0; i < layer.pageItems.length; i++) {
          layer.pageItems[i].selected = true;
        }

        // Run Illustrator's outline command
        app.executeMenuCommand("outline");

        app.selection = null;
      }

      // Rename original layer and outline its text
      sourceLayer.name = "OUTLINE TYPE";
      outlineLayer(sourceLayer);

      // ✅ Cleanup: keep only LIVE TYPE + OUTLINE TYPE
      for (var l = tempDoc.layers.length - 1; l >= 0; l--) {
        var lyr = tempDoc.layers[l];
        if (lyr.name !== "LIVE TYPE" && lyr.name !== "OUTLINE TYPE") {
          try {
            lyr.remove();
          } catch (e) {
            $.writeln("Could not remove layer " + lyr.name + ": " + e);
          }
        }
      }

      // Hide LIVE TYPE at the end
      liveLayer.visible = false;

      tempDoc.save();
      tempDoc.close(SaveOptions.DONOTSAVECHANGES);

      var metadataPayload = '{"Document_Type":"Name Prototype"}';
      addXMPToFile(nameFile, "LEAP_XMP_META", metadataPayload);

      exportedCount++;
    } catch (e) {
      $.writeln("Error processing " + finalName + ": " + e);
    }

    bar.value++;
    statusText.text = "Exported " + abName;
    win.update();
  }

  if (tempFile.exists) tempFile.remove();
  win.close();

  alert(
    "Successfully exported " + exportedCount + " AI files into 'Names' folder"
  );
}

// --- Helpers ---
function findTempFile(folder, name) {
  var f1 = new File(folder.fsName + "/TEMP_" + name + ".ai");
  if (f1.exists) return f1;
  return null;
}

function cleanupTempFile(folder, name) {
  var f = findTempFile(folder, name);
  if (f && f.exists) {
    try {
      f.remove();
    } catch (e) {}
  }
}

function delay(ms) {
  var start = new Date().getTime();
  while (new Date().getTime() - start < ms) {}
}

function addXMPToFile(file, key, payload) {
  if (!file.exists) return;

  var tempDoc;
  try {
    tempDoc = app.open(file);
    setXMPMetadata(tempDoc, key, payload);
    tempDoc.save();
    tempDoc.close(SaveOptions.SAVECHANGES);
  } catch (e) {
    $.writeln("Failed to set XMP on " + file.fsName + ": " + e);
    if (tempDoc) tempDoc.close(SaveOptions.DONOTSAVECHANGES);
  }
}

function setXMPMetadata(doc, key, payload) {
  if (!doc) return;

  var xmpString = doc.XMPString;
  if (!xmpString || xmpString.length === 0) {
    xmpString =
      '<?xpacket begin="\ufeff" id="W5M0MpCehiHzreSzNTczkc9d"?>' +
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

// Run
exportAllNameArtboards(true);
