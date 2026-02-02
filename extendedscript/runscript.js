/**
 * Handles all JSON parsing and stringifying operations.
 */
var JsonUtils = {
  stringifyMetadataArray: function (data) {
    // ... (original code is unchanged)
    var json = "[\n";
    for (var i = 0; i < data.length; i++) {
      var item = data[i];
      json += "  {\n";
      var keys = [];
      for (var key in item) {
        if (item.hasOwnProperty(key)) {
          keys.push(key);
        }
      }
      for (var j = 0; j < keys.length; j++) {
        var key = keys[j];
        var value = item[key].toString().replace(/"/g, '\\"');
        json += '    "' + key + '": "' + value + '"';
        if (j < keys.length - 1) json += ",";
        json += "\n";
      }
      json += "  }";
      if (i < data.length - 1) json += ",";
      json += "\n";
    }
    json += "]";
    return json;
  },

  stringifyObject: function (obj) {
    // ... (original code is unchanged)
    if (obj === null) return "null";
    if (typeof obj === "string") {
      return '"' + obj.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
    }
    if (typeof obj === "number" || typeof obj === "boolean") {
      return obj.toString();
    }
    if (obj instanceof Array) {
      var arr = [];
      for (var i = 0; i < obj.length; i++) {
        arr.push(JsonUtils.stringifyObject(obj[i]));
      }
      return "[" + arr.join(",") + "]";
    }
    if (typeof obj === "object") {
      var props = [];
      for (var key in obj) {
        if (obj.hasOwnProperty(key)) {
          props.push('"' + key + '":' + JsonUtils.stringifyObject(obj[key]));
        }
      }
      return "{" + props.join(",") + "}";
    }
    return '""';
  },

  safeParseArrayOfObjects: function (jsonString) {
    // ... (original code is unchanged)
    var str = String(jsonString);
    str = str.replace(/[\n\r\t]/g, "");
    str = str.replace(/^\s+|\s+$/g, "");
    str = str.slice(1, str.length - 1);
    var items = str.split("},");
    var result = [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      if (item.charAt(item.length - 1) !== "}") item += "}";
      var obj = {};
      var regex = /"([^"]+)"\s*:\s*"([^"]*)"/g;
      var match;
      while ((match = regex.exec(item)) !== null) {
        obj[match[1]] = match[2];
      }
      result.push(obj);
    }
    return result;
  },

  customJSONParse: function (jsonString) {
    // ... (original code is unchanged)
    var parsed = {};
    var regex = /"([^"]+)":\s*("[^"]*"|[^,}]*)/g;
    var match;
    while ((match = regex.exec(jsonString)) !== null) {
      var value = match[2];
      if (value.charAt(0) === '"' && value.charAt(value.length - 1) === '"') {
        value = value.slice(1, -1);
      }
      parsed[match[1]] = value;
    }
    return parsed;
  },
};

/**
 * Handles all file and folder system operations.
 */
var FileUtils = {
  deleteFolderContents: function (folder) {
    // ... (original code is unchanged)
    var files = folder.getFiles();
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      if (file instanceof Folder) {
        FileUtils.deleteFolderContents(file);
        file.remove();
      } else {
        file.remove();
      }
    }
  },

  copyFolderContents: function (sourceFolder, destinationFolder, processSVG) {
    // ... (original code is unchanged)
    var folderContents = sourceFolder.getFiles();
    for (var j = 0; j < folderContents.length; j++) {
      var item = folderContents[j];
      if (item instanceof Folder) {
        var newSubFolder = new Folder(
          destinationFolder.fsName + "/" + item.name
        );
        if (!newSubFolder.exists) newSubFolder.create();
        FileUtils.copyFolderContents(item, newSubFolder, processSVG);
      } else {
        var targetFile = new File(destinationFolder.fsName + "/" + item.name);
        item.copy(targetFile);
        if (processSVG && item.name.match(/\.ai$/i)) {
          var aiDoc = app.open(targetFile);
          var svgOptions = new ExportOptionsSVG();
          svgOptions.embedRasterImages = true;
          var svgFileName = item.name.replace(/\.ai$/i, ".svg");
          var svgFile = new File(destinationFolder.fsName + "/" + svgFileName);
          aiDoc.exportFile(svgFile, ExportType.SVG, svgOptions);
          aiDoc.close(SaveOptions.DONOTSAVECHANGES);
        }
      }
    }
  },
};

/**
 * Handles all Adobe Illustrator DOM manipulations.
 */
var IllustratorUtils = {
  findLayerByName: function (doc, layerName) {
    // ... (original code is unchanged)
    for (var i = 0; i < doc.layers.length; i++) {
      if (doc.layers[i].name === layerName) return doc.layers[i];
    }
    return null;
  },

  collectAllPageItems: function (layer, result) {
    // ... (original code is unchanged)
    if (!result) result = [];
    for (var i = 0; i < layer.pageItems.length; i++) {
      result.push(layer.pageItems[i]);
    }
    for (var j = 0; j < layer.layers.length; j++) {
      IllustratorUtils.collectAllPageItems(layer.layers[j], result);
    }
    return result;
  },

  replaceSwatchCMYK: function (doc, variableName, cmyk, swatchName) {
    // ... (original code is unchanged)
    try {
      var variableNameInNameProto = "$" + variableName;
      var swatch = IllustratorUtils.findSwatchByExactName(
        doc,
        variableNameInNameProto
      );
      if (!swatch) return;
      $.writeln(
        "Name: " +
          doc.name +
          " | Swatch found: " +
          swatch.name +
          " → " +
          swatchName
      );
      var newColor = new CMYKColor();
      newColor.cyan = cmyk.c;
      newColor.magenta = cmyk.m;
      newColor.yellow = cmyk.y;
      newColor.black = cmyk.k;
      if (swatch.color.typename === "SpotColor") {
        swatch.color.spot.color = newColor;
      } else if (swatch.color.typename === "CMYKColor") {
        swatch.color = newColor;
      }
      swatch.name = swatchName;
    } catch (e) {
      $.writeln(
        "⚠ Swatch not found or failed to update: " + swatchName + " → " + e
      );
    }
  },

  findSwatchByExactName: function (doc, targetName) {
    // ... (original code is unchanged)
    for (var i = 0; i < doc.swatches.length; i++) {
      var s = doc.swatches[i];
      if (s.name === targetName) {
        return s;
      }
    }
    return null;
  },

  updateTextFrames: function (layer, player) {
    // ... (original code is unchanged)
    for (var i = 0; i < layer.textFrames.length; i++) {
      var singleTF = layer.textFrames[i];
      var str = singleTF.contents;
      var replacedText = str.replace(
        /\[([^\]]+)\]/g,
        function (match, keyName) {
          return player.hasOwnProperty(keyName) ? player[keyName] : "";
        }
      );
      singleTF.contents = replacedText;
    }
  },
};

// ===================================================================
// #endregion UTILITY MODULES
// ===================================================================

// ===================================================================
// #region MAIN PROCESSING FUNCTIONS
// ===================================================================

/**
 * Main orchestrator function for processing templates.
 */
function processTemplates(config) {
  // --- 1. INITIALIZATION ---
  var state = {
    config: config,
    totalNotFoundNamePrototypes: 0,
    finishedProduct: 0,
    originalTemplatePath: "",
    tempFolderPath: config.systemFolderPath + "/Temp",
    tempFolder: new Folder(config.systemFolderPath + "/Temp"),
    dateString:
      new Date().getFullYear() +
      "-" +
      ("0" + (new Date().getMonth() + 1)).slice(-2) +
      "-" +
      ("0" + new Date().getDate()).slice(-2),
    progressWin: null,
    currentStep: 0,
    totalSteps: 0,
    variables:
      typeof config.variables === "string"
        ? JsonUtils.safeParseArrayOfObjects(config.variables)
        : config.variables,
  };

  app.userInteractionLevel = UserInteractionLevel.DONTDISPLAYALERTS;
  if (!state.tempFolder.exists) state.tempFolder.create();

  var finalProducts = prepareFinalProductsData(config);
  state.totalSteps = finalProducts.length * 3;
  initializeProgressBar(state);

  // --- 2. CORE PROCESSING WORKFLOW ---
  if (finalProducts.length > 0) {
    generateLiveLinks(finalProducts, state);
    processAllPlayers(finalProducts, state);
  } else {
    createLogFile(
      "NO",
      "No players found for the selected template.",
      {},
      state
    );
  }

  // --- 3. FINALIZATION & CLEANUP ---
  finalizeProcess(state);

  return JsonUtils.stringifyObject({
    finishedProduct: state.finishedProduct,
    logErrorFilePath: new Folder(
      state.config.systemFolderPath + "/Log/Job Logs/" + state.dateString
    ).fsName,
    jobFolderPath: state.config.exportFolderPath,
    jobFolderName: state.config.systemFolderPath,
  });
}

function prepareFinalProductsData(config) {
  var finalProducts = [];
  if (config.isTest) {
    // ... (original logic for isTest)
    var templateFolderName = config.activeFile.replace(".ai", "");
    var templateFilePath =
      config.systemFolderPath +
      "/Templates/" +
      templateFolderName +
      "/" +
      config.activeFile;
    var filterFilePath =
      config.systemFolderPath +
      "/Templates/" +
      templateFolderName +
      "/template_filter_set.json";
    var filterFile = new File(filterFilePath);
    if (!filterFile.exists)
      $.writeln(
        "Warning: template_filter_sets.json not found in " + templateFolderName
      );

    var filterContent = filterFile.exists ? filterFile.read() : "[]";
    var filterSets = JsonUtils.safeParseArrayOfObjects(filterContent);
    var filterSetInSingleObj = {};
    for (var j = 0; j < filterSets.length; j++) {
      var filterSet = filterSets[j];
      filterSetInSingleObj[filterSet.field] = filterSet.value;
    }
    var values = [];
    for (var key in filterSetInSingleObj) {
      if (filterSetInSingleObj.hasOwnProperty(key))
        values.push(filterSetInSingleObj[key]);
    }
    var joinedStringValues = values.join("_");
    for (var k = 0; k < config.playerData.length; k++) {
      finalProducts.push({
        templatePath: templateFilePath,
        rows: [config.playerData[k]],
        values: joinedStringValues,
      });
    }
  } else {
    finalProducts = config.playerData;
  }
  return finalProducts;
}

function initializeProgressBar(state) {
  state.progressWin = new Window("palette", "Processing Templates");
  state.progressWin.progressBar = state.progressWin.add(
    "progressbar",
    undefined,
    0,
    state.totalSteps
  );
  state.progressWin.progressBar.preferredSize.width = 300;
  state.progressWin.progressText = state.progressWin.add(
    "statictext",
    undefined,
    "Starting..."
  );
  state.progressWin.progressText.preferredSize.width = 300;
  state.progressWin.layout.layout(true);
  state.progressWin.center();
  state.progressWin.show();
}

function updateProgress(state, message) {
  state.currentStep++;
  state.progressWin.progressBar.value = state.currentStep;
  state.progressWin.progressText.text = message;
  state.progressWin.update();
}

function generateLiveLinks(finalProducts, state) {
  for (var i = 0; i < finalProducts.length; i++) {
    var product = finalProducts[i];
    var player = product.rows[0];
    var playerName = player[state.config.columnPlayerName];
    var playerNumber = player[state.config.columnPlayerNumber];
    var playerFolderAndFileName = formatDynamicPlayerString(
      state.config.exportFolderStructure.split("/").pop(),
      player
    );
    var playerTempFolder = new Folder(
      state.tempFolderPath + "/" + playerFolderAndFileName + " Live Links"
    );
    if (!playerTempFolder.exists) playerTempFolder.create();

    updateProgress(state, "Processing links for " + playerName);
    processLinksInTemplate(
      product.templatePath,
      playerName,
      playerNumber,
      playerTempFolder,
      playerFolderAndFileName,
      player,
      state
    );
  }
}

function processLinksInTemplate(
  filePath,
  playerName,
  playerNumber,
  playerFolder,
  folderName,
  player,
  state
) {
  var file = new File(filePath);
  state.originalTemplatePath = filePath;
  try {
    app.open(file);
  } catch (e) {
    createLogFile(
      "NO",
      "Failed to open template file: " + file.fsName,
      player,
      state
    );
    return;
  }
  var doc = app.activeDocument;
  var nnLinksLayer = IllustratorUtils.findLayerByName(doc, "NN LINKS");
  if (!nnLinksLayer) {
    createLogFile("NO", "NN LINKS layer not found", player, state);
    doc.close(SaveOptions.DONOTSAVECHANGES);
    return;
  }
  var allPageItems = IllustratorUtils.collectAllPageItems(nnLinksLayer);
  var isPrototypeExists = processPageItems(
    allPageItems,
    playerNumber,
    playerFolder,
    playerName,
    player,
    state
  );
  if (isPrototypeExists) {
    createFinalTemplate(file, playerFolder, folderName, player, state);
  } else {
    deletePlayerFolder(playerFolder);
  }
  if (doc.name !== state.config.activeFile) {
    doc.close(SaveOptions.DONOTSAVECHANGES);
  }
}

function processPageItems(
  pageItems,
  playerNumber,
  playerFolder,
  playerName,
  player,
  state
) {
  // This function is already well-refactored from previous steps.
  // It can be further broken down if needed, but is acceptable as is.
  // ... (original processPageItems code, using state and utils)
  var allItemsExist = true;
  var jsonSourceFile = new File(
    app.activeDocument.path + "/template_colors.json"
  );
  var templateColorsJsonPath = playerFolder.fsName + "/template_colors.json";
  var templateColorsJsonFile = new File(templateColorsJsonPath);
  if (jsonSourceFile.exists) jsonSourceFile.copy(templateColorsJsonFile);

  for (var i = 0; i < pageItems.length; i++) {
    var pageItem = pageItems[i];
    var linkNote = pageItem.note
      ? JsonUtils.customJSONParse(pageItem.note)
      : "";
    if (linkNote && linkNote["Object_Type"] === "NN PRO Link") {
      var linkFilePath = getPrototypeLinkFilePath(
        linkNote,
        playerNumber,
        playerName,
        state.config.systemFolderPath
      );
      if (linkFilePath) {
        var linkFile = new File(linkFilePath);
        $.writeln("Link File: " + linkFilePath);
        if (linkFile.exists) {
          if (linkNote["Link_Type"] === "Name") {
            processNameLink(
              linkNote,
              linkFile,
              playerFolder,
              playerName,
              templateColorsJsonFile
            );
          } else {
            processNumberLink(linkFile, playerFolder);
          }
        } else {
          if (linkNote["Link_Type"] === "Name")
            state.totalNotFoundNamePrototypes++;
          createLogFile(
            "NO",
            linkNote["Link_Type"] + " Prototype is Missing",
            player,
            state
          );
          allItemsExist = false;
          break;
        }
      }
    }
  }
  if (templateColorsJsonFile.exists) templateColorsJsonFile.remove();
  return allItemsExist;
}

function processNameLink(
  linkNote,
  linkFile,
  playerFolder,
  playerName,
  templateColorsJsonFile
) {
  // ... (original processNameLink code, using utils)
  var namePlatesFolder = new Folder(playerFolder.fsName + "/Name Plates");
  namePlatesFolder.create();
  var instanceId = linkNote["InstanceId"];
  var namePrototypeFileName = playerName + "_" + instanceId + ".ai";
  var copyNameFilePath = namePlatesFolder.fsName + "/" + namePrototypeFileName;
  linkFile.copy(new File(copyNameFilePath));

  var colorMappings = [];
  if (templateColorsJsonFile.exists) {
    if (templateColorsJsonFile.open("r")) {
      var content = templateColorsJsonFile.read();
      templateColorsJsonFile.close();
      if (content.length) {
        try {
          colorMappings = eval("(" + content + ")");
        } catch (err) {}
      }
    }
  }

  var filteredColorMappings = colorMappings.filter(function (mapping) {
    return mapping.InstanceId === instanceId;
  });

  if (filteredColorMappings.length > 0) {
    var prototypeFile = new File(copyNameFilePath);
    if (prototypeFile.exists) {
      var doc = app.open(prototypeFile);
      for (var k = 0; k < filteredColorMappings.length; k++) {
        var mapping = filteredColorMappings[k];
        IllustratorUtils.replaceSwatchCMYK(
          doc,
          mapping.ColorVariable,
          mapping.Color,
          mapping.Swatch
        );
      }
      doc.close(SaveOptions.SAVECHANGES);
    }
  }
}

function processNumberLink(linkFile, playerFolder) {
  // ... (original processNumberLink code)
  var copyNumberFilePath = playerFolder.fsName + "/" + linkFile.name;
  linkFile.copy(new File(copyNumberFilePath));
}

function getPrototypeLinkFilePath(
  linkNote,
  playerNumber,
  playerName,
  systemFolderPath
) {
  // ... (original getPrototypeLinkFilePath code)
  var linkType = linkNote["Link_Type"];
  var linkName = linkNote["Link_Name"];
  if (linkType === "Number") {
    return (
      systemFolderPath +
      "/Number Prototypes/" +
      linkName +
      "/Numbers/" +
      linkName +
      "_" +
      (playerNumber < 10 ? "0" : "") +
      playerNumber +
      ".ai"
    );
  } else if (linkType === "Name") {
    return (
      systemFolderPath +
      "/Name Prototypes/" +
      linkName +
      "/" +
      "Names" +
      "/" +
      playerName +
      ".ai"
    );
  }
  return null;
}

function createFinalTemplate(file, playerFolder, folderName, player, state) {
  // ... (original createFinalTemplate code, using state and utils)
  var templateDestinationFile = new File(
    playerFolder.fsName + "/" + folderName + ".ai"
  );
  file.copy(templateDestinationFile);
  var openedDoc = app.open(templateDestinationFile);
  var nnLayer = IllustratorUtils.findLayerByName(openedDoc, "NN TEXT");
  if (nnLayer) IllustratorUtils.updateTextFrames(nnLayer, player);

  var nnLinksLayer = IllustratorUtils.findLayerByName(openedDoc, "NN LINKS");
  if (nnLinksLayer) {
    var pageItems = IllustratorUtils.collectAllPageItems(nnLinksLayer);
    for (var i = 0; i < pageItems.length; i++) {
      var pageItem = pageItems[i];
      var linkNote = pageItem.note
        ? JsonUtils.customJSONParse(pageItem.note)
        : null;
      if (
        !linkNote ||
        linkNote["Link_Type"] !== "Variable" ||
        !linkNote["Link_Name"]
      )
        continue;

      var matched = state.variables.find(function (variable) {
        return variable.VariableName === linkNote["Link_Name"];
      });

      if (matched && matched.Field && matched.Data) {
        var playerFieldValue = player[matched.Field];
        pageItem.hidden = String(playerFieldValue) !== String(matched.Data);
      } else {
        pageItem.hidden = true;
      }
      // ... (rest of the naming logic)
    }
  }
  try {
    openedDoc.close(SaveOptions.SAVECHANGES);
  } catch (e) {
    $.writeln("Error saving/closing document: " + e);
  }
}

function processAllPlayers(finalProducts, state) {
  for (var i = 0; i < finalProducts.length; i++) {
    var product = finalProducts[i];
    var player = product.rows[0];
    var playerName = player[state.config.columnPlayerName];
    var playerNumber = player[state.config.columnPlayerNumber];

    var dynamicFolderName = formatDynamicPlayerString(
      state.config.exportFolderStructure.split("/").slice(0, -1).join("/"),
      player
    );
    var playerFolder = new Folder(
      state.config.exportFolderPath + "/" + dynamicFolderName
    );
    if (!playerFolder.exists) playerFolder.create();

    var livePlayerFolderAndFileName = formatDynamicPlayerString(
      state.config.exportFolderStructure.split("/").pop(),
      player
    );

    moveTempFoldersToPlayerFolder(
      livePlayerFolderAndFileName,
      playerFolder,
      state
    );
    updateProgress(state, "Creating live product for " + playerName);
    processLiveProduct(
      livePlayerFolderAndFileName,
      playerNumber,
      playerName,
      playerFolder,
      product.rows,
      state
    );
    updateProgress(state, "Creating final product for " + playerName);
    processFinalProduct(
      livePlayerFolderAndFileName,
      playerNumber,
      playerName,
      playerFolder,
      player,
      state
    );
  }
}

function moveTempFoldersToPlayerFolder(
  livePlayerFolderAndFileName,
  playerFolder,
  state
) {
  // ... (original logic, using FileUtils)
  var tempContents = state.tempFolder.getFiles();
  for (var i = 0; i < tempContents.length; i++) {
    var singleTempFolder = tempContents[i];
    var expectedTempFolderName = livePlayerFolderAndFileName + " Live Links";
    if (
      singleTempFolder instanceof Folder &&
      singleTempFolder.name.replace(/%20/g, " ") === expectedTempFolderName
    ) {
      var destinationFolder = new Folder(
        playerFolder.fsName + "/" + singleTempFolder.name
      );
      if (!destinationFolder.exists) destinationFolder.create();
      var folderContents = singleTempFolder.getFiles();
      for (var j = 0; j < folderContents.length; j++) {
        var item = folderContents[j];
        if (
          item instanceof Folder &&
          decodeURIComponent(item.name) === "Name Plates"
        ) {
          var namePlatesDest = new Folder(playerFolder.fsName + "/Name Plates");
          if (!namePlatesDest.exists) namePlatesDest.create();
          FileUtils.copyFolderContents(item, namePlatesDest, true);
        } else {
          if (item instanceof Folder) {
            var subFolderDest = new Folder(
              destinationFolder.fsName + "/" + item.name
            );
            if (!subFolderDest.exists) subFolderDest.create();
            FileUtils.copyFolderContents(item, subFolderDest, false);
          } else {
            item.copy(destinationFolder.fsName + "/" + item.name);
          }
        }
      }
    }
  }
}

function processLiveProduct(
  name,
  playerNumber,
  playerName,
  playerFolder,
  players,
  state
) {
  // ... (original logic, using state and utils)
  // This function contains the massive exportArtblocks logic, which is a prime candidate for further refactoring.
  // For now, I will place it inside this function as it was.
  var singlePlayer = players[0];
  var liveFolder = new Folder(playerFolder.fsName + "/" + name + " Live Links");
  var assetsFolder = new Folder(playerFolder.fsName + "/" + "Assets");
  var files = liveFolder.getFiles();
  var metadataFolder = new Folder(playerFolder.fsName + "/Metadata");
  if (!metadataFolder.exists) metadataFolder.create();
  var dataFile = new File(metadataFolder.fsName + "/" + name + ".json");
  dataFile.encoding = "UTF8";
  dataFile.open("w");
  dataFile.write(JsonUtils.stringifyObject(singlePlayer));
  dataFile.close();

  for (var i = 0; i < files.length; i++) {
    if (decodeURIComponent(files[i].name) === name + ".ai" && files[i].exists) {
      app.open(files[i]);
      var doc = app.activeDocument;
      if (!doc) {
        $.writeln("Error: Failed to open document " + files[i].fsName);
        continue;
      }
      processLayerRecursively(
        doc.layers,
        liveFolder.fsName,
        playerFolder.fsName,
        playerNumber,
        playerName,
        false,
        state
      );
      updateMetadata("NN Pro LIVE", state);
      exportNNArtboards(doc, liveFolder, state);
      exportArtboards(
        doc,
        state.config.artboards,
        players,
        assetsFolder,
        state
      );
      try {
        doc.close(SaveOptions.SAVECHANGES);
      } catch (e) {
        $.writeln("Error saving/closing document: " + e);
      }
    }
  }
}

function processFinalProduct(
  name,
  playerNumber,
  playerName,
  playerFolder,
  player,
  state
) {
  // ... (original logic, using state and utils)
  var liveFolder = new Folder(playerFolder.fsName + "/" + name + " Live Links");
  var files = liveFolder.getFiles();
  for (var i = 0; i < files.length; i++) {
    if (decodeURIComponent(files[i].name) === name + ".ai") {
      var copiedFilePath = playerFolder.fsName + "/" + files[i].name;
      files[i].copy(copiedFilePath);
      var copiedFile = new File(copiedFilePath);
      if (copiedFile.exists) {
        app.open(copiedFilePath);
        var doc = app.activeDocument;
        if (!doc) continue;
        processLayerRecursively(
          doc.layers,
          liveFolder.fsName,
          playerFolder.fsName,
          playerNumber,
          playerName,
          true,
          state
        );
        updateMetadata("NN Pro Product", state);
        createLogFile("YES", "Product Created Successfully", player, state);
        state.finishedProduct += 1;
        try {
          doc.close(SaveOptions.SAVECHANGES);
        } catch (e) {
          $.writeln("Error saving/closing document: " + e);
        }
      }
    }
  }
}

function finalizeProcess(state) {
  if (state.totalNotFoundNamePrototypes > 0) {
    alert(
      state.totalNotFoundNamePrototypes +
        " Name Plates not found!, Please create the nameplates from name prototypes tab"
    );
  }
  updateProgress(state, "Process completed successfully");
  $.sleep(1000);
  state.progressWin.close();

  // Log file cleanup
  var logFolder = new Folder(
    state.config.systemFolderPath + "/Log/Job Logs/" + state.dateString
  );
  if (!logFolder.exists) logFolder.create();
  if (state.tempFolder.exists) {
    var tempContents = state.tempFolder.getFiles();
    for (var i = 0; i < tempContents.length; i++) {
      var tempItem = tempContents[i];
      if (tempItem instanceof File) {
        var logFilePath = logFolder.fsName + "/" + tempItem.name;
        tempItem.copy(logFilePath);
      }
    }
    FileUtils.deleteFolderContents(state.tempFolder);
    state.tempFolder.remove();
  }
}

var variables = [
  { VariableName: "HJ", Field: "Item_ID", Data: "KKK" },
  { VariableName: "GGT", Field: "Org", Data: "KOL", id: 1740996369385 },
  {
    VariableName: "ALBA",
    Field: "Player Number",
    Data: "OI",
    id: 1740996550948,
  },
  {
    VariableName: "HH",
    Field: "Graphic",
    Data: "JJ",
    id: 1741001891241,
  },
  {
    VariableName: "AMAR",
    Field: "Artist Initials",
    Data: "KU",
    id: 1741001942207,
  },
  { VariableName: "HJ", Field: "Player Number", Data: "KKK" },
  {
    VariableName: "ALIM",
    Field: "Graphic Org Name",
    Data: "PO",
    id: 1749726056937,
  },
  {
    VariableName: "SWEET",
    Field: "Artist",
    Data: "ET",
    id: 1749726328701,
  },
  {
    VariableName: "RITA",
    Field: "Graphic Org Name",
    Data: "RI",
    id: 1749726339800,
  },
  {
    VariableName: "CP",
    Field: "Colorway 2 Desc",
    Data: "NN",
    id: 1752744632778,
  },
  {
    VariableName: "CAPTAIN",
    Field: "Colorway 3 Desc",
    Data: "y",
    id: 1752766832253,
  },
];

var configArray = {
  version: "development",
  systemFolderPath:
    "/Users/ashik/Documents/MDS/Resource/LEAP /Automation Asset",
  exportFolderPath: "/Users/ashik/Documents/MDS/Resource/LEAP /Export",
  playerData: [
    {
      Item_ID: "00JW-0484-H37-FP6",
      Colorway_Desc: "Athletic Red",
      League_desc: "NHL",
      "Lineup Style Code": "00JW",
      "Lineup Org Code": "2AE",
      "Player ID": "52408",
      "Player First Name": "RAFEEF",
      "Player Last Name": "LERONZO",
      Player_Name: "MARIA SHORAPOVA LERONZO",
      "Player Number": "59",
      "Style Color Code": "0484",
      "Style Season": "F24",
      "Graphic Concept Code": "01Z5",
      Graphic_Name: "Authenitc Stack NN",
      "Graphic Org Name": "CHICAGO BLACKHAWKS",
      Graphic_code: "FP6",
      "True Org Code": "H37",
      "Colorway 3 Desc": "y",
      "Team Org Code": "ATL",
    },
  ],
  columnFileName: "NHL-TEST-2",
  columnName: "Item_ID",
  artboards: [
    // {
    //   id: 1743572710884,
    //   artboardName: "CAD",
    //   fileName: "[Item ID]-[Player Number]-xk",
    //   exportType: "jpg",
    //   isChecked: true,
    //   jpgQuality: 5,
    // },
    {
      id: 1743572662508,
      artboardName: "kk",
      fileName: "gala",
      exportType: "png",
      isAntialiasing: true,
      isChecked: true,
      isOutlineAndEmbed: true,
    },
    {
      id: 1743572662508,
      artboardName: "FRONT",
      fileName: "JK",
      exportType: "png",
      isChecked: true,
      isOutlineAndEmbed: true,
      layers: "Front Full Size Art",
    },
  ],
  columnPlayerName: "Player First Name",
  columnPlayerNumber: "Player Number",
  activeFile: app.activeDocument.name,
  keyField: "Player ID",
  isTest: true,
  variables: variables,
  exportFolderStructure:
    "[Graphic Concept Code]/[League_desc]/[Team Org Code]-[Graphic Org Name]/[Graphic Concept Code]-[Player_Name]",
  // league: "League_desc",
  // team: "Team_dec",
};

var info = processTemplates(configArray);
